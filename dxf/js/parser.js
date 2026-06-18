/**
 * parser.js
 * DXF 파싱 (LWPOLYLINE / HATCH → 레이어별 폴리곤 + 색상별 폴리곤)
 */

const BORDER_NAMES = ['둘레', 'BORDER', 'FRAME', 'OUTLINE', '도면한도리'];

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
  function _addHatch(layer, ring, colorIdx, trueColor) {
    if (ring.length < 3) return;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(ring);
    hatchDrawOrder.push({ ring, hex: _resolveColorHex(colorIdx, trueColor, layer, layerDefaultAci) });
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
      for (const { layer, ring, colorIdx, trueColor } of res.rings) {
        _addHatch(layer, ring, colorIdx, trueColor);
      }
    } else {
      i++;
    }
  }

  const colors = {};
  // HATCH끼리 겹치는 영역은 맨 위(나중에 그려진) 색상에만 남긴다
  const visibleHatchRings = resolveVisibleRings(hatchDrawOrder.map(e => e.ring));
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
  let ring  = [];
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
      ring.push([curX, parseFloat(val)]);
      curX = null;
    }
    i++;
  }

  // 닫힌 폴리라인: 첫 점 복사로 링 닫기
  if ((flags & 1) && ring.length > 0) {
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  }

  return { layer, ring, colorIdx, trueColor, nextIdx: i };
}

/** HATCH 한 개 파싱 → 경계 폴리라인 추출 */
function _parseHatch(pairs, startIdx) {
  let layer  = '0';
  let colorIdx = null, trueColor = null;
  let rings  = [];
  let i = startIdx;

  // 레이어명·색상 수집 (AcDbEntity 섹션, 91번이 나오기 전까지)
  let pathCount = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') return { rings, nextIdx: i };
    if (code === '8') layer = val;
    else if (code === '62') colorIdx = parseInt(val, 10) || 0;
    else if (code === '420') trueColor = val;
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
      const ring = [];
      let curX = null;
      let vRead = 0;
      while (i < pairs.length && vRead < vertCount) {
        const [code, val] = pairs[i];
        if (code === '0') break;
        if (code === '10') curX = parseFloat(val);
        else if (code === '20' && curX !== null) {
          ring.push([curX, parseFloat(val)]);
          curX = null; vRead++;
        } else if (code === '42') { /* bulge – 무시 */ }
        i++;
      }
      if (isClosed && ring.length > 0) {
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) ring.push([fx, fy]);
      }
      if (ring.length >= 3) rings.push({ layer, ring, colorIdx, trueColor });
    } else {
      // 엣지 경계 – 엣지 개수(93) 만큼 스킵
      let edgeCount = 0;
      while (i < pairs.length) {
        const [code, val] = pairs[i];
        if (code === '0') return { rings, nextIdx: i };
        if (code === '93') { edgeCount = parseInt(val) || 0; i++; break; }
        i++;
      }
      // 엣지 데이터 스킵 (단순 라인만 간단 수집)
      const ring = [];
      let curX = null;
      let skip = 0;
      while (i < pairs.length && skip < edgeCount * 20) {
        const [code, val] = pairs[i];
        if (code === '0') break;
        if (code === '72' && skip > 0) skip++; // 엣지 경계 시작 시그널
        if (code === '10') curX = parseFloat(val);
        else if (code === '20' && curX !== null) {
          ring.push([curX, parseFloat(val)]);
          curX = null;
        }
        i++; skip++;
      }
      if (ring.length >= 3) rings.push({ layer, ring, colorIdx, trueColor });
    }

    // 소스 경계 오브젝트 스킵 (97)
    while (i < pairs.length) {
      const [code, val] = pairs[i];
      if (code === '0') return { rings, nextIdx: i };
      if (code === '97') {
        const cnt = parseInt(val) || 0;
        i += 1 + cnt * 2;
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
