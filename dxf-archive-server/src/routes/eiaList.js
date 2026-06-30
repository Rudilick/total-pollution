const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const { normalizeAgency } = require('../lib/agencyAlias');

const router = express.Router();

const DEFAULT_REGION_PASSWORD = '0000';

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

// PATCH /api/eia-list/reclassify  (업로드 시 종류를 잘못 골라 올린 경우 일괄 정정용)
// body: { from_type, to_type }
router.patch('/eia-list/reclassify', async (req, res, next) => {
  const { from_type, to_type } = req.body || {};
  if (!VALID_TYPES.includes(from_type) || !VALID_TYPES.includes(to_type)) {
    return res.status(400).json({ error: 'from_type/to_type이 올바르지 않습니다.' });
  }
  try {
    const result = await pool.query(
      'UPDATE eia_list SET assessment_type = $2, assessment_type_label = $2 WHERE assessment_type = $1',
      [from_type, to_type]
    );
    res.json({ updated: result.rowCount });
  } catch (e) {
    next(e);
  }
});

// POST /api/eia-list
// body: { rows: [{ serial_no, agency_name, project_name, assessment_type_label,
//         consult_type, location, site_area, reply_date, is_public, province, city }, ...] }
// 평가종류는 각 행의 assessment_type_label(엑셀 "구분"/"환경영향평가종류" 칸 값)로 정한다 —
// 업로드 화면의 어느 버튼/칸을 썼는지가 아니라 엑셀 내용 자체가 출처. (예전엔 업로드 시
// 고른 종류를 행 전체에 강제 적용했는데, 파일을 잘못된 칸에 올리면 통째로 잘못 분류되는
// 사고가 났음 — 행 내용을 직접 보고 분류하면 이 문제가 안 생긴다.)
// 누적 업로드: 일련번호+기관명(정규화)+평가종류가 이미 있는 행은 건드리지 않고 건너뛰고,
// 새로운 행만 추가한다. 업로드 자료가 EIASS에서 그대로 받아오는 거라 기존 자료가 바뀔 일이
// 없다는 전제 — 그래서 덮어쓰기 없이 항상 "있으면 스킵, 없으면 추가"로만 동작한다.
// 행에 광역/기초자치단체가 있으면, 처음 보는 (province, city) 조합은 비밀번호 "0000"으로
// region_credentials에 자동 등록한다(지역 로그인 후보) — 고정 행정구역 목록을 따로
// 하드코딩하지 않고 실제 업로드된 데이터를 그대로 지역 후보로 쓴다.
router.post('/eia-list', async (req, res, next) => {
  const { rows } = req.body || {};

  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows는 배열이어야 합니다.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT serial_no, agency_name, assessment_type FROM eia_list');
    const existingKeys = new Set(
      existing.rows.map(r => `${r.assessment_type}|${r.serial_no}|${normalizeAgency(r.agency_name)}`)
    );

    const existingRegions = await client.query('SELECT province, city FROM region_credentials');
    const knownRegions = new Set(existingRegions.rows.map(r => `${r.province}|${r.city}`));
    const defaultPasswordHash = await bcrypt.hash(DEFAULT_REGION_PASSWORD, 10);

    const inserted_by_type = {};
    for (const t of VALID_TYPES) inserted_by_type[t] = 0;
    let skipped_duplicate = 0;
    let skipped_invalid = 0;
    let regions_registered = 0;

    for (const r of rows) {
      const serialNo = String(r?.serial_no || '').trim();
      const type = String(r?.assessment_type_label || '').trim();
      if (!serialNo || !VALID_TYPES.includes(type)) { skipped_invalid++; continue; }

      const key = `${type}|${serialNo}|${normalizeAgency(r.agency_name)}`;
      if (existingKeys.has(key)) { skipped_duplicate++; continue; }
      existingKeys.add(key); // 같은 업로드 안에서도 동일 키가 또 나오면 두 번째부터는 스킵

      const province = String(r.province || '').trim() || null;
      const city = String(r.city || '').trim() || null;

      await client.query(
        `INSERT INTO eia_list
           (serial_no, agency_name, project_name, assessment_type, assessment_type_label,
            consult_type, location, site_area, reply_date, is_public, province, city, operator_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          serialNo,
          r.agency_name || null,
          r.project_name || null,
          type,
          type,
          r.consult_type || null,
          r.location || null,
          r.site_area === '' || r.site_area === undefined || r.site_area === null ? null : Number(r.site_area),
          r.reply_date || null,
          typeof r.is_public === 'boolean' ? r.is_public : null,
          province,
          city,
          r.operator_name || null,
        ]
      );
      inserted_by_type[type]++;

      if (province && city) {
        const regionKey = `${province}|${city}`;
        if (!knownRegions.has(regionKey)) {
          knownRegions.add(regionKey);
          await client.query(
            `INSERT INTO region_credentials (province, city, password_hash, must_change_password)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (province, city) DO NOTHING`,
            [province, city, defaultPasswordHash]
          );
          regions_registered++;
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ inserted_by_type, skipped_duplicate, skipped_invalid, regions_registered });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
