/**
 * export.js
 * 변경 비교 도면 + 증가율 도면 + 일람표 → 인쇄/PDF 내보내기
 *
 * 의존: geometry.js(shoelace, applyTransform, getDataBBox)
 *       parser.js(detectAlignLayer, detectBorderLayer, getLandUseLayers)
 *       analyzer.js(getAlignTransform)
 *       ui.js(layerColor)
 *       polygon-clipping CDN
 */

const _EX = {
  CW: 1200, CH: 820,   // 캔버스 크기
  PAD: 36,             // 지도 여백(px)
  LEG_H: 58,           // 하단 범례 높이
  // 변경 강조 색
  chgFill:    'rgba(225, 70, 20, 0.55)',
  chgStroke:  '#c42800',
  chgLabel:   '#c42800',
  // 증가 강조 색
  incrFill:   'rgba(25, 155, 75, 0.55)',
  incrStroke: '#0a7a3c',
  incrLabel:  '#0a7a3c',
};

// ─────────────────────────────────────────────────────────────────
//  진입점
// ─────────────────────────────────────────────────────────────────
function exportReport(result, exportSlots) {
  const loaded = exportSlots.filter(s => s.data);
  if (loaded.length < 2) { alert('도면 2개 이상 업로드 후 사용하세요.'); return; }

  const sections = [];

  // 변경 차수별 섹션
  result.pairResults.forEach((pr, i) => {
    const sFrom = exportSlots[pr.idxFrom];
    const sTo   = exportSlots[pr.idxTo];
    if (!sFrom?.data || !sTo?.data) return;
    sections.push(_makePairSection(pr, sFrom, sTo, i + 1));
  });

  // 증가율 섹션
  sections.push(_makeIncreaseSection(result, loaded[0], loaded[loaded.length - 1]));

  _openPrintWindow(sections);
}

// ─────────────────────────────────────────────────────────────────
//  변경 차수 섹션 생성
// ─────────────────────────────────────────────────────────────────
function _makePairSection(pr, sFrom, sTo, seqNum) {
  const { T } = getAlignTransform(sFrom.data, sTo.data);

  const exclFrom = [detectAlignLayer(sFrom.data).layer, detectBorderLayer(sFrom.data)].filter(Boolean);
  const exclTo   = [detectAlignLayer(sTo.data).layer,   detectBorderLayer(sTo.data)].filter(Boolean);
  const lsFrom   = getLandUseLayers(sFrom.data, exclFrom);
  const lsTo     = getLandUseLayers(sTo.data,   exclTo);

  // A 링 → B 좌표계로 변환
  const tFrom = {};
  lsFrom.forEach(l => { tFrom[l] = (sFrom.data.layers[l] || []).map(r => applyTransform(r, T)); });
  const tTo = {};
  lsTo.forEach(l => { tTo[l] = sTo.data.layers[l] || []; });

  // bbox (B 좌표계 통합)
  const allRings = [
    ...lsFrom.flatMap(l => tFrom[l]),
    ...lsTo.flatMap(l => tTo[l]),
  ];
  const tfn = _makeMapTransform(allRings, _EX.CW, _EX.CH, _EX.PAD, _EX.LEG_H);

  const canvas = _newCanvas();
  const ctx    = canvas.getContext('2d');
  _fillBg(ctx, canvas.width, canvas.height);

  // 변경 전 레이어 (연하게)
  lsFrom.forEach(l => _drawRings(ctx, tFrom[l], layerColor(l), 0.14, 0.45, 1, tfn));
  // 변경 후 레이어 (중간 농도)
  lsTo.forEach(l => _drawRings(ctx, tTo[l], layerColor(l), 0.28, 0.80, 1, tfn));

  // 변경 폴리곤 강조 + 넘버링
  const chunks = [];
  let chunkN = 1;
  pr.changes.forEach(ch => {
    (ch.polys || []).forEach(poly => {
      if (!poly?.[0]?.length) return;
      _drawPoly(ctx, poly, _EX.chgFill, _EX.chgStroke, 2.5, tfn);
      const [cx, cy] = _centroid(poly[0]);
      _drawLabel(ctx, tfn.x(cx), tfn.y(cy), chunkN, _EX.chgLabel);
      chunks.push({ num: chunkN, from: ch.from, to: ch.to, area: shoelace(poly[0]) });
      chunkN++;
    });
  });

  // 범례
  const legendItems = [
    { color: '#aaa',          label: `변경 전 (${sFrom.label})` },
    { color: layerColor(lsTo[0] || '?'), label: `변경 후 (${sTo.label})` },
    { color: _EX.chgStroke,   label: '변경 구역' },
  ];
  _drawLegend(ctx, canvas.width, canvas.height, _EX.LEG_H, legendItems);
  _drawScaleBar(ctx, canvas.width, canvas.height, _EX.LEG_H);

  return {
    title:      `${seqNum}차 변경 도면 비교 — ${sFrom.label} → ${sTo.label}`,
    subtitle:   `변경률: ${pr.changePct.toFixed(3)} %  ·  변경 면적: ${_fmtArea(pr.changeArea)} ㎡`,
    imgDataURL: canvas.toDataURL('image/png'),
    chunks,
    chunkType: 'change',
  };
}

