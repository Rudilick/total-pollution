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

// ── 검색어가 없을 때(검색창이 비어있는 초기 상태) 기본으로 보여줄 목록 —
// 정렬은 서버가 이미 "도면 있는 사업 우선 → 그 안에서 일련번호 숫자 큰(최신) 순"으로
// 내려주므로 여기서 다시 정렬하지 않는다(중복 정렬은 기준이 어긋날 위험만 키운다).
async function loadDefaultArchiveList() {
  const resultsEl = document.getElementById('archive-results');
  if (!resultsEl) return;
  const seq = ++_archiveSearchSeq;
  resultsEl.innerHTML = '<p class="archive-empty">불러오는 중...</p>';
  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects`);
    if (!res.ok) throw new Error('서버 응답 오류');
    const { projects } = await res.json();
    if (seq !== _archiveSearchSeq) return;
    renderArchiveResults(projects);
  } catch (e) {
    if (seq !== _archiveSearchSeq) return;
    resultsEl.innerHTML = `<p class="archive-empty">목록을 불러오지 못했습니다: ${e.message}</p>`;
  }
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
    loadDefaultArchiveList();
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

    const boldParts = [p.serial_no, p.operator_name].filter(Boolean).join(' ');
    const agencyHtml = p.agency_name ? `<span class="archive-card-agency">${p.agency_name}</span>` : '';
    const badge = p.has_drawings === false
      ? '<div class="pill pill-warn pill-status">도면<br>미등록</div>'
      : '<div class="pill pill-nc pill-status">도면<br>등록</div>';

    card.innerHTML =
      `<div class="archive-card-main">
         <div class="archive-card-title">${_assessmentTypeMarkerHtml(p.assessment_type)}${boldParts}${agencyHtml}</div>
         <div class="archive-card-project-name">${p.project_name || '(사업명 미확인)'}</div>
         <div class="archive-card-meta">${p.location || '&nbsp;'}</div>
       </div>
       ${badge}`;

    card.onclick = () => {
      if (p.has_drawings === false) {
        // 도면 미등록 사업은 이동할 곳이 없다 — 눌렀다는 시각 피드백만 잠깐 주고 끝낸다
        // ("도면 미등록" 배지로 이미 안내가 되어 있어 별도 메시지는 불필요).
        card.classList.add('archive-card-pressed');
        setTimeout(() => card.classList.remove('archive-card-pressed'), 150);
      } else {
        loadArchiveProject(p.serial_no);
      }
    };
    resultsEl.appendChild(card);
  });
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
      slot.dxfText = d.dxf_content;
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
