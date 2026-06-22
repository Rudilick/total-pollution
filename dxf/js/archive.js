/**
 * archive.js
 * 도면 아카이브 검색 및 슬롯 자동 채움
 */

// ── 관리자 페이지 진입 인증 ──────────────────────────────────
function enterArchiveAdmin(e) {
  if (e) e.preventDefault();

  if (localStorage.getItem('archiveAdminToken') === ARCHIVE_ADMIN_KEY) {
    location.href = 'archive-admin.html';
    return false;
  }

  const input = prompt('관리자 인증키를 입력하세요.');
  if (input === null) return false;

  if (input.trim() === ARCHIVE_ADMIN_KEY) {
    localStorage.setItem('archiveAdminToken', input.trim());
    location.href = 'archive-admin.html';
  } else {
    alert('인증키가 올바르지 않습니다.');
  }
  return false;
}

// ── 검색 (입력할 때마다 즉시 검색) ───────────────────────────
let _archiveSearchSeq = 0;

async function onArchiveSearch() {
  const input = document.getElementById('archive-query');
  const resultsEl = document.getElementById('archive-results');
  if (!input || !resultsEl) return;

  const q = input.value.trim();
  const seq = ++_archiveSearchSeq;

  if (!q) {
    resultsEl.innerHTML = '';
    return;
  }
  resultsEl.innerHTML = '<p class="archive-empty">검색 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('서버 응답 오류');
    const { projects } = await res.json();
    if (seq !== _archiveSearchSeq) return; // 이후 입력으로 인한 최신 요청이 아니면 무시
    renderArchiveResults(projects);
  } catch (e) {
    if (seq !== _archiveSearchSeq) return;
    resultsEl.innerHTML = `<p class="archive-empty">검색 실패: ${e.message}</p>`;
  }
}

function renderArchiveResults(projects) {
  const resultsEl = document.getElementById('archive-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '';

  if (!projects.length) {
    resultsEl.innerHTML = '<p class="archive-empty">검색 결과가 없습니다.</p>';
    return;
  }

  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'archive-card' + (p.has_drawings === false ? ' archive-card-nodrawing' : '');

    const metaParts = [];
    if (p.agency_name)     metaParts.push(p.agency_name);
    if (p.operator_name)  metaParts.push(p.operator_name);
    if (p.location)       metaParts.push(p.location);
    if (p.first_eia_year) metaParts.push(`${p.first_eia_year}년`);

    const badge = p.has_drawings === false
      ? '<div class="pill pill-warn">도면 미등록</div>'
      : `<div class="pill pill-nc">${p.stage_count}단계</div>`;

    card.innerHTML =
      `<div class="archive-card-main">
         <div class="archive-card-title">${p.serial_no} <span class="archive-card-name">${p.project_name || '(사업명 미확인)'}</span></div>
         <div class="archive-card-meta">${metaParts.join(' · ') || '&nbsp;'}</div>
       </div>
       ${badge}`;

    card.onclick = () => {
      if (p.has_drawings === false) {
        showNoDrawingsMessage(p);
      } else {
        loadArchiveProject(p.serial_no);
      }
    };
    resultsEl.appendChild(card);
  });
}

function showNoDrawingsMessage(p) {
  const resultsEl = document.getElementById('archive-results');
  if (!resultsEl) return;
  resultsEl.innerHTML =
    `<p class="archive-empty">"${p.project_name || p.serial_no}" (${p.serial_no}) — ` +
    `등록된 도면이 없습니다. 평가목록에만 등록된 사업입니다.</p>`;
}

function _archiveStageLabel(index) {
  return index === 0 ? '최초 도면' : `${index}차변경`;
}

async function loadArchiveProject(serialNo) {
  const resultsEl = document.getElementById('archive-results');
  if (resultsEl) resultsEl.innerHTML = '<p class="archive-empty">불러오는 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects/${encodeURIComponent(serialNo)}`);
    if (!res.ok) throw new Error('존재하지 않는 일련번호입니다.');
    const { project, drawings } = await res.json();

    if (!drawings.length) throw new Error('등록된 도면이 없습니다.');

    const newSlots = drawings.map(d => {
      const slot = _newSlot(d.stage_label);
      _initSlotFromParsed(slot, parseDXF(d.dxf_content));
      slot.file = { name: d.file_name };
      return slot;
    });
    newSlots.push(_newSlot(_archiveStageLabel(drawings.length)));

    slots = newSlots;
    renderSlotsWrap();
    updateRunBtn();

    if (resultsEl) {
      resultsEl.innerHTML =
        `<p class="archive-empty">"${project.project_name}" (${project.serial_no}) 도면 ${drawings.length}건을 불러왔습니다.</p>`;
    }
  } catch (e) {
    if (resultsEl) {
      resultsEl.innerHTML = `<p class="archive-empty">불러오기 실패: ${e.message}</p>`;
    }
  }
}
