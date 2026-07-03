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
  // 증가 분석 도면의 기존 부지(용도 구분 없이 통일) 색
  baseGray:   '#9a9a9a',
  // 겹침 확인 강조 색 (변경/증가와 헷갈리지 않게 보라색 계열)
  overlapFill:   'rgba(190, 0, 190, 0.55)',
  overlapStroke: '#7a0080',
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

  // 면적상세 섹션용 — 모든 차수의 변경/증가 항목을 한데 모음
  const detailChunks = sections.flatMap(sec => sec.chunks);

  _openPrintWindow(sections, detailChunks);
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

  // 변경 후 레이어를 최초 도면 전체 윤곽으로 잘라낸다 — 이 비교 도면은 "기존 부지 안에서
  // 용도가 바뀐 부분"만 보면 되고, 부지 자체가 늘어난(증가) 부분은 증가 분석 도면에서
  // 따로 다루므로 여기서는 안 보이게 뺀다.
  const fromUnion = _runClipping(polygonClipping.union, lsFrom.flatMap(l => tFrom[l]).map(_ringGeom));
  function _clipToFrom(rings) {
    if (!fromUnion || !rings.length) return rings;
    const u = _runClipping(polygonClipping.union, rings.map(_ringGeom));
    if (!u) return rings;
    const inter = _runClipping(polygonClipping.intersection, [u, fromUnion]);
    if (!inter) return rings;
    return cleanMultiPoly(inter)
      .map(poly => (poly.length > 1 ? mergePolygonHoles(poly) : poly[0]))
      .filter(r => r && r.length >= 3);
  }

  // 변경 전 레이어 (연하게 — 변경 구역 강조가 도드라져 보이도록 투명도를 살짝 둔다)
  lsFrom.forEach(l => _drawRings(ctx, tFrom[l], layerColor(l), 0.14, tfn));
  // 변경 후 레이어 (증가분은 잘라내고, 기존 부지 안의 변화만 / 중간 농도)
  lsTo.forEach(l => _drawRings(ctx, _clipToFrom(tTo[l]), layerColor(l), 0.28, tfn));

  // N-1차/N차 개별 도면 이미지 (페이지 상단 2분할용) — 비교 도면과 같은 tfn을 그대로
  // 써서 세 이미지의 축척·위치가 서로 어긋나지 않게 한다. 개별 도면은 증가분을 잘라내지
  // 않고 각 단계 그대로(제 모습)를 보여준다.
  const fromCanvas = _newCanvas();
  const fromCtx = fromCanvas.getContext('2d');
  _fillBg(fromCtx, fromCanvas.width, fromCanvas.height);
  lsFrom.forEach(l => _drawRings(fromCtx, tFrom[l], layerColor(l), 0.8, tfn));
  _drawScaleBar(fromCtx, fromCanvas.width, fromCanvas.height, _EX.LEG_H);

  const toCanvas = _newCanvas();
  const toCtx = toCanvas.getContext('2d');
  _fillBg(toCtx, toCanvas.width, toCanvas.height);
  lsTo.forEach(l => _drawRings(toCtx, tTo[l], layerColor(l), 0.8, tfn));
  _drawScaleBar(toCtx, toCanvas.width, toCanvas.height, _EX.LEG_H);

  // 변경 폴리곤 강조 + 넘버링 (라벨 위치는 먼저 모아서 겹침을 풀고 나중에 그린다)
  const chunks = [];
  const labelPositions = [];
  let chunkN = 1;
  pr.changes.forEach(ch => {
    (ch.polys || []).forEach(poly => {
      if (!poly?.[0]?.length) return;
      _drawPoly(ctx, poly, _EX.chgFill, _EX.chgStroke, 2.5, tfn);
      const [cx, cy] = _centroid(poly[0]);
      labelPositions.push({ x: tfn.x(cx), y: tfn.y(cy), num: chunkN, color: _EX.chgLabel });
      // shoelace(poly[0])는 외곽 링 면적만 계산해서 구멍(중간이 빠진 도넛형 모양)이 있으면
      // 실제보다 부풀려진다 — multiPolyArea([poly])로 구멍을 빼야 한다(geometry.js의
      // multiPolyArea가 이미 같은 이유로 정확히 이렇게 처리하고 있음).
      chunks.push({ num: chunkN, from: ch.from, to: ch.to, area: multiPolyArea([poly]), poly, origin: `${seqNum}차 변경` });
      chunkN++;
    });
  });
  _resolveLabelCollisions(labelPositions);
  labelPositions.forEach(lp => _drawLabel(ctx, lp.x, lp.y, lp.num, lp.color));
  _drawScaleBar(ctx, canvas.width, canvas.height, _EX.LEG_H);

  // 도면별 토지이용 레이어 범례 (변경 전·후 레이어 전체)
  const layerLegend = [...new Set([...lsFrom, ...lsTo])]
    .map(l => ({ color: layerColor(l), label: l }));

  return {
    title:      `${seqNum}차 변경 도면 비교 — ${sFrom.label} → ${sTo.label}`,
    subtitle:   `변경률: ${pr.changePct.toFixed(3)} %  ·  변경 면적: ${_fmtArea(pr.changeArea)} ㎡` +
      (pr.excludedArea > 0.1 ? `  ·  제척된 면적: ${_fmtArea(pr.excludedArea)} ㎡` : ''),
    imgDataURL: canvas.toDataURL('image/png'),       // 비교(변경 구역 강조) 도면 — 하단 통합칸
    imgFromDataURL: fromCanvas.toDataURL('image/png'), // 변경 전 개별 도면 — 상단 왼쪽
    imgToDataURL:   toCanvas.toDataURL('image/png'),   // 변경 후 개별 도면 — 상단 오른쪽
    fromLabel: sFrom.label,
    toLabel:   sTo.label,
    layerLegend,
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
  if (rFirst.length && rLast.length) {
    const a = _runClipping(polygonClipping.union, rFirst.map(_ringGeom));
    const b = _runClipping(polygonClipping.union, rLast.map(_ringGeom));
    const diff = a && b ? _runClipping(polygonClipping.difference, [b, a]) : null;
    incrPolys = diff ? cleanMultiPoly(diff) : [];
  } else if (rLast.length) {
    const u = _runClipping(polygonClipping.union, rLast.map(_ringGeom));
    incrPolys = u ? cleanMultiPoly(u) : [];
  }

  const allRings = [...rFirst, ...rLast];
  const tfn = _makeMapTransform(allRings, _EX.CW, _EX.CH, _EX.PAD, _EX.LEG_H);

  const canvas = _newCanvas();
  const ctx    = canvas.getContext('2d');
  _fillBg(ctx, canvas.width, canvas.height);

  // 최초 도면 레이어 (base) — 용도 구분 없이 옅은 회색으로 통일 (이 도면은 증가 구역만 보면 됨)
  lsFirst.forEach(l => {
    const tr = (sFirst.data.layers[l] || []).map(r => applyTransform(r, T));
    _drawRings(ctx, tr, _EX.baseGray, 0.35, tfn);
  });

  // 증가 구역 강조
  const chunks = [];
  const labelPositions = [];
  let chunkN = 1;
  incrPolys.forEach(poly => {
    if (!poly?.[0]?.length) return;
    _drawPoly(ctx, poly, _EX.incrFill, _EX.incrStroke, 2.5, tfn);
    const [cx, cy] = _centroid(poly[0]);
    labelPositions.push({ x: tfn.x(cx), y: tfn.y(cy), num: chunkN, color: _EX.incrLabel });
    // shoelace(poly[0])는 외곽 링만 계산해 구멍이 있으면 부풀려진다 — multiPolyArea로 정정.
    chunks.push({ num: chunkN, from: '현황', to: '증가', area: multiPolyArea([poly]), poly, origin: '증가' });
    chunkN++;
  });
  _resolveLabelCollisions(labelPositions);
  labelPositions.forEach(lp => _drawLabel(ctx, lp.x, lp.y, lp.num, lp.color));

  _drawScaleBar(ctx, canvas.width, canvas.height, _EX.LEG_H);

  const totalArea = chunks.reduce((s, c) => s + c.area, 0);
  return {
    title:      `사업부지 증가 분석 — ${sFirst.label} → ${sLast.label}`,
    subtitle:   `증가율: ${result.increasePct.toFixed(3)} %  ·  증가 면적: ${_fmtArea(totalArea)} ㎡`,
    imgDataURL: canvas.toDataURL('image/png'),
    layerLegend: [], // 이 도면은 기존 부지=회색, 증가 구역=초록 단 두 가지뿐이라 용도별 범례가 필요 없음
    chunks,
    chunkType: 'increase',
  };
}

