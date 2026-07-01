/**
 * parser.js
 * DXF 파싱 (LWPOLYLINE / HATCH → 레이어별 폴리곤 + 색상별 폴리곤)
 */

const BORDER_NAMES = ['둘레', 'BORDER', 'FRAME', 'OUTLINE', '도면한도리'];

// ── 불지(bulge) → 호(arc) 보간 ───────────────────────────────────
// LWPOLYLINE/HATCH 경계의 곡선 구간은 그룹코드 42(bulge)로 표현되는데, 지금까지는
// 이걸 무시하고 양 끝점을 직선으로 그냥 이어버려서 곡선이 직선으로 잘려 보였다.
// bulge = tan(포함각/4) 라는 DXF 정의를 그대로 써서 중심·반지름을 구하고, 그 호를
// 여러 점으로 잘라(segments개) 끼워넣는다.
function _bulgeArcPoints(p1, p2, bulge, segments) {
  if (!bulge) return [];
  const theta = Math.atan(bulge) * 4;
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const c = Math.hypot(dx, dy);
  if (c < 1e-9) return [];
  const r = c / (2 * Math.abs(Math.sin(theta / 2)));
  const chordAngle = Math.atan2(dy, dx);
  const midX = (p1[0] + p2[0]) / 2, midY = (p1[1] + p2[1]) / 2;
  const sign = bulge >= 0 ? 1 : -1; // 양수=반시계, 음수=시계 (DXF 정의)
  const apothem = Math.sqrt(Math.max(r * r - (c / 2) * (c / 2), 0));
  const perpAngle = chordAngle + sign * Math.PI / 2;
  const cx = midX + apothem * Math.cos(perpAngle);
  const cy = midY + apothem * Math.sin(perpAngle);
  const startAngle = Math.atan2(p1[1] - cy, p1[0] - cx);
  // 같은 물리적 원호를 HATCH 엣지 경계(_arcEdgePoints)에서 또 만날 수 있어서, 분할 개수가
  // 다르면 두 근사 사이에 머리카락 굵기의 틈/겹침이 생긴다 — 두 함수 다 64로 맞춘다.
  const n = Math.max(2, segments || 64);
  const pts = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const ang = startAngle + theta * t;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return pts;
}
/**
 * HATCH 엣지 경계의 "원호(타입2)" 엣지 — 중심/반지름/시작각/끝각(도)으로 호를 점들로 잘라낸다.
 * (LWPOLYLINE의 bulge와는 정의 방식이 달라 별도 함수로 둔다: 여기는 중심점 기준 절대각.)
 */
function _arcEdgePoints(cx, cy, radius, startDeg, endDeg, ccw, segments) {
  let startRad = startDeg * Math.PI / 180;
  let endRad = endDeg * Math.PI / 180;
  // ccw(73)=0(시계방향)일 때는 start/end각이 y축이 뒤집힌 좌표계(즉 부호가 반대인 각)로
  // 적혀있다 — 인접한 직선 엣지의 끝점과 좌표를 맞춰보면, y성분에 -1을 곱해야 정확히
  // 일치한다(실측으로 확인됨). 이걸 빼먹으면 짧은 호 대신 전혀 다른 위치/방향의 호가 그려진다.
  const ySign = ccw ? 1 : -1;
  while (endRad < startRad) endRad += Math.PI * 2;
  const n = Math.max(2, segments || 64); // _bulgeArcPoints와 분할 개수를 맞춰서 같은 원호의 근사 오차를 줄인다
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = startRad + (endRad - startRad) * (k / n);
    pts.push([cx + radius * Math.cos(t), cy + ySign * radius * Math.sin(t)]);
  }
  return pts;
}
/**
 * HATCH 엣지 경계의 "타원호(타입3)" 엣지 — 중심/장축벡터/단축비율/시작각/끝각(도)으로
 * 타원호를 점들로 잘라낸다. _arcEdgePoints와 같은 각도 파라미터화(50/51, 73)를 쓰되,
 * 장축 방향(rot)만큼 회전시킨다.
 */
