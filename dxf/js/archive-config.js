/**
 * archive-config.js
 * 도면 아카이브 API 서버 주소
 */

const ARCHIVE_API_BASE = 'https://total-pollution-production.up.railway.app/api';
// 로컬 개발 시: const ARCHIVE_API_BASE = 'http://localhost:3000/api';

// 도면 아카이브 관리자 페이지 진입 인증키 (백엔드 ADMIN_TOKEN과 동일)
const ARCHIVE_ADMIN_KEY = 'a19900427!';

// 평가종류별 2글자 마커 + 색상톤 — 검색 결과 카드에서 한눈에 구분하려고 둔다.
// (dxf/js/archive.js, dxf/js/archive-admin.js 양쪽 검색 카드에서 공통으로 씀)
const ASSESSMENT_TYPE_MARKERS = {
  '전략환경영향평가':   { label: '전략', cls: 'pill-type-strategic' },
  '환경영향평가':       { label: '환평', cls: 'pill-type-full' },
  '소규모환경영향평가': { label: '소평', cls: 'pill-type-small' },
  '사전환경성검토':     { label: '사전', cls: 'pill-type-pre' },
};

/** 평가종류 마커 pill HTML(없으면 빈 문자열) */
function _assessmentTypeMarkerHtml(assessmentType) {
  const m = ASSESSMENT_TYPE_MARKERS[assessmentType];
  return m ? `<span class="pill ${m.cls}">${m.label}</span>` : '';
}