// ─────────────────────────────────────────────────────────────────
//  증가율 섹션 생성
// ─────────────────────────────────────────────────────────────────
function _makeIncreaseSection(result, sFirst, sLast) {
  const { T } = getAlignTransform(sFirst.data, sLast.data);

  const exclFirst = [detectAlignLayer(sFirst.data).layer, detectBorderLayer(sFirst.data)].filter(Boolean);
  const exclLast  = [detectAlignLayer(sLast.data).layer,  detectBorderLayer(sLast.data)].filter(Boolean);
  const lsFirst   = getLandUseLayers(sFirst.data, exclFirst);
  const lsLast    = getLandUseLayers(sLast.data,  exclLast);

  const rFirst = lsFirst.flatMap(l => (sFirst.data.layers[l] || []).map(r => applyTransform(r, T)));
  const rLast  = lsLast.flatMap(l => sLast.data.layers[l]  || []);

  // 증가 폴리곤 = last - first (polygon-clipping difference)
  let incrPolys = [];
  try {
    if (rFirst.length && rLast.length) {
      const a = polygonClipping.union(...rFirst.map(r => [r]));
      const b = polygonClipping.union(...rLast.map(r => [r]));
      incrPolys = polygonClipping.difference(b, a) || [];
    } else if (rLast.length) {
      incrPolys = polygonClipping.union(...rLast.map(r => [r])) || [];
    }
  } catch (_) { incrPolys = []; }

  const allRings = [...rFirst, ...rLast];
  const tfn = _makeMapTransform(allRings, _EX.CW, _EX.CH, _EX.PAD, _EX.LEG_H);

  const canvas = _newCanvas();
  const ctx    = canvas.getContext('2d');
  _fillBg(ctx, canvas.width, canvas.height);

  // 최초 도면 레이어 (base)
  lsFirst.forEach(l => {
    const tr = (sFirst.data.layers[l] || []).map(r => applyTransform(r, T));
    _drawRings(ctx, tr, layerColor(l), 0.22, 0.75, 1, tfn);
  });

  // 증가 구역 강조
  const chunks = [];
  let chunkN = 1;
  incrPolys.forEach(poly => {
    if (!poly?.[0]?.length) return;
    _drawPoly(ctx, poly, _EX.incrFill, _EX.incrStroke, 2.5, tfn);
    const [cx, cy] = _centroid(poly[0]);
    _drawLabel(ctx, tfn.x(cx), tfn.y(cy), chunkN, _EX.incrLabel);
    chunks.push({ num: chunkN, from: '현황', to: '증가', area: shoelace(poly[0]) });
    chunkN++;
  });

  _drawLegend(ctx, canvas.width, canvas.height, _EX.LEG_H, [
    { color: '#777',         label: `최초 도면 (${sFirst.label})` },
    { color: _EX.incrStroke, label: '증가 구역' },
  ]);
  _drawScaleBar(ctx, canvas.width, canvas.height, _EX.LEG_H);

  const totalArea = chunks.reduce((s, c) => s + c.area, 0);
  return {
    title:      `사업부지 증가 분석 — ${sFirst.label} → ${sLast.label}`,
    subtitle:   `증가율: ${result.increasePct.toFixed(3)} %  ·  증가 면적: ${_fmtArea(totalArea)} ㎡`,
    imgDataURL: canvas.toDataURL('image/png'),
    chunks,
    chunkType: 'increase',
  };
}

// ─────────────────────────────────────────────────────────────────
//  캔버스 드로잉 유틸
// ─────────────────────────────────────────────────────────────────

function _newCanvas() {
  const c = document.createElement('canvas');
  c.width  = _EX.CW;
  c.height = _EX.CH;
  return c;
}

