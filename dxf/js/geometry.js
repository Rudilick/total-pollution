/**
 * geometry.js
 * 좌표 변환, 면적 계산, 폴리곤 불리언 연산 유틸리티
 */

/**
 * 연속 3점이 거의 일직선이면 중간점을 제거하고(Douglas-Peucker류), 좌표를 mm 단위로
 * 반올림한다 — polygon-clipping이 점이 많고 색상·조각이 많은 실제 도면을 한꺼번에
 * 합치려 할 때 내부에서 무한 재귀(스택 오버플로우)나 "Unable to find segment in
 * SweepLine tree" 에러로 죽는 문제를 막기 위함. 점이 많고 좌표가 미세하게만 달라도
 * 라이브러리의 스위프라인 알고리즘이 불안정해짐을 실측으로 확인했다 — 단순화·반올림
 * 정도(eps=1mm, 소수점 4자리)는 면적에 거의 영향이 없다(실측 오차 0.01㎥ 이하).
 */
function _simplifyRing(ring, eps = 0.001, precision = 4) {
  const round = p => [Number(p[0].toFixed(precision)), Number(p[1].toFixed(precision))];
  if (ring.length <= 3) return ring.map(round);
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const a = out[out.length - 1], b = ring[i], c = ring[i + 1];
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    const base = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const dist = base > 0 ? area2 / base : 0;
    if (dist > eps) out.push(b);
  }
  out.push(ring[ring.length - 1]);
  return out.map(round);
}

/**
 * 링을 polygon-clipping에 넘길 geom(폴리곤) 형태로 바꾼다.
 * 구멍이 합쳐진 링(mergePolygonHoles로 만든 키홀 링)을 [ring] 하나로만 넘기면
 * polygon-clipping이 구멍을 그냥 채워진 영역으로 오인해서, 그 구멍 안에 다른
 * 도형이 있어도 "겹친다"고 잘못 판정한다 — __origPoly(원래 [외곽, 구멍...] 형태)가
 * 있으면 그걸 그대로 써야 구멍이 제대로 빈 공간으로 처리된다.
 */
function _ringGeom(ring) { return ring.__origPoly || [ring]; }

/** 폴리곤(Ring[] = [외곽, 구멍...]) 하나의 모든 링을 단순화한다 */
function _simplifyPolygon(poly) { return poly.map(ring => _simplifyRing(ring)); }

/**
 * polygon-clipping에 넘기는 인자는 Polygon(Ring[], 3단 깊이)이거나 그 함수 자신의 결과인
 * MultiPolygon(Polygon[], 4단 깊이)일 수 있다 — 점 좌표가 몇 단 깊이에 있는지로 구분해서
 * 알맞게 단순화한다.
 */
function _simplifyClippingArg(g) {
  if (!g?.length || !g[0]?.length) return g;
  const isMultiPoly = Array.isArray(g[0][0]?.[0]);
  return isMultiPoly ? g.map(_simplifyPolygon) : _simplifyPolygon(g);
}

/**
 * polygon-clipping 호출(union/difference/xor 등)을 우선 원본 좌표 그대로 시도하고,
 * 실패하면(점이 많고 색·조각이 많은 실제 도면에서 라이브러리가 무한 재귀나 "Unable to
 * find segment" 에러로 죽는 경우) 좌표를 살짝 단순화해서 한 번 더 시도한다.
 * 평소(원본 그대로 성공하는 대다수 케이스)엔 결과가 1bit도 안 바뀌고, 정말 죽는
 * 복잡한 케이스에서만 미세한(0.01㎥ 이하) 정밀도를 양보해서 살아남는다.
 * @param {Function} fn - polygonClipping.union/intersection/difference/xor
 * @param {Array} args - 함수에 그대로 펼쳐 넘길 Polygon 또는 MultiPolygon 배열
 */
function _runClipping(fn, args) {
  try { return fn(...args); }
  catch (e) {
    try { return fn(...args.map(_simplifyClippingArg)); }
    catch (e2) { return null; }
  }
}

