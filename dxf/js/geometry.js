/**
 * geometry.js
 * 좌표 변환, 면적 계산, 폴리곤 불리언 연산 유틸리티
 */

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
  return ring.map(([x, y]) => [x * t.scale + t.tx, y * t.scale + t.ty]);
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
 * MultiPolygon 면적 합산 (polygon-clipping 결과 형식)
 * @param {Array} multiPoly
 * @returns {number}
 */
function multiPolyArea(multiPoly) {
  if (!multiPoly || !multiPoly.length) return 0;
  return multiPoly.reduce((s, poly) =>
    s + poly.reduce((ss, ring) => ss + shoelace(ring), 0), 0
  );
}

/**
 * 링 배열 → MultiPolygon 유니온
 * @param {Array[]} rings
 * @returns {Array} MultiPolygon
 */
function unionRings(rings) {
  if (!rings || rings.length === 0) return [];
  try {
    const mp = rings.map(r => [r]);
    if (mp.length === 1) return mp;
    return polygonClipping.union(...mp) || mp;
  } catch (e) {
    return rings.map(r => [r]);
  }
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
const MIN_SLIVER_AREA  = 0.01; // ㎡ — 이보다 작은 결과 폴리곤은 부동소수점 잔여물로 간주해 제거
const MIN_SLIVER_WIDTH = 0.05; // m  — 평균 폭(면적/둘레*2)이 이보다 얇으면 스파이크로 간주해 제거

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
  try {
    const a = polygonClipping.union(...ringsA.map(r => [r]));
    const b = polygonClipping.union(...ringsB.map(r => [r]));
    const inter = cleanMultiPoly(polygonClipping.intersection(a, b));
    return { area: multiPolyArea(inter), polys: inter };
  } catch (e) {
    return { area: 0, polys: [] };
  }
}

/**
 * B에만 있고 A에는 없는 영역 (사업부지 증가 계산용)
 * @param {Array[]} ringsA - 변경 전 전체 폴리곤
 * @param {Array[]} ringsB - 변경 후 전체 폴리곤
 * @returns {number} 면적
 */
function newAreaOnly(ringsA, ringsB) {
  if (!ringsB.length) return 0;
  if (!ringsA.length) return polyAreaSum(ringsB);
  try {
    const a = polygonClipping.union(...ringsA.map(r => [r]));
    const b = polygonClipping.union(...ringsB.map(r => [r]));
    const diff = cleanMultiPoly(polygonClipping.difference(b, a));
    return multiPolyArea(diff);
  } catch (e) {
    return 0;
  }
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
