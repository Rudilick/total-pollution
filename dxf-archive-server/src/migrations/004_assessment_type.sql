-- projects에 평가종류 컬럼 추가 — eia_list와의 매칭(일련번호+기관명+평가종류 3종 교차검증)에 필요.
-- projects 자체의 기본키(serial_no)는 그대로 유지, 이 컬럼은 매칭/표시용 부가 정보일 뿐이다.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assessment_type TEXT;
