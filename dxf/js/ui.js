/**
 * ui.js
 * DOM 렌더링, 슬롯 관리, 썸네일, 결과 표시
 */

// 레이어명에 매칭되지 않을 때 쓰는 고정 색상 폴백 팔레트
const LAYER_COLORS = [
  '#185fa5','#3b6d11','#a32d2d','#633806',
  '#6d3b9e','#0284c7','#b45309','#0d9488',
  '#64748b','#be185d','#1d4ed8','#15803d',
];

// 레이어명에 특정 키워드가 포함되면 해당 색상 계열(톤)에서 배정
// 우선순위 순서대로 검사 — '기타'는 가장 마지막(예: '기타녹지'는 녹지 계열)
const LAYER_COLOR_TONES = [
  { keywords: ['녹지'],        colors: ['#1b5e20','#2e7d32','#388e3c','#43a047','#558b2f','#66bb6a'] }, // 초록
  { keywords: ['도로'],        colors: ['#455a64','#546e7a','#616161','#757575','#78909c','#9e9e9e'] }, // 회색
  { keywords: ['건축','건물'],  colors: ['#bf360c','#d84315','#e65100','#ef6c00','#f57c00','#fb8c00'] }, // 주황
  { keywords: ['주차'],        colors: ['#0d47a1','#1565c0','#1976d2','#1e88e5','#2196f3','#0277bd'] }, // 파란색
  { keywords: ['대지','부지'],  colors: ['#795548','#8d6e63','#a1887f','#6d4c41','#bcaaa4','#a1796a'] }, // 베이지·갈색
  { keywords: ['공원','운동'],  colors: ['#9ccc65','#aed581','#c0ca33','#8bc34a','#cddc39','#7cb342'] }, // 연두색
  { keywords: ['기타'],        colors: ['#f9a825','#fbc02d','#fdd835','#f57f17','#ffb300','#ffca28'] }, // 노랑
];

const _layerColorCache = {};
const _toneUsedIdx = {};
let   _fallbackIdx = 0;

// ── 흰색(저대비) 해치 화면 표시용 대체색 ───────────────────────────
// 흰색으로 입력된 용도는 배경(흰색 계열)과 안 구분돼서 안 보이는 것처럼 보인다.
// 데이터(colorKey)는 그대로 두고, 화면에 그릴 때만 대비되는 임의 색으로 바꿔서 보여준다.
const _displayColorOverrides = {};
function _isLowContrast(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return r >= 240 && g >= 240 && b >= 240;
}
function _hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}
function _getDisplayColor(hex) {
  if (!_isLowContrast(hex)) return hex;
  if (_displayColorOverrides[hex]) return _displayColorOverrides[hex];
  const taken = new Set([
    ...(typeof globalLegend !== 'undefined' ? globalLegend.map(r => r.colorKey?.toLowerCase()) : []),
    ...Object.values(_displayColorOverrides).map(c => c.toLowerCase()),
  ]);
  let candidate;
  for (let tries = 0; tries < 30; tries++) {
    candidate = _hslToHex(Math.floor(Math.random() * 360), 65 + Math.random() * 20, 45 + Math.random() * 15);
    if (!taken.has(candidate.toLowerCase())) break;
  }
  _displayColorOverrides[hex] = candidate;
  return candidate;
}

function layerColor(name) {
  // 이제는 해치 색상을 직접 읽으니 추측할 필요가 없다 — 범례에서 그 용도명에 실제로
  // 쓰인 색(colorKey)을 그대로 쓴다. 못 찾을 때만(예전 레이어명 등) 아래 추측 로직으로.
  if (typeof globalLegend !== 'undefined') {
    const hit = globalLegend.find(r => r.label === name);
    if (hit) return _getDisplayColor(hit.colorKey);
  }
  if (_layerColorCache[name]) return _layerColorCache[name];

  const tone = LAYER_COLOR_TONES.find(t => t.keywords.some(k => name.includes(k)));
  let color;
  if (tone) {
    const key = tone.keywords[0];
    const used = _toneUsedIdx[key] || (_toneUsedIdx[key] = new Set());
    let avail = tone.colors.map((_, i) => i).filter(i => !used.has(i));
    if (!avail.length) { used.clear(); avail = tone.colors.map((_, i) => i); }
    const idx = avail[Math.floor(Math.random() * avail.length)];
    used.add(idx);
    color = tone.colors[idx];
  } else {
    color = LAYER_COLORS[_fallbackIdx++ % LAYER_COLORS.length];
  }

  _layerColorCache[name] = color;
  return color;
}

