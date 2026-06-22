-- 환경영향평가 공식 목록 (전략환경영향평가/환경영향평가/소규모환경영향평가/사전환경성검토)
-- 종류별로 통째로 교체 가능 — projects/drawings와는 살아있는 의존관계 없음
CREATE TABLE IF NOT EXISTS eia_list (
  id                     SERIAL PRIMARY KEY,
  serial_no              TEXT NOT NULL,                 -- 사업코드
  agency_name            TEXT,                          -- 기관명 (협의기관)
  project_name           TEXT,                          -- 사업명
  assessment_type        TEXT NOT NULL,                 -- 업로드 탭이 결정한 4종 중 하나 (삭제 범위 기준값)
  assessment_type_label  TEXT,                          -- 엑셀 원본 '환경영향평가종류' 텍스트 (참고/표시용)
  consult_type           TEXT,                          -- 협의구분: 본협의 | 재협의 | 변경협의
  location               TEXT,                          -- 사업지
  site_area              NUMERIC,                       -- 규모 (대지면적)
  reply_date             DATE,                          -- 회신일
  is_public              BOOLEAN,                       -- 평가서 공개유무
  uploaded_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eia_list_serial ON eia_list (serial_no);
CREATE INDEX IF NOT EXISTS idx_eia_list_type   ON eia_list (assessment_type);

-- projects에 기관명 스냅샷 컬럼 추가 — eia_list가 나중에 갈아엎여도 등록된 사업은 영향 없음
ALTER TABLE projects ADD COLUMN IF NOT EXISTS agency_name TEXT;