function _ellipticArcEdgePoints(cx, cy, majDx, majDy, ratio, startDeg, endDeg, ccw, segments) {
  const majorLen = Math.hypot(majDx, majDy);
  const rot = Math.atan2(majDy, majDx);
  let startRad = startDeg * Math.PI / 180;
  let endRad = endDeg * Math.PI / 180;
  const ySign = ccw ? 1 : -1; // _arcEdgePoints와 같은 DXF 좌표계 관례
  while (endRad < startRad) endRad += Math.PI * 2;
  const n = Math.max(2, segments || 64);
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = startRad + (endRad - startRad) * (k / n);
    const u = majorLen * Math.cos(t);
    const v = ySign * majorLen * ratio * Math.sin(t);
    pts.push([cx + u * Math.cos(rot) - v * Math.sin(rot), cy + u * Math.sin(rot) + v * Math.cos(rot)]);
  }
  return pts;
}
/**
 * HATCH 엣지 경계의 "스플라인(타입4)" 엣지 — 정확한 NURBS 평가 대신, 곡선이 실제로
 * 지나가는 피팅점(fitPts)이 있으면 그걸, 없으면 제어점(controlPts, 곡선 근처를 지나감)을
 * 근사 좌표로 쓴다. "완전히 스킵"보다는 실제 면적에 훨씬 가까워진다.
 */
function _splineEdgePoints(fitPts, controlPts) {
  if (fitPts && fitPts.length >= 2) return fitPts;
  return controlPts || [];
}

/** vertices[i] → vertices[i+1] 구간의 불지값이 bulges[i]일 때, 곡선 구간에 보간점을 끼워넣는다 */
function _applyBulges(vertices, bulges) {
  if (!bulges.some(b => b)) return vertices;
  const out = [];
  for (let i = 0; i < vertices.length; i++) {
    out.push(vertices[i]);
    const next = vertices[i + 1];
    if (next && bulges[i]) out.push(..._bulgeArcPoints(vertices[i], next, bulges[i]));
  }
  return out;
}

// ── 색상 변환 (ACI 색상 인덱스 / 트루컬러 → #rrggbb) ──────────────
// 1~9는 AutoCAD 표준 기본색 그대로. 10~249는 표준표의 근사치(육안 구분용 –
// 실제 도면은 보통 1~9 또는 트루컬러를 쓰므로 정확도보다 "항상 같은 인덱스는
// 항상 같은 색"이라는 안정성이 더 중요하다). 250~255는 표준 그레이스케일.
const ACI_BASE_RGB = {
  1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255],
  5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255], 8: [128, 128, 128], 9: [192, 192, 192],
};
function _hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [r, g, b].map(v => Math.round((v + m) * 255));
}
function aciToRgb(idx) {
  idx = parseInt(idx, 10) || 0;
  if (ACI_BASE_RGB[idx]) return ACI_BASE_RGB[idx];
  if (idx >= 250 && idx <= 255) {
    const v = Math.round(51 + ((idx - 250) / 5) * 204);
    return [v, v, v];
  }
  if (idx >= 10 && idx <= 249) {
    const seg = idx - 10;
    const hue = Math.floor(seg / 10) * 15;
    const light = 20 + (seg % 10) * 8;
    return _hslToRgb(hue, 100, light);
  }
  return [0, 0, 0]; // 0(ByBlock) 등 알 수 없는 값
}
function _trueColorToRgb(val) {
  const n = (parseInt(val, 10) || 0) >>> 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function _rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
/** 엔티티의 색상코드(62)/트루컬러(420)와 소속 레이어의 기본색으로 최종 hex 색상 결정 */
function _resolveColorHex(colorIdx, trueColor, layer, layerDefaultAci) {
  if (trueColor != null) return _rgbToHex(_trueColorToRgb(trueColor));
  if (colorIdx != null && colorIdx !== 256 && colorIdx !== 0) {
    return _rgbToHex(aciToRgb(Math.abs(colorIdx)));
  }
  // ByLayer(256) 또는 미지정 → 소속 레이어의 기본 색상을 따른다
  const layerAci = layerDefaultAci[layer];
  return _rgbToHex(aciToRgb(layerAci != null ? Math.abs(layerAci) : 7));
}
/** TABLES/LAYER 섹션에서 레이어명 → 기본 ACI 색상 인덱스만 뽑아낸다 (분석 키로는 안 씀) */
function _parseLayerDefaultColors(pairs) {
  const map = {};
  let inLayerTable = false;
  let curName = null, curColor = null;
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code === '0' && val === 'TABLE') {
      const next = pairs[i + 1];
      inLayerTable = !!(next && next[0] === '2' && next[1] === 'LAYER');
      continue;
    }
    if (code === '0' && val === 'ENDTAB') { inLayerTable = false; continue; }
    if (!inLayerTable) continue;
    if (code === '0' && val === 'LAYER') {
      if (curName != null) map[curName] = curColor;
      curName = null; curColor = null;
      continue;
    }
    if (code === '2' && curName === null) curName = val;
    else if (code === '62') curColor = parseInt(val, 10) || 0;
  }
  if (curName != null) map[curName] = curColor;
  return map;
}