// ── 슬롯 상태 ───────────────────────────────────────────────
let slots = [];
let _slotId = 0;

function _newSlot(label) {
  return { id: ++_slotId, label, data: null, file: null, rawData: null, dxfText: null };
}

// ── 색상 범례: 도면마다 따로 두지 않고 전 도면 공통 1개만 쓴다 ──────
// (같은 색이면 같은 용도일 거라는 가정 — 도면마다 같은 색을 두 번 입력하지 않아도 됨)
let globalLegend = [];

function _initSlotFromParsed(slot, rawParsed) {
  slot.rawData = rawParsed;
  _refreshGlobalLegend();
}
// 모든 슬롯의 distinct color를 합쳐 legend를 갱신(기존 입력값은 유지)하고,
// 모든 슬롯의 slot.data를 새 legend로 다시 계산한다.
function _refreshGlobalLegend() {
  const seen = new Set();
  const merged = [];
  slots.filter(s => s.rawData).forEach(s => {
    getDistinctColors(s.rawData).forEach(colorKey => {
      if (seen.has(colorKey)) return;
      seen.add(colorKey);
      const existing = globalLegend.find(r => r.colorKey === colorKey);
      merged.push(existing || { colorKey, label: '' });
    });
  });
  globalLegend = merged;
  slots.forEach(_recomputeSlotData);
}
function _recomputeSlotData(slot) {
  if (!slot.rawData) { slot.data = null; return; }
  slot.data = applyColorLegend(slot.rawData, globalLegend);
}

// 어느 색이 위인지 캐드에 실제로 기록돼 있지 않은(SORTENTSTABLE 없는) 겹침이
// 하나라도 있으면 분석을 막는다 — 추측해서 계산하면 안 보이는 색이 계산에 잡히는
// 식으로 조용히 틀린 결과가 나올 수 있기 때문.
function _hasAmbiguousOverlaps() {
  return slots.some(s => s.rawData?.ambiguousOverlaps?.length > 0);
}

function initSlots() {
  slots = [_newSlot('최초 도면'), _newSlot('변경 도면')];
  renderSlotsWrap();
}

function addSlot() {
  slots.push(_newSlot(`변경 도면 ${slots.length}`));
  renderSlotsWrap();
}

// 슬롯(단계) 자체는 그대로 두고, 업로드된 도면만 취소해서 다시 빈 칸으로 되돌린다.
function clearSlot(slot) {
  slot.data = null;
  slot.rawData = null;
  slot.file = null;
  _refreshGlobalLegend();
  renderSlotsWrap();
}

function removeSlot(id) {
  if (slots.length <= 2) return;
  slots = slots.filter(s => s.id !== id);
  _refreshGlobalLegend();
  renderSlotsWrap();
}

// ── 슬롯 렌더링 ─────────────────────────────────────────────
function renderSlotsWrap() {
  const wrap = document.getElementById('slots-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  slots.forEach((slot, idx) => {
    if (idx > 0) wrap.appendChild(_makeArrow());

    const col = document.createElement('div');
    col.className = 'slot-col';
    col.appendChild(_makeSlotEl(slot, idx));

    // 삭제 버튼 (3개 이상일 때)
    if (slots.length > 2) {
      const del = document.createElement('button');
      del.textContent = '삭제';
      del.style.cssText =
        'margin-top:5px;font-size:10px;padding:2px 7px;border-radius:6px;' +
        'border:1px solid #ddd;background:#fff;color:#888;cursor:pointer;box-shadow:none;';
      del.onclick = (e) => { e.stopPropagation(); removeSlot(slot.id); };
      col.appendChild(del);
    }

    wrap.appendChild(col);
  });

  // + 단계 추가 버튼
  wrap.appendChild(_makeArrow());
  const addBtn = document.createElement('button');
  addBtn.className = 'add-btn';
  addBtn.innerHTML = '<div class="add-icon">+</div><span>단계 추가</span>';
  addBtn.onclick = addSlot;
  wrap.appendChild(addBtn);

  updateRunBtn();
  _renderBorderInfo();
  _renderLegendWrap();
}

