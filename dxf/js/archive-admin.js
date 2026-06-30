/**
 * archive-admin.js
 * 도면 아카이브 관리자 페이지 - 신규 등록 / 단계 추가 / 삭제
 * (이 페이지의 사업/도면 조작은 지역 로그인(region-auth.js, _regionFetch)으로 인증한다 —
 *  슈퍼관리자 키(admin-auth.js)는 환경영향평가 목록 업로드/지역 비밀번호 관리 전용 페이지에서만 씀)
 */

// ── 신규 프로젝트 등록용 슬롯 ────────────────────────────────
let adminSlots = [];
let _adminSlotId = 0;

function _newAdminSlot(label) {
  return { id: ++_adminSlotId, label, data: null, rawData: null, file: null, dxfText: null, saved: false, stageIndex: null };
}

function _adminStageLabel(idx) {
  return idx === 0 ? '최초도면' : `${idx}차변경`;
}

function initAdminSlots() {
  adminSlots = [_newAdminSlot(_adminStageLabel(0))];
  adminLegend = [];
  renderNewSlotsWrap();
}

function addAdminSlot() {
  adminSlots.push(_newAdminSlot(_adminStageLabel(adminSlots.length)));
  renderNewSlotsWrap();
}

function removeAdminSlot(id) {
  if (adminSlots.length <= 1) return;
  adminSlots = adminSlots.filter(s => s.id !== id);
  _refreshAdminLegend();
  renderNewSlotsWrap();
}

async function handleAdminFileSelect(slot, file) {
  try {
    const text = await file.text();
    slot.dxfText = text;
    slot.rawData = parseDXF(text);
    slot.file = file;
    _refreshAdminLegend();
  } catch (e) {
    alert('DXF 파일 읽기 실패: ' + e.message);
  }
}

// ── 도면 미리보기 패널 ───────────────────────────────────────
let _selectedTileEl = null;
let _previewSlotId  = null;

function selectPreviewTile(el, data, label) {
  if (_selectedTileEl) _selectedTileEl.classList.remove('selected');
  el.classList.add('selected');
  _selectedTileEl = el;
  showPreview(data, label);
}

function showPreview(data, label) {
  const canvas = document.getElementById('preview-canvas');
  const empty  = document.getElementById('preview-empty');
  const meta   = document.getElementById('preview-meta');
  if (!canvas) return;

  if (!data) {
    canvas.style.display = 'none';
    empty.style.display  = 'flex';
    meta.textContent = '';
    return;
  }

  const box = canvas.parentElement.getBoundingClientRect();
  canvas.width  = box.width;
  canvas.height = box.height;
  canvas.style.display = 'block';
  empty.style.display  = 'none';
  drawThumbnail(canvas, data);
  meta.textContent = label || '';
}

function clearPreview() {
  if (_selectedTileEl) _selectedTileEl.classList.remove('selected');
  _selectedTileEl = null;
  showPreview(null);
}

