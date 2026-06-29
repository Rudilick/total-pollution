/**
 * archive-admin.js
 * 도면 아카이브 관리자 페이지 - 신규 등록 / 단계 추가 / 삭제
 * (_adminFetch, _ensureAdminAuth는 admin-auth.js 공통 파일에 있음)
 */

// ── 신규 프로젝트 등록용 슬롯 ────────────────────────────────
let adminSlots = [];
let _adminSlotId = 0;

function _newAdminSlot(label) {
  return { id: ++_adminSlotId, label, data: null, file: null, dxfText: null };
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

    const replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'tile-replace-btn';
    replaceBtn.textContent = '교체';
    replaceBtn.onclick = (e) => { e.stopPropagation(); input.click(); };
    el.appendChild(replaceBtn);
  } else {
    el.onclick = () => input.click();
  }

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

    if (adminSlots.length > 1) {
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

// ── 신규 프로젝트 등록 제출 ──────────────────────────────────
async function submitNewProject() {
  const statusEl = document.getElementById('new-project-status');
  statusEl.innerHTML = '';

  const serial_no     = document.getElementById('new-serial').value.trim();
  const project_name  = document.getElementById('new-name').value.trim();
  const agency_name   = document.getElementById('new-agency').value.trim();
  const operator_name = document.getElementById('new-operator').value.trim();
  const location      = document.getElementById('new-location').value.trim();
  const yearVal       = document.getElementById('new-year').value.trim();
  const notes         = document.getElementById('new-notes').value.trim();

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
    notes: notes || null,
    drawings,
  };

  statusEl.innerHTML = '<p class="archive-empty">등록 중...</p>';
  try {
    const res = await _adminFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (res.status === 409) {
      statusEl.innerHTML =
        `<p class="status-err">${data.error} 아래 "기존 프로젝트에 단계 추가" 섹션을 이용하세요.</p>`;
      return;
    }
    if (!res.ok) throw new Error(data.error || '등록 실패');

    statusEl.innerHTML =
      `<p class="status-ok">등록 완료: ${data.project.serial_no} (${data.drawings.length}단계)</p>`;
    document.getElementById('new-serial').value   = '';
    document.getElementById('new-name').value     = '';
    document.getElementById('new-agency').value   = '';
    document.getElementById('new-operator').value = '';
    document.getElementById('new-location').value = '';
    document.getElementById('new-year').value     = '';
    document.getElementById('new-notes').value    = '';
    _previewSlotId = null;
    clearPreview();
    initAdminSlots();
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

// ── 기존 프로젝트 조회 / 단계 추가 / 삭제 ────────────────────
let _stageSerialNo = null;
let _stageDrawingsCount = 0;
let _stageSlot = null;

async function lookupProject(serialNoArg) {
  const serialNo = serialNoArg !== undefined
    ? serialNoArg
    : document.getElementById('lookup-serial').value.trim();
  const resultEl = document.getElementById('lookup-result');
  if (!serialNo) return;
  resultEl.innerHTML = '<p class="archive-empty">조회 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects/${encodeURIComponent(serialNo)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '조회 실패');
    renderLookupResult(serialNo, data.project, data.drawings);
  } catch (e) {
    resultEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

// ── 단계 추가/정정 대상 검색 (입력할 때마다 즉시 검색) ───────
let _lookupSearchSeq = 0;

async function onLookupSearch(forceLookup) {
  const input = document.getElementById('lookup-serial');
  const resultsEl = document.getElementById('lookup-results');
  const q = input.value.trim();
  const seq = ++_lookupSearchSeq;

  document.getElementById('lookup-result').innerHTML = '';
  if (!q) {
    resultsEl.innerHTML = '';
    return;
  }
  resultsEl.innerHTML = '<p class="archive-empty">검색 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('서버 응답 오류');
    const { projects } = await res.json();
    if (seq !== _lookupSearchSeq) return; // 이후 입력으로 인한 최신 요청이 아니면 무시

    // 도면 추가가 목적인 화면이라, 도면이 아직 없는(평가목록 전용) 항목은 클릭해도 할 게
    // 없으므로 여기서는 제외한다.
    const withDrawings = projects.filter(p => p.has_drawings !== false);

    if (forceLookup) {
      const exact = withDrawings.find(p => p.serial_no === q);
      if (exact) {
        resultsEl.innerHTML = '';
        await lookupProject(exact.serial_no);
        return;
      }
    }
    renderLookupSearchResults(withDrawings);
  } catch (e) {
    if (seq !== _lookupSearchSeq) return;
    resultsEl.innerHTML = `<p class="archive-empty">검색 실패: ${e.message}</p>`;
  }
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
    card.className = 'archive-card';

    const metaParts = [];
    if (p.operator_name)  metaParts.push(p.operator_name);
    if (p.location)       metaParts.push(p.location);
    if (p.first_eia_year) metaParts.push(`${p.first_eia_year}년`);

    card.innerHTML =
      `<div class="archive-card-main">
         <div class="archive-card-title">${p.serial_no} <span class="archive-card-name">${p.project_name}</span></div>
         <div class="archive-card-meta">${metaParts.join(' · ') || '&nbsp;'}</div>
       </div>
       <div class="pill pill-nc">${p.stage_count}단계</div>`;

    card.onclick = () => {
      document.getElementById('lookup-serial').value = p.serial_no;
      resultsEl.innerHTML = '';
      lookupProject(p.serial_no);
    };
    resultsEl.appendChild(card);
  });
}

