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

// ── 검색/기본목록 공용 — 정렬은 서버가 이미 "도면 있는 사업 우선 → 그 안에서
// 일련번호 숫자 큰(최신) 순"으로 내려주므로 여기서 다시 정렬하지 않는다.
let _archiveSearchSeq = 0;
let _archiveCurrentQuery = '';
let _archiveCurrentPage = 1;

async function loadDefaultArchiveList() {
  await _fetchArchivePage('', 1);
}

// ── 검색 (입력할 때마다 즉시 검색, 항상 1페이지부터) ───────────────────────────
async function onArchiveSearch() {
  const input = document.getElementById('archive-query');
  if (!input) return;
  await _fetchArchivePage(input.value.trim(), 1);
}

async function _fetchArchivePage(q, page) {
  const resultsEl = document.getElementById('archive-results');
  if (!resultsEl) return;
  const seq = ++_archiveSearchSeq;
  _archiveCurrentQuery = q;
  _archiveCurrentPage = page;
  resultsEl.innerHTML = `<p class="archive-empty">${q ? '검색 중...' : '불러오는 중...'}</p>`;
  const statusEl = document.getElementById('archive-load-status');
  if (statusEl) statusEl.innerHTML = '';

  try {
    const url = `${ARCHIVE_API_BASE}/projects?q=${encodeURIComponent(q)}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('서버 응답 오류');
    const { projects, total, pageSize } = await res.json();
    if (seq !== _archiveSearchSeq) return; // 이후 입력/클릭으로 인한 최신 요청이 아니면 무시
    renderArchiveResults(projects);
    renderArchivePagination(total, page, pageSize);
  } catch (e) {
    if (seq !== _archiveSearchSeq) return;
    resultsEl.innerHTML = `<p class="archive-empty">${q ? '검색 실패' : '목록을 불러오지 못했습니다'}: ${e.message}</p>`;
  }
}

function renderArchivePagination(total, page, pageSize) {
  const wrapId = 'archive-pagination';
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'pagination';
    document.getElementById('archive-results').insertAdjacentElement('afterend', wrap);
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) { wrap.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= pageCount; i++) {
    html += `<button class="pagination-btn${i === page ? ' pagination-btn-active' : ''}" data-page="${i}">${i}</button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.onclick = () => _fetchArchivePage(_archiveCurrentQuery, Number(btn.dataset.page));
  });
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
      : '<div class="pill pill-status-ok pill-status">도면<br>등록</div>';

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
        // 목록은 그대로 두고 클릭한 카드만 파란톤으로 강조 — 다른 카드를 또 비교해
        // 누르기 편하게 목록이 사라지지 않게 한다.
        resultsEl.querySelectorAll('.archive-card-selected').forEach(c => c.classList.remove('archive-card-selected'));
        card.classList.add('archive-card-selected');
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
  const statusEl = document.getElementById('archive-load-status');
  if (statusEl) statusEl.innerHTML = '<p class="archive-empty">불러오는 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects/${encodeURIComponent(serialNo)}`);
    if (!res.ok) throw new Error('존재하지 않는 일련번호입니다.');
    const { project, drawings } = await res.json();

    if (!drawings.length) throw new Error('등록된 도면이 없습니다.');

    // _initSlotFromParsed()는 전역 slots 배열을 기준으로 색상범례(legend)를 다시
    // 계산하는데, 그 시점엔 아직 slots가 예전(또는 빈) 배열을 가리키고 있어서
    // 방금 불러온 도면들의 rawData가 legend 계산에서 통째로 빠지고 slot.data가
    // 끝까지 null로 남는 버그가 있었다(그래서 "해치 도형을 찾지 못했습니다"가 남).
    // rawData만 먼저 채워서 slots를 교체한 다음, legend를 한 번에 다시 계산한다.
    const newSlots = drawings.map(d => {
      const slot = _newSlot(d.stage_label);
      slot.dxfText = d.dxf_content;
      slot.rawData = parseDXF(d.dxf_content);
      slot.file = { name: d.file_name };
      return slot;
    });
    newSlots.push(_newSlot(_archiveStageLabel(drawings.length)));

    slots = newSlots;
    _refreshGlobalLegend();
    renderSlotsWrap();
    updateRunBtn();

    if (statusEl) {
      statusEl.innerHTML =
        `<p class="archive-empty">"${project.project_name}" (${project.serial_no}) 도면 ${drawings.length}건을 불러왔습니다.</p>`;
    }
  } catch (e) {
    if (statusEl) {
      statusEl.innerHTML = `<p class="archive-empty">불러오기 실패: ${e.message}</p>`;
    }
  }
}
