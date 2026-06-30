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

// POST /api/projects
// body: { serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
//         assessment_type, drawings: [{ stage_label, file_name, dxf_content }, ...] }  (index 0 = 최초도면)
// province/city는 body로 안 받고 로그인된 지역(req.region) 값을 그대로 쓴다 — 사용자가 직접
// 입력/조작해서 다른 지역 소속으로 등록하지 못하게.
router.post('/projects', requireRegionAuth, async (req, res, next) => {
  const {
    serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
    assessment_type, drawings,
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

    const existing = await client.query('SELECT 1 FROM projects WHERE serial_no = $1', [serial_no]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: '이미 등록된 일련번호입니다. 단계 추가 API를 사용하세요.' });
    }

    const projResult = await client.query(
      `INSERT INTO projects (serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name, assessment_type, province, city)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
                 assessment_type, province, city, created_at, updated_at`,
      [serial_no, project_name, operator_name || null, location || null,
        first_eia_year || null, notes || null, agency_name || null, assessment_type || null,
        province, city]
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
// body: { stage_label, file_name, dxf_content }  -> stage_index = max+1
router.post('/projects/:serial_no/stages', requireRegionAuth, async (req, res, next) => {
  const { serial_no } = req.params;
  const { stage_label, file_name, dxf_content } = req.body || {};

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

    await client.query('UPDATE projects SET updated_at = now() WHERE serial_no = $1', [serial_no]);

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

// PATCH /api/projects/:serial_no  (메타정보 일부 수정)
router.patch('/projects/:serial_no', requireRegionAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { serial_no } = req.params;
    const { project_name, operator_name, location, first_eia_year, notes } = req.body || {};

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
         updated_at     = now()
       WHERE serial_no = $1
       RETURNING serial_no, project_name, operator_name, location, first_eia_year, notes,
                 created_at, updated_at`,
      [serial_no, project_name ?? null, operator_name ?? null, location ?? null,
        first_eia_year ?? null, notes ?? null]
    );
    res.json({ project: result.rows[0] });
  } catch (e) {
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
