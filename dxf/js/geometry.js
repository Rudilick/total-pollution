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
    const inter = polygonClipping.intersection(a, b);
    return { area: multiPolyArea(inter), polys: inter || [] };
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
    const diff = polygonClipping.difference(b, a);
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
    (data.layers[l] || []).forEach(ring =>
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      })
    )
  );
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
