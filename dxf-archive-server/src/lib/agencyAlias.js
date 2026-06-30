/**
 * agencyAlias.js
 * 기관명 개편/명칭 변경으로 같은 기관이 다른 이름으로 기록된 경우를 매칭 시 같은
 * 기관으로 취급하기 위한 정규화. (예: 환경부 → 기후에너지환경부)
 *
 * 주의: routes/projects.js의 SQL에 이 맵과 동일한 규칙을 CASE WHEN으로 인라인해서
 * 쓰는 곳이 있다 — 이 맵을 바꾸면 그쪽 SQL도 같이 맞춰야 한다.
 */

const AGENCY_ALIASES = {
  '환경부': '기후에너지환경부',
};

/** 매칭용으로 기관명을 정규화한다(표시용 원본 값은 그대로 둔 채, 비교할 때만 사용) */
function normalizeAgency(name) {
  const trimmed = String(name || '').trim();
  return AGENCY_ALIASES[trimmed] || trimmed;
}

module.exports = { normalizeAgency, AGENCY_ALIASES };