/**
 * SORTENTSTABLE(도면 순서 테이블) 파싱 → { [엔티티 핸들]: 정렬키(숫자) }
 * 그룹코드 331(엔티티 핸들)/5(그 엔티티의 정렬용 핸들) 쌍이 반복된다.
 * 정렬키가 작을수록 먼저(아래) 그려지고, 클수록 나중(위)에 그려진다.
 */
function _parseSortEntsTable(pairs) {
  const map = {};
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code !== '0' || val !== 'SORTENTSTABLE') continue;
    let j = i + 1;
    let pendingHandle = null;
    while (j < pairs.length && pairs[j][0] !== '0') {
      const [c, v] = pairs[j];
      if (c === '331') pendingHandle = v;
      else if (c === '5' && pendingHandle != null) {
        map[pendingHandle] = parseInt(v, 16) || 0;
        pendingHandle = null;
      }
      j++;
    }
  }
  return map;
}

/**
 * DXF 텍스트 → { layers: { [layerName]: ring[][] }, colors, ambiguousOverlaps }
 */
function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  // 그룹코드-값 쌍 배열 구성
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const val  = lines[i + 1].trim();
    if (code !== '') pairs.push([code, val]);
  }

  const layerDefaultAci = _parseLayerDefaultColors(pairs);
  const layers = {};
  // 색상/용도 분석은 HATCH만 본다 — LWPOLYLINE은 캐드에서 보통 테두리·경계선처럼
  // 칠이 없는 별개 객체로 쓰이고, 범례에 끼면 "제외" 처리를 따로 해줘야 해서 번거롭다.
  // (layers에는 그대로 넣어 다른 화면의 도면 미리보기는 영향받지 않게 한다.)
  const hatchDrawOrder = [];
  let inEntities = false;
  let i = 0;

  function _addPoly(layer, ring) {
    if (ring.length < 3) return;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(ring);
  }
  function _addHatch(layer, ring, colorIdx, trueColor, handle) {
    if (ring.length < 3) return;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(ring);
    hatchDrawOrder.push({ ring, handle, hex: _resolveColorHex(colorIdx, trueColor, layer, layerDefaultAci) });
  }

  while (i < pairs.length) {
    const [code, val] = pairs[i];

    if (code === '0' && val === 'SECTION') {
      i++;
      if (i < pairs.length && pairs[i][0] === '2') {
        const secName = pairs[i][1];
        inEntities = (secName === 'ENTITIES' || secName === 'BLOCKS');
      }
    } else if (code === '0' && val === 'ENDSEC') {
      inEntities = false;
      i++;
    } else if (inEntities && code === '0' && val === 'LWPOLYLINE') {
      const res = _parseLWPolyline(pairs, i + 1);
      i = res.nextIdx;
      _addPoly(res.layer, res.ring);
    } else if (inEntities && code === '0' && val === 'HATCH') {
      const res = _parseHatch(pairs, i + 1);
      i = res.nextIdx;
      for (const { layer, ring, colorIdx, trueColor, handle } of res.rings) {
        _addHatch(layer, ring, colorIdx, trueColor, handle);
      }
    } else {
      i++;
    }
  }

  const colors = {};
  // HATCH끼리 겹치는 영역은 "실제로 위에 그려진" 색상에만 남긴다 — 단, 추측은 하지 않는다.
  // 면적도 핸들(생성순서)도 실제 화면 표시 순서를 보장하지 않는다는 걸 실제 도면들로
  // 직접 확인했다 — 두 개만 겹칠 때도 배경이 건물 크기만큼 잘게 쪼개진 도면에서는
  // "작은 게 위" 추측이 틀릴 수 있어서, 추측은 완전히 쓰지 않기로 했다.
  // 신뢰할 수 있는 건 SORTENTSTABLE(도면 순서 테이블) 하나뿐이다 — 캐드가 사용자의
  // "표시순서" 조작을 실제로 기록한 값이기 때문. 그게 없는, 색이 서로 다른 두 해치가
  // 겹치는 경우는 "어느 게 위인지 알 수 없는 겹침"으로 따로 모아서(ambiguousOverlaps)
  // 호출자가 사용자에게 확인을 요구할 수 있게 한다. (미리보기용 순서는 어쩔 수 없이
  // 파일 순서를 쓰지만, 그건 정답이라고 주장하는 게 아니라 그릴 순서가 필요해서일 뿐이다.)
  const sortKeyByHandle = _parseSortEntsTable(pairs);
  function _hasSortKey(e) { return e.handle != null && sortKeyByHandle[e.handle] !== undefined; }
  function _compareHatchOrder(a, b) {
    const aKey = _hasSortKey(a) ? sortKeyByHandle[a.handle] : undefined;
    const bKey = _hasSortKey(b) ? sortKeyByHandle[b.handle] : undefined;
    if (aKey !== undefined && bKey !== undefined) return aKey - bKey;
    if (aKey !== undefined || bKey !== undefined) return aKey !== undefined ? 1 : -1;
    return a.idx - b.idx; // 둘 다 없으면 파일 순서(미리보기용일 뿐, 정답 주장 아님)
  }
  const sortedByDrawOrder = hatchDrawOrder
    .map((e, idx) => ({ ...e, idx }))
    .sort(_compareHatchOrder);
  const visibleSorted = resolveVisibleRings(sortedByDrawOrder.map(e => e.ring));
  const visibleHatchRings = new Array(hatchDrawOrder.length);
  sortedByDrawOrder.forEach((e, sortedIdx) => { visibleHatchRings[e.idx] = visibleSorted[sortedIdx]; });
  hatchDrawOrder.forEach((entity, idx) => {
    const visParts = visibleHatchRings[idx];
    if (!visParts.length) return;
    if (!colors[entity.hex]) colors[entity.hex] = [];
    colors[entity.hex].push(...visParts);
  });

  // 어느 게 위인지 알 수 없는(SORTENTSTABLE에 둘 다 없는) 서로 다른 색 해치끼리의
  // 실제 겹침을 전부 모은다 — 같은 색끼리 겹치는 건 어느 게 위든 결과가 같아 무관하다.
  const ambiguousOverlaps = [];
  const indexed = hatchDrawOrder.map((e, idx) => ({ ...e, idx }));
  for (let a = 0; a < indexed.length; a++) {
    if (_hasSortKey(indexed[a])) continue;
    for (let b = a + 1; b < indexed.length; b++) {
      if (indexed[a].hex === indexed[b].hex) continue;
      if (_hasSortKey(indexed[b])) continue;
      const interRaw = _runClipping(polygonClipping.intersection, [_ringGeom(indexed[a].ring), _ringGeom(indexed[b].ring)]);
      if (!interRaw) continue;
      const inter = cleanMultiPoly(interRaw);
      inter.forEach(poly => {
        const area = shoelace(poly[0]);
        if (area > 0.01) ambiguousOverlaps.push({ polys: [poly], area });
      });
    }
  }

  return { layers, colors, ambiguousOverlaps };
}