/**
 * 두 둘레 바운딩박스를 기준으로 A→B 정합 변환 파라미터 계산
 * @param {{ minX, minY, maxX, maxY }|null} bboxA
 * @param {{ minX, minY, maxX, maxY }|null} bboxB
 * @returns {{ scale: number, tx: number, ty: number }}
 */
function computeTransform(bboxA, bboxB) {
  if (!bboxA || !bboxB) return { scale: 1, tx: 0, ty: 0 };
  const sx = (bboxB.maxX - bboxB.minX) / (bboxA.maxX - bboxA.minX) || 1;
  const sy = (bboxB.maxY - bboxB.minY) / (bboxA.maxY - bboxA.minY) || 1;
  const scale = (sx + sy) / 2;
  return {
    scale,
    tx: bboxB.minX - bboxA.minX * scale,
    ty: bboxB.minY - bboxA.minY * scale,
  };
}

/**
 * 단일 링에 변환 적용
 * @param {Array} ring - [[x,y], ...]
 * @param {{ scale, tx, ty }} t
 * @returns {Array}
 */
function applyTransform(ring, t) {
  const out = ring.map(([x, y]) => [x * t.scale + t.tx, y * t.scale + t.ty]);
  // .map()은 새 배열을 만들어서 ring에 붙어있던 부가 프로퍼티가 사라진다 — 같이 옮겨 붙여준다.
  // __origPoly: 구멍 보존용 원본 폴리곤. __arcAreaDelta: 원호 analytic 면적 보정치(면적이므로
  // scale의 제곱만큼 같이 스케일된다).
  if (ring.__origPoly) out.__origPoly = ring.__origPoly.map(sub => applyTransform(sub, t));
  if (ring.__arcAreaDelta) out.__arcAreaDelta = ring.__arcAreaDelta * t.scale * t.scale;
  return out;
}

/**
 * Shoelace 공식으로 단일 링 면적 계산
 * @param {Array} ring
 * @returns {number}
 */
function shoelace(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(s / 2);
}

/**
 * 링 배열 전체 면적 합산
 * @param {Array[]} rings
 * @returns {number}
 */
function polyAreaSum(rings) {
  return rings.reduce((s, r) => s + shoelace(r), 0);
}

/**
 * shoelace + 원호 analytic 면적 보정(ring.__arcAreaDelta, 있으면). parser.js가 붙여준 이
 * 보정치는 폴리곤 클리핑(xor/union/intersection/difference)을 거치지 않은 "원본 그대로의"
 * ring에서만 유효하다 — 클리핑 결과물은 완전히 새 배열이라 애초에 이 프로퍼티가 없다.
 * @param {Array} ring
 * @returns {number}
 */
function exactShoelace(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(s / 2 + (ring.__arcAreaDelta || 0));
}

/**
 * 링 배열 전체 면적 합산 (analytic 보정 적용)
 * @param {Array[]} rings
 * @returns {number}
 */
function exactPolyAreaSum(rings) {
  return rings.reduce((s, r) => s + exactShoelace(r), 0);
}

/**
 * MultiPolygon 면적 합산 (polygon-clipping 결과 형식)
 * @param {Array} multiPoly
 * @returns {number}
 */
function multiPolyArea(multiPoly) {
  if (!multiPoly || !multiPoly.length) return 0;
  // poly[0]은 외곽, poly[1+]는 구멍(polygon-clipping 컨벤션) — shoelace()가 절대값을
  // 돌려주므로 구멍도 그냥 더하면 빼야 할 면적이 더해져 버린다(겹침/증가 계산이 실제보다
  // 훨씬 커지는 버그의 원인이었음). 구멍 링은 빼준다.
  return multiPoly.reduce((s, poly) =>
    s + poly.reduce((ss, ring, idx) => ss + (idx === 0 ? shoelace(ring) : -shoelace(ring)), 0), 0
  );
}

/**
 * 링 배열 → MultiPolygon 유니온
 * @param {Array[]} rings
 * @returns {Array} MultiPolygon
 */
function unionRings(rings) {
  if (!rings || rings.length === 0) return [];
  const mp = rings.map(_ringGeom);
  if (mp.length === 1) return mp;
  return _runClipping(polygonClipping.union, mp) || mp;
}