// ── 색상 범례 입력 (모든 도면 공통: 색상 칩 + 용도명 입력 1세트) ────
function _renderLegendWrap() {
  const wrap = document.getElementById('legend-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!slots.some(s => s.rawData)) return;

  const box = document.createElement('div');
  box.className = 'legend-slot';

  const title = document.createElement('div');
  title.className = 'legend-slot-title';
  title.textContent = '색상별 용도 입력 (모든 도면 공통)';
  box.appendChild(title);

  if (!globalLegend.length) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:12px;color:var(--gray-400);';
    p.textContent = '도면에서 해치(칠한 도형)를 찾지 못했습니다.';
    box.appendChild(p);
  }

  globalLegend.forEach(row => {
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
      slots.forEach(_recomputeSlotData);
      updateRunBtn();
    };
    rowEl.appendChild(input);

    box.appendChild(rowEl);
  });

  if (!_isLegendComplete()) {
    const warn = document.createElement('div');
    warn.className = 'legend-incomplete';
    warn.textContent = '모든 색상에 용도명을 입력해야 분석할 수 있습니다.';
    box.appendChild(warn);
  }

  wrap.appendChild(box);
  _renderOverlapWarning(wrap);
}

// ── 겹침 확인 필요 — 캐드에 표시순서가 기록 안 된, 서로 다른 색끼리의 겹침 ──
function _renderOverlapWarning(wrap) {
  const slotsWithOverlap = slots.filter(s => s.rawData?.ambiguousOverlaps?.length > 0);
  if (!slotsWithOverlap.length) return;

  const totalCount = slotsWithOverlap.reduce((s, sl) => s + sl.rawData.ambiguousOverlaps.length, 0);

  const box = document.createElement('div');
  box.className = 'legend-slot overlap-warning-box';

  const title = document.createElement('div');
  title.className = 'legend-slot-title';
  title.textContent = '겹침 확인 필요 — 어느 색이 위인지 알 수 없습니다';
  box.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'overlap-warning-desc';
  desc.textContent =
    `${slotsWithOverlap.map(s => s.label).join(', ')}에 ${totalCount}곳 발견. ` +
    '도면에서 위치를 확인하려면 아래 버튼으로 겹침 확인 보고서를 열어보세요. ' +
    '중복 해치를 없애거나 캐드에서 표시순서를 지정한 뒤 다시 올려야 분석할 수 있습니다.';
  box.appendChild(desc);

  const btn = document.createElement('button');
  btn.className = 'run-btn overlap-report-btn';
  btn.textContent = '겹침 확인 보고서 보기';
  btn.onclick = () => exportOverlapReport(slots);
  box.appendChild(btn);

  wrap.appendChild(box);
}

function _isLegendComplete() {
  return globalLegend.every(row => String(row.label || '').trim());
}

function _makeArrow() {
  const div = document.createElement('div');
  div.className = 'slot-arrow';
  div.innerHTML = '<div class="arrow-line"></div>';
  return div;
}

function _makeSlotEl(slot, idx) {
  const el = document.createElement('div');
  el.className = 'slot' + (slot.data ? ' loaded' : '');

  // 숨겨진 file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dxf';
  input.onchange = (e) => { if (e.target.files[0]) handleFileSelect(slot, e.target.files[0]); };
  el.appendChild(input);

  if (slot.data) {
    // 업로드 취소 — 슬롯(단계)은 남기고 도면만 빈 칸으로 되돌림
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tile-replace-btn';
    cancelBtn.textContent = '취소';
    cancelBtn.onclick = (e) => { e.stopPropagation(); clearSlot(slot); };
    el.appendChild(cancelBtn);
  }

  const inner = document.createElement('div');
  inner.className = 'slot-inner';

  if (slot.data) {
    // 썸네일
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';
    canvas.width  = 148;
    canvas.height = 88;
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

  el.onclick = () => input.click();

  // 드래그앤드롭
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
      handleFileSelect(slot, file);
    } else if (file) {
      alert('.dxf 파일만 업로드할 수 있습니다.');
    }
  });

  return el;
}

