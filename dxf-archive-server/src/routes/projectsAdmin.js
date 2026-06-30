const express = require('express');
const { pool } = require('../db');
const { requireRegionAuth } = require('../middleware/authJwt');

const router = express.Router();
router.use(requireRegionAuth);

// POST /api/projects
// body: { serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
//         assessment_type, drawings: [{ stage_label, file_name, dxf_content }, ...] }  (index 0 = 최초도면)
// province/city는 body로 안 받고 로그인된 지역(req.region) 값을 그대로 쓴다 — 사용자가 직접
// 입력/조작해서 다른 지역 소속으로 등록하지 못하게.
router.post('/projects', async (req, res, next) => {
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
      const dResult = await client.query(
        `INSERT INTO drawings (serial_no, stage_index, stage_label, file_name, dxf_content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING stage_index, stage_label, file_name`,
        [serial_no, i, stageLabel, d.file_name, d.dxf_content]
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
router.post('/projects/:serial_no/stages', async (req, res, next) => {
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

    const dResult = await client.query(
      `INSERT INTO drawings (serial_no, stage_index, stage_label, file_name, dxf_content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING stage_index, stage_label, file_name`,
      [serial_no, nextIndex, label, file_name, dxf_content]
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
router.delete('/projects/:serial_no/stages/:stage_index', async (req, res, next) => {
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
router.patch('/projects/:serial_no', async (req, res, next) => {
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
