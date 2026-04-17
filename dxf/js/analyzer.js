/**
 * analyzer.js
 *
 * ① 증가부지: 최초(A) vs 최종(F) → A에 없는 자리에 F에서 생긴 면적
 *    증가율 = 증가면적 / A 전체면적 × 100
 *
 * ② 변경부지: 각 인접 단계(A→B, B→C...) 누적 합산
 *    레이어X → 레이어Y 로 바뀐 교차 면적
 *    각 단계 변경률 = 변경면적 / 해당단계 전 도면 전체면적 × 100 의 누적 합
 *
 * 정합 기준: 지정된 레이어 우선, 없으면 둘레 패딩
 */

function getAlignTransform(_dataA, _dataB) {
  // 같은 프로젝트 도면은 좌표계가 동일 → 변환 없이 그대로 겹침
  return { T: { scale: 1, tx: 0, ty: 0 }, typeA: 'direct', typeB: 'direct' };
}

function calcPairChange(dataA, dataB) {
  const { T, typeA, typeB } = getAlignTransform(dataA, dataB);

  const alignA = detectAlignLayer(dataA);
  const alignB = detectAlignLayer(dataB);
  const excludeA = [alignA.layer, detectBorderLayer(dataA)].filter(Boolean);
  const excludeB = [alignB.layer, detectBorderLayer(dataB)].filter(Boolean);

  const lsA = getLandUseLayers(dataA, excludeA);
  const lsB = getLandUseLayers(dataB, excludeB);
  const allLayers = [...new Set([...lsA, ...lsB])];

  // A 링에 B 좌표계로 변환
  const ringsA = {}, ringsB = {};
  allLayers.forEach(l => {
    ringsA[l] = (dataA.layers[l] || []).map(r => applyTransform(r, T));
    ringsB[l] = (dataB.layers[l] || []);
  });

  const totalRingsA = lsA.flatMap(l => ringsA[l]);
  const totalRingsB = lsB.flatMap(l => ringsB[l]);
  const totalAreaA = polyAreaSum(totalRingsA);
  const totalAreaB = polyAreaSum(totalRingsB);

  // 변경부지: A의 레이어X → B의 레이어Y (X≠Y) 교차 면적
  const changes = [];
  for (const lFrom of lsA) {
    for (const lTo of lsB) {
      if (lFrom === lTo) continue;
      const { area, polys } = intersectionArea(ringsA[lFrom], ringsB[lTo]);
      if (area > 0.1) changes.push({ from: lFrom, to: lTo, area, polys });
    }
  }

  const changeArea = changes.reduce((s, c) => s + c.area, 0);
  const changePct = totalAreaA > 0 ? (changeArea / totalAreaA * 100) : 0;

  return {
    changes, changeArea, changePct,
    totalAreaA, totalAreaB,
    allLayers, lsA, lsB,
    alignTypeA: typeA, alignTypeB: typeB,
  };
}

function runAnalysis(slots) {
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) throw new Error('최소 2개 도면이 필요합니다.');

  // 단계별 변경률
  const pairResults = [];
  for (let i = 0; i < loaded.length - 1; i++) {
    const r = calcPairChange(loaded[i].data, loaded[i + 1].data);
    r.labelFrom = loaded[i].label;
    r.labelTo   = loaded[i + 1].label;
    r.idxFrom   = slots.indexOf(loaded[i]);
    r.idxTo     = slots.indexOf(loaded[i + 1]);
    pairResults.push(r);
  }

  // 증가율: 최초 vs 최종
  const first = loaded[0];
  const last  = loaded[loaded.length - 1];

  const { T: TFL } = getAlignTransform(first.data, last.data);
  const alignFirst = detectAlignLayer(first.data);
  const alignLast  = detectAlignLayer(last.data);
  const lsFirst = getLandUseLayers(first.data, [alignFirst.layer, detectBorderLayer(first.data)].filter(Boolean));
  const lsLast  = getLandUseLayers(last.data,  [alignLast.layer,  detectBorderLayer(last.data)].filter(Boolean));

  const ringsFirst = lsFirst.flatMap(l => (first.data.layers[l] || []).map(r => applyTransform(r, TFL)));
  const ringsLast  = lsLast.flatMap(l => last.data.layers[l] || []);

  const areaFirst    = polyAreaSum(ringsFirst);
  const areaLast     = polyAreaSum(ringsLast);
  const increaseArea = newAreaOnly(ringsFirst, ringsLast);
  const increasePct  = areaFirst > 0 ? (increaseArea / areaFirst * 100) : 0;

  const totalChangePct  = pairResults.reduce((s, r) => s + r.changePct,  0);
  const totalChangeArea = pairResults.reduce((s, r) => s + r.changeArea, 0);

  return {
    pairResults,
    totalChangePct, totalChangeArea,
    increaseArea, increasePct,
    areaFirst, areaLast,
    labelFirst: first.label,
    labelLast:  last.label,
  };
}
