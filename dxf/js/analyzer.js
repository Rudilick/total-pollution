/**
 * analyzer.js
 *
 * ① 증가부지: 최초(A) vs 최종(F) → A에 없는 자리에 F에서 생긴 면적
 *    증가율 = 증가면적 / 분모면적 × 100
 *
 * ② 변경부지: 각 인접 단계(A→B, B→C...) 변경 면적 합산
 *    레이어X → 레이어Y 로 바뀐 교차 면적
 *    모든 단계 변경률의 분모 = 분모면적 (1차·2차·3차 공통)
 *
 * 분모면적(denomArea): 환경영향평가법상 변경률/증가율은 "이미 협의한 사업면적" 대비로
 * 판단하는 지표이므로, 아카이브 DB에 등록된 사업면적(eia_list.site_area)이 있으면 그것을
 * 쓰고, 없으면(단독 세션 등 DB 미등록 상태) 최초 도면 실측 면적(areaFirst)으로 폴백한다.
 * CAD 실측 총면적은 도면 작성 방식(경계 정의, 해치/호 근사 등)에 따라 협의서상 사업면적과
 * 다를 수 있는 수치라 원칙적으로 분모로 쓰기에 부적합하다 — areaFirst/areaLast는 계속
 * 계산·표시하되 어디까지나 "실측값 표시"용이고, 비율 계산의 분모가 아니다.
 *
 * 정합: 같은 프로젝트 도면은 좌표계 동일 → 변환 없이 직접 겹침
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
  const totalAreaA = exactPolyAreaSum(totalRingsA);
  const totalAreaB = exactPolyAreaSum(totalRingsB);

  // 변경부지: A의 레이어X → B의 레이어Y (X≠Y) 교차 면적
  const changes = [];
  for (const lFrom of lsA) {
    for (const lTo of lsB) {
      if (lFrom === lTo) continue;
      const { area, polys } = intersectionArea(ringsA[lFrom], ringsB[lTo]);
      if (area > 0) changes.push({ from: lFrom, to: lTo, area, polys });
    }
  }

  const changeArea = changes.reduce((s, c) => s + c.area, 0);
  const changePct = totalAreaA > 0 ? (changeArea / totalAreaA * 100) : 0;

  // 제척된 면적: A(이전 단계) 전체에는 있었는데 B(다음 단계) 전체에는 아예 없어진 부분
  // (매도·제척 등으로 부지에서 빠진 경우) — 분자(changeArea) 계산에는 포함되지 않는다.
  const excludedArea = newAreaOnly(totalRingsB, totalRingsA);

  return {
    changes, changeArea, changePct, excludedArea,
    totalAreaA, totalAreaB,
    allLayers, lsA, lsB,
    alignTypeA: typeA, alignTypeB: typeB,
  };
}

function runAnalysis(slots, dbSiteArea) {
  const loaded = slots.filter(s => s.data);
  if (loaded.length < 2) throw new Error('최소 2개 도면이 필요합니다.');

  const first = loaded[0];
  const last  = loaded[loaded.length - 1];

  // ── 최초 도면 실측 면적 (표시용 — DB 미등록 시에는 분모 폴백으로도 쓰임) ──
  const alignFirst = detectAlignLayer(first.data);
  const lsFirst    = getLandUseLayers(first.data,
    [alignFirst.layer, detectBorderLayer(first.data)].filter(Boolean));
  const ringsFirst = lsFirst.flatMap(l => first.data.layers[l] || []);
  const areaFirst  = exactPolyAreaSum(ringsFirst);

  // ── 변경률/증가율의 분모: DB 사업면적이 있으면 그것을, 없으면 최초도면 실측값 ──
  const denomArea   = (dbSiteArea && dbSiteArea > 0) ? dbSiteArea : areaFirst;
  const denomSource = (dbSiteArea && dbSiteArea > 0) ? 'db_site_area' : 'cad_first_drawing';

  // ── 단계별 변경 계산 ─────────────────────────────────────────
  const pairResults = [];
  for (let i = 0; i < loaded.length - 1; i++) {
    const r = calcPairChange(loaded[i].data, loaded[i + 1].data);
    // 분모를 denomArea로 통일
    r.changePct = denomArea > 0 ? (r.changeArea / denomArea * 100) : 0;
    r.denomArea = denomArea;     // ui에서 상세 비율 표시에 사용
    r.denomSource = denomSource; // ui에서 분모 출처 라벨 표시에 사용
    r.labelFrom = loaded[i].label;
    r.labelTo   = loaded[i + 1].label;
    r.idxFrom   = slots.indexOf(loaded[i]);
    r.idxTo     = slots.indexOf(loaded[i + 1]);
    pairResults.push(r);
  }

  // ── 증가율: 최초 vs 최종 ─────────────────────────────────────
  const alignLast = detectAlignLayer(last.data);
  const lsLast    = getLandUseLayers(last.data,
    [alignLast.layer, detectBorderLayer(last.data)].filter(Boolean));
  const ringsLast  = lsLast.flatMap(l => last.data.layers[l] || []);

  const areaLast     = exactPolyAreaSum(ringsLast);
  const increaseArea = newAreaOnly(ringsFirst, ringsLast);
  const increasePct  = denomArea > 0 ? (increaseArea / denomArea * 100) : 0;

  // 누적 변경률도 denomArea 기준
  const totalChangeArea = pairResults.reduce((s, r) => s + r.changeArea, 0);
  const totalChangePct  = denomArea > 0 ? (totalChangeArea / denomArea * 100) : 0;

  return {
    pairResults,
    totalChangePct, totalChangeArea,
    increaseArea, increasePct,
    areaFirst, areaLast,
    denomArea, denomSource,
    labelFirst: first.label,
    labelLast:  last.label,
  };
}
