-- 평가목록(eia_list)에도 사업자명을 받아서 검색 카드에 보여줄 수 있게 한다
-- (기존엔 등록된 사업(projects)에만 있었음 — eia_list는 컬럼 자체가 없었음).
ALTER TABLE eia_list ADD COLUMN IF NOT EXISTS operator_name TEXT;
