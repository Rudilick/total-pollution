-- 지역(광역/기초자치단체)별 로그인 + 데이터 격리를 위한 스키마.
-- 광역/기초자치단체 고정 목록을 따로 하드코딩하지 않고, eia_list 업로드에 실제로 나온
-- (province, city) 조합을 그대로 지역 후보로 자동 등록한다(routes/eiaList.js 참고).

ALTER TABLE eia_list ADD COLUMN IF NOT EXISTS province TEXT; -- 광역자치단체
ALTER TABLE eia_list ADD COLUMN IF NOT EXISTS city     TEXT; -- 기초자치단체

ALTER TABLE projects ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city     TEXT;

CREATE TABLE IF NOT EXISTS region_credentials (
  id                    SERIAL PRIMARY KEY,
  province              TEXT NOT NULL,
  city                  TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (province, city)
);
