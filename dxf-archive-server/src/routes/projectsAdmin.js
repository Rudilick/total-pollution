const express = require('express');
const { pool } = require('../db');
const { requireRegionAuth } = require('../middleware/authJwt');

const router = express.Router();
// router.use(requireRegionAuth)로 경로 없이 걸면, 이 라우터가 server.js에서 eiaListRoutes보다
// 먼저 마운트되어 있어서 /api/eia-list 같은 "이 라우터엔 없는 경로"까지 가로채 401을 내버린다
// (같은 '/api' 프리픽스 아래 여러 라우터가 줄줄이 마운트되는 구조라, 경로 없는 router.use는
// 자기 라우트가 아닌 요청까지 먹어버림) — 그래서 각 라우트에 개별적으로 건다.

// 서버가 일련번호_도면순서_업로드일자 형식으로 파일명을 직접 지어준다(원본 업로드 파일명은
// 확장자만 가져다 쓰고 버린다) — 사용자별로 제각각인 원본 파일명 대신, 어떤 사업의 몇 번째
// 변경 도면인지 파일명만 보고 바로 알 수 있게 하기 위함.
function _todayKstYYYYMMDD() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000); // Date.now()는 항상 UTC 기준이라 +9시간 하면 KST 날짜가 나온다
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${kst.getUTCFullYear()}${mm}${dd}`;
}

function _buildDrawingFileName(serialNo, stageIndex, originalFileName) {
  const dotIdx = originalFileName ? originalFileName.lastIndexOf('.') : -1;
  const ext = dotIdx > -1 ? originalFileName.slice(dotIdx) : '.dxf';
  return `${serialNo}_${stageIndex}_${_todayKstYYYYMMDD()}${ext}`;
}

// 그 사업코드로 DB(eia_list)에 현재 등록된 사업면적 — 본협의/재협의/변경협의 중 특정 회차를
// 우선하지 않고, projects.js의 GET 조회와 동일하게 MAX(site_area)를 그대로 쓴다(연속성을
// 추적하지 않는 시스템이라 더 정교한 선택 로직은 불필요하다는 판단).
async function _lookupDbSiteArea(client, serialNo) {
  const r = await client.query('SELECT MAX(site_area) AS site_area FROM eia_list WHERE serial_no = $1', [serialNo]);
  const v = r.rows[0]?.site_area;
  return v == null ? null : Number(v);
}

// 도면 업로드 시 CAD 실측 면적과 DB 사업면적을 비교해 감사 로그 한 행을 남긴다.
// 프런트가 확인/인정 모달을 통과시킨 뒤에만 이 값들을 보내오지만, 등록 자체를 막는 검증은
// 서버에서도 하지 않는다 — 이 로그는 오직 "그때 이 수치로 인정했었다"는 기록용이다.
async function _logAreaAck(client, { serialNo, stageIndex, cadArea, dbSiteArea, region, req }) {
  const diffArea = dbSiteArea != null ? cadArea - dbSiteArea : null;
  const diffPct = dbSiteArea ? (diffArea / dbSiteArea) * 100 : null;
  await client.query(
    `INSERT INTO area_ack_log
       (serial_no, stage_index, cad_area, db_site_area, diff_area, diff_pct,
        acked_province, acked_city, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [serialNo, stageIndex, cadArea, dbSiteArea, diffArea, diffPct,
      region?.province || null, region?.city || null,
      req.ip || req.headers['x-forwarded-for'] || null, req.get('User-Agent') || null]
  );
}

