/**
 * ui.js
 * DOM 렌더링, 슬롯 관리, 썸네일, 결과 표시
 */

// 레이어별 고정 색상 팔레트
const LAYER_COLORS = [
  '#185fa5','#3b6d11','#a32d2d','#633806',
  '#6d3b9e','#0284c7','#b45309','#0d9488',
  '#64748b','#be185d','#1d4ed8','#15803d',
];
const _layerColorCache = {};
let   _colorIdx = 0;
function layerColor(name) {
  if (!_layerColorCache[name]) {
    _layerColorCache[name] = LAYER_COLORS[_colorIdx++ % LAYER_COLORS.length];
  }
  return _layerColorCache[name];
}

// ── 슬롯 상태 ───────────────────────────────────────────────
let slots = [];
let _slotId = 0;

function _newSlot(label) {
  return { id: ++_slotId, label, data: null, file: null };
}

function initSlots() {
  slots = [_newSlot('최초 도면'), _newSlot('변경 도면')];
  renderSlotsWrap();
}

function addSlot() {
  slots.push(_newSlot(`변경 도면 ${slots.length}`));
  renderSlotsWrap();
}

function removeSlot(id) {
  if (slots.length <= 2) return;
  slots = slots.filter(s => s.id !== id);
  renderSlotsWrap();
}

// ── 모든 로드된 슬롯의 공유 bbox ────────────────────────────
function _getSharedBbox() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  slots.forEach(s => {
    if (!s.data) return;
    Object.values(s.data.layers).forEach(rings => {
      rings.forEach(ring => ring.forEach(([x, y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }));
    });
  });
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// ── 슬롯 렌더링 ─────────────────────────────────────────────
function renderSlotsWrap() {
  const wrap = document.getElementById('slots-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  // 로드된 슬롯 전체를 아우르는 공유 bbox (썸네일 동일 축척)
  const sharedBbox = _getSharedBbox();

  slots.forEach((slot, idx) => {
    if (idx > 0) wrap.appendChild(_makeArrow());

    const col = document.createElement('div');
    col.className = 'slot-col';
    col.appendChild(_makeSlotEl(slot, idx, sharedBbox));

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
}

function _makeArrow() {
  const div = document.createElement('div');
  div.className = 'slot-arrow';
  div.innerHTML = '<div class="arrow-line"></div>';
  return div;
}

function _makeSlotEl(slot, idx, sharedBbox) {
  const el = document.createElement('div');
  el.className = 'slot' + (slot.data ? ' loaded' : '');

  // 숨겨진 file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dxf';
  input.onchange = (e) => { if (e.target.files[0]) handleFileSelect(slot, e.target.files[0]); };
  el.appendChild(input);

  const inner = document.createElement('div');
  inner.className = 'slot-inner';

  if (slot.data) {
    // 썸네일
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';
    canvas.width  = 148;
    canvas.height = 88;
    setTimeout(() => drawThumbnail(canvas, slot.data, sharedBbox), 0);
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
    sub.textContent = '.dxf 클릭하여 업로드';

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
  return el;
}

// ── 파일 처리 ────────────────────────────────────────────────
async function handleFileSelect(slot, file) {
  try {
    const text = await file.text();
    slot.data  = parseDXF(text);
    slot.file  = file;
    renderSlotsWrap();
  } catch (e) {
    alert('DXF 파일 읽기 실패: ' + e.message);
  }
}

// ── 썸네일 캔버스 ────────────────────────────────────────────
// sharedBbox: 전체 슬롯 공유 bbox → 모든 썸네일이 동일 축척으로 표시
function drawThumbnail(canvas, data, sharedBbox) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allLayers = Object.keys(data.layers);
  if (!allLayers.length) return;

  // 공유 bbox 우선, 없으면 이 슬롯 단독 bbox
  const bbox = sharedBbox || getDataBBox(data, allLayers);
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

  for (const layer of allLayers) {
    const col = layerColor(layer);
    ctx.fillStyle   = col + '50';
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1;

    for (const ring of (data.layers[layer] || [])) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(tx(ring[0][0]), ty(ring[0][1]));
      for (let k = 1; k < ring.length; k++) ctx.lineTo(tx(ring[k][0]), ty(ring[k][1]));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

// ── 실행 버튼 상태 ───────────────────────────────────────────
function updateRunBtn() {
  const btn = document.getElementById('run-btn');
  if (!btn) return;
  const loaded = slots.filter(s => s.data).length;
  btn.disabled = loaded < 2;
  btn.textContent = loaded < 2
    ? `분석 실행 (도면 ${loaded}/2 이상 업로드 필요)`
    : '분석 실행';
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
          const pctVal = r.totalAreaA > 0 ? (c.area / r.totalAreaA * 100) : 0;
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
      `  |  정합: ${r.alignTypeA} → ${r.alignTypeB}`;
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
