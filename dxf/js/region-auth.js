/**
 * region-auth.js
 * 지역(광역/기초자치단체) 로그인 — archive-admin.html에서 사용. 슈퍼관리자 키
 * (admin-auth.js)와는 별개의 토큰(localStorage 'regionToken')으로 동작한다.
 */

let _regionsCache = null;

function _regionFetch(path, opts = {}) {
  const token = localStorage.getItem('regionToken') || '';
  const headers = Object.assign(
    { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    opts.headers || {}
  );
  return fetch(`${ARCHIVE_API_BASE}${path}`, Object.assign({}, opts, { headers }));
}

async function _loadRegionOptions() {
  const provinceSel = document.getElementById('login-province');
  if (!provinceSel) return;
  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/region-auth/regions`);
    const data = await res.json();
    _regionsCache = data.regions || [];
    const provinces = [...new Set(_regionsCache.map(r => r.province))].sort();
    provinces.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      provinceSel.appendChild(opt);
    });
  } catch (e) {
    const statusEl = document.getElementById('region-login-status');
    if (statusEl) statusEl.innerHTML = `<p class="status-err">지역 목록을 불러오지 못했습니다: ${e.message}</p>`;
  }
}

function _onLoginProvinceChange() {
  const province = document.getElementById('login-province').value;
  const citySel = document.getElementById('login-city');
  citySel.innerHTML = '<option value="">기초자치단체 선택</option>';
  if (!province || !_regionsCache) { citySel.disabled = true; return; }
  const cities = _regionsCache.filter(r => r.province === province).map(r => r.city).sort();
  cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    citySel.appendChild(opt);
  });
  citySel.disabled = false;
}

async function _regionLogin() {
  const province = document.getElementById('login-province').value;
  const city = document.getElementById('login-city').value;
  const password = document.getElementById('login-password').value;
  const statusEl = document.getElementById('region-login-status');

  if (!province || !city || !password) {
    statusEl.innerHTML = '<p class="status-err">광역·기초자치단체, 비밀번호를 모두 선택/입력하세요.</p>';
    return;
  }
  statusEl.innerHTML = '<p class="archive-empty">로그인 중...</p>';
  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/region-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ province, city, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '로그인 실패');

    localStorage.setItem('regionToken', data.token);
    localStorage.setItem('regionProvince', data.province);
    localStorage.setItem('regionCity', data.city);
    document.getElementById('login-password').value = '';
    statusEl.innerHTML = '';

    if (data.mustChangePassword) {
      _showRegionScreen('changepw');
    } else {
      _enterAdminMain();
    }
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

async function _regionChangePassword() {
  const pw1 = document.getElementById('new-pw-1').value;
  const pw2 = document.getElementById('new-pw-2').value;
  const statusEl = document.getElementById('region-changepw-status');

  if (!pw1 || !pw2) {
    statusEl.innerHTML = '<p class="status-err">새 비밀번호를 두 번 입력하세요.</p>';
    return;
  }
  if (pw1 !== pw2) {
    statusEl.innerHTML = '<p class="status-err">입력한 비밀번호가 서로 다릅니다.</p>';
    return;
  }
  if (pw1.length < 4) {
    statusEl.innerHTML = '<p class="status-err">비밀번호는 4자 이상이어야 합니다.</p>';
    return;
  }
  statusEl.innerHTML = '<p class="archive-empty">변경 중...</p>';
  try {
    const res = await _regionFetch('/region-auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: pw1, newPassword2: pw2 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '변경 실패');
    document.getElementById('new-pw-1').value = '';
    document.getElementById('new-pw-2').value = '';
    _enterAdminMain();
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

function _showRegionScreen(which) {
  document.getElementById('region-login-screen').style.display = which === 'login' ? '' : 'none';
  document.getElementById('region-changepw-screen').style.display = which === 'changepw' ? '' : 'none';
  document.getElementById('admin-main-content').style.display = 'none';
  document.getElementById('region-session-info').style.display = 'none';
}

function _enterAdminMain() {
  document.getElementById('region-login-screen').style.display = 'none';
  document.getElementById('region-changepw-screen').style.display = 'none';
  document.getElementById('admin-main-content').style.display = '';

  const province = localStorage.getItem('regionProvince');
  const city = localStorage.getItem('regionCity');
  const infoEl = document.getElementById('region-session-info');
  infoEl.style.display = '';
  infoEl.innerHTML = `📍 ${province} ${city}로 로그인됨 · <a onclick="_regionLogout()">로그아웃</a>`;

  if (typeof initAdminSlots === 'function') initAdminSlots();
  if (typeof loadAdminDefaultList === 'function') loadAdminDefaultList();
}

function _regionLogout() {
  localStorage.removeItem('regionToken');
  localStorage.removeItem('regionProvince');
  localStorage.removeItem('regionCity');
  location.reload();
}

// ── 초기화 — 이미 로그인돼 있으면 토큰 유효성 확인 후 바로 본문 진입 ──────
document.addEventListener('DOMContentLoaded', async () => {
  await _loadRegionOptions();

  const token = localStorage.getItem('regionToken');
  if (!token) { _showRegionScreen('login'); return; }

  try {
    const res = await _regionFetch('/region-auth/me');
    if (!res.ok) throw new Error('토큰 무효');
    _enterAdminMain();
  } catch (e) {
    localStorage.removeItem('regionToken');
    _showRegionScreen('login');
  }
});
