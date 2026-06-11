CREATE TABLE IF NOT EXISTS projects (
  serial_no       TEXT PRIMARY KEY,           -- 일련번호 (예: HG20261345)
  project_name    TEXT NOT NULL,              -- 사업명
  operator_name   TEXT,                       -- 사업자명
  location        TEXT,                       -- 위치 (시도/시군구 등 자유 텍스트)
  first_eia_year  INTEGER,                    -- 최초 환경영향평가 연도
  notes           TEXT,                       -- 비고
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drawings (
  id              SERIAL PRIMARY KEY,
  serial_no       TEXT NOT NULL REFERENCES projects(serial_no) ON DELETE CASCADE,
  stage_index     INTEGER NOT NULL,           -- 0=최초도면, 1=1차변경, 2=2차변경, ...
  stage_label     TEXT NOT NULL,              -- '최초도면' | 'N차변경'
  file_name       TEXT NOT NULL,
  dxf_content     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (serial_no, stage_index)
);

CREATE INDEX IF NOT EXISTS idx_projects_name   ON projects (project_name);
CREATE INDEX IF NOT EXISTS idx_drawings_serial ON drawings (serial_no, stage_index);
