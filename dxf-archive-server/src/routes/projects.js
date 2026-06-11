const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/projects?q=검색어
router.get('/projects', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    let result;
    if (q) {
      result = await pool.query(
        `SELECT p.serial_no, p.project_name, p.operator_name, p.location, p.first_eia_year,
                COUNT(d.id)::int AS stage_count
           FROM projects p
           LEFT JOIN drawings d ON d.serial_no = p.serial_no
          WHERE p.serial_no ILIKE $1 || '%'
             OR p.project_name ILIKE '%' || $1 || '%'
          GROUP BY p.serial_no
          ORDER BY p.updated_at DESC`,
        [q]
      );
    } else {
      result = await pool.query(
        `SELECT p.serial_no, p.project_name, p.operator_name, p.location, p.first_eia_year,
                COUNT(d.id)::int AS stage_count
           FROM projects p
           LEFT JOIN drawings d ON d.serial_no = p.serial_no
          GROUP BY p.serial_no
          ORDER BY p.updated_at DESC
          LIMIT 50`
      );
    }

    res.json({ projects: result.rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/projects/:serial_no
router.get('/projects/:serial_no', async (req, res, next) => {
  try {
    const { serial_no } = req.params;

    const projResult = await pool.query(
      `SELECT serial_no, project_name, operator_name, location, first_eia_year, notes,
              created_at, updated_at
         FROM projects WHERE serial_no = $1`,
      [serial_no]
    );
    if (projResult.rows.length === 0) {
      return res.status(404).json({ error: '존재하지 않는 일련번호입니다.' });
    }

    const drawResult = await pool.query(
      `SELECT stage_index, stage_label, file_name, dxf_content
         FROM drawings WHERE serial_no = $1
        ORDER BY stage_index ASC`,
      [serial_no]
    );

    res.json({ project: projResult.rows[0], drawings: drawResult.rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
