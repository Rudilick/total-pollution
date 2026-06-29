/**
 * admin-auth.js
 * 관리자 토큰 인증 + 인증 헤더 포함 fetch — 관리자 관련 페이지(archive-admin.html,
 * eia-upload.html)에서 공통으로 쓴다.
 */

// ── 관리자 토큰 ──────────────────────────────────────────────
function _adminFetch(path, opts = {}) {
  const token = localStorage.getItem('archiveAdminToken') || '';
  const headers = Object.assign(
    { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    opts.headers || {}
  );
  return fetch(`${ARCHIVE_API_BASE}${path}`, Object.assign({}, opts, { headers }));
}

// ── 진입 인증 ────────────────────────────────────────────────
function _ensureAdminAuth() {
  let token = localStorage.getItem('archiveAdminToken');
  while (token !== ARCHIVE_ADMIN_KEY) {
    const input = prompt('관리자 인증키를 입력하세요.');
    if (input === null) {
      location.href = 'index.html';
      return false;
    }
    token = input.trim();
    if (token === ARCHIVE_ADMIN_KEY) {
      localStorage.setItem('archiveAdminToken', token);
    } else {
      alert('인증키가 올바르지 않습니다.');
    }
  }
  return true;
}