// POST /api/projects
// body: { serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
//         assessment_type, color_legend, drawings: [{ stage_label, file_name, dxf_content }, ...] }
//         (drawings index 0 = 최초도면, color_legend = [{colorKey, label}, ...])
// province/city는 body로 안 받고 로그인된 지역(req.region) 값을 그대로 쓴다 — 사용자가 직접
// 입력/조작해서 다른 지역 소속으로 등록하지 못하게.
router.post('/projects', requireRegionAuth, async (req, res, next) => {
  const {
    serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
    assessment_type, color_legend, drawings, cad_area,
  } = req.body || {};
  const { province, city } = req.region;

  if (!serial_no || !project_name) {
    return res.status(400).json({ error: 'serial_no, project_name은 필수입니다.' });
  }
  if (!Array.isArray(drawings) || drawings.length === 0) {
    return res.status(400).json({ error: '최소 1개 이상의 도면(drawings)이 필요합니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT province, city FROM projects WHERE serial_no = $1', [serial_no]);
    if (existing.rows.length > 0) {
      if (!req.body.overwrite) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: '이미 등록된 일련번호입니다.' });
      }
      const p = existing.rows[0];
      if (p.province !== province || p.city !== city) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: '다른 지역에 등록된 사업을 덮어쓸 수 없습니다.' });
      }
      await client.query('DELETE FROM drawings WHERE serial_no = $1', [serial_no]);
      await client.query('DELETE FROM projects WHERE serial_no = $1', [serial_no]);
    }

    const projResult = await client.query(
      `INSERT INTO projects (serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name, assessment_type, province, city, color_legend)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
                 assessment_type, province, city, color_legend, created_at, updated_at`,
      [serial_no, project_name, operator_name || null, location || null,
        first_eia_year || null, notes || null, agency_name || null, assessment_type || null,
        province, city, JSON.stringify(Array.isArray(color_legend) ? color_legend : [])]
    );

    const insertedDrawings = [];
    for (let i = 0; i < drawings.length; i++) {
      const d = drawings[i];
      if (!d?.dxf_content || !d?.file_name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `drawings[${i}]에 file_name/dxf_content가 필요합니다.` });
      }
      const stageLabel = d.stage_label || (i === 0 ? '최초도면' : `${i}차변경`);
      const fileName = _buildDrawingFileName(serial_no, i, d.file_name);
      const dResult = await client.query(
        `INSERT INTO drawings (serial_no, stage_index, stage_label, file_name, dxf_content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING stage_index, stage_label, file_name`,
        [serial_no, i, stageLabel, fileName, d.dxf_content]
      );
      insertedDrawings.push(dResult.rows[0]);
    }

    if (cad_area != null) {
      const dbSiteArea = await _lookupDbSiteArea(client, serial_no);
      await _logAreaAck(client, {
        serialNo: serial_no, stageIndex: 0, cadArea: Number(cad_area), dbSiteArea,
        region: req.region, req,
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ project: projResult.rows[0], drawings: insertedDrawings });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

/** 대상 프로젝트가 로그인된 지역 소속인지 확인 — 아니면 403. 없으면 404. */
async function _assertOwnRegion(client, serial_no, region, res) {
  const proj = await client.query('SELECT province, city FROM projects WHERE serial_no = $1', [serial_no]);
  if (proj.rows.length === 0) {
    res.status(404).json({ error: '존재하지 않는 일련번호입니다.' });
    return false;
  }
  const p = proj.rows[0];
  if (p.province !== region.province || p.city !== region.city) {
    res.status(403).json({ error: '다른 지역에 등록된 사업입니다.' });
    return false;
  }
  return true;
}

// POST /api/projects/:serial_no/stages
// body: { stage_label, file_name, dxf_content, color_legend }  -> stage_index = max+1
// color_legend가 오면 그 시점의 전체 범례로 갱신한다(프런트가 항상 누적된 전체 범례를
// 들고 있다가 보냄 — 새 단계에서 새 색상이 감지되면 그 행까지 포함된 상태로 옴).
router.post('/projects/:serial_no/stages', requireRegionAuth, async (req, res, next) => {
  const { serial_no } = req.params;
  const { stage_label, file_name, dxf_content, color_legend, cad_area } = req.body || {};

  if (!file_name || !dxf_content) {
    return res.status(400).json({ error: 'file_name, dxf_content는 필수입니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!(await _assertOwnRegion(client, serial_no, req.region, res))) {
      await client.query('ROLLBACK');
      return;
    }

    const maxResult = await client.query(
      'SELECT COALESCE(MAX(stage_index), -1) AS max_idx FROM drawings WHERE serial_no = $1',
      [serial_no]
    );
    const nextIndex = maxResult.rows[0].max_idx + 1;
    const label = stage_label || (nextIndex === 0 ? '최초도면' : `${nextIndex}차변경`);
    const generatedFileName = _buildDrawingFileName(serial_no, nextIndex, file_name);

    const dResult = await client.query(
      `INSERT INTO drawings (serial_no, stage_index, stage_label, file_name, dxf_content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING stage_index, stage_label, file_name`,
      [serial_no, nextIndex, label, generatedFileName, dxf_content]
    );

    if (Array.isArray(color_legend)) {
      await client.query(
        'UPDATE projects SET color_legend = $2, updated_at = now() WHERE serial_no = $1',
        [serial_no, JSON.stringify(color_legend)]
      );
    } else {
      await client.query('UPDATE projects SET updated_at = now() WHERE serial_no = $1', [serial_no]);
    }

    if (cad_area != null) {
      const dbSiteArea = await _lookupDbSiteArea(client, serial_no);
      await _logAreaAck(client, {
        serialNo: serial_no, stageIndex: nextIndex, cadArea: Number(cad_area), dbSiteArea,
        region: req.region, req,
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ drawing: dResult.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// DELETE /api/projects/:serial_no/stages/:stage_index  (오류 정정용)
router.delete('/projects/:serial_no/stages/:stage_index', requireRegionAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { serial_no, stage_index } = req.params;

    if (!(await _assertOwnRegion(client, serial_no, req.region, res))) {
      return;
    }

    const result = await client.query(
      'DELETE FROM drawings WHERE serial_no = $1 AND stage_index = $2 RETURNING id',
      [serial_no, Number(stage_index)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '해당 단계를 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  } finally {
    client.release();
  }
});

// PATCH /api/projects/:serial_no  (메타정보 일부 수정 — color_legend만 보내서
// 새 도면 없이 범례만 갱신하는 것도 가능)
router.patch('/projects/:serial_no', requireRegionAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { serial_no } = req.params;
    const { project_name, operator_name, location, first_eia_year, notes, color_legend } = req.body || {};

    if (!(await _assertOwnRegion(client, serial_no, req.region, res))) {
      return;
    }

    const result = await client.query(
      `UPDATE projects SET
         project_name   = COALESCE($2, project_name),
         operator_name  = COALESCE($3, operator_name),
         location       = COALESCE($4, location),
         first_eia_year = COALESCE($5, first_eia_year),
         notes          = COALESCE($6, notes),
         color_legend   = COALESCE($7, color_legend),
         updated_at     = now()
       WHERE serial_no = $1
       RETURNING serial_no, project_name, operator_name, location, first_eia_year, notes,
                 color_legend, created_at, updated_at`,
      [serial_no, project_name ?? null, operator_name ?? null, location ?? null,
        first_eia_year ?? null, notes ?? null,
        Array.isArray(color_legend) ? JSON.stringify(color_legend) : null]
    );
    res.json({ project: result.rows[0] });
  } catch (e) {
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
