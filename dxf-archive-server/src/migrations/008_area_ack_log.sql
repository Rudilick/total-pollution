-- 도면 업로드(신규 등록/신규 단계 추가) 시 CAD 실측 면적과 DB 사업면적(eia_list.site_area)이
-- 다를 수 있음을 관리자에게 고지했고, 관리자가 이를 인지한 채로 진행했다는 감사 기록.
-- drawings 행은 나중에 삭제될 수 있으므로(단계 삭제), 감사 기록은 별도 테이블로 분리해
-- 원본이 지워져도 "그때 이 수치로 인정했었다"는 증거가 남도록 한다.
CREATE TABLE IF NOT EXISTS area_ack_log (
  id             SERIAL PRIMARY KEY,
  serial_no      TEXT NOT NULL REFERENCES projects(serial_no) ON DELETE CASCADE,
  stage_index    INTEGER NOT NULL,
  cad_area       NUMERIC NOT NULL,
  db_site_area   NUMERIC,
  diff_area      NUMERIC,
  diff_pct       NUMERIC,
  acked_province TEXT,
  acked_city     TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  acked_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_area_ack_log_serial ON area_ack_log (serial_no);