/** LWPOLYLINE 한 개 파싱 */
function _parseLWPolyline(pairs, startIdx) {
  let layer = '0';
  let flags = 0;
  let vertices = [];
  let bulges = []; // bulges[i] = vertices[i]→vertices[i+1] 구간의 불지값
  let curX  = null;
  let colorIdx = null, trueColor = null;
  let i = startIdx;

  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') break;          // 다음 엔티티
    if (code === '8')  layer = val;
    else if (code === '62') colorIdx = parseInt(val, 10) || 0;
    else if (code === '420') trueColor = val;
    else if (code === '70') flags = parseInt(val) || 0;
    else if (code === '10') curX  = parseFloat(val);
    else if (code === '20' && curX !== null) {
      vertices.push([curX, parseFloat(val)]);
      bulges.push(0);
      curX = null;
    }
    else if (code === '42' && bulges.length) bulges[bulges.length - 1] = parseFloat(val) || 0;
    i++;
  }

  // 닫힌 폴리라인: 첫 점 복사로 링 닫기 (마지막 점의 불지값이 이 닫는 구간에 그대로 적용됨)
  if ((flags & 1) && vertices.length > 0) {
    const [fx, fy] = vertices[0];
    const [lx, ly] = vertices[vertices.length - 1];
    if (fx !== lx || fy !== ly) vertices.push([fx, fy]);
  }
  const ring = _applyBulges(vertices, bulges);

  return { layer, ring, colorIdx, trueColor, nextIdx: i };
}

