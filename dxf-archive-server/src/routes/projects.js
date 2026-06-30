const express = require('express');
const { pool } = require('../db');
const { optionalRegionAuth } = require('../middleware/authJwt');

const router = express.Router();

// GET /api/projects?q=검색어
// 지역 로그인 상태(req.region)면 그 지역(province+city) 결과만 보여준다 — 관리자 페이지의
// "기존 협의자료 불러오기"가 자기 지역 목록으로만 자동완성되게. 로그인 없이 호출하면(공개
// 분석기 화면) 기존처럼 전체를 보여준다(하위호환, 공개 비교 도구는 지역 제한이 필요 없음).
router.get('/projects', optionalRegionAuth, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const region = req.region || null;

    // 도면이 이미 등록된 사업(projects)뿐 아니라, 아직 도면 없이 평가목록(eia_list)에만
    // 있는 사업도 같이 보여준다 — has_drawings로 클라이언트가 구분한다.
    // q가 빈 문자열이면 ILIKE 패턴이 전부 '%'(전체일치)가 되어 검색어 없이 전체 목록을
    // 그대로 가져온다 — "검색 전 기본 목록"과 "검색"을 같은 쿼리로 처리한다.
    const result = await pool.query(
      `SELECT serial_no, project_name, operator_name, location, first_eia_year, agency_name,
              stage_count, has_drawings
         FROM (
           SELECT p.serial_no, p.project_name, p.operator_name, p.location, p.first_eia_year,
                  p.agency_name,
                  COUNT(d.id)::int AS stage_count,
                  TRUE AS has_drawings,
                  p.updated_at AS sort_key
             FROM projects p
             LEFT JOIN drawings d ON d.serial_no = p.serial_no
            WHERE ($2::text IS NULL OR (p.province = $2 AND p.city = $3))
              AND (
                p.serial_no ILIKE $1 || '%'
               OR p.project_name ILIKE '%' || $1 || '%'
               OR p.operator_name ILIKE '%' || $1 || '%'
               OR p.location ILIKE '%' || $1 || '%'
              )
            GROUP BY p.serial_no

           UNION ALL

           SELECT e.serial_no,
                  MAX(e.project_name)  AS project_name,
                  NULL                 AS operator_name,
                  MAX(e.location)      AS location,
                  NULL                 AS first_eia_year,
                  MAX(e.agency_name)   AS agency_name,
                  0                    AS stage_count,
                  FALSE                AS has_drawings,
                  MAX(e.uploaded_at)   AS sort_key
             FROM eia_list e
            -- 일련번호+기관명(정규화)+평가종류 3종이 모두 일치하는 등록된 사업이 있으면 제외.
            -- 기관명/평가종류가 비어있는(예전에 등록된) 사업은 일련번호만으로 매칭해서
            -- 새 컬럼이 없는 과거 데이터에서 같은 사업이 중복으로 보이지 않게 한다.
            -- (lib/agencyAlias.js와 같은 규칙 — 거기 바뀌면 여기도 같이 바꿔야 함)
            WHERE NOT EXISTS (
              SELECT 1 FROM projects p
               WHERE p.serial_no = e.serial_no
                 AND (
                   p.agency_name IS NULL OR e.agency_name IS NULL OR
                   (CASE WHEN p.agency_name = '환경부' THEN '기후에너지환경부' ELSE p.agency_name END) =
                   (CASE WHEN e.agency_name = '환경부' THEN '기후에너지환경부' ELSE e.agency_name END)
                 )
                 AND (p.assessment_type IS NULL OR p.assessment_type = e.assessment_type)
            )
              AND ($2::text IS NULL OR (e.province = $2 AND e.city = $3))
              AND (
                e.serial_no ILIKE $1 || '%'
                OR e.project_name ILIKE '%' || $1 || '%'
                OR e.agency_name ILIKE '%' || $1 || '%'
                OR e.location ILIKE '%' || $1 || '%'
              )
            GROUP BY e.serial_no
         ) combined
        ORDER BY has_drawings DESC, sort_key DESC
        LIMIT 200`,
      [q, region?.province ?? null, region?.city ?? null]
    );

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
              agency_name, assessment_type, created_at, updated_at
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