function _fillBg(ctx, w, h) {
  ctx.fillStyle = '#f8f8f6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

/** 링 배열을 같은 색으로 채워 그리기 */
function _drawRings(ctx, rings, hexColor, fillAlpha, strokeAlpha, lw, tfn) {
  if (!rings?.length) return;
  ctx.save();
  rings.forEach(ring => {
    if (ring.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(tfn.x(ring[0][0]), tfn.y(ring[0][1]));
    for (let i = 1; i < ring.length; i++) ctx.lineTo(tfn.x(ring[i][0]), tfn.y(ring[i][1]));
    ctx.closePath();
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle   = hexColor;
    ctx.fill();
    ctx.globalAlpha = strokeAlpha;
    ctx.strokeStyle = hexColor;
    ctx.lineWidth   = lw;
    ctx.stroke();
  });
  ctx.restore();
}

/** polygon-clipping MultiPolygon 한 개 그리기 (구멍 포함) */
function _drawPoly(ctx, poly, fillStyle, strokeStyle, lw, tfn) {
  ctx.save();
  ctx.beginPath();
  poly.forEach((ring, ri) => {
    if (!ring.length) return;
    ctx.moveTo(tfn.x(ring[0][0]), tfn.y(ring[0][1]));
    for (let i = 1; i < ring.length; i++) ctx.lineTo(tfn.x(ring[i][0]), tfn.y(ring[i][1]));
    ctx.closePath();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle   = fillStyle;
  ctx.fill('evenodd');       // 구멍 처리
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth   = lw;
  ctx.stroke();
  ctx.restore();
}

/** 번호 라벨 (원형 배지) */
function _drawLabel(ctx, x, y, num, bgColor) {
  const r = num >= 100 ? 17 : 14;
  ctx.save();
  // 흰색 후광
  ctx.globalAlpha = 0.85;
  ctx.fillStyle   = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.fill();
  // 배지
  ctx.globalAlpha = 1;
  ctx.fillStyle   = bgColor;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // 숫자
  ctx.fillStyle      = '#fff';
  ctx.font           = `bold ${r < 14 ? 10 : 12}px sans-serif`;
  ctx.textAlign      = 'center';
  ctx.textBaseline   = 'middle';
  ctx.fillText(String(num), x, y + 0.5);
  ctx.restore();
}

/** 폴리곤 외곽링 무게중심 */
function _centroid(ring) {
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % n];
    const a = x0 * y1 - x1 * y0;
    A += a; cx += (x0 + x1) * a; cy += (y0 + y1) * a;
  }
  A /= 2;
  if (Math.abs(A) < 1e-10) return [
    ring.slice(0, n).reduce((s, [x]) => s + x, 0) / n,
    ring.slice(0, n).reduce((s, [, y]) => s + y, 0) / n,
  ];
  return [cx / (6 * A), cy / (6 * A)];
}

/** 지도 좌표→캔버스 픽셀 변환 함수 생성 */
function _makeMapTransform(rings, CW, CH, pad, legH) {
  const mapH = CH - legH;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rings.forEach(ring => ring.forEach(([x, y]) => {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }));
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
  const dw = maxX - minX || 1, dh = maxY - minY || 1;
  const scale = Math.min((CW - pad * 2) / dw, (mapH - pad * 2) / dh);
  const ox = pad + ((CW  - pad * 2) - dw * scale) / 2;
  const oy = pad + ((mapH - pad * 2) - dh * scale) / 2;
  return {
    x: wx => (wx - minX) * scale + ox,
    y: wy => mapH - ((wy - minY) * scale + oy),
    scale,
  };
}

/** 범례 */
function _drawLegend(ctx, W, H, legH, items) {
  const y0 = H - legH;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.fillRect(0, y0, W, legH);
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();

  const gap = Math.min(220, (W - 20) / items.length);
  items.forEach((item, i) => {
    const lx = 20 + i * gap;
    const ly = y0 + legH / 2;
    ctx.fillStyle = item.color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(lx, ly - 8, 20, 16);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, ly - 8, 20, 16);
    ctx.fillStyle      = '#333';
    ctx.font           = '12px sans-serif';
    ctx.textAlign      = 'left';
    ctx.textBaseline   = 'middle';
    ctx.fillText(item.label, lx + 26, ly + 1);
  });
  ctx.restore();
}

/** 스케일 바 (오른쪽 하단) */
function _drawScaleBar(ctx, W, H, legH) {
  const x = W - 20, y = H - legH / 2;
  ctx.save();
  ctx.font           = '10px sans-serif';
  ctx.textAlign      = 'right';
  ctx.textBaseline   = 'middle';
  ctx.fillStyle      = '#888';
  ctx.fillText('※ 면적 단위: DXF 좌표 단위²', x, y);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────
//  프린트 HTML 생성 & 팝업 열기
// ─────────────────────────────────────────────────────────────────
function _openPrintWindow(sections) {
  const now = new Date().toLocaleString('ko-KR', { hour12: false });
  let bodyHtml = `
    <div class="rpt-header">
      <div class="rpt-title">토지이용계획 변경 분석 보고서</div>
      <div class="rpt-meta">생성일시: ${now}</div>
    </div>`;

  sections.forEach((sec, i) => {
    const isLast = i === sections.length - 1;
    bodyHtml += `
      <div class="rpt-section${i > 0 ? ' page-break' : ''}">
        <div class="sec-head">
          <span class="sec-num">${i + 1}</span>
          <span class="sec-title">${sec.title}</span>
        </div>
        <div class="sec-sub">${sec.subtitle}</div>
        <img class="map-img" src="${sec.imgDataURL}" alt="${sec.title}">
        <div class="tbl-title">일람표</div>
        ${_chunkTableHtml(sec.chunks, sec.chunkType)}
      </div>`;
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>토지이용계획 변경 분석 보고서</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:"Apple SD Gothic Neo","맑은 고딕","Malgun Gothic","Noto Sans KR",sans-serif;
    font-size:13px;color:#1a1a1a;background:#fff;padding:24px 28px;
  }
  /* ── 헤더 ── */
  .rpt-header{
    text-align:center;margin-bottom:28px;
    border-bottom:2.5px solid #1a1a1a;padding-bottom:14px;
  }
  .rpt-title{font-size:20px;font-weight:800;letter-spacing:-0.3px;}
  .rpt-meta{font-size:11px;color:#666;margin-top:5px;}
  /* ── 섹션 ── */
  .rpt-section{margin-bottom:52px;}
  .sec-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
  .sec-num{
    width:28px;height:28px;border-radius:50%;
    background:#185fa5;color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:800;flex-shrink:0;
  }
  .sec-title{font-size:15px;font-weight:800;color:#111;}
  .sec-sub{font-size:12px;color:#555;margin-bottom:12px;padding-left:38px;}
  /* ── 도면 이미지 ── */
  .map-img{
    width:100%;max-width:100%;
    border:1px solid #ccc;display:block;margin-bottom:14px;
  }
  /* ── 일람표 ── */
  .tbl-title{
    font-size:13px;font-weight:800;color:#333;
    margin-bottom:6px;border-left:3px solid #185fa5;padding-left:8px;
  }
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{
    background:#e8f0fa;padding:7px 10px;
    border:1px solid #b8c8de;text-align:center;font-weight:800;
  }
  td{padding:6px 10px;border:1px solid #ddd;text-align:center;}
  td.left{text-align:left;}
  tr:nth-child(even) td{background:#f6f9fc;}
  .total-row td{background:#ddeeff;font-weight:800;}
  .empty-note{color:#888;font-size:12px;padding:6px 0;}
  /* ── 인쇄 ── */
  @media print{
    @page{size:A4;margin:12mm 14mm;}
    body{padding:0;}
    .page-break{page-break-before:always;}
    .print-btn{display:none!important;}
  }
  /* ── 고정 버튼 ── */
  .print-btn{
    position:fixed;bottom:22px;right:22px;
    background:#185fa5;color:#fff;border:none;
    padding:13px 26px;border-radius:10px;font-size:14px;
    font-weight:800;cursor:pointer;
    box-shadow:0 4px 16px rgba(0,0,0,0.22);z-index:9999;
  }
  .print-btn:hover{background:#0c447c;}
</style>
</head>
<body>
${bodyHtml}
<button class="print-btn" onclick="window.print()">🖨&nbsp;&nbsp;인쇄 / PDF 저장</button>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=800');
  if (!win) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.'); return; }
  win.document.write(html);
  win.document.close();
}

function _chunkTableHtml(chunks, type) {
  if (!chunks?.length) return '<p class="empty-note">변경/증가 구역 없음</p>';
  const isChange = type === 'change';
  const thead = isChange
    ? '<tr><th style="width:60px">번호</th><th>변경 전 용도</th><th>변경 후 용도</th><th style="width:130px">면적 (㎡)</th></tr>'
    : '<tr><th style="width:60px">번호</th><th>구분</th><th style="width:130px">면적 (㎡)</th></tr>';
  const rows = chunks.map(c => isChange
    ? `<tr><td>${c.num}</td><td class="left">${c.from}</td><td class="left">${c.to}</td><td>${_fmtArea(c.area)}</td></tr>`
    : `<tr><td>${c.num}</td><td class="left">증가 구역</td><td>${_fmtArea(c.area)}</td></tr>`
  ).join('');
  const total = chunks.reduce((s, c) => s + c.area, 0);
  const tfoot = isChange
    ? `<tr class="total-row"><td colspan="3" style="text-align:right;font-weight:800;">합 계</td><td>${_fmtArea(total)}</td></tr>`
    : `<tr class="total-row"><td colspan="2" style="text-align:right;font-weight:800;">합 계</td><td>${_fmtArea(total)}</td></tr>`;
  return `<table><thead>${thead}</thead><tbody>${rows}${tfoot}</tbody></table>`;
}

function _fmtArea(n) {
  return Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
