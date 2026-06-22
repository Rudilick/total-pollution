const express = require('express');
const { pool } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// POST /api/projects
// body: { serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
//         drawings: [{ stage_label, file_name, dxf_content }, ...] }  (index 0 = 최초도면)
router.post('/projects', async (req, res, next) => {
  const {
    serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name, drawings,
  } = req.body || {};

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
      `INSERT INTO projects (serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING serial_no, project_name, operator_name, location, first_eia_year, notes, agency_name,
                 created_at, updated_at`,
      [serial_no, project_name, operator_name || null, location || null,
        first_eia_year || null, notes || null, agency_name || null]
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

    const proj = await client.query('SELECT 1 FROM projects WHERE serial_no = $1', [serial_no]);
    if (proj.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '존재하지 않는 일련번호입니다.' });
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
  try {
    const { serial_no, stage_index } = req.params;
    const result = await pool.query(
      'DELETE FROM drawings WHERE serial_no = $1 AND stage_index = $2 RETURNING id',
      [serial_no, Number(stage_index)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '해당 단계를 찾을 수 없습니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/projects/:serial_no  (메타정보 일부 수정)
router.patch('/projects/:serial_no', async (req, res, next) => {
  try {
    const { serial_no } = req.params;
    const { project_name, operator_name, location, first_eia_year, notes } = req.body || {};

    const result = await pool.query(
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
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '존재하지 않는 일련번호입니다.' });
    }
    res.json({ project: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