function renderLookupResult(serialNo, project, drawings) {
  const resultEl = document.getElementById('lookup-result');
  resultEl.innerHTML = '';

  _stageSerialNo = serialNo;
  _stageDrawingsCount = drawings.length;
  _stageSlot = _newAdminSlot(_adminStageLabel(drawings.length));

  const meta = document.createElement('p');
  meta.className = 'archive-empty';
  meta.textContent = `${project.project_name} (${project.serial_no}) — 등록된 단계: ${drawings.length}개`;
  resultEl.appendChild(meta);

  const list = document.createElement('div');
  list.className = 'stage-list';
  drawings.forEach(d => {
    const item = document.createElement('div');
    item.className = 'stage-item';

    const info = document.createElement('div');
    info.className = 'stage-info';

    let dData = null;
    try { dData = parseDXF(d.dxf_content); } catch (e) { /* 미리보기 불가 */ }

    if (dData) {
      const thumb = document.createElement('canvas');
      thumb.className = 'stage-thumb';
      thumb.width = 56;
      thumb.height = 40;
      setTimeout(() => drawThumbnail(thumb, dData), 0);
      thumb.onclick = () =>
        selectPreviewTile(thumb, dData, `${d.stage_index}: ${d.stage_label} — ${d.file_name}`);
      info.appendChild(thumb);
    }

    const label = document.createElement('span');
    label.innerHTML =
      `<span class="layer-dot" style="background:${layerColor(d.stage_label)}"></span>` +
      `${d.stage_index}: ${d.stage_label} — ${d.file_name}`;
    info.appendChild(label);

    const del = document.createElement('button');
    del.className = 'btn-danger';
    del.textContent = '삭제';
    del.onclick = () => deleteStage(serialNo, d.stage_index);

    item.appendChild(info);
    item.appendChild(del);
    list.appendChild(item);
  });
  resultEl.appendChild(list);

  const addWrap = document.createElement('div');
  addWrap.className = 'slots-wrap timeline-wrap';
  addWrap.id = 'stage-add-wrap';
  resultEl.appendChild(addWrap);
  _renderStageSlot();

  const addBtn = document.createElement('button');
  addBtn.className = 'run-btn';
  addBtn.id = 'stage-add-btn';
  addBtn.textContent = `${_stageSlot.label} 추가`;
  addBtn.onclick = submitAddStage;
  resultEl.appendChild(addBtn);

  const status = document.createElement('div');
  status.id = 'stage-status';
  resultEl.appendChild(status);
}

function _renderStageSlot() {
  const wrap = document.getElementById('stage-add-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const col = document.createElement('div');
  col.className = 'slot-col';
  const tileEl = _makeUploadSlotEl(_stageSlot, _stageDrawingsCount, async (slot, file) => {
    await handleAdminFileSelect(slot, file);
    _previewSlotId = slot.id;
    _renderStageSlot();
  });
  col.appendChild(tileEl);

  if (_stageSlot.data && _stageSlot.id === _previewSlotId) {
    selectPreviewTile(tileEl, _stageSlot.data, _stageSlot.file ? _stageSlot.file.name : _stageSlot.label);
  }
  wrap.appendChild(col);
}

async function submitAddStage() {
  const statusEl = document.getElementById('stage-status');
  if (!_stageSlot.data) {
    statusEl.innerHTML = '<p class="status-err">DXF 파일을 업로드하세요.</p>';
    return;
  }
  statusEl.innerHTML = '<p class="archive-empty">추가 중...</p>';

  try {
    const res = await _adminFetch(`/projects/${encodeURIComponent(_stageSerialNo)}/stages`, {
      method: 'POST',
      body: JSON.stringify({
        stage_label: _stageSlot.label,
        file_name: _stageSlot.file.name,
        dxf_content: _stageSlot.dxfText,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '추가 실패');
    await lookupProject();
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

async function deleteStage(serialNo, stageIndex) {
  if (!confirm(`${stageIndex}단계를 삭제하시겠습니까? (되돌릴 수 없습니다)`)) return;
  try {
    const res = await _adminFetch(`/projects/${encodeURIComponent(serialNo)}/stages/${stageIndex}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '삭제 실패');
    await lookupProject();
  } catch (e) {
    alert(e.message);
  }
}

// ── 초기화 ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!_ensureAdminAuth()) return;
  initAdminSlots();
});
