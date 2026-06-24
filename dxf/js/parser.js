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
  const n = Math.max(2, segments || 12);
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
  if (ccw) {
    while (endRad <= startRad) endRad += Math.PI * 2;
  } else {
    while (endRad >= startRad) endRad -= Math.PI * 2;
  }
  const n = Math.max(2, segments || 24);
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = startRad + (endRad - startRad) * (k / n);
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)]);
  }
  return pts;
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
 * DXF 텍스트 → { layers: { [layerName]: ring[][] } }
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
  // HATCH끼리 겹치는 영역은 "실제로 위에 그려진" 색상에만 남긴다.
  // ① 사용자가 SORTENTSTABLE(도면 순서 테이블)에 직접 순서를 지정해둔 엔티티끼리는
  //    그 지정 순서가 절대 기준이다 — 방금 일부를 "맨 위로 가져오기" 등으로 의도적으로
  //    조정한 경우라서 가장 신뢰할 수 있다.
  // ② 테이블에 없는 엔티티의 핸들(생성 순서)은 화면 표시 순서와 무관할 수 있다 — 예를 들어
  //    "전체 부지" 같은 배경용 큰 해치를 나중에 다시 그려도 화면에서는 여전히 배경으로 깔려야
  //    하는 경우가 흔하다. 그래서 테이블에 없는 엔티티끼리는 "면적이 작은 쪽(=배경이 아니라
  //    특정 용도로 좁게 쓰인 색)이 위" 휴리스틱을 쓴다.
  // ③ 한쪽만 테이블에 있으면, 사용자가 막 손댄 그 엔티티가 우선한다(테이블에 있는 쪽이 위).
  const AREA_TIE_TOLERANCE = 0.01;
  const totalAreaByHex = {};
  hatchDrawOrder.forEach(e => { totalAreaByHex[e.hex] = (totalAreaByHex[e.hex] || 0) + shoelace(e.ring); });
  const sortKeyByHandle = _parseSortEntsTable(pairs);
  function _compareHatchOrder(a, b) {
    const aKey = a.handle != null ? sortKeyByHandle[a.handle] : undefined;
    const bKey = b.handle != null ? sortKeyByHandle[b.handle] : undefined;
    if (aKey !== undefined && bKey !== undefined) return aKey - bKey;
    if (aKey !== undefined || bKey !== undefined) return aKey !== undefined ? 1 : -1;
    const maxArea = Math.max(a.area, b.area) || 1;
    if (Math.abs(a.area - b.area) / maxArea < AREA_TIE_TOLERANCE) {
      return totalAreaByHex[b.hex] - totalAreaByHex[a.hex]; // 도면 전체 총면적이 작은 색이 나중(=위)
    }
    return b.area - a.area; // 면적 작은 쪽이 나중(=위)
  }
  const sortedByDrawOrder = hatchDrawOrder
    .map((e, idx) => ({ ...e, idx, area: shoelace(e.ring) }))
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

  return { layers, colors };
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

  // 레이어명·색상·핸들·솔리드 여부 수집 (AcDbEntity 섹션, 91번이 나오기 전까지)
  let pathCount = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') return { rings, nextIdx: i };
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
      if (code === '0') return { rings, nextIdx: i };
      if (code === '92') { pathType = parseInt(val) || 0; i++; break; }
      i++;
    }

    const isPolyline = !!(pathType & 2);

    if (isPolyline) {
      // 폴리라인 경계
      let hasBulge = 0, isClosed = 0, vertCount = 0;
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings, nextIdx: i };
        if (code === '72') { hasBulge = parseInt(val); i++; break; }
        i++;
      }
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings, nextIdx: i };
        if (code === '73') { isClosed = parseInt(val); i++; break; }
        i++;
      }
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings, nextIdx: i };
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
      if (isClosed && vertices.length > 0) {
        const [fx, fy] = vertices[0];
        const [lx, ly] = vertices[vertices.length - 1];
        if (fx !== lx || fy !== ly) vertices.push([fx, fy]);
      }
      const ring = _applyBulges(vertices, bulges);
      if (isSolid && ring.length >= 3) rings.push({ layer, ring, colorIdx, trueColor, handle });
    } else {
      // 엣지 경계 – 엣지 개수(93)만큼 정확히 읽는다. 라인/원호는 정확히 처리하고,
      // 타원호·스플라인처럼 흔치 않은 엣지는 모양은 부정확할 수 있어도 각 엣지의
      // 끝(다음 72 또는 97/0)까지만 정확히 건너뛰어 — 다음 경계 경로의 데이터를
      // 같은 ring에 잘못 이어붙이는 일이 없게 한다(예전 버전의 버그).
      let edgeCount = 0;
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings, nextIdx: i };
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
        } else {
          // 타원호/스플라인 등 — 다음 엣지 시작 전까지만 건너뛰어 동기화를 유지한다.
          while (i < pairs.length && pairs[i][0] !== '72' && pairs[i][0] !== '97' && pairs[i][0] !== '0') i++;
        }
      }
      if (isSolid && ring.length >= 3) rings.push({ layer, ring, colorIdx, trueColor, handle });
    }

    // 소스 경계 오브젝트 스킵 (97)
    while (i < pairs.length) {
      const [code, val] = pairs[i];
      if (code === '0') return { rings, nextIdx: i };
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

  return { rings, nextIdx: i };
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
