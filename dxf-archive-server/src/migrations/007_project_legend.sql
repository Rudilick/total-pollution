-- 도면 아카이브 관리자에서도 색상별 용도명(범례)을 입력/보관할 수 있게 한다.
-- 분석기 화면의 globalLegend/applyColorLegend와 같은 모양 [{colorKey, label}, ...]을
-- 그대로 저장해서, 도면을 다시 불러올 때 변환 없이 그대로 복원한다.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color_legend JSONB NOT NULL DEFAULT '[]'::jsonb;
