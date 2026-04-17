/**
 * parser.js
 * DXF 파싱 (LWPOLYLINE / HATCH → 레이어별 폴리곤)
 */

const BORDER_NAMES = ['둘레', 'BORDER', 'FRAME', 'OUTLINE', '도면한도리'];

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

  const layers = {};
  let inEntities = false;
  let i = 0;

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
      if (res.ring.length >= 3) {
        if (!layers[res.layer]) layers[res.layer] = [];
        layers[res.layer].push(res.ring);
      }
    } else if (inEntities && code === '0' && val === 'HATCH') {
      const res = _parseHatch(pairs, i + 1);
      i = res.nextIdx;
      for (const { layer, ring } of res.rings) {
        if (ring.length >= 3) {
          if (!layers[layer]) layers[layer] = [];
          layers[layer].push(ring);
        }
      }
    } else {
      i++;
    }
  }

  return { layers };
}

/** LWPOLYLINE 한 개 파싱 */
function _parseLWPolyline(pairs, startIdx) {
  let layer = '0';
  let flags = 0;
  let ring  = [];
  let curX  = null;
  let i = startIdx;

  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') break;          // 다음 엔티티
    if (code === '8')  layer = val;
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

  return { layer, ring, nextIdx: i };
}

/** HATCH 한 개 파싱 → 경계 폴리라인 추출 */
function _parseHatch(pairs, startIdx) {
  let layer  = '0';
  let rings  = [];
  let i = startIdx;

  // 레이어명 먼저 수집 (AcDbEntity 섹션)
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') break;
    if (code === '8') { layer = val; break; }
    i++;
  }

  // 경계 경로 개수 (91번)
  let pathCount = 0;
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === '0') { return { rings, nextIdx: i }; }
    if (code === '91') { pathCount = parseInt(val) || 0; i++; break; }
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
      if (ring.length >= 3) rings.push({ layer, ring });
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
      if (ring.length >= 3) rings.push({ layer, ring });
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
