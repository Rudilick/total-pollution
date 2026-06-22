const express = require('express');
const { pool } = require('../db');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

const VALID_TYPES = ['전략환경영향평가', '환경영향평가', '소규모환경영향평가', '사전환경성검토'];

// GET /api/eia-list/by-serial/:serial_no  (공개 조회 - 신규 프로젝트 등록 시 기관명 자동완성용)
router.get('/eia-list/by-serial/:serial_no', async (req, res, next) => {
  try {
    const { serial_no } = req.params;
    const result = await pool.query(
      `SELECT agency_name, project_name, assessment_type, assessment_type_label, uploaded_at
         FROM eia_list
        WHERE serial_no = $1
        ORDER BY uploaded_at DESC
        LIMIT 1`,
      [serial_no]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '해당 사업코드가 평가목록에 없습니다.' });
    }
    res.json({ entry: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

router.use(adminAuth);

// GET /api/eia-list/summary  (관리자 화면 - 종류별 현재 건수)
router.get('/eia-list/summary', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT assessment_type, COUNT(*)::int AS count
         FROM eia_list
        GROUP BY assessment_type`
    );
    res.json({ summary: result.rows });
  } catch (e) {
    next(e);
  }
});

// POST /api/eia-list
// body: { assessment_type, rows: [{ serial_no, agency_name, project_name, assessment_type_label,
//         consult_type, location, site_area, reply_date, is_public }, ...] }
// 해당 assessment_type의 기존 데이터를 전부 삭제하고 rows로 교체한다 (다른 종류는 영향 없음).
router.post('/eia-list', async (req, res, next) => {
  const { assessment_type, rows } = req.body || {};

  if (!VALID_TYPES.includes(assessment_type)) {
    return res.status(400).json({ error: 'assessment_type이 올바르지 않습니다.' });
  }
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows는 배열이어야 합니다.' });
  }

  const usable = rows.filter(r => r && r.serial_no && String(r.serial_no).trim());
  const skipped = rows.length - usable.length;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM eia_list WHERE assessment_type = $1', [assessment_type]);

    for (const r of usable) {
      await client.query(
        `INSERT INTO eia_list
           (serial_no, agency_name, project_name, assessment_type, assessment_type_label,
            consult_type, location, site_area, reply_date, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          String(r.serial_no).trim(),
          r.agency_name || null,
          r.project_name || null,
          assessment_type,
          r.assessment_type_label || null,
          r.consult_type || null,
          r.location || null,
          r.site_area === '' || r.site_area === undefined || r.site_area === null ? null : Number(r.site_area),
          r.reply_date || null,
          typeof r.is_public === 'boolean' ? r.is_public : null,
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ assessment_type, inserted: usable.length, skipped });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