/** HATCH 한 개 파싱 → 경계 폴리라인 추출 */
function _parseHatch(pairs, startIdx) {
  let layer  = '0';
  let colorIdx = null, trueColor = null;
  let handle = null;
  let isSolid = false; // 70(솔리드 채우기 여부) — 패턴 해치(질감용 등)는 토지이용 분석에서 제외
  let rings  = [];
  let i = startIdx;
  // 한 HATCH 엔티티 안의 여러 경계 경로(path)는 독립된 도형이 아니라, 짝수/홀수(evenodd)
  // 규칙으로 겹쳐서 "구멍"까지 같이 표현하는 경우가 흔하다(예: 배경 해치 안에 건물 모양으로
  // 구멍을 뚫어둔 도면). 경로별로 바로 rings에 넣지 않고 일단 raw 형태로 모아뒀다가, 경로를
  // 전부 다 읽은 뒤에 한꺼번에 evenodd로 합쳐서 실제 채워진 모양(구멍 포함)을 구한다.
  const rawRings = [];
  function _finalizeRings() {
    if (rawRings.length === 1) {
      if (isSolid && rawRings[0].length >= 3) rings.push({ layer, ring: rawRings[0], colorIdx, trueColor, handle });
    } else if (rawRings.length > 1) {
      const xorRaw = _runClipping(polygonClipping.xor, rawRings.map(r => [r]));
      const merged = xorRaw ? cleanMultiPoly(xorRaw) : null;
      if (merged) {
        merged.forEach(poly => {
          const ring = poly.length > 1 ? mergePolygonHoles(poly) : poly[0];
          if (isSolid && ring && ring.length >= 3) rings.push({ layer, ring, colorIdx, trueColor, handle });
        });
      } else {
        // evenodd 합치기에 실패하면(비정상 도형 등) 안전망으로 기존처럼 각각 독립적으로 처리
        rawRings.forEach(r => { if (isSolid && r.length >= 3) rings.push({ layer, ring: r, colorIdx, trueColor, handle }); });
      }
    }
    return rings;
  }

  // 레이어명·색상·핸들·솔리드 여부 수집 (AcDbEntity 섹션, 91번이 나오기 전까지)
  let pathCount = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
    if (code === '5') handle = val;
    else if (code === '8') layer = val;
    else if (code === '62') colorIdx = parseInt(val, 10) || 0;
    else if (code === '420') trueColor = val;
    else if (code === '70') isSolid = (val === '1');
    else if (code === '91') { pathCount = parseInt(val) || 0; i++; break; }
    i++;
  }

  for (let p = 0; p < pathCount; p++) {
    // 경계 경로 타입 (92번)
    let pathType = 0;
    while (i < pairs.length) {
      const [code, val] = pairs[i];
      if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
      if (code === '92') { pathType = parseInt(val) || 0; i++; break; }
      i++;
    }

    const isPolyline = !!(pathType & 2);

    if (isPolyline) {
      // 폴리라인 경계
      let hasBulge = 0, isClosed = 0, vertCount = 0;
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
        if (code === '72') { hasBulge = parseInt(val); i++; break; }
        i++;
      }
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
        if (code === '73') { isClosed = parseInt(val); i++; break; }
        i++;
      }
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
        if (code === '93') { vertCount = parseInt(val) || 0; i++; break; }
        i++;
      }
      const vertices = [];
      const bulges = [];
      let curX = null;
      let vRead = 0;
      while (i < pairs.length && vRead < vertCount) {
        const [code, val] = pairs[i];
        if (code === '0') break;
        if (code === '10') curX = parseFloat(val);
        else if (code === '20' && curX !== null) {
          vertices.push([curX, parseFloat(val)]);
          bulges.push(0);
          curX = null; vRead++;
        } else if (code === '42' && bulges.length) bulges[bulges.length - 1] = parseFloat(val) || 0;
        i++;
      }
      // isClosed(73) 플래그가 0으로 찍혀 있어도, 해치 경계 폴리라인은 정의상 항상
      // 닫힌 루프여야 한다(안 닫히면 채울 영역 자체가 없다) — 플래그를 믿지 말고
      // 첫/끝 점이 다르면 항상 닫아준다(엣지 경계 쪽과 동일한 이유).
      if (vertices.length > 0) {
        const [fx, fy] = vertices[0];
        const [lx, ly] = vertices[vertices.length - 1];
        if (fx !== lx || fy !== ly) vertices.push([fx, fy]);
      }
      const ring = _applyBulges(vertices, bulges);
      if (ring.length >= 3) rawRings.push(ring);
    } else {
      // 엣지 경계 – 엣지 개수(93)만큼 정확히 읽는다. 라인/원호는 정확히 처리하고,
      // 타원호·스플라인처럼 흔치 않은 엣지는 모양은 부정확할 수 있어도 각 엣지의
      // 끝(다음 72 또는 97/0)까지만 정확히 건너뛰어 — 다음 경계 경로의 데이터를
      // 같은 ring에 잘못 이어붙이는 일이 없게 한다(예전 버전의 버그).
      let edgeCount = 0;
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
        if (code === '93') { edgeCount = parseInt(val) || 0; i++; break; }
        i++;
      }
      const ring = [];
      for (let e = 0; e < edgeCount; e++) {
        if (i >= pairs.length || pairs[i][0] !== '72') break;
        const edgeType = parseInt(pairs[i][1], 10) || 1;
        i++; // 72 소비

        if (edgeType === 1) {
          // 직선: 10/20=시작점만 모은다 — 연속된 엣지의 시작점들이 이미 폐다각형을 이룬다.
          let sx = null, sy = null;
          while (i < pairs.length && pairs[i][0] !== '72' && pairs[i][0] !== '97' && pairs[i][0] !== '0') {
            const [code, val] = pairs[i];
            if (code === '10') sx = parseFloat(val);
            else if (code === '20') sy = parseFloat(val);
            i++;
          }
          if (sx !== null && sy !== null) ring.push([sx, sy]);
        } else if (edgeType === 2) {
          // 원호: 10/20=중심, 40=반지름, 50/51=시작/끝각(도), 73=반시계 여부
          let cx = 0, cy = 0, radius = 0, startDeg = 0, endDeg = 0, ccw = true;
          while (i < pairs.length && pairs[i][0] !== '72' && pairs[i][0] !== '97' && pairs[i][0] !== '0') {
            const [code, val] = pairs[i];
            if (code === '10') cx = parseFloat(val);
            else if (code === '20') cy = parseFloat(val);
            else if (code === '40') radius = parseFloat(val);
            else if (code === '50') startDeg = parseFloat(val);
            else if (code === '51') endDeg = parseFloat(val);
            else if (code === '73') ccw = val === '1';
            i++;
          }
          ring.push(..._arcEdgePoints(cx, cy, radius, startDeg, endDeg, ccw));
        } else if (edgeType === 3) {
          // 타원호: 10/20=중심, 11/21=장축 끝점(중심 기준 상대좌표), 40=단축/장축 비율,
          // 50/51=시작/끝각(도), 73=반시계 여부
          let cx = 0, cy = 0, majDx = 0, majDy = 0, ratio = 1, startDeg = 0, endDeg = 0, ccw = true;
          while (i < pairs.length && pairs[i][0] !== '72' && pairs[i][0] !== '97' && pairs[i][0] !== '0') {
            const [code, val] = pairs[i];
            if (code === '10') cx = parseFloat(val);
            else if (code === '20') cy = parseFloat(val);
            else if (code === '11') majDx = parseFloat(val);
            else if (code === '21') majDy = parseFloat(val);
            else if (code === '40') ratio = parseFloat(val);
            else if (code === '50') startDeg = parseFloat(val);
            else if (code === '51') endDeg = parseFloat(val);
            else if (code === '73') ccw = val === '1';
            i++;
          }
          ring.push(..._ellipticArcEdgePoints(cx, cy, majDx, majDy, ratio, startDeg, endDeg, ccw));
        } else if (edgeType === 4) {
          // 스플라인: 94(차수)/73(유리)/74(주기)/95(노트개수)/96(제어점개수) 헤더 뒤에
          // 40(노트값)들, 10/20(+유리스플라인이면 42=가중치)로 된 제어점들, 그 뒤에
          // 97(피팅점개수)+11/21(피팅점)이 순서대로 온다. 이 97은 경로 전체가 끝난 뒤
          // 나오는 "소스 경계 오브젝트 개수" 97(아래 545번째 줄 부근)과 그룹코드가 같지만,
          // 제어점 데이터 바로 뒤에 있는 97은 거의 항상 이 스플라인 자신의 피팅점개수다
          // (경로 단위 97은 보통 associative 해치에만, 그것도 이 자리보다 뒤에 나온다) —
          // 그 값만큼 11/21을 그대로 읽어 소모하면 동기화가 깨지지 않는다.
          while (i < pairs.length && ['94', '73', '74', '95', '96'].includes(pairs[i][0])) i++;
          while (i < pairs.length && pairs[i][0] === '40') i++; // 노트값 스킵
          const controlPts = [];
          let scx = null;
          while (i < pairs.length) {
            const [code, val] = pairs[i];
            if (code === '10') { scx = parseFloat(val); i++; }
            else if (code === '20' && scx !== null) { controlPts.push([scx, parseFloat(val)]); scx = null; i++; }
            else if (code === '42') { i++; } // 가중치, 사용 안 함
            else break;
          }
          const fitPts = [];
          if (i < pairs.length && pairs[i][0] === '97') {
            let numFit = parseInt(pairs[i][1], 10) || 0;
            i++;
            let fcx = null;
            while (i < pairs.length && numFit > 0) {
              const [code, val] = pairs[i];
              if (code === '11') { fcx = parseFloat(val); i++; }
              else if (code === '21' && fcx !== null) { fitPts.push([fcx, parseFloat(val)]); fcx = null; numFit--; i++; }
              else break; // 예상과 다른 코드가 나오면 더 진행하지 않고 안전하게 멈춘다
            }
          }
          // 접선(12/22, 13/23) 등 남은 선택 필드는 다음 엣지(72)/경로 종료(97/0) 앞까지 건너뛴다
          while (i < pairs.length && pairs[i][0] !== '72' && pairs[i][0] !== '97' && pairs[i][0] !== '0') i++;
          ring.push(..._splineEdgePoints(fitPts, controlPts));
        } else {
          // 정말 알 수 없는 엣지 타입 — 다음 엣지 시작 전까지만 건너뛰어 동기화를 유지한다.
          while (i < pairs.length && pairs[i][0] !== '72' && pairs[i][0] !== '97' && pairs[i][0] !== '0') i++;
        }
      }
      // 엣지 경계는 각 엣지의 시작점만 모아서 마지막 점이 첫 점과 같지 않다(직선/원호 등
      // "연속된 엣지의 시작점들이 이미 폐다각형을 이룬다"는 가정은 맞지만, 배열 자체는
      // 닫혀있지 않다). shoelace()는 첫 점=마지막 점인 닫힌 링을 전제로 하므로, 여기서
      // 명시적으로 첫 점을 끝에 복제해 닫아준다 — 안 닫으면 도형 위치에 따라 면적이
      // 실제보다 크거나 작게 계산된다(원점에서 먼 도형일수록 오차가 커짐).
      if (ring.length > 0) {
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) ring.push([fx, fy]);
      }
      if (ring.length >= 3) rawRings.push(ring);
    }

    // 소스 경계 오브젝트 스킵 (97)
    while (i < pairs.length) {
      const [code, val] = pairs[i];
      if (code === '0') return { rings: _finalizeRings(), nextIdx: i };
      if (code === '97') {
        // 97(소스 경계 오브젝트 개수) 다음에는 그 개수만큼 330(핸들) 쌍이 온다.
        // pairs 배열은 그룹코드-값 한 쌍이 이미 한 칸이므로, 97 자신(+1)과
        // 330 칸 수(cnt)만 더하면 된다 — *2를 하면 다음 경로(92)를 건너뛰어
        // 그 뒤 경로들이 통째로 깨진다(여러 경계 영역이 있는 HATCH에서 발생).
        const cnt = parseInt(val) || 0;
        i += 1 + cnt;
        break;
      }
      if (code === '91' || code === '92') break; // 다음 경로
      i++;
    }
  }

  // HATCH 엔티티 끝까지 스킵
  while (i < pairs.length) {
    const [code] = pairs[i];
    if (code === '0') break;
    i++;
  }

  return { rings: _finalizeRings(), nextIdx: i };
}

