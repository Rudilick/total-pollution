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
// 비밀번호를 프런트 소스에 박아두지 않고, 서버(ADMIN_TOKEN 환경변수)에 물어봐서
// 검증한다 — 통과한 값만 localStorage에 저장해 이후 _adminFetch의 Bearer 토큰으로 쓴다.
async function _verifyAdminPassword(password) {
  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/admin-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function _ensureAdminAuth() {
  const stored = localStorage.getItem('archiveAdminToken');
  if (stored && await _verifyAdminPassword(stored)) return true;
  if (stored) localStorage.removeItem('archiveAdminToken');

  while (true) {
    const input = prompt('관리자 비밀번호를 입력하세요.');
    if (input === null) {
      location.href = 'index.html';
      return false;
    }
    const password = input.trim();
    if (await _verifyAdminPassword(password)) {
      localStorage.setItem('archiveAdminToken', password);
      return true;
    }
    alert('비밀번호가 올바르지 않습니다.');
  }
}
