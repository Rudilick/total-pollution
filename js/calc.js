// ================================================================
// calc.js  ─  오염부하량 계산 엔진  v3
//
// [v3 변경]
//   - urbanType: UI select 제거 → 용도지역 대분류로 자동 판단
//   - popUnit:   UI input 제거 → POPULATION_UNIT_DB 자동 조회
//   - 처리방법:  전역 default 제거 → 건물별 method1/2/3로 변경
//   - 새 처리방법 cascade:
//       method1: "공공하수처리시설" | "개인하수처리시설" | "정화조"
//       method2: 처리장명(공공) | "고도처리"/"일반처리"(개인)
//       method3: "50톤이상"/"50톤미만"(개인)
//   - 가정인구: state.householdMethod1/2/3 사용
// ================================================================

// ── 1. 기술지침 상수 ─────────────────────────────────────────
const CALC_CONSTS = {
  FECES_FLOW_UNIT: { "시가화": 0.00115, "비시가화": 0.00134 },
  BIZ_FECES_RATIO: 0.006,
  GRAY_CONV_RATE:  0.88,
  BIZ_FLOW_DENOM:  0.006 + (1 - 0.006) * 0.88,
  WATER_SUPPLY:    { "시가화": 220.2, "비시가화": 170 },
  HH_LOAD_UNIT: {
    "시가화":  { BOD: 50.7, TN: 10.6, TP: 1.24 },
    "비시가화": { BOD: 48.6, TN: 13.0, TP: 1.45 },
  },
  FECES_LOAD_RATIO: { BOD: 0.45, TN: 0.8, TP: 0.8 },

  // 개인오수처리시설 방류수질 (mg/L)
  INDIVIDUAL_STD: {
    large: { BOD: 10, TN: 20, TP: 2 },   // 50㎥/일 이상 (수변구역도 동일)
    small: { BOD: 20, TN: 40, TP: 4 },   // 50㎥/일 미만
  },

  // 시가화 판단 기준 (용도지역 대분류)
  URBAN_ZONES: ["주거지역", "상업지역", "공업지역"],

  // 토지계 원단위 (kg/㎢·일)
  LAND_UNIT: {
    "전":       { BOD:  4.38, TN:  3.409, TP: 1.400 },
    "답":       { BOD:  4.24, TN:  2.920, TP: 0.467 },
    "과수원":   { BOD:  2.69, TN:  1.562, TP: 0.630 },
    "목장용지": { BOD:  3.71, TN:  3.986, TP: 0.295 },
    "공원":     { BOD:  3.71, TN:  3.986, TP: 0.295 },
    "묘지":     { BOD:  3.71, TN:  3.986, TP: 0.295 },
    "사적지":   { BOD:  3.71, TN:  3.986, TP: 0.295 },
    "임야":     { BOD:  1.49, TN:  2.522, TP: 0.056 },
    "광천지":   { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "염전":     { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "제방":     { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "하천":     { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "구거":     { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "유지":     { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "양어장":   { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "잡종지":   { BOD:  0.96, TN:  0.759, TP: 0.027 },
    "대지":     { BOD: 10.28, TN: 11.360, TP: 0.600 },
    "공장용지": { BOD: 33.10, TN:  9.423, TP: 0.885 },
    "학교":     { BOD:  7.25, TN:  8.431, TP: 0.447 },
    "창고":     { BOD:  7.25, TN:  8.431, TP: 0.447 },
    "종교":     { BOD:  7.25, TN:  8.431, TP: 0.447 },
    "주차장":   { BOD: 12.42, TN:  7.553, TP: 0.391 },
    "도로":     { BOD: 12.42, TN:  7.553, TP: 0.391 },
    "철도":     { BOD: 12.42, TN:  7.553, TP: 0.391 },
    "수도":     { BOD: 12.42, TN:  7.553, TP: 0.391 },
    "주유소":   { BOD: 75.02, TN: 13.588, TP: 1.385 },
    "체육용지": { BOD:  5.39, TN:  3.611, TP: 0.738 },
    "유원지":   { BOD: 14.87, TN:  5.976, TP: 0.609 },
  },
};

// ── 2. 유틸 ──────────────────────────────────────────────────
function _pn(v) {
  if (typeof parseNum === "function") return parseNum(v);
  const n = Number(String(v ?? "").replace(/,/g,""));
  return Number.isFinite(n) ? n : 0;
}
const _zero = () => ({ BOD:0, TN:0, TP:0 });
function _add(a,b){ return { BOD:a.BOD+b.BOD, TN:a.TN+b.TN, TP:a.TP+b.TP }; }
function _r(v, d=6){ return Math.round(v*10**d)/10**d; }

// ── 3. 공용면적 배분 ─────────────────────────────────────────
function _allocateCommonArea(floor) {
  const common  = _pn(floor.commonArea);
  const uses    = floor.uses;
  const sumArea = uses.filter(u=>u.unitType==="area"&&!u.isNonSewage)
                      .reduce((s,u)=>s+_pn(u.inputValue),0);
  return uses.map(u => {
    if (u.isNonSewage) return {...u, finalValue:0, commonAlloc:0};
    const base = _pn(u.inputValue);
    if (u.unitType==="area") {
      const alloc = sumArea>0 ? common*(base/sumArea) : 0;
      return {...u, finalValue:base+alloc, commonAlloc:alloc};
    }
    return {...u, finalValue:base, commonAlloc:0};
  });
}

// ── 4. 영업인구 오수발생 세부 ─────────────────────────────────
function _calcBizFlow(sewageVolume) {
  const 사용유량      = _r(sewageVolume / CALC_CONSTS.BIZ_FLOW_DENOM);
  const 분뇨발생유량  = _r(사용유량 * CALC_CONSTS.BIZ_FECES_RATIO);
  const 잡배수발생유량 = _r(sewageVolume - 분뇨발생유량);
  return { 사용유량, 분뇨발생유량, 잡배수발생유량 };
}

// ── 5. 영업인구 발생부하량 ───────────────────────────────────
function _calcBizLoad(sewageVolume, conc) {
  const R   = CALC_CONSTS.FECES_LOAD_RATIO;
  const gen = { BOD:_r(sewageVolume*conc.BOD/1000), TN:_r(sewageVolume*conc.TN/1000), TP:_r(sewageVolume*conc.TP/1000) };
  return {
    발생부하량:       gen,
    분뇨발생부하량:   { BOD:_r(R.BOD*gen.BOD), TN:_r(R.TN*gen.TN), TP:_r(R.TP*gen.TP) },
    잡배수발생부하량: { BOD:_r((1-R.BOD)*gen.BOD), TN:_r((1-R.TN)*gen.TN), TP:_r((1-R.TP)*gen.TP) },
  };
}

// ── 6. 처리방법 → 배출부하량 ────────────────────────────────
/**
 * @param {number}   오수발생유량
 * @param {{ BOD,TN,TP }} 발생부하량  (kg/일)
 * @param {string}   method1   공공하수처리시설 | 개인하수처리시설 | 정화조
 * @param {string}   method2   처리장명(공공) | 고도처리/일반처리(개인)
 * @param {string}   method3   50톤이상/50톤미만(개인)
 * @param {boolean}  isWaterBuffer  수변구역 해당 여부
 * @param {object|null} plantInfo  SEWAGE_PLANT_DB 항목
 */
function _calcDischargeLoad(오수발생유량, 발생부하량, method1, method2, method3, isWaterBuffer, plantInfo) {

  // ── 공공하수처리시설 ──────────────────────────────────────
  if (method1 === "공공하수처리시설" && plantInfo) {
    const 방류유량비   = plantInfo.efflFlowRatio ?? 1.0;
    const 관거이송량   = _r(오수발생유량 * 방류유량비);
    const 관거배출유량 = _r(오수발생유량 - 관거이송량);

    const 방류부하량 = {
      BOD: _r(관거이송량 * plantInfo.efflBOD / 1000),
      TN:  _r(관거이송량 * (plantInfo.efflTN||0) / 1000),
      TP:  _r(관거이송량 * plantInfo.efflTP / 1000),
    };

    const 유실BOD = _r((plantInfo.leakRatioBOD||0)+(plantInfo.overflowRatioBOD||0)+(plantInfo.untreatRatioBOD||0));
    const 유실TN  = _r((plantInfo.leakRatioTN ||0)+(plantInfo.overflowRatioTN ||0)+(plantInfo.untreatRatioTN ||0));
    const 유실TP  = _r((plantInfo.leakRatioTP ||0)+(plantInfo.overflowRatioTP ||0)+(plantInfo.untreatRatioTP ||0));
    const 관거배출부하량 = {
      BOD: _r(발생부하량.BOD * 유실BOD),
      TN:  _r(발생부하량.TN  * 유실TN),
      TP:  _r(발생부하량.TP  * 유실TP),
    };

    return {
      배출부하량: { BOD:_r(방류부하량.BOD+관거배출부하량.BOD), TN:_r(방류부하량.TN+관거배출부하량.TN), TP:_r(방류부하량.TP+관거배출부하량.TP) },
      방류부하량, 관거배출부하량, 관거이송량, 관거배출유량,
      관거배출유량비_pct: _r((1-방류유량비)*100),
      관거유실율_pct: { BOD:_r(유실BOD*100), TN:_r(유실TN*100), TP:_r(유실TP*100) },
      처리장정보: { name:plantInfo.name, capacity:plantInfo.capacity, efflBOD:plantInfo.efflBOD, efflTN:plantInfo.efflTN, efflTP:plantInfo.efflTP },
    };
  }

  // ── 개인하수처리시설 ──────────────────────────────────────
  // 수변구역 or 50톤이상 → large 기준, 50톤미만 → small 기준
  if (method1 === "개인하수처리시설") {
    // BOD: 수변구역 또는 50톤이상 → 10,  50톤미만 기타 → 20
    // TP:  50톤이상만 2,  50톤미만은 수변구역 여부와 무관하게 4
    const isLarge = (method3 !== "50톤미만");
    const std = {
      BOD: (isWaterBuffer || isLarge) ? 10 : 20,
      TN:  isLarge ? 20 : 40,
      TP:  isLarge ? 2  : 4,
    };
    const 배출부하량 = {
      BOD: _r(오수발생유량 * std.BOD / 1000),
      TN:  _r(오수발생유량 * std.TN  / 1000),
      TP:  _r(오수발생유량 * std.TP  / 1000),
    };
    return {
      배출부하량,
      방류부하량: {...배출부하량}, 관거배출부하량: _zero(),
      관거이송량: 오수발생유량, 관거배출유량: 0,
      관거배출유량비_pct: 0, 관거유실율_pct: {BOD:0,TN:0,TP:0},
      처리장정보: null,
      개인처리기준: { grade: method2, capacity: method3, std, isWaterBuffer },
    };
  }

  // ── 정화조 ───────────────────────────────────────────────
  // ※ 주의: 아래 기준은 "BOD 25% 삭감" 적용 (기술지침 기준 추후 확인 필요)
  // 정화조 삭감대상계수: TN 0.20, TP 0.20 삭감비 가정 → 사용자 확인 후 수정
  if (method1 === "정화조") {
    const 배출부하량 = {
      BOD: _r(발생부하량.BOD * (1 - 0.25)),
      TN:  발생부하량.TN,
      TP:  발생부하량.TP,
    };
    return {
      배출부하량,
      방류부하량: {...배출부하량}, 관거배출부하량: _zero(),
      관거이송량: 오수발생유량, 관거배출유량: 0,
      관거배출유량비_pct: 0, 관거유실율_pct: {BOD:0,TN:0,TP:0},
      처리장정보: null,
    };
  }

  // ── 미선택 fallback ──────────────────────────────────────
  return {
    배출부하량: {...발생부하량},
    방류부하량: _zero(), 관거배출부하량: _zero(),
    관거이송량: 오수발생유량, 관거배출유량: 0,
    관거배출유량비_pct: 0, 관거유실율_pct: {BOD:0,TN:0,TP:0},
    처리장정보: null,
  };
}

// ── 7. 가정인구 계산 ─────────────────────────────────────────
function _calcHousehold(households, popUnit, urbanType, method1, method2, method3, isWaterBuffer, plantInfo) {
  if (!households||households<=0) return null;
  const ut = urbanType||"비시가화";
  const population      = _r(households * popUnit);
  const 급수원단위       = CALC_CONSTS.WATER_SUPPLY[ut];
  const 일평균급수량      = _r(population * 급수원단위 / 1000);
  const 분뇨발생유량      = _r(population * CALC_CONSTS.FECES_FLOW_UNIT[ut]);
  const 잡배수발생유량     = _r((일평균급수량 - 분뇨발생유량) * CALC_CONSTS.GRAY_CONV_RATE);
  const 오수발생유량       = _r(분뇨발생유량 + 잡배수발생유량);

  const R = CALC_CONSTS.FECES_LOAD_RATIO;
  const loadUnit = CALC_CONSTS.HH_LOAD_UNIT[ut];
  const 발생부하량 = { BOD:_r(population*loadUnit.BOD/1000), TN:_r(population*loadUnit.TN/1000), TP:_r(population*loadUnit.TP/1000) };
  const 분뇨발생부하량 = { BOD:_r(R.BOD*발생부하량.BOD), TN:_r(R.TN*발생부하량.TN), TP:_r(R.TP*발생부하량.TP) };
  const 잡배수발생부하량 = { BOD:_r((1-R.BOD)*발생부하량.BOD), TN:_r((1-R.TN)*발생부하량.TN), TP:_r((1-R.TP)*발생부하량.TP) };

  const dr = _calcDischargeLoad(오수발생유량, 발생부하량, method1, method2, method3, isWaterBuffer, plantInfo);
  return { population, 급수원단위, 일평균급수량, 분뇨발생유량, 잡배수발생유량, 오수발생유량, 발생부하량, 분뇨발생부하량, 잡배수발생부하량, ...dr };
}

// ── 8. 영업인구 계산 ─────────────────────────────────────────
function _calcBusinessRows(buildings, urbanType, isWaterBuffer) {
  const rows = [];
  let 오수합계 = 0, 발생합계 = _zero(), 배출합계 = _zero();

  for (const bldg of buildings) {
    const m1 = bldg.method1 || "공공하수처리시설";
    const m2 = bldg.method2 || "";
    const m3 = bldg.method3 || "";
    const plantInfo = (m1==="공공하수처리시설") ? _getPlantInfo(m2) : null;

    for (const floor of bldg.floors) {
      for (const use of _allocateCommonArea(floor)) {
        if (use.isNonSewage || !use.major || !use.mid || use.finalValue<=0) continue;
        const factors = _getFactors(use.major, use.mid, use.minor);
        if (!factors || !factors.sewage) continue;

        const 오수발생유량 = _r(use.finalValue * factors.sewage / 1000);
        if (오수발생유량<=0) continue;

        const flowDetail = _calcBizFlow(오수발생유량);
        const loadDetail = _calcBizLoad(오수발생유량, { BOD:factors.bod, TN:factors.tn, TP:factors.tp });
        const dr = _calcDischargeLoad(오수발생유량, loadDetail.발생부하량, m1, m2, m3, isWaterBuffer, plantInfo);

        rows.push({
          buildingNo:bldg.buildingNo, floorNo:floor.floorNo,
          major:use.major, mid:use.mid, minor:use.minor||"",
          unitType:use.unitType, unitText:use.unitText,
          전용면적:_pn(use.inputValue), 공용배분:_r(use.commonAlloc||0), 적용면적:_r(use.finalValue),
          오수발생원단위:factors.sewage, BOD농도:factors.bod, TN농도:factors.tn, TP농도:factors.tp,
          오수발생유량, ...flowDetail,
          발생부하량:loadDetail.발생부하량, 분뇨발생부하량:loadDetail.분뇨발생부하량, 잡배수발생부하량:loadDetail.잡배수발생부하량,
          ...dr,
          sewageMethod1:m1, sewageMethod2:m2, sewageMethod3:m3,
          plantName:plantInfo?.name||"", excludeReason:use.excludeReason||"",
        });
        오수합계 = _r(오수합계+오수발생유량);
        발생합계 = _add(발생합계, loadDetail.발생부하량);
        배출합계 = _add(배출합계, dr.배출부하량);
      }
    }
  }
  return { rows, 합계:{ 오수발생유량:오수합계, 발생부하량:발생합계, 배출부하량:배출합계 } };
}

// ── 9. 생활계 전체 계산 ──────────────────────────────────────
function _calcLifeSection(moduleState, urbanType, isWaterBuffer) {
  // 가정인구
  const households  = _pn(moduleState.householdCount);
  const m1 = moduleState.householdMethod1 || "공공하수처리시설";
  const m2 = moduleState.householdMethod2 || "";
  const m3 = moduleState.householdMethod3 || "";
  const plantInfo = (m1==="공공하수처리시설") ? _getPlantInfo(m2) : null;

  const popUnit = _getPopUnit(
    document.getElementById("sidoSelect")?.value||"",
    document.getElementById("sigunSelect")?.value||""
  );

  const hhResult = (households>0&&popUnit>0)
    ? _calcHousehold(households, popUnit, urbanType, m1, m2, m3, isWaterBuffer, plantInfo)
    : null;

  // 영업인구
  const bizResult = _calcBusinessRows(moduleState.buildings, urbanType, isWaterBuffer);

  const totalSewage = _r((hhResult?.오수발생유량||0)+bizResult.합계.오수발생유량);
  const total발생   = _add(hhResult?.발생부하량||_zero(), bizResult.합계.발생부하량);
  const total배출   = _add(hhResult?.배출부하량||_zero(), bizResult.합계.배출부하량);

  return { 가정인구:hhResult, 영업인구:bizResult,
    합계:{ 오수발생유량:totalSewage, 발생부하량:total발생, 배출부하량:total배출 } };
}

// ── 10. 토지계 계산 ──────────────────────────────────────────
function _calcLand(landObj) {
  const rows = []; let total = _zero();
  for (const [jmok, rawArea] of Object.entries(landObj)) {
    const area = _pn(rawArea); if (area<=0) continue;
    const unit = CALC_CONSTS.LAND_UNIT[jmok]; if (!unit) continue;
    const 발생부하량 = { BOD:_r(unit.BOD*area/1e6), TN:_r(unit.TN*area/1e6), TP:_r(unit.TP*area/1e6) };
    rows.push({ jmok, area, 발생부하량, 원단위:unit });
    total = _add(total, 발생부하량);
  }
  return { rows, 합계:{ 발생부하량:total, 배출부하량:total } };
}

// ── 11. DB 조회 헬퍼 ─────────────────────────────────────────
function _getFactors(major, mid, minor) {
  if (typeof LIFE_FACTOR_MAP==="undefined") return null;
  return LIFE_FACTOR_MAP[`${major}|${mid}|${minor||""}`]
      || LIFE_FACTOR_MAP[`${major}|${mid}|`] || null;
}
function _getPlantInfo(plantName) {
  if (!plantName||typeof SEWAGE_PLANT_DB==="undefined") return null;
  return SEWAGE_PLANT_DB.find(p=>p.name===plantName||p.code===plantName)||null;
}
function _getPopUnit(sido, sigun) {
  if (typeof POPULATION_UNIT_DB==="undefined"||!sigun) return 2.63;
  const found = POPULATION_UNIT_DB.find(p=>p.sigun===sigun||(p.sido===sido&&p.sigun===sigun));
  return found?.unit || 2.63;
}

// ── 12. UI 파라미터 수집 ────────────────────────────────────
function _collectParams() {
  const get = (id,fb="") => document.getElementById(id)?.value||fb;

  // 시가화 자동 판단 (용도지역 대분류 기반)
  const zoneMain  = get("zoneMainSelect");
  const urbanType = CALC_CONSTS.URBAN_ZONES.includes(zoneMain) ? "시가화" : "비시가화";

  // 수변구역 여부
  const isWaterBuffer = document.querySelector('input[name="env_river"][value="해당"]')?.checked || false;

  const sido  = get("sidoSelect");
  const sigun = get("sigunSelect");

  return { sido, sigun, urbanType, isWaterBuffer, zoneMain };
}

// ── 13. 메인 계산 실행 ──────────────────────────────────────
function runCalc() {
  const p = _collectParams();

  const lifeBefore_result = _calcLifeSection(
    window.lifeBefore?.state ?? { householdCount:"", householdMethod1:"개인하수처리시설", householdMethod2:"", householdMethod3:"", buildings:[] },
    p.urbanType, p.isWaterBuffer
  );
  const lifeAfter_result = _calcLifeSection(
    window.lifeAfter?.state ?? { householdCount:"", householdMethod1:"공공하수처리시설", householdMethod2:"", householdMethod3:"", buildings:[] },
    p.urbanType, p.isWaterBuffer
  );

  const lifeDelta = {
    점오염: {
      BOD: _r(lifeAfter_result.합계.배출부하량.BOD - lifeBefore_result.합계.배출부하량.BOD),
      TN:  _r(lifeAfter_result.합계.배출부하량.TN  - lifeBefore_result.합계.배출부하량.TN),
      TP:  _r(lifeAfter_result.합계.배출부하량.TP  - lifeBefore_result.합계.배출부하량.TP),
    },
    비점오염: _zero(),
  };

  const landBefore_result = _calcLand(window.landState?.before ?? {});
  const landAfter_result  = _calcLand(window.landState?.after  ?? {});
  const landDelta = {
    BOD: _r(landAfter_result.합계.배출부하량.BOD - landBefore_result.합계.배출부하량.BOD),
    TN:  _r(landAfter_result.합계.배출부하량.TN  - landBefore_result.합계.배출부하량.TN),
    TP:  _r(landAfter_result.합계.배출부하량.TP  - landBefore_result.합계.배출부하량.TP),
  };

  const result = {
    params: p,
    생활계: { 사업전:lifeBefore_result, 사업후:lifeAfter_result, 증감:lifeDelta },
    토지계: { 사업전:landBefore_result, 사업후:landAfter_result, 증감:landDelta },
    최종배출부하량: {
      점오염:  lifeDelta.점오염,
      비점오염: { BOD:_r(lifeDelta.비점오염.BOD+landDelta.BOD), TN:_r(lifeDelta.비점오염.TN+landDelta.TN), TP:_r(lifeDelta.비점오염.TP+landDelta.TP) },
    },
    계산일시: new Date().toLocaleString("ko-KR"),
  };
  window.LAST_CALC_RESULT = result;
  console.log("[calc.js v3] 계산 완료:", result);
  return result;
}

// ── 14. 포맷 헬퍼 ───────────────────────────────────────────
const CalcFormat = {
  load: v => typeof v==="number" ? v.toFixed(4) : "-",
  flow: v => typeof v==="number" ? v.toFixed(4) : "-",
  pct:  v => typeof v==="number" ? v.toFixed(4) : "-",
  int:  v => typeof v==="number" ? Math.round(v).toLocaleString("ko-KR") : "-",
  area: v => typeof v==="number" ? v.toFixed(2) : "-",
};

window.runCalc     = runCalc;
window.CalcFormat  = CalcFormat;
window.CALC_CONSTS = CALC_CONSTS;