/**
 * 링의 둘레 길이 계산
 * @param {Array} ring
 * @returns {number}
 */
function _ringPerimeter(ring) {
  let p = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return p;
}

/**
 * polygon-clipping 결과에서 부동소수점 오차로 생긴 미세 슬리버(스파이크) 폴리곤 제거
 * - 면적이 너무 작은 폴리곤뿐 아니라, 길고 가는 "바늘" 모양(둘레 대비 면적이 매우 작은 폴리곤)도 제거
 * @param {Array} multiPoly - polygon-clipping 결과 (MultiPolygon)
 * @param {number} minArea - 이보다 외곽선 면적이 작은 폴리곤은 제거 (㎡)
 * @param {number} minWidth - 평균 폭이 이보다 얇은 폴리곤은 제거 (m)
 * @returns {Array}
 */
// 실제로 가늘고 뾰족하게 그려진 도형(예: 얇은 삼각형 꼭짓점)까지 지워버리면 안 되므로 폭
// 기준은 거의 0으로 두고, 면적 기준만 0.01㎥로 — 곡선(아크) 테셀레이션 차이로 생기는
// 진짜 부동소수점 잡음(0.0001㎥ 이하)은 걸러내되, 사람이 실제로 그린 가장 작은 변화보다는
// 충분히 낮게 잡는다.
const MIN_SLIVER_AREA  = 0.01; // ㎡
const MIN_SLIVER_WIDTH = 1e-4; // m

function cleanMultiPoly(multiPoly, minArea = MIN_SLIVER_AREA, minWidth = MIN_SLIVER_WIDTH) {
  if (!multiPoly) return [];
  return multiPoly.filter(poly => {
    const ring = poly?.[0];
    if (!ring?.length) return false;
    const area = shoelace(ring);
    if (area < minArea) return false;
    const perim = _ringPerimeter(ring);
    return perim === 0 || (area / perim) >= minWidth / 2;
  });
}

/**
 * 두 링 배열의 교집합 면적 (polygon-clipping 사용)
 * @param {Array[]} ringsA
 * @param {Array[]} ringsB
 * @returns {{ area: number, polys: Array }}
 */
function intersectionArea(ringsA, ringsB) {
  if (!ringsA.length || !ringsB.length) return { area: 0, polys: [] };
  const aMp = ringsA.map(_ringGeom), bMp = ringsB.map(_ringGeom);
  const a = _runClipping(polygonClipping.union, aMp) || aMp;
  const b = _runClipping(polygonClipping.union, bMp) || bMp;
  const inter = cleanMultiPoly(_runClipping(polygonClipping.intersection, [a, b]) || []);
  return { area: multiPolyArea(inter), polys: inter };
}

/**
 * B에만 있고 A에는 없는 영역 (사업부지 증가 계산용)
 * @param {Array[]} ringsA - 변경 전 전체 폴리곤
 * @param {Array[]} ringsB - 변경 후 전체 폴리곤
 * @returns {number} 면적
 */
function newAreaOnly(ringsA, ringsB) {
  if (!ringsB.length) return 0;
  if (!ringsA.length) return exactPolyAreaSum(ringsB); // 클리핑 없이 그대로 반환하는 경로라 analytic 보정 유효
  const aMp = ringsA.map(_ringGeom), bMp = ringsB.map(_ringGeom);
  const a = _runClipping(polygonClipping.union, aMp) || aMp;
  const b = _runClipping(polygonClipping.union, bMp) || bMp;
  const diff = cleanMultiPoly(_runClipping(polygonClipping.difference, [b, a]) || []);
  return multiPolyArea(diff);
}