// 업로드 슬롯 DOM (ui.js의 _makeSlotEl과 동일한 마크업/스타일을 재사용하되,
// 파일 선택 시 동작을 콜백으로 받음). 타임라인 타일 크기로 축소,
// 도면이 로드된 타일은 클릭 시 우측 미리보기 패널에 표시되고
// 파일 교체는 별도의 "교체" 버튼으로 처리한다.
function _makeUploadSlotEl(slot, idx, onFileSelect) {
  const el = document.createElement('div');
  el.className = 'slot' + (slot.data ? ' loaded' : '');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dxf';
  input.onchange = (e) => { if (e.target.files[0]) onFileSelect(slot, e.target.files[0]); };
  el.appendChild(input);

  const inner = document.createElement('div');
  inner.className = 'slot-inner';

  if (slot.data) {
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';
    canvas.width = 96;
    canvas.height = 56;
    // 썸네일은 raw 데이터(rawData)를 쓴다 — slot.data(범례 적용 후)는 용도명을 아직
    // 안 채운 색이면 .layers가 비어서 아무것도 안 그려진다(분석기 화면도 같은 이유로
    // rawData를 씀 — ui.js의 _makeSlotEl 참고).
    setTimeout(() => drawThumbnail(canvas, slot.rawData), 0);
    inner.appendChild(canvas);
  } else {
    const num = document.createElement('div');
    num.className = 'slot-num';
    num.textContent = idx + 1;

    const lbl = document.createElement('div');
    lbl.className = 'slot-label';
    lbl.textContent = slot.label;

    const sub = document.createElement('div');
    sub.className = 'slot-sub';
    sub.textContent = '클릭 또는 드래그';

    inner.appendChild(num);
    inner.appendChild(lbl);
    inner.appendChild(sub);
  }
  el.appendChild(inner);

  if (slot.data && slot.file) {
    const bottom = document.createElement('div');
    bottom.className = 'slot-bottom';
    const fname = document.createElement('div');
    fname.className = 'slot-fname';
    fname.textContent = slot.file.name;
    bottom.appendChild(fname);
    el.appendChild(bottom);
  }

  if (slot.data) {
    el.onclick = () => selectPreviewTile(el, slot.rawData, slot.file ? slot.file.name : slot.label);

    if (!slot.saved) {
      // 이미 저장된 단계는 파일 교체 API가 없어서(삭제 후 다시 추가해야 함) 미리보기만 허용
      const replaceBtn = document.createElement('button');
      replaceBtn.type = 'button';
      replaceBtn.className = 'tile-replace-btn';
      replaceBtn.textContent = '교체';
      replaceBtn.onclick = (e) => { e.stopPropagation(); input.click(); };
      el.appendChild(replaceBtn);
    }
  } else {
    el.onclick = () => input.click();
  }

  if (!slot.saved) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.style.borderColor = 'var(--blue-mid)';
      el.style.background  = 'var(--blue-light)';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderColor = '';
      el.style.background  = '';
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.style.borderColor = '';
      el.style.background  = '';
      const file = e.dataTransfer.files[0];
      if (file && file.name.toLowerCase().endsWith('.dxf')) {
        onFileSelect(slot, file);
      } else if (file) {
        alert('.dxf 파일만 업로드할 수 있습니다.');
      }
    });
  }

  return el;
}

function renderNewSlotsWrap() {
  const wrap = document.getElementById('new-slots-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  adminSlots.forEach((slot, idx) => {
    if (idx > 0) wrap.appendChild(_makeArrow());

    const col = document.createElement('div');
    col.className = 'slot-col';
    const tileEl = _makeUploadSlotEl(slot, idx, async (s, file) => {
      await handleAdminFileSelect(s, file);
      _previewSlotId = s.id;
      renderNewSlotsWrap();
    });
    col.appendChild(tileEl);

    if (slot.data && slot.id === _previewSlotId) {
      selectPreviewTile(tileEl, slot.rawData, slot.file ? slot.file.name : slot.label);
    }

    if (slot.saved) {
      // 이미 저장된 단계 — 삭제하면 실제 DB에서도 지워진다
      const del = document.createElement('button');
      del.textContent = '삭제';
      del.style.cssText =
        'margin-top:5px;font-size:10px;padding:2px 7px;border-radius:6px;' +
        'border:1px solid #ddd;background:#fff;color:#888;cursor:pointer;box-shadow:none;';
      del.onclick = (e) => { e.stopPropagation(); deleteStage(_loadedProjectSerial, slot.stageIndex); };
      col.appendChild(del);
    } else if (adminSlots.length > 1) {
      const del = document.createElement('button');
      del.textContent = '삭제';
      del.style.cssText =
        'margin-top:5px;font-size:10px;padding:2px 7px;border-radius:6px;' +
        'border:1px solid #ddd;background:#fff;color:#888;cursor:pointer;box-shadow:none;';
      del.onclick = (e) => { e.stopPropagation(); removeAdminSlot(slot.id); };
      col.appendChild(del);
    }

    wrap.appendChild(col);
  });

  wrap.appendChild(_makeArrow());
  const addBtn = document.createElement('button');
  addBtn.className = 'add-btn';
  addBtn.innerHTML = '<div class="add-icon">+</div><span>단계 추가</span>';
  addBtn.onclick = addAdminSlot;
  wrap.appendChild(addBtn);

  _renderAdminLegendWrap();
}