// ── 파일 처리 ────────────────────────────────────────────────
async function handleFileSelect(slot, file) {
  if (typeof polygonClipping === 'undefined') {
    alert('필요한 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }
  try {
    const text = await file.text();
    slot.dxfText = text;
    _initSlotFromParsed(slot, parseDXF(text));
    slot.file  = file;
    renderSlotsWrap();
  } catch (e) {
    alert('DXF 파일 읽기 실패: ' + e.message);
  }
}

// ── 썸네일 캔버스 ────────────────────────────────────────────
// 도면 자체의 bbox를 기준으로 타일 안에 꽉 차게 중앙 정렬
function drawThumbnail(canvas, data) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allLayers = Object.keys(data.layers);
  if (!allLayers.length) return;

  const bbox = getDataBBox(data, allLayers);
  if (!bbox) return;

  const pad = 5;
  const W = canvas.width  - pad * 2;
  const H = canvas.height - pad * 2;
  const dw = bbox.maxX - bbox.minX || 1;
  const dh = bbox.maxY - bbox.minY || 1;
  const scale = Math.min(W / dw, H / dh);
  const ox = pad + (W - dw * scale) / 2;
  const oy = pad + (H - dh * scale) / 2;

  const tx = x => (x - bbox.minX) * scale + ox;
  const ty = y => canvas.height - ((y - bbox.minY) * scale + oy);

  // 레이어가 아니라 도면에 실제로 쓰인 색상 그대로 그린다 (추측 색이 아님)
  for (const col of Object.keys(data.colors || {})) {
    ctx.fillStyle   = _getDisplayColor(col) + '50';

    // 같은 색 조각끼리 먼저 하나로 합쳐서 그린다 — 안 그러면 같은 용도가 여러
    // 조각으로 나뉘어 그려진 도면에서 조각 경계마다 선이 보인다.
    const rawRings = data.colors[col] || [];
    let merged;
    try {
      merged = cleanMultiPoly(polygonClipping.union(...rawRings.map(_ringGeom)))
        .map(poly => (poly.length > 1 ? mergePolygonHoles(poly) : poly[0]))
        .filter(r => r && r.length >= 3);
    } catch (e) {
      merged = rawRings;
    }

    for (const ring of merged) {
      // 면적이 0인 퇴화(점/선) 링은 잔재 가이드선이므로 그리지 않음
      if (ring.length < 2 || shoelace(ring) < 1e-6) continue;
      ctx.beginPath();
      // 구멍이 합쳐진 링은 외곽+구멍을 각각 서브패스로 그려서(evenodd) 둘을 잇는 틈새 선이
      // 안 보이게 한다 (__origPoly가 원래의 [외곽, 구멍...] 형태)
      const subpaths = ring.__origPoly || [ring];
      subpaths.forEach(sub => {
        if (!sub.length) return;
        ctx.moveTo(tx(sub[0][0]), ty(sub[0][1]));
        for (let k = 1; k < sub.length; k++) ctx.lineTo(tx(sub[k][0]), ty(sub[k][1]));
        ctx.closePath();
      });
      ctx.fill('evenodd');
    }
  }
}

// ── 실행 버튼 상태 ───────────────────────────────────────────
function updateRunBtn() {
  const btn = document.getElementById('run-btn');
  if (!btn) return;
  const loadedSlots = slots.filter(s => s.data);
  const loaded = loadedSlots.length;
  const allLegendsDone = _isLegendComplete();
  const hasOverlap = _hasAmbiguousOverlaps();
  btn.disabled = loaded < 2 || !allLegendsDone || hasOverlap;
  btn.textContent = loaded < 2
    ? `분석 실행 (도면 ${loaded}/2 이상 업로드 필요)`
    : (hasOverlap ? '분석 실행 (겹침을 먼저 해결하세요)'
      : (!allLegendsDone ? '분석 실행 (색상별 용도명을 입력하세요)' : '분석 실행'));
}

// ── 정합 방식 표시 ───────────────────────────────────────────
function _renderBorderInfo() {
  const el = document.getElementById('border-info');
  if (!el) return;
  const loaded = slots.filter(s => s.data).length;
  if (!loaded) { el.textContent = ''; return; }
  el.textContent = `도면 ${loaded}개 로드됨  ·  좌표 직접 정합 (변환 없음)`;
}

// ── 에러 표시 ────────────────────────────────────────────────
function showError(msg) {
  const div = document.getElementById('errdiv');
  if (!div) return;
  div.style.display = msg ? 'block' : 'none';
  div.innerHTML = msg ? `<div class="errmsg">${msg}</div>` : '';
}

// ── 결과 렌더링 ──────────────────────────────────────────────
function renderResults(result) {
  const resDiv = document.getElementById('results');
  if (!resDiv) return;
  resDiv.style.display = 'block';

  _renderPairs(result.pairResults);
  _renderTotal(result);
}

function _fmt(n) { return n.toFixed(2); }
function _fmtArea(n) { return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }); }

