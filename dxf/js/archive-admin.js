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
  return { id: ++_adminSlotId, label, data: null, file: null, dxfText: null, saved: false, stageIndex: null };
}

function _adminStageLabel(idx) {
  return idx === 0 ? '최초도면' : `${idx}차변경`;
}

function initAdminSlots() {
  adminSlots = [_newAdminSlot(_adminStageLabel(0))];
  renderNewSlotsWrap();
}

function addAdminSlot() {
  adminSlots.push(_newAdminSlot(_adminStageLabel(adminSlots.length)));
  renderNewSlotsWrap();
}

function removeAdminSlot(id) {
  if (adminSlots.length <= 1) return;
  adminSlots = adminSlots.filter(s => s.id !== id);
  renderNewSlotsWrap();
}

async function handleAdminFileSelect(slot, file) {
  try {
    const text = await file.text();
    slot.data = parseDXF(text);
    slot.dxfText = text;
    slot.file = file;
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
    setTimeout(() => drawThumbnail(canvas, slot.data), 0);
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
    el.onclick = () => selectPreviewTile(el, slot.data, slot.file ? slot.file.name : slot.label);

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
      selectPreviewTile(tileEl, slot.data, slot.file ? slot.file.name : slot.label);
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
  const resultsEl = document.getElementById('lookup-results');
  resultsEl.innerHTML = '<p class="archive-empty">불러오는 중...</p>';

  try {
    const res = await _regionFetch(`/projects/${encodeURIComponent(serialNo)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '조회 실패');
    _loadProjectIntoForm(serialNo, data.project, data.drawings);
    resultsEl.innerHTML = `<p class="archive-empty">✓ "${data.project.project_name}" 불러옴 — 오른쪽에서 도면을 추가하세요.</p>`;
  } catch (e) {
    resultsEl.innerHTML = `<p class="status-err">${e.message}</p>`;
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

  adminSlots = drawings.map(d => {
    const slot = _newAdminSlot(d.stage_label);
    slot.saved = true;
    slot.stageIndex = d.stage_index;
    slot.file = { name: d.file_name };
    slot.dxfText = d.dxf_content;
    try { slot.data = parseDXF(d.dxf_content); } catch (e) { slot.data = null; }
    return slot;
  });
  adminSlots.push(_newAdminSlot(_adminStageLabel(drawings.length)));
  _previewSlotId = null;
  renderNewSlotsWrap();
  clearPreview();

  document.getElementById('register-section-title').textContent =
    `📌 ${project.project_name} (${project.serial_no}) — 도면 추가/정정`;
  document.getElementById('project-mode-banner').innerHTML =
    `기존 프로젝트를 불러왔습니다 — 새 단계 도면만 업로드해서 저장하세요. ` +
    `<a onclick="_resetToNewProjectMode()">✕ 새 프로젝트 등록으로</a>`;
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
  document.getElementById('project-mode-banner').innerHTML =
    `평가목록에서 불러온 사업입니다 — 도면을 업로드해서 등록하세요. ` +
    `<a onclick="_resetToNewProjectMode()">✕ 새 프로젝트 등록으로</a>`;
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
  document.getElementById('project-mode-banner').innerHTML = '';
  document.getElementById('project-submit-btn').textContent = '프로젝트 등록';
  document.getElementById('new-project-status').innerHTML = '';
  document.getElementById('lookup-serial').value = '';
  _previewSlotId = null;
  clearPreview();
  initAdminSlots();
}

// 기존 프로젝트에 새로 추가된(저장 안 된) 슬롯들만 골라 단계로 저장
async function _saveNewStagesToExistingProject() {
  const statusEl = document.getElementById('new-project-status');
  const readySlots = adminSlots.filter(s => !s.saved && s.data);

  if (!readySlots.length) {
    statusEl.innerHTML = '<p class="status-err">업로드할 새 도면이 없습니다.</p>';
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
      document.getElementById('lookup-serial').value = p.serial_no;
      // 목록을 바로 지워버리면 파란 눌림 표시가 화면에 그려질 틈도 없이 사라지므로,
      // 한 프레임 보이게 짧게 지연 후 진행한다.
      card.classList.add('archive-card-selected');
      setTimeout(() => {
        resultsEl.innerHTML = '';
        if (noDrawings) {
          _loadEiaListEntryIntoForm(p);
          resultsEl.innerHTML = `<p class="archive-empty">✓ "${p.project_name || p.serial_no}" 평가목록에서 불러옴 — 오른쪽에서 최초 도면을 업로드하세요.</p>`;
        } else {
          lookupProject(p.serial_no);
        }
      }, 80);
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