/**
 * 구멍(hole) 하나를 외곽 링에 "키홀(틈새)" 기법으로 합쳐 단일 폐곡선으로 만든다.
 * 외곽 링의 한 점에서 구멍 시작점까지 폭 0인 틈을 내고 구멍을 한 바퀴 돈 뒤 같은 틈으로
 * 돌아오는 식 — 이 프로젝트의 모든 함수가 "구멍 없는 단순 링" 하나만 다루도록 짜여 있어서
 * (면적 합산, 교집합, 미리보기 그리기, 내보내기 등) 구멍이 있는 폴리곤을 새로 지원하는 대신
 * 이 방식으로 항상 단순 링으로 바꿔서 기존 코드를 그대로 쓸 수 있게 한다.
 * @param {Array} outerRing
 * @param {Array} holeRing
 * @returns {Array}
 */
function _keyholeMerge(outerRing, holeRing) {
  const holeStart = holeRing[0];
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < outerRing.length - 1; i++) {
    const dx = outerRing[i][0] - holeStart[0], dy = outerRing[i][1] - holeStart[1];
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return [
    ...outerRing.slice(0, bestIdx + 1),
    ...holeRing,
    ...outerRing.slice(bestIdx),
  ];
}
/** polygon-clipping의 한 Polygon(외곽+구멍들)을 구멍 없는 단일 링 하나로 합친다 */
function mergePolygonHoles(poly) {
  let merged = poly[0];
  for (let h = 1; h < poly.length; h++) merged = _keyholeMerge(merged, poly[h]);
  // 면적 계산용으로는 이 단일 링(키홀로 합친 것)을 쓰지만, 그대로 그림으로 그리면 외곽↔구멍을
  // 잇는 폭 0인 틈새가 직선처럼 보인다. 화면에 그릴 때는 원래의 [외곽, 구멍...] 형태를 써서
  // (export.js의 _drawPoly처럼 서브패스+evenodd로) 그 틈새 선이 안 보이게 할 수 있도록,
  // 원본 polygon을 같이 들고 다닌다.
  if (poly.length > 1) merged.__origPoly = poly;
  return merged;
}

/**
 * 그려진 순서(나중 것이 위) 기준으로, 각 도형에서 다른 도형에 덮이지 않고
 * 실제로 "눈에 보이는" 부분만 남긴다 (페인터 알고리즘을 뒤에서부터 적용).
 * 해치가 서로 겹치는 경우, 겹친 영역은 맨 위에 그려진 도형 쪽에만 남는다.
 * @param {Array[]} ringsInDrawOrder - 그려진 순서대로(인덱스가 클수록 나중 = 위)
 * @returns {Array[][]} 입력과 같은 길이. 각 원본 ring이 가려지지 않고 남은 부분(0~여러 조각)
 */
function resolveVisibleRings(ringsInDrawOrder) {
  const result = ringsInDrawOrder.map(() => []);
  let stack = []; // 지금까지(뒤에서부터) 처리한, 즉 "이보다 위에 있는" 모든 도형의 합집합
  for (let i = ringsInDrawOrder.length - 1; i >= 0; i--) {
    const ring = ringsInDrawOrder[i];
    let visible;
    if (!stack.length) {
      visible = [_ringGeom(ring)];
    } else {
      visible = cleanMultiPoly(_runClipping(polygonClipping.difference, [_ringGeom(ring), stack]) || [_ringGeom(ring)]);
    }
    visible.forEach(poly => {
      if (!poly[0] || poly[0].length < 3) return;
      result[i].push(poly.length > 1 ? mergePolygonHoles(poly) : poly[0]);
    });
    if (!stack.length) {
      stack = [_ringGeom(ring)];
    } else {
      const unioned = _runClipping(polygonClipping.union, [stack, _ringGeom(ring)]);
      stack = unioned ? cleanMultiPoly(unioned) : stack.concat([_ringGeom(ring)]);
    }
  }
  return result;
}

/**
 * 도면 전체 바운딩박스 계산 (썸네일 렌더링용)
 * @param {{ layers: Object }} data
 * @param {string[]} layers
 * @returns {{ minX, minY, maxX, maxY }|null}
 */
function getDataBBox(data, layers) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  layers.forEach(l =>
    (data.layers[l] || []).forEach(ring => {
      // 면적이 0인 퇴화(점/선) 링은 동떨어진 잔재 도형일 수 있으므로 bbox 계산에서 제외
      if (shoelace(ring) < 1e-6) return;
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      });
    })
  );
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