// ── 유틸 함수 (analyzer.js에서 호출) ──────────────────────────

/** 둘레 레이어 이름 반환 */
function detectBorderLayer(data) {
  for (const name of BORDER_NAMES) {
    if (data.layers[name] && data.layers[name].length > 0) return name;
  }
  // 대소문자 무시 검색
  const upper = BORDER_NAMES.map(n => n.toUpperCase());
  for (const key of Object.keys(data.layers)) {
    if (upper.includes(key.toUpperCase()) && data.layers[key].length > 0) return key;
  }
  return null;
}

/** 정합 기준 레이어 감지 */
function detectAlignLayer(data) {
  const layer = detectBorderLayer(data);
  return layer ? { layer, type: 'border' } : { layer: null, type: 'bbox' };
}

/** 토지이용 레이어 목록 (둘레·제외 레이어 빼고) */
function getLandUseLayers(data, exclude) {
  return Object.keys(data.layers).filter(
    l => !exclude.includes(l) && data.layers[l] && data.layers[l].length > 0
  );
}

/** 지정 레이어의 바운딩박스 */
function getBorderBBox(data, layerName) {
  if (!layerName || !data.layers[layerName]) {
    return getDataBBox(data, Object.keys(data.layers));
  }
  return getDataBBox(data, [layerName]);
}

// ── 색상 범례 (레이어 대신 색상으로 용도를 구분) ──────────────────

/** 도면에서 실제로 쓰인 색상 목록 (도형이 많은 색 순) */
function getDistinctColors(parsedData) {
  return Object.keys(parsedData.colors || {})
    .filter(hex => parsedData.colors[hex].length > 0)
    .sort((a, b) => parsedData.colors[b].length - parsedData.colors[a].length);
}

/**
 * 사용자가 입력한 색상→용도명 매핑을 적용해 기존 analyzer.js가 기대하는
 * { layers: { [용도명]: ring[][] } } 모양으로 변환한다.
 * legendRows: [{ colorKey, label }]
 */
function applyColorLegend(parsedData, legendRows) {
  const layers = {};
  (legendRows || []).forEach(row => {
    const rings = (parsedData.colors || {})[row.colorKey] || [];
    const key = String(row.label || '').trim();
    if (!rings.length || !key) return;
    if (!layers[key]) layers[key] = [];
    layers[key].push(...rings);
  });
  return { layers };
}