function _renderPairs(pairResults) {
  const wrap = document.getElementById('pairs-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  pairResults.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'step-pair';

    // 헤더 (접기/펼치기)
    const head = document.createElement('div');
    head.className = 'pair-head';

    const badge = document.createElement('div');
    badge.className = 'pair-badge';
    badge.innerHTML =
      `<span class="badge-from">${r.labelFrom}</span>` +
      `<span class="badge-arr">→</span>` +
      `<span class="badge-to">${r.labelTo}</span>`;

    const pct = document.createElement('div');
    pct.className = 'pair-pct' + (r.changePct === 0 ? ' zero' : '');
    pct.textContent = _fmt(r.changePct) + '%';

    const chev = document.createElement('span');
    chev.className = 'chevron open';
    chev.textContent = '▲';

    head.appendChild(badge);
    head.appendChild(pct);
    head.appendChild(chev);

    // 상세 (레이어별 변경 테이블)
    const detail = document.createElement('div');
    detail.className = 'pair-detail';

    if (r.changes.length > 0) {
      const tbl = document.createElement('table');
      tbl.innerHTML =
        `<thead><tr>
          <th>변경 전 용도</th>
          <th>변경 후 용도</th>
          <th style="text-align:right">면적 (㎡)</th>
          <th style="text-align:right">비율 (%)</th>
        </tr></thead>`;
      const tbody = document.createElement('tbody');
      r.changes
        .slice()
        .sort((a, b) => b.area - a.area)
        .forEach(c => {
          const tr = document.createElement('tr');
          const pctVal = r.areaFirst > 0 ? (c.area / r.areaFirst * 100) : 0;
          tr.innerHTML =
            `<td><span class="layer-dot" style="background:${layerColor(c.from)}"></span>${c.from}</td>` +
            `<td><span class="layer-dot" style="background:${layerColor(c.to)}"></span>${c.to}</td>` +
            `<td style="text-align:right">${_fmtArea(c.area)}</td>` +
            `<td style="text-align:right">${_fmt(pctVal)}%</td>`;
          tbody.appendChild(tr);
        });
      tbl.appendChild(tbody);
      detail.appendChild(tbl);
    } else {
      detail.innerHTML = '<p style="font-size:13px;color:#888;padding:10px 0;">변경된 토지이용 없음</p>';
    }

    const meta = document.createElement('div');
    meta.className = 'pair-meta';
    meta.textContent =
      `전 도면 면적: ${_fmtArea(r.totalAreaA)} ㎡  |  후 도면 면적: ${_fmtArea(r.totalAreaB)} ㎡` +
      `  |  기준 면적(최초 도면): ${_fmtArea(r.areaFirst)} ㎡` +
      (r.excludedArea > 0.1 ? `  |  제척된 면적: ${_fmtArea(r.excludedArea)} ㎡` : '');
    detail.appendChild(meta);

    // 접기/펼치기
    let open = true;
    detail.style.maxHeight = '600px';
    head.onclick = () => {
      open = !open;
      detail.style.maxHeight = open ? '600px' : '0';
      chev.textContent = open ? '▲' : '▼';
      chev.classList.toggle('open', open);
    };

    card.appendChild(head);
    card.appendChild(detail);
    wrap.appendChild(card);
  });
}

function _renderTotal(result) {
  const grid = document.getElementById('total-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const items = [
    {
      label: '누적 토지이용 변경률',
      val: _fmt(result.totalChangePct) + '%',
      cls: result.totalChangePct > 0 ? 'up' : '',
      sub: `변경 면적 ${_fmtArea(result.totalChangeArea)} ㎡`,
    },
    {
      label: '사업부지 증가율',
      val: _fmt(result.increasePct) + '%',
      cls: result.increasePct > 0 ? 'up' : '',
      sub: `증가 면적 ${_fmtArea(result.increaseArea)} ㎡`,
    },
    {
      label: '최초 → 최종 도면 면적',
      val: `${_fmtArea(result.areaFirst)} → ${_fmtArea(result.areaLast)}`,
      cls: '',
      sub: `${result.labelFirst} → ${result.labelLast}  (단위: ㎡)`,
    },
  ];

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML =
      `<div class="summary-label">${item.label}</div>` +
      `<div class="summary-val ${item.cls}">${item.val}</div>` +
      `<div class="summary-sub">${item.sub}</div>`;
    grid.appendChild(card);
  });
}