// ── 색상별 용도 입력 (분석기 화면의 globalLegend/_refreshGlobalLegend와 같은 패턴 —
// 도면 아카이브에 등록할 때도 색상별 용도명을 받아서 projects.color_legend에 저장한다) ──
let adminLegend = [];

function _recomputeAdminSlotData(slot) {
  if (!slot.rawData) { slot.data = null; return; }
  slot.data = applyColorLegend(slot.rawData, adminLegend);
}

// 새 색상이 감지되면(예: 새 단계 도면에 이전엔 없던 색) 기존 라벨은 보존한 채 새 행을
// 자동으로 추가한다.
function _refreshAdminLegend() {
  const seen = new Set();
  const merged = [];
  adminSlots.filter(s => s.rawData).forEach(s => {
    getDistinctColors(s.rawData).forEach(colorKey => {
      if (seen.has(colorKey)) return;
      seen.add(colorKey);
      const existing = adminLegend.find(r => r.colorKey === colorKey);
      merged.push(existing || { colorKey, label: '' });
    });
  });
  adminLegend = merged;
  adminSlots.forEach(_recomputeAdminSlotData);
  _renderAdminLegendWrap();
}

function _renderAdminLegendWrap() {
  const wrap = document.getElementById('admin-legend-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!adminSlots.some(s => s.rawData)) return;

  const box = document.createElement('div');
  box.className = 'legend-slot';

  const title = document.createElement('div');
  title.className = 'legend-slot-title';
  title.textContent = '색상별 용도 입력 (모든 도면 공통)';
  box.appendChild(title);

  if (!adminLegend.length) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:12px;color:var(--gray-400);';
    p.textContent = '도면에서 해치(칠한 도형)를 찾지 못했습니다.';
    box.appendChild(p);
  }

  adminLegend.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'legend-row';

    const swatch = document.createElement('div');
    swatch.className = 'legend-swatch';
    swatch.style.background = _getDisplayColor(row.colorKey);
    rowEl.appendChild(swatch);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '용도명 입력 (예: 주거용지)';
    input.value = row.label;
    input.oninput = (e) => {
      row.label = e.target.value;
      adminSlots.forEach(_recomputeAdminSlotData);
    };
    rowEl.appendChild(input);

    box.appendChild(rowEl);
  });

  wrap.appendChild(box);
}

// ── 신규 등록 시 일련번호 입력 -> 평가목록 기관명 자동완성 ───
let _newSerialLookupSeq = 0;
let _newSerialLookupTimer = null;

function onNewSerialInput() {
  clearTimeout(_newSerialLookupTimer);
  _newSerialLookupTimer = setTimeout(_lookupAgencyForNewSerial, 350);
}