// ─────────────────────────────────────────────────────────────────
//  겹침 확인 보고서 — 어느 색이 위인지 캐드에 기록 안 된 겹침을 도면 위에
//  한 가지 색으로만 강조해서 보여준다(분석 실행 전, 슬롯 업로드만 된 상태에서도
//  바로 볼 수 있다 — 변경/증가 분석과 무관하게 슬롯별로 독립적으로 본다).
// ─────────────────────────────────────────────────────────────────
function exportOverlapReport(slots) {
  const targets = (slots || []).filter(s => s.rawData?.ambiguousOverlaps?.length > 0);
  if (!targets.length) { alert('겹침이 없습니다.'); return; }
  const sections = targets.map((slot, i) => _makeOverlapSection(slot, i + 1));
  _openPrintWindow(sections, []);
}

function _makeOverlapSection(slot, seqNum) {
  const data = slot.rawData;
  const allRings = Object.values(data.colors || {}).flat();
  const tfn = _makeMapTransform(allRings, _EX.CW, _EX.CH, _EX.PAD, _EX.LEG_H);

  const canvas = _newCanvas();
  const ctx    = canvas.getContext('2d');
  _fillBg(ctx, canvas.width, canvas.height);

  // 실제 색상으로 도면 전체를 옅게 깔아서(위치 파악용), 겹침 구역만 한 가지
  // 경고색으로 또렷하게 강조한다 — 색상별로 다르게 칠하면 또 추측처럼 보일 수 있어서
  // 일부러 다 같은 색 하나로만 표시한다.
  Object.entries(data.colors || {}).forEach(([hex, rings]) => {
    _drawRings(ctx, rings, hex, 0.35, tfn);
  });

  const chunks = [];
  const labelPositions = [];
  let chunkN = 1;
  (data.ambiguousOverlaps || []).forEach(ov => {
    (ov.polys || []).forEach(poly => {
      if (!poly?.[0]?.length) return;
      _drawPoly(ctx, poly, _EX.overlapFill, _EX.overlapStroke, 2.5, tfn);
      const [cx, cy] = _centroid(poly[0]);
      labelPositions.push({ x: tfn.x(cx), y: tfn.y(cy), num: chunkN, color: _EX.overlapStroke });
      // shoelace(poly[0])는 외곽 링만 계산해 구멍이 있으면 부풀려진다 — multiPolyArea로 정정.
      chunks.push({ num: chunkN, area: multiPolyArea([poly]) });
      chunkN++;
    });
  });
  _resolveLabelCollisions(labelPositions);
  labelPositions.forEach(lp => _drawLabel(ctx, lp.x, lp.y, lp.num, lp.color));
  _drawScaleBar(ctx, canvas.width, canvas.height, _EX.LEG_H);

  return {
    title:      `겹침 확인 — ${slot.label}${slot.file?.name ? ' (' + slot.file.name + ')' : ''}`,
    subtitle:   `어느 색이 위인지 알 수 없는 겹침 ${chunks.length}건` +
      ' — 중복 해치 없이 다시 작성해서 올려주세요.',
    imgDataURL: canvas.toDataURL('image/png'),
    layerLegend: [],
    chunks,
    chunkType: 'overlap',
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

/** 링 배열을 같은 색으로 채워 그리기 — 같은 색 조각끼리는 먼저 하나로 합쳐서
 *  그린다. 안 그러면 원래 도면에서 같은 용도가 여러 조각으로 나뉘어 그려진 경우
 *  (인접한 조각들끼리) 그 경계마다 쓸데없는 선이 그대로 보인다. */
function _drawRings(ctx, rings, hexColor, fillAlpha, tfn) {
  if (!rings?.length) return;
  hexColor = _getDisplayColor(hexColor);
  const unioned = _runClipping(polygonClipping.union, rings.map(_ringGeom));
  const merged = unioned
    ? cleanMultiPoly(unioned)
        .map(poly => (poly.length > 1 ? mergePolygonHoles(poly) : poly[0]))
        .filter(r => r && r.length >= 3)
    : rings; // 합치기 실패하면 기존처럼 개별로 그림(안전망)
  ctx.save();
  ctx.filter = 'saturate(72%) brightness(110%)';
  merged.forEach(ring => {
    // 면적이 0인 퇴화(점/선) 링은 잔재 가이드선이므로 그리지 않음
    if (ring.length < 2 || shoelace(ring) < 1e-6) return;
    ctx.beginPath();
    // 구멍이 합쳐진 링은 외곽+구멍을 각각 별도 서브패스로 그려서(evenodd) 둘을 잇는
    // 틈새 선이 보이지 않게 한다 (__origPoly가 그 원래 [외곽, 구멍...] 형태)
    const subpaths = ring.__origPoly || [ring];
    subpaths.forEach(sub => {
      if (!sub.length) return;
      ctx.moveTo(tfn.x(sub[0][0]), tfn.y(sub[0][1]));
      for (let i = 1; i < sub.length; i++) ctx.lineTo(tfn.x(sub[i][0]), tfn.y(sub[i][1]));
      ctx.closePath();
    });
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle   = hexColor;
    ctx.fill('evenodd');
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

/** 변경/증가 폴리곤 1개를 자신의 bbox에 맞춰 확대한 미니 카드 이미지 생성 (면적상세용) */
function _makeDetailCardImage(poly, fillStyle, strokeStyle) {
  const W = 360, H = 300, pad = 24;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  _fillBg(ctx, W, H);
  if (!poly?.[0]?.length) return canvas.toDataURL('image/png');
  const tfn = _makeMapTransform(poly, W, H, pad, 0);
  _drawPoly(ctx, poly, fillStyle, strokeStyle, 2, tfn);
  return canvas.toDataURL('image/png');
}

/** 번호 라벨 (원형 배지) */
function _drawLabel(ctx, x, y, num, bgColor) {
  const r = num >= 100 ? 17 : 14;
  ctx.save();
  // 흰색 후광
  ctx.globalAlpha = 1;
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

/**
 * 라벨(번호 배지)끼리 겹치면 서로 밀어내서 둘 다 보이게 한다.
 * 변경 조각 2개의 중심점이 우연히 거의 같은 위치면, 나중에 그려진 배지가
 * 먼저 것을 완전히 덮어버리는 문제를 막는다.
 */
function _resolveLabelCollisions(positions, minDist = 36) {
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const pa = positions[a], pb = positions[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        moved = true;
        let ux, uy;
        if (dist < 1e-6) {
          const ang = (a * 137 + b * 53) % 360 * Math.PI / 180;
          ux = Math.cos(ang); uy = Math.sin(ang);
          dist = 0;
        } else {
          ux = dx / dist; uy = dy / dist;
        }
        const push = (minDist - dist) / 2;
        pa.x -= ux * push; pa.y -= uy * push;
        pb.x += ux * push; pb.y += uy * push;
      }
    }
    if (!moved) break;
  }
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
  rings.forEach(ring => {
    // 면적이 0인 퇴화(점/선) 링은 동떨어진 잔재 도형일 수 있으므로 bbox 계산에서 제외
    if (shoelace(ring) < 1e-6) return;
    ring.forEach(([x, y]) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    });
  });
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
function _openPrintWindow(sections, detailChunks) {
  const now = new Date().toLocaleString('ko-KR', { hour12: false });
  let bodyHtml = `
    <div class="rpt-header">
      <div class="rpt-title">토지이용계획 변경 분석 보고서</div>
      <div class="rpt-meta">생성일시: ${now}</div>
    </div>`;

  sections.forEach((sec, i) => {
    const isLast = i === sections.length - 1;
    const mapHtml = sec.chunkType === 'change'
      ? `<div class="pair-grid">
           <div class="pair-top">
             <div class="pair-top-cell">
               <div class="pair-cell-head"><span class="pair-cell-num">1</span><span class="pair-cell-label">${sec.fromLabel}</span></div>
               <img class="pair-img-half" src="${sec.imgFromDataURL}" alt="${sec.fromLabel}">
             </div>
             <div class="pair-top-cell">
               <div class="pair-cell-head"><span class="pair-cell-num">2</span><span class="pair-cell-label">${sec.toLabel}</span></div>
               <img class="pair-img-half" src="${sec.imgToDataURL}" alt="${sec.toLabel}">
             </div>
           </div>
           <div class="pair-bottom">
             <div class="pair-cell-head"><span class="pair-cell-label">도면 비교 (변경 구역 강조)</span></div>
             <img class="pair-img-full" src="${sec.imgDataURL}" alt="${sec.title} 비교">
           </div>
         </div>`
      : `<img class="map-img" src="${sec.imgDataURL}" alt="${sec.title}">`;

    bodyHtml += `
      <div class="rpt-section${i > 0 ? ' page-break' : ''}">
        <div class="sec-head">
          <span class="sec-num">${i + 1}</span>
          <span class="sec-title">${sec.title}</span>
        </div>
        <div class="sec-sub">${sec.subtitle}</div>
        ${mapHtml}
        ${_layerLegendHtml(sec.layerLegend)}
        <div class="tbl-title">일람표</div>
        ${_chunkTableHtml(sec.chunks, sec.chunkType)}
      </div>`;
  });

  bodyHtml += _makeDetailGridSection(detailChunks, sections.length + 1);

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
    border:1px solid #ccc;display:block;margin-bottom:8px;
  }
  /* ── 변경 차수 페이지: 상단 전후 도면 2분할 + 하단 비교 도면 통합 ── */
  .pair-grid{ margin-bottom:8px; }
  .pair-top{ display:flex; gap:10px; margin-bottom:8px; }
  .pair-top-cell{ flex:1; min-width:0; }
  .pair-bottom{ }
  .pair-cell-head{ display:flex; align-items:center; gap:7px; margin-bottom:4px; }
  .pair-cell-num{
    width:20px;height:20px;border-radius:50%;
    background:#555;color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:800;flex-shrink:0;
  }
  .pair-cell-label{ font-size:12px;font-weight:700;color:#333; }
  .pair-img-half{
    width:100%;max-height:78mm;object-fit:contain;
    border:1px solid #ccc;display:block;background:#f8f8f6;
  }
  .pair-img-full{
    width:100%;max-height:92mm;object-fit:contain;
    border:1px solid #ccc;display:block;background:#f8f8f6;
  }
  /* ── 도면 범례 ── */
  .layer-legend{
    display:flex;flex-wrap:wrap;gap:6px 16px;
    background:#f6f9fc;border:1px solid #ddd;border-radius:6px;
    padding:8px 12px;margin-bottom:14px;
  }
  .lgd-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#333;}
  .lgd-swatch{
    display:inline-block;width:14px;height:14px;
    border:1px solid #888;border-radius:2px;flex-shrink:0;
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
  .tbl-dot{
    display:inline-block;width:8px;height:8px;border-radius:2px;
    margin-right:5px;vertical-align:middle;
  }
  tr:nth-child(even) td{background:#f6f9fc;}
  .total-row td{background:#ddeeff;font-weight:800;}
  .empty-note{color:#888;font-size:12px;padding:6px 0;}
  /* ── 면적상세 그리드 ── */
  .detail-grid{
    display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;
    gap:14px;margin-top:10px;
  }
  .detail-card{
    border:1px solid #ccc;border-radius:6px;padding:10px;
    display:flex;flex-direction:column;align-items:center;
    background:#fafafa;
  }
  .detail-img{
    width:100%;max-height:200px;object-fit:contain;
    border:1px solid #ddd;background:#f8f8f6;margin-bottom:8px;
  }
  .detail-origin{font-size:12px;font-weight:800;color:#185fa5;}
  .detail-fromto{font-size:12px;color:#333;margin-top:2px;}
  .detail-area{font-size:13px;font-weight:800;color:#111;margin-top:4px;}
  /* ── 인쇄 ── */
  @media print{
    @page{size:A4;margin:12mm 14mm;}
    body{padding:0;}
    .page-break{page-break-before:always;}
    .detail-page{page-break-inside:avoid;}
    .print-btn{display:none!important;}
    /* 브라우저가 인쇄 시 배경색을 기본적으로 빼버려서, 범례 점/표 헤더 색이 PDF에서
       안 보이는 문제 방지 — 모든 요소에 배경색을 그대로 출력하도록 강제 */
    *{ print-color-adjust:exact!important; -webkit-print-color-adjust:exact!important; }
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

/** 도면별 토지이용 레이어 범례 HTML */
function _layerLegendHtml(items) {
  if (!items?.length) return '';
  const chips = items.map(it =>
    `<span class="lgd-item"><span class="lgd-swatch" style="background:${it.color}"></span>${it.label}</span>`
  ).join('');
  return `<div class="layer-legend">${chips}</div>`;
}

function _chunkTableHtml(chunks, type) {
  if (!chunks?.length) return '<p class="empty-note">변경/증가 구역 없음</p>';
  const dot = color => `<span class="tbl-dot" style="background:${color}"></span>`;

  if (type === 'overlap') {
    // 어디서 겹쳤는지 위치(도면의 번호)만 확인하면 되고, 개별 면적까지는 필요 없다.
    const rows = chunks.map(c => `<tr><td>${c.num}</td><td class="left">${dot(_EX.overlapStroke)}겹침 구역</td></tr>`).join('');
    return `<table><thead><tr><th style="width:60px">번호</th><th>구분</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  const isChange = type === 'change';
  const thead = isChange
    ? '<tr><th style="width:60px">번호</th><th>변경 전 용도</th><th>변경 후 용도</th><th style="width:130px">면적 (㎡)</th></tr>'
    : '<tr><th style="width:60px">번호</th><th>구분</th><th style="width:130px">면적 (㎡)</th></tr>';
  const rows = chunks.map(c => isChange
    ? `<tr><td>${c.num}</td><td class="left">${dot(layerColor(c.from))}${c.from}</td><td class="left">${dot(layerColor(c.to))}${c.to}</td><td>${_fmtArea(c.area)}</td></tr>`
    : `<tr><td>${c.num}</td><td class="left">${dot(_EX.incrStroke)}증가 구역</td><td>${_fmtArea(c.area)}</td></tr>`
  ).join('');
  const total = chunks.reduce((s, c) => s + c.area, 0);
  const tfoot = isChange
    ? `<tr class="total-row"><td colspan="3" style="text-align:right;font-weight:800;">합 계</td><td>${_fmtArea(total)}</td></tr>`
    : `<tr class="total-row"><td colspan="2" style="text-align:right;font-weight:800;">합 계</td><td>${_fmtArea(total)}</td></tr>`;
  return `<table><thead>${thead}</thead><tbody>${rows}${tfoot}</tbody></table>`;
}

/**
 * 면적상세 섹션 HTML — 모든 차수의 변경/증가 항목을 합쳐, 각 조각을 bbox에 맞춰
 * 확대한 카드를 A4 한 장당 2x2(4개)씩 나열한다.
 */
function _makeDetailGridSection(detailChunks, sectionNum) {
  const valid = (detailChunks || []).filter(c => c.poly?.[0]?.length);
  if (!valid.length) return '';

  const cards = valid.map(c => {
    const isIncr = c.origin === '증가';
    const img = _makeDetailCardImage(
      c.poly,
      isIncr ? _EX.incrFill   : _EX.chgFill,
      isIncr ? _EX.incrStroke : _EX.chgStroke
    );
    const fromToLabel = isIncr ? '증가 구역' : `${c.from} → ${c.to}`;
    return `
      <div class="detail-card">
        <img class="detail-img" src="${img}" alt="${c.origin} #${c.num}">
        <div class="detail-origin">${c.origin} #${c.num}</div>
        <div class="detail-fromto">${fromToLabel}</div>
        <div class="detail-area">${_fmtArea(c.area)} ㎡</div>
      </div>`;
  });

  // 4장씩 묶어 페이지 구성 — 첫 페이지에는 섹션 헤딩을 같이 넣어 별도 페이지를 낭비하지 않는다.
  let pagesHtml = '';
  for (let i = 0; i < cards.length; i += 4) {
    const group = cards.slice(i, i + 4).join('');
    const headHtml = i === 0
      ? `<div class="sec-head">
           <span class="sec-num">${sectionNum}</span>
           <span class="sec-title">면적상세</span>
         </div>
         <div class="sec-sub">전체 변경·증가 구역 개별 확대도 (총 ${valid.length}건)</div>`
      : '';
    pagesHtml += `
      <div class="detail-page rpt-section page-break">
        ${headHtml}
        <div class="detail-grid">${group}</div>
      </div>`;
  }

  return pagesHtml;
}

function _fmtArea(n) {
  return Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
