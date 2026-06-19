-- 설계사무소
CREATE TABLE IF NOT EXISTS offices (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,              -- 사무소명
  registration_no TEXT,                       -- 등록번호 (공공데이터 출처, 없으면 NULL)
  region          TEXT,                       -- 지역
  source          TEXT,                       -- 데이터 출처 (예: '공공데이터' | '직접입력')
  synced_at       TIMESTAMPTZ,                -- 공공데이터 최신화 일시 (직접입력이면 NULL)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offices_name ON offices (name);

-- 회원
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  office_id       INTEGER REFERENCES offices(id),
  role            TEXT NOT NULL DEFAULT 'member',   -- 'member' | 'admin'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_office ON users (office_id);

-- 회원가입 시 포괄 동의 로그 (체크 여부만이 아니라 그 시점에 보여준 문구 전문까지 같이 저장)
CREATE TABLE IF NOT EXISTS signup_consents (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  office_id       INTEGER REFERENCES offices(id),
  consent_type    TEXT NOT NULL,              -- 'terms' | 'privacy' | 'office_info' | 'cad_authority' | 'cad_license' | 'responsibility'
  consent_version TEXT NOT NULL,
  consent_text    TEXT NOT NULL,              -- 동의 시점에 표시된 문구 전문
  agreed          BOOLEAN NOT NULL,
  agreed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address      TEXT,
  user_agent      TEXT,
  service_name    TEXT NOT NULL DEFAULT 'ENVELO'
);
CREATE INDEX IF NOT EXISTS idx_signup_consents_user ON signup_consents (user_id);

-- 분석 실행(아카이브 등록) 건별 동의 로그 — 같은 파일이라도 클릭마다 새로 쌓인다
CREATE TABLE IF NOT EXISTS analysis_consents (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  office_id       INTEGER REFERENCES offices(id),
  serial_no       TEXT REFERENCES projects(serial_no),
  drawing_id      INTEGER REFERENCES drawings(id),
  file_hash       TEXT,                       -- 분석 실행 시점 CAD 파일의 SHA-256
  original_filename TEXT,
  consent_type    TEXT NOT NULL,              -- 'analysis_archive' | 'authority_confirm' | 'sensitive_confirm' | 'responsibility'
  consent_version TEXT NOT NULL,
  consent_text    TEXT NOT NULL,
  agreed          BOOLEAN NOT NULL,
  agreed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address      TEXT,
  user_agent      TEXT,
  service_name    TEXT NOT NULL DEFAULT 'ENVELO'
);
CREATE INDEX IF NOT EXISTS idx_analysis_consents_user ON analysis_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_consents_serial ON analysis_consents (serial_no);

-- 기존 projects/drawings에 회원·사무소·중복판단(해시) 연결
ALTER TABLE projects ADD COLUMN IF NOT EXISTS office_id INTEGER REFERENCES offices(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_drawings_hash ON drawings (file_hash);

-- 권리침해 신고
CREATE TABLE IF NOT EXISTS reports (
  id              SERIAL PRIMARY KEY,
  serial_no       TEXT REFERENCES projects(serial_no),
  drawing_id      INTEGER REFERENCES drawings(id),
  reporter_id     INTEGER REFERENCES users(id),
  reporter_email  TEXT,                       -- 비회원 신고도 받을 수 있게 이메일도 같이 둠
  report_type     TEXT NOT NULL,              -- '저작권' | '개인정보' | '영업비밀' | '군사시설' | '소속오표시' | '기타'
  content         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewing' | 'kept' | 'hidden' | 'deleted' | 'rejected'
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