async function _lookupAgencyForNewSerial() {
  const serialInput = document.getElementById('new-serial');
  const agencyInput  = document.getElementById('new-agency');
  if (!serialInput || !agencyInput) return;

  const serialNo = serialInput.value.trim();
  const seq = ++_newSerialLookupSeq;
  if (!serialNo) return;

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/eia-list/by-serial/${encodeURIComponent(serialNo)}`);
    if (seq !== _newSerialLookupSeq) return;
    if (!res.ok) return; // 평가목록에 없으면 조용히 무시 — 직접 입력 가능
    const { entry } = await res.json();
    if (entry.agency_name && !agencyInput.value.trim()) {
      agencyInput.value = entry.agency_name;
    }
  } catch (e) {
    // 자동완성 실패는 조용히 무시 — 수동 입력 가능
  }
}

// ── 신규 등록 / 기존 프로젝트에 도면 저장 (통합) ─────────────
// _loadedProjectSerial이 있으면(왼쪽에서 기존 프로젝트를 불러온 상태) "도면 저장"
// 모드, 없으면 "프로젝트 등록"(신규) 모드로 동작한다.
let _loadedProjectSerial = null;
// 검색 카드 재클릭 시 초기화로 토글하기 위해, 현재 폼에 불러와진 카드의 일련번호를 추적
// (도면 미등록 항목도 포함 — _loadedProjectSerial은 그 경우 null로 남기 때문에 별도로 둠).
let _currentlyLoadedCardSerial = null;

const _ADMIN_FORM_FIELD_IDS = ['new-serial', 'new-name', 'new-agency', 'new-operator', 'new-location', 'new-year', 'new-assessment-type'];

function submitProjectForm() {
  return _loadedProjectSerial ? _saveNewStagesToExistingProject() : _submitBrandNewProject();
}

async function _submitBrandNewProject() {
  const statusEl = document.getElementById('new-project-status');
  statusEl.innerHTML = '';

  const serial_no        = document.getElementById('new-serial').value.trim();
  const project_name     = document.getElementById('new-name').value.trim();
  const agency_name      = document.getElementById('new-agency').value.trim();
  const operator_name    = document.getElementById('new-operator').value.trim();
  const location         = document.getElementById('new-location').value.trim();
  const yearVal          = document.getElementById('new-year').value.trim();
  const assessment_type  = document.getElementById('new-assessment-type').value.trim();

  if (!serial_no || !project_name) {
    statusEl.innerHTML = '<p class="status-err">일련번호와 사업명은 필수입니다.</p>';
    return;
  }
  if (adminSlots.some(s => !s.data)) {
    statusEl.innerHTML = '<p class="status-err">모든 단계에 DXF 파일을 업로드하세요.</p>';
    return;
  }

  const drawings = adminSlots.map((s, i) => ({
    stage_label: _adminStageLabel(i),
    file_name: s.file.name,
    dxf_content: s.dxfText,
  }));

  const body = {
    serial_no, project_name,
    agency_name: agency_name || null,
    operator_name: operator_name || null,
    location: location || null,
    first_eia_year: yearVal ? Number(yearVal) : null,
    assessment_type: assessment_type || null,
    color_legend: adminLegend,
    drawings,
  };

  statusEl.innerHTML = '<p class="archive-empty">등록 중...</p>';
  try {
    const res = await _regionFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (res.status === 409) {
      statusEl.innerHTML =
        `<p class="status-err">${data.error} 왼쪽에서 검색해 불러온 뒤 도면을 추가하세요.</p>`;
      return;
    }
    if (!res.ok) throw new Error(data.error || '등록 실패');

    statusEl.innerHTML =
      `<p class="status-ok">등록 완료: ${data.project.serial_no} (${data.drawings.length}단계)</p>`;
    _ADMIN_FORM_FIELD_IDS.forEach(id => { document.getElementById(id).value = ''; });
    _previewSlotId = null;
    clearPreview();
    initAdminSlots();
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

// ── 기존 프로젝트 조회 → 오른쪽 폼/슬롯에 불러오기 ───────────
async function lookupProject(serialNoArg) {
  const serialNo = serialNoArg !== undefined
    ? serialNoArg
    : document.getElementById('lookup-serial').value.trim();
  if (!serialNo) return;
  const statusEl = document.getElementById('lookup-load-status');
  if (statusEl) statusEl.innerHTML = '<p class="archive-empty">불러오는 중...</p>';

  try {
    const res = await _regionFetch(`/projects/${encodeURIComponent(serialNo)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '조회 실패');
    _loadProjectIntoForm(serialNo, data.project, data.drawings);
    if (statusEl) statusEl.innerHTML = ''; // 카드가 파란색으로 강조되는 것만으로 충분 — 별도 안내문구 불필요
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

// 검색에서 항목을 선택했을 때: 오른쪽 폼을 그 프로젝트 정보로 채우고(수정 불가),
// 기존에 저장된 도면들을 전부 불러와 슬롯에 표시 + 새 단계용 빈 슬롯 1개 추가.
function _loadProjectIntoForm(serialNo, project, drawings) {
  _loadedProjectSerial = serialNo;

  document.getElementById('new-serial').value             = project.serial_no;
  document.getElementById('new-name').value                = project.project_name || '';
  document.getElementById('new-agency').value               = project.agency_name || '';
  document.getElementById('new-operator').value             = project.operator_name || '';
  document.getElementById('new-location').value             = project.location || '';
  document.getElementById('new-year').value                 = project.first_eia_year || '';
  document.getElementById('new-assessment-type').value      = project.assessment_type || '';
  _ADMIN_FORM_FIELD_IDS.forEach(id => { document.getElementById(id).disabled = true; });

  // 저장된 색상범례를 먼저 복원한 뒤(기존 라벨이 살아있게), rawData만 채워서 slots를
  // 교체하고 한 번에 다시 계산한다 — legend 계산을 slots 교체 전에 하면 막 불러온
  // 도면들의 색상이 통째로 빠지는 버그가 났던 적이 있어(분석기 화면에서 고친 것과
  // 같은 종류) 순서를 지킨다.
  adminLegend = Array.isArray(project.color_legend) ? project.color_legend : [];
  adminSlots = drawings.map(d => {
    const slot = _newAdminSlot(d.stage_label);
    slot.saved = true;
    slot.stageIndex = d.stage_index;
    slot.file = { name: d.file_name };
    slot.dxfText = d.dxf_content;
    try { slot.rawData = parseDXF(d.dxf_content); } catch (e) { slot.rawData = null; }
    return slot;
  });
  adminSlots.push(_newAdminSlot(_adminStageLabel(drawings.length)));
  _previewSlotId = null;
  _refreshAdminLegend();
  renderNewSlotsWrap();
  clearPreview();

  document.getElementById('register-section-title').textContent =
    `📌 ${project.project_name} (${project.serial_no}) — 도면 추가/정정`;
  document.getElementById('project-submit-btn').textContent = '도면 저장';
  document.getElementById('new-project-status').innerHTML = '';
}

// 검색 결과 중 "도면 미등록"(아직 projects 테이블엔 없고 평가목록에만 있는) 항목을
// 선택했을 때: lookupProject처럼 서버에서 다시 불러올 게 없다(projects에 없으니
// GET /projects/:serial_no가 404남) — 검색 결과에 이미 있는 정보로 바로 폼을 채우고
// 잠그되, _loadedProjectSerial은 null로 둬서 저장 시 "신규 등록"(POST /projects)으로
// 처리되게 한다(최초 도면 1건과 함께 projects 행이 그제서야 생성됨).
function _loadEiaListEntryIntoForm(p) {
  _loadedProjectSerial = null;
  adminLegend = []; // 완전히 새 사업이라 이전 범례가 없음

  document.getElementById('new-serial').value             = p.serial_no;
  document.getElementById('new-name').value                = p.project_name || '';
  document.getElementById('new-agency').value               = p.agency_name || '';
  document.getElementById('new-operator').value             = p.operator_name || '';
  document.getElementById('new-location').value             = p.location || '';
  document.getElementById('new-year').value                 = p.first_eia_year || '';
  document.getElementById('new-assessment-type').value      = p.assessment_type || '';
  _ADMIN_FORM_FIELD_IDS.forEach(id => { document.getElementById(id).disabled = true; });

  adminSlots = [_newAdminSlot(_adminStageLabel(0))];
  _previewSlotId = null;
  renderNewSlotsWrap();
  clearPreview();

  document.getElementById('register-section-title').textContent =
    `📌 ${p.project_name || p.serial_no} (${p.serial_no}) — 최초 도면 등록`;
  document.getElementById('project-submit-btn').textContent = '프로젝트 등록';
  document.getElementById('new-project-status').innerHTML = '';
}

function _resetToNewProjectMode() {
  _loadedProjectSerial = null;
  _ADMIN_FORM_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    el.disabled = false;
    el.value = '';
  });
  document.getElementById('register-section-title').textContent = '📌 신규 프로젝트 등록';
  document.getElementById('project-submit-btn').textContent = '프로젝트 등록';
  document.getElementById('new-project-status').innerHTML = '';
  document.getElementById('lookup-serial').value = '';
  document.querySelectorAll('#lookup-results .archive-card-selected')
    .forEach(c => c.classList.remove('archive-card-selected'));
  _currentlyLoadedCardSerial = null;
  _previewSlotId = null;
  clearPreview();
  initAdminSlots();
}

