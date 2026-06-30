/**
 * archive.js
 * 도면 아카이브 검색 및 슬롯 자동 채움
 */

// ── 검색/기본목록 공용 — 정렬은 서버가 이미 "도면 있는 사업 우선 → 그 안에서
// 일련번호 숫자 큰(최신) 순"으로 내려주므로 여기서 다시 정렬하지 않는다.
let _archiveSearchSeq = 0;
let _archiveCurrentQuery = '';
let _archiveCurrentPage = 1;
let _selectedProject = null; // 현재 선택(핀 고정)된 프로젝트 객체

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

function _makeArchiveCard(p, resultsEl) {
  const card = document.createElement('div');
  card.className = 'archive-card' + (p.has_drawings === false ? ' archive-card-nodrawing' : '');

  const badge = p.has_drawings === false
    ? '<div class="drawing-circle drawing-circle-none">도면<br>미등록</div>'
    : '<div class="drawing-circle drawing-circle-ok">도면<br>등록</div>';

  const siteAreaHtml = p.site_area
    ? Number(p.site_area).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
    : '–';

  card.innerHTML =
    `<div class="archive-card-main">
       <div class="archive-card-row1">
         <div class="archive-field">
           <div class="archive-field-label">사업명</div>
           <div class="archive-field-value">${p.project_name || '–'}</div>
         </div>
         <div class="archive-field">
           <div class="archive-field-label">소재지</div>
           <div class="archive-field-value">${p.location || '–'}</div>
         </div>
       </div>
       <div class="archive-card-row2">
         <div class="archive-field">
           <div class="archive-field-label">사업코드</div>
           <div class="archive-field-value">${p.serial_no || '–'}</div>
         </div>
         <div class="archive-field">
           <div class="archive-field-label">협의년도</div>
           <div class="archive-field-value">${p.first_eia_year || '–'}</div>
         </div>
         <div class="archive-field">
           <div class="archive-field-label">규모(㎡)</div>
           <div class="archive-field-value">${siteAreaHtml}</div>
         </div>
         <div class="archive-field">
           <div class="archive-field-label">사업자</div>
           <div class="archive-field-value">${p.operator_name || '–'}</div>
         </div>
         <div class="archive-field">
           <div class="archive-field-label">협의기관</div>
           <div class="archive-field-value">${p.agency_name || '–'}</div>
         </div>
         <div class="archive-field">
           <div class="archive-field-label">${_assessmentTypeMarkerHtml(p.assessment_type)}평가종류</div>
           <div class="archive-field-value">${p.assessment_type || '–'}</div>
         </div>
       </div>
     </div>
     ${badge}`;

  card.onclick = () => {
    if (p.has_drawings === false) {
      card.classList.add('archive-card-pressed');
      setTimeout(() => card.classList.remove('archive-card-pressed'), 150);
    } else if (_selectedProject?.serial_no === p.serial_no) {
      // 이미 선택된 카드 재클릭 → 선택 해제 + 슬롯 초기화
      _selectedProject = null;
      initSlots();
      _refreshGlobalLegend();
      updateRunBtn();
      renderArchiveResults(_lastRenderProjects || []);
    } else {
      _selectedProject = p;
      loadArchiveProject(p.serial_no);
      renderArchiveResults(_lastRenderProjects || []);
    }
  };

  return card;
}

let _lastRenderProjects = [];

function renderArchiveResults(projects) {
  _lastRenderProjects = projects;
  const resultsEl = document.getElementById('archive-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '';

  const hasResults = projects.length > 0 || _selectedProject != null;
  if (!hasResults) {
    resultsEl.innerHTML = '<p class="archive-empty">검색 결과가 없습니다.</p>';
    return;
  }

  // 선택 카드가 있으면 최상단 핀 고정
  if (_selectedProject) {
    const pinCard = _makeArchiveCard(_selectedProject, resultsEl);
    pinCard.classList.add('archive-card-selected');
    resultsEl.appendChild(pinCard);
  }

  // 검색 결과 (선택 카드는 제외해 중복 방지)
  projects
    .filter(p => p.serial_no !== _selectedProject?.serial_no)
    .forEach(p => resultsEl.appendChild(_makeArchiveCard(p, resultsEl)));
}

function _archiveStageLabel(index) {
  return index === 0 ? '최초 도면' : `${index}차변경`;
}

async function loadArchiveProject(serialNo) {
  const statusEl = document.getElementById('archive-load-status');

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
    // 도면 아카이브 관리자에서 저장해둔 색상별 용도명(project.color_legend)이 있으면
    // 먼저 복원해서, 새로 감지된 색만 빈 라벨로 추가되고 기존 라벨은 유지되게 한다.
    globalLegend = Array.isArray(project.color_legend) ? project.color_legend : [];
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

    if (statusEl) statusEl.innerHTML = ''; // 카드가 파란색으로 강조되는 것만으로 충분 — 별도 안내문구 불필요
  } catch (e) {
    if (statusEl) {
      statusEl.innerHTML = `<p class="archive-empty">불러오기 실패: ${e.message}</p>`;
    }
  }
}
