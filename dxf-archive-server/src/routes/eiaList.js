const express = require('express');
const { pool } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const { normalizeAgency } = require('../lib/agencyAlias');

const router = express.Router();

const VALID_TYPES = ['전략환경영향평가', '환경영향평가', '소규모환경영향평가', '사전환경성검토'];

// GET /api/eia-list/by-serial/:serial_no  (공개 조회 - 신규 프로젝트 등록 시 기관명 자동완성용)
// agency_name/assessment_type을 쿼리파라미터로 주면 그 값으로 더 정확히 매칭하고,
// 없으면 기존처럼 그 일련번호의 가장 최근 행을 반환한다(하위호환).
router.get('/eia-list/by-serial/:serial_no', async (req, res, next) => {
  try {
    const { serial_no } = req.params;
    const { agency_name, assessment_type } = req.query;

    let result;
    if (agency_name || assessment_type) {
      const all = await pool.query(
        `SELECT agency_name, project_name, assessment_type, assessment_type_label, uploaded_at
           FROM eia_list
          WHERE serial_no = $1
          ORDER BY uploaded_at DESC`,
        [serial_no]
      );
      const match = all.rows.find(r =>
        (!agency_name || normalizeAgency(r.agency_name) === normalizeAgency(agency_name)) &&
        (!assessment_type || r.assessment_type === assessment_type)
      );
      result = { rows: match ? [match] : [] };
    } else {
      result = await pool.query(
        `SELECT agency_name, project_name, assessment_type, assessment_type_label, uploaded_at
           FROM eia_list
          WHERE serial_no = $1
          ORDER BY uploaded_at DESC
          LIMIT 1`,
        [serial_no]
      );
    }

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
// 누적 업로드: 일련번호+기관명(정규화)+평가종류가 이미 있는 행은 건드리지 않고 건너뛰고,
// 새로운 행만 추가한다. 업로드 자료가 EIASS에서 그대로 받아오는 거라 기존 자료가 바뀔 일이
// 없다는 전제 — 그래서 덮어쓰기 없이 항상 "있으면 스킵, 없으면 추가"로만 동작한다.
router.post('/eia-list', async (req, res, next) => {
  const { assessment_type, rows } = req.body || {};

  if (!VALID_TYPES.includes(assessment_type)) {
    return res.status(400).json({ error: 'assessment_type이 올바르지 않습니다.' });
  }
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows는 배열이어야 합니다.' });
  }

  const usable = rows.filter(r => r && r.serial_no && String(r.serial_no).trim());
  const skipped_invalid = rows.length - usable.length;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT serial_no, agency_name FROM eia_list WHERE assessment_type = $1',
      [assessment_type]
    );
    const existingKeys = new Set(
      existing.rows.map(r => `${r.serial_no}|${normalizeAgency(r.agency_name)}`)
    );

    let inserted = 0;
    let skipped_duplicate = 0;
    for (const r of usable) {
      const serialNo = String(r.serial_no).trim();
      const key = `${serialNo}|${normalizeAgency(r.agency_name)}`;
      if (existingKeys.has(key)) { skipped_duplicate++; continue; }
      existingKeys.add(key); // 같은 업로드 안에서도 동일 키가 또 나오면 두 번째부터는 스킵

      await client.query(
        `INSERT INTO eia_list
           (serial_no, agency_name, project_name, assessment_type, assessment_type_label,
            consult_type, location, site_area, reply_date, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          serialNo,
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
      inserted++;
    }

    await client.query('COMMIT');
    res.status(201).json({ assessment_type, inserted, skipped_duplicate, skipped_invalid });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