// 기존 프로젝트에 새로 추가된(저장 안 된) 슬롯들만 골라 단계로 저장.
// 새 도면 없이 범례만 고친 경우엔 PATCH로 범례만 갱신한다.
async function _saveNewStagesToExistingProject() {
  const statusEl = document.getElementById('new-project-status');
  const readySlots = adminSlots.filter(s => !s.saved && s.data);

  if (!readySlots.length) {
    statusEl.innerHTML = '<p class="archive-empty">저장 중...</p>';
    try {
      const res = await _regionFetch(`/projects/${encodeURIComponent(_loadedProjectSerial)}`, {
        method: 'PATCH',
        body: JSON.stringify({ color_legend: adminLegend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      statusEl.innerHTML = '<p class="status-ok">범례 저장 완료</p>';
    } catch (e) {
      statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
    }
    return;
  }
  statusEl.innerHTML = '<p class="archive-empty">저장 중...</p>';

  try {
    for (const slot of readySlots) {
      const res = await _regionFetch(`/projects/${encodeURIComponent(_loadedProjectSerial)}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          stage_label: slot.label,
          file_name: slot.file.name,
          dxf_content: slot.dxfText,
          color_legend: adminLegend,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
    }
    await lookupProject(_loadedProjectSerial); // 새로 저장된 단계까지 반영해 다시 불러오기
    document.getElementById('new-project-status').innerHTML = '<p class="status-ok">도면 저장 완료</p>';
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

// ── 단계 추가/정정 대상 검색 ─────────────────────────────────
let _lookupSearchSeq = 0;
let _lookupCurrentQuery = '';
let _lookupCurrentPage = 1;

// 검색어가 없을 때 기본 목록: 서버가 이미 "도면 있는 사업 우선 → 일련번호 숫자 큰(최신)
// 순"으로 내려주므로 여기서 다시 정렬하지 않는다(중복 정렬은 기준이 어긋날 위험만 키운다).
async function loadAdminDefaultList() {
  await _fetchLookupPage('', 1, false);
}

async function onLookupSearch(forceLookup) {
  const input = document.getElementById('lookup-serial');
  await _fetchLookupPage(input.value.trim(), 1, forceLookup);
}

async function _fetchLookupPage(q, page, forceLookup) {
  const resultsEl = document.getElementById('lookup-results');
  if (!resultsEl) return;
  const seq = ++_lookupSearchSeq;
  _lookupCurrentQuery = q;
  _lookupCurrentPage = page;
  resultsEl.innerHTML = `<p class="archive-empty">${q ? '검색 중...' : '불러오는 중...'}</p>`;
  const loadStatusEl = document.getElementById('lookup-load-status');
  if (loadStatusEl) loadStatusEl.innerHTML = '';

  try {
    const res = await _regionFetch(`/projects?q=${encodeURIComponent(q)}&page=${page}`);
    if (!res.ok) throw new Error('서버 응답 오류');
    const { projects, total, pageSize } = await res.json();
    if (seq !== _lookupSearchSeq) return;

    if (forceLookup && q && projects.length) {
      const exact = projects.find(p => p.serial_no === q && p.has_drawings);
      if (exact) {
        resultsEl.innerHTML = '';
        await lookupProject(exact.serial_no);
        return;
      }
    }
    renderLookupSearchResults(projects);
    renderLookupPagination(total, page, pageSize);
  } catch (e) {
    if (seq !== _lookupSearchSeq) return;
    resultsEl.innerHTML = `<p class="archive-empty">${q ? '검색 실패' : '목록을 불러오지 못했습니다'}: ${e.message}</p>`;
  }
}

function renderLookupPagination(total, page, pageSize) {
  const wrapId = 'lookup-pagination';
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'pagination';
    document.querySelector('.lookup-scroll').insertAdjacentElement('afterend', wrap);
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) { wrap.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= pageCount; i++) {
    html += `<button class="pagination-btn${i === page ? ' pagination-btn-active' : ''}" data-page="${i}">${i}</button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.onclick = () => _fetchLookupPage(_lookupCurrentQuery, Number(btn.dataset.page), false);
  });
}

function renderLookupSearchResults(projects) {
  const resultsEl = document.getElementById('lookup-results');
  resultsEl.innerHTML = '';

  if (!projects.length) {
    resultsEl.innerHTML = '<p class="archive-empty">검색 결과가 없습니다.</p>';
    return;
  }

  projects.forEach(p => {
    const card = document.createElement('div');
    const noDrawings = p.has_drawings === false;
    card.className = 'archive-card' + (noDrawings ? ' archive-card-nodrawing' : '');

    const boldParts = [p.serial_no, p.operator_name].filter(Boolean).join(' ');
    const agencyHtml = p.agency_name ? `<span class="archive-card-agency">${p.agency_name}</span>` : '';
    const badge = noDrawings
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
      // 이미 불러온 카드를 다시 누르면 — 신규 등록 모드로 초기화(예전엔 별도
      // "✕ 새 프로젝트 등록으로" 링크가 있었는데, 같은 카드 재클릭으로 대체).
      if (_currentlyLoadedCardSerial === p.serial_no) {
        _resetToNewProjectMode();
        return;
      }
      document.getElementById('lookup-serial').value = p.serial_no;
      // 목록은 그대로 두고 클릭한 카드만 파란톤으로 강조 — 다른 사업과 비교해가며
      // 누르기 편하게 목록이 사라지지 않게 한다.
      resultsEl.querySelectorAll('.archive-card-selected').forEach(c => c.classList.remove('archive-card-selected'));
      card.classList.add('archive-card-selected');
      _currentlyLoadedCardSerial = p.serial_no;
      const statusEl = document.getElementById('lookup-load-status');
      if (statusEl) statusEl.innerHTML = '';
      if (noDrawings) {
        _loadEiaListEntryIntoForm(p);
      } else {
        lookupProject(p.serial_no);
      }
    };
    resultsEl.appendChild(card);
  });
}

async function deleteStage(serialNo, stageIndex) {
  if (!confirm(`${stageIndex}단계를 삭제하시겠습니까? (되돌릴 수 없습니다)`)) return;
  try {
    const res = await _regionFetch(`/projects/${encodeURIComponent(serialNo)}/stages/${stageIndex}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '삭제 실패');
    await lookupProject(serialNo);
  } catch (e) {
    alert(e.message);
  }
}

// ── 초기화 ───────────────────────────────────────────────────
// 지역 로그인 통과 후 initAdminSlots()/loadAdminDefaultList()는
// region-auth.js의 _enterAdminMain()이 호출한다.
