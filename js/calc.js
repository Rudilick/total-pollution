// ================================================================
// calc.js  ─  오염부하량 계산 엔진  (v2)
//
// [주요 변경]
//   _calcDischargeLoad 전면 재설계
//   ─ 기존: 분뇨/잡배수 분리 → 직접이송 개념 (지침과 불일치)
//   ─ 변경: 관거이송량 기반 (기술지침 §Ⅷ + 남양주시 참고자료)
//     ① 관거이송량 = 오수발생량 × 방류유량비 (= 1 - 관거배출유량비)
//     ② 방류부하량  = 관거이송량 × 방류수질
//     ③ 관거배출부하량 = 발생부하량 × 관거유실율(BOD/TN/TP비 합)
//     ④ 배출부하량  = ② + ③
//
//   _calcBusinessRows: 섹션 defaultPlant를 영업인구에도 전달
//   중간계산값 전부 row 객체에 저장 → word-gen.js 매핑 가능
//
// [입력]  lifeBefore.state, lifeAfter.state, landState
//         LIFE_FACTOR_MAP, SEWAGE_PLANT_DB, POPULATION_UNIT_DB
//         UI: 시가화구분, 지자체, 처리장
// [출력]  window.LAST_CALC_RESULT
// ================================================================

// ──────────────────────────────────────────────
// 1. 기술지침 상수 (오염총량관리기술지침 2022)
// ──────────────────────────────────────────────
const CALC_CONSTS = {
  // 분뇨발생유량원단위 (m³/인/일)  표 Ⅵ-1
  FECES_FLOW_UNIT: { "시가화": 0.00115, "비시가화": 0.00134 },

  // 영업인구 분뇨발생유량비 (-)   표 Ⅵ-1
  BIZ_FECES_RATIO: 0.006,

  // 잡배수 오수전환율 (-)          표 Ⅵ-1
  GRAY_CONV_RATE: 0.88,

  // 영업인구 사용유량 역산 분모: 0.006 + (1-0.006)×0.88
  BIZ_FLOW_DENOM: 0.006 + (1 - 0.006) * 0.88,

  // 가정인구 급수원단위 (L/인/일)
  WATER_SUPPLY: { "시가화": 220.2, "비시가화": 170 },

  // 가정인구 발생부하원단위 (g/인/일)  표 Ⅶ-1
  HH_LOAD_UNIT: {
    "시가화":  { BOD: 50.7, TN: 10.6, TP: 1.24 },
    "비시가화": { BOD: 48.6, TN: 13.0, TP: 1.45 },
  },

  // 분뇨발생부하비 (-)  표 Ⅶ-1
  FECES_LOAD_RATIO: { BOD: 0.45, TN: 0.8, TP: 0.8 },

  // 개인오수처리시설 방류수질기준 (mg/L)
  INDIVIDUAL_STD: {
    large: { BOD: 10, TN: 20, TP: 2  },  // 50m³/일 이상
    small: { BOD: 20, TN: 40, TP: 4  },  // 50m³/일 미만
  },

  // 토지계 지목별 연평균 발생부하원단위 (kg/㎢·일)  표 Ⅶ-5
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

// ──────────────────────────────────────────────
// 2. 유틸
// ──────────────────────────────────────────────
function _pn(v) {
  if (typeof parseNum === "function") return parseNum(v);
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const _zero = () => ({ BOD: 0, TN: 0, TP: 0 });

function _add(a, b) {
  return { BOD: a.BOD + b.BOD, TN: a.TN + b.TN, TP: a.TP + b.TP };
}

function _r(v, d = 6) {
  return Math.round(v * 10 ** d) / 10 ** d;
}

// ──────────────────────────────────────────────
// 3. 공용면적 배분  [업무편람]
// ──────────────────────────────────────────────
function _allocateCommonArea(floor) {
  const common = _pn(floor.commonArea);
  const uses   = floor.uses;
  const areaUses  = uses.filter(u => u.unitType === "area" && !u.isNonSewage);
  const sumArea   = areaUses.reduce((s, u) => s + _pn(u.inputValue), 0);

  return uses.map(u => {
    if (u.isNonSewage) return { ...u, finalValue: 0, commonAlloc: 0 };
    const base = _pn(u.inputValue);
    if (u.unitType === "area") {
      const alloc = sumArea > 0 ? common * (base / sumArea) : 0;
      return { ...u, finalValue: base + alloc, commonAlloc: alloc };
    }
    return { ...u, finalValue: base, commonAlloc: 0 };
  });
}

// ──────────────────────────────────────────────
// 4. 영업인구 오수발생 세부 (분뇨/잡배수 분리)
//    ※ 문서 중간값 기록 목적
// ──────────────────────────────────────────────
function _calcBizFlow(sewageVolume) {
  const 사용유량      = _r(sewageVolume / CALC_CONSTS.BIZ_FLOW_DENOM);
  const 분뇨발생유량  = _r(사용유량 * CALC_CONSTS.BIZ_FECES_RATIO);
  const 잡배수발생유량 = _r(sewageVolume - 분뇨발생유량);
  return { 사용유량, 분뇨발생유량, 잡배수발생유량 };
}

// ──────────────────────────────────────────────
// 5. 영업인구 발생부하량 (분뇨/잡배수 분리)
// ──────────────────────────────────────────────
function _calcBizLoad(sewageVolume, conc) {
  const R   = CALC_CONSTS.FECES_LOAD_RATIO;
  const gen = {
    BOD: _r(sewageVolume * conc.BOD / 1000),
    TN:  _r(sewageVolume * conc.TN  / 1000),
    TP:  _r(sewageVolume * conc.TP  / 1000),
  };
  const feces = { BOD: _r(R.BOD * gen.BOD), TN: _r(R.TN * gen.TN), TP: _r(R.TP * gen.TP) };
  const gray  = { BOD: _r((1-R.BOD)*gen.BOD), TN: _r((1-R.TN)*gen.TN), TP: _r((1-R.TP)*gen.TP) };
  return { 발생부하량: gen, 분뇨발생부하량: feces, 잡배수발생부하량: gray };
}

// ──────────────────────────────────────────────
// 6. 배출부하량 계산 [기술지침 §Ⅷ + 남양주시 참고자료]
//
// 공공하수처리시설:
//   ① 관거이송량     = 오수발생량 × 방류유량비
//   ② 방류부하량     = 관거이송량 × 방류수질
//   ③ 관거배출부하량 = 발생부하량 × 관거유실율(BOD비+월류비+배제비)
//   ④ 배출부하량     = ② + ③
// ──────────────────────────────────────────────
/**
 * @param {number}          오수발생유량  - m³/일
 * @param {{ BOD,TN,TP }}   발생부하량   - kg/일
 * @param {string}          sewageMethod
 * @param {object|null}     plantInfo    - SEWAGE_PLANT_DB 항목
 * @returns {{ 배출부하량, 방류부하량, 관거배출부하량, 관거이송량, 관거배출유량,
 *             관거배출유량비_pct, 관거유실율_pct, 처리장정보 }}
 */
function _calcDischargeLoad(오수발생유량, 발생부하량, sewageMethod, plantInfo) {

  // ── 공공하수처리시설 ──────────────────────────────────────
  if (sewageMethod === "공공하수처리시설" && plantInfo) {
    // ① 관거이송량
    const 방류유량비    = plantInfo.efflFlowRatio ?? 1.0;
    const 관거이송량    = _r(오수발생유량 * 방류유량비);
    const 관거배출유량  = _r(오수발생유량 - 관거이송량);
    const 관거배출유량비_pct = _r((1 - 방류유량비) * 100);

    // ② 방류부하량 = 관거이송량 × 방류수질
    const 방류부하량 = {
      BOD: _r(관거이송량 * plantInfo.efflBOD / 1000),
      TN:  _r(관거이송량 * (plantInfo.efflTN || 0) / 1000),
      TP:  _r(관거이송량 * plantInfo.efflTP / 1000),
    };

    // ③ 관거배출부하량 = 발생부하량 × 관거유실율
    //    관거유실율 = 누수비 + 월류비 + 배제비 (각각 BOD/TN/TP 부하비, 소수형태)
    const 관거유실율_BOD = _r(
      (plantInfo.leakRatioBOD     || 0) +
      (plantInfo.overflowRatioBOD || 0) +
      (plantInfo.untreatRatioBOD  || 0)
    );
    const 관거유실율_TN = _r(
      (plantInfo.leakRatioTN     || 0) +
      (plantInfo.overflowRatioTN || 0) +
      (plantInfo.untreatRatioTN  || 0)
    );
    const 관거유실율_TP = _r(
      (plantInfo.leakRatioTP     || 0) +
      (plantInfo.overflowRatioTP || 0) +
      (plantInfo.untreatRatioTP  || 0)
    );

    const 관거배출부하량 = {
      BOD: _r(발생부하량.BOD * 관거유실율_BOD),
      TN:  _r(발생부하량.TN  * 관거유실율_TN),
      TP:  _r(발생부하량.TP  * 관거유실율_TP),
    };

    // ④ 최종 배출부하량
    const 배출부하량 = {
      BOD: _r(방류부하량.BOD + 관거배출부하량.BOD),
      TN:  _r(방류부하량.TN  + 관거배출부하량.TN),
      TP:  _r(방류부하량.TP  + 관거배출부하량.TP),
    };

    return {
      배출부하량,
      방류부하량,
      관거배출부하량,
      관거이송량,
      관거배출유량,
      관거배출유량비_pct,
      관거유실율_pct: {
        BOD: _r(관거유실율_BOD * 100),
        TN:  _r(관거유실율_TN  * 100),
        TP:  _r(관거유실율_TP  * 100),
      },
      처리장정보: {
        name:      plantInfo.name,
        capacity:  plantInfo.capacity,
        efflBOD:   plantInfo.efflBOD,
        efflTN:    plantInfo.efflTN,
        efflTP:    plantInfo.efflTP,
      },
    };
  }

  // ── 개인오수처리시설 ──────────────────────────────────────
  if (sewageMethod === "개인오수처리시설") {
    const std = 오수발생유량 >= 50
      ? CALC_CONSTS.INDIVIDUAL_STD.large
      : CALC_CONSTS.INDIVIDUAL_STD.small;
    const 배출부하량 = {
      BOD: _r(오수발생유량 * std.BOD / 1000),
      TN:  _r(오수발생유량 * std.TN  / 1000),
      TP:  _r(오수발생유량 * std.TP  / 1000),
    };
    return {
      배출부하량,
      방류부하량:     { ...배출부하량 },
      관거배출부하량: _zero(),
      관거이송량:     오수발생유량,
      관거배출유량:   0,
      관거배출유량비_pct: 0,
      관거유실율_pct: { BOD: 0, TN: 0, TP: 0 },
      처리장정보: null,
    };
  }

  // ── 재래식화장실(단독정화조) ──────────────────────────────
  if (sewageMethod === "재래식화장실") {
    const 배출부하량 = {
      BOD: _r(발생부하량.BOD * (1 - 0.25)),   // BOD 25% 삭감
      TN:  발생부하량.TN,
      TP:  발생부하량.TP,
    };
    return {
      배출부하량,
      방류부하량:     { ...배출부하량 },
      관거배출부하량: _zero(),
      관거이송량:     오수발생유량,
      관거배출유량:   0,
      관거배출유량비_pct: 0,
      관거유실율_pct: { BOD: 0, TN: 0, TP: 0 },
      처리장정보: null,
    };
  }

  // ── 미선택 / 기본값 ───────────────────────────────────────
  return {
    배출부하량:     { ...발생부하량 },
    방류부하량:     _zero(),
    관거배출부하량: _zero(),
    관거이송량:     오수발생유량,
    관거배출유량:   0,
    관거배출유량비_pct: 0,
    관거유실율_pct: { BOD: 0, TN: 0, TP: 0 },
    처리장정보: null,
  };
}

// ──────────────────────────────────────────────
// 7. 가정인구 계산
// ──────────────────────────────────────────────
function _calcHousehold(households, popUnit, urbanType, sewageMethod, plantInfo) {
  if (!households || households <= 0) return null;

  const ut = urbanType || "비시가화";

  // 오수발생유량
  const population      = _r(households * popUnit);
  const 급수원단위       = CALC_CONSTS.WATER_SUPPLY[ut];
  const 일평균급수량      = _r(population * 급수원단위 / 1000);      // m³/일
  const 분뇨발생유량      = _r(population * CALC_CONSTS.FECES_FLOW_UNIT[ut]);
  const 잡배수발생유량     = _r((일평균급수량 - 분뇨발생유량) * CALC_CONSTS.GRAY_CONV_RATE);
  const 오수발생유량       = _r(분뇨발생유량 + 잡배수발생유량);

  // 발생부하량
  const loadUnit = CALC_CONSTS.HH_LOAD_UNIT[ut];
  const 발생부하량 = {
    BOD: _r(population * loadUnit.BOD / 1000),
    TN:  _r(population * loadUnit.TN  / 1000),
    TP:  _r(population * loadUnit.TP  / 1000),
  };
  const R = CALC_CONSTS.FECES_LOAD_RATIO;
  const 분뇨발생부하량 = {
    BOD: _r(R.BOD * 발생부하량.BOD),
    TN:  _r(R.TN  * 발생부하량.TN),
    TP:  _r(R.TP  * 발생부하량.TP),
  };
  const 잡배수발생부하량 = {
    BOD: _r((1-R.BOD) * 발생부하량.BOD),
    TN:  _r((1-R.TN)  * 발생부하량.TN),
    TP:  _r((1-R.TP)  * 발생부하량.TP),
  };

  // 배출부하량 (관거이송 기반)
  const dischargeResult = _calcDischargeLoad(오수발생유량, 발생부하량, sewageMethod, plantInfo);

  return {
    population,
    급수원단위,
    일평균급수량,
    분뇨발생유량,
    잡배수발생유량,
    오수발생유량,
    발생부하량,
    분뇨발생부하량,
    잡배수발생부하량,
    ...dischargeResult,
  };
}

// ──────────────────────────────────────────────
// 8. 영업인구(건축물 용도별) 계산
// ──────────────────────────────────────────────
/**
 * @param {Array}      buildings    - lifeModule.state.buildings
 * @param {string}     urbanType    - "시가화" | "비시가화"
 * @param {object|null} defaultPlant - 섹션 기본 처리장 (없으면 건물별 선택)
 */
function _calcBusinessRows(buildings, urbanType, defaultPlant = null) {
  const rows = [];
  let 오수발생유량합계 = 0;
  let 발생부하량합계   = _zero();
  let 배출부하량합계   = _zero();

  for (const bldg of buildings) {
    const sewageMethod = bldg.sewageMethod || "개인오수처리시설";

    // per-building 처리장이 있으면 우선, 없으면 섹션 기본 사용
    const plantInfo = _getPlantInfo(bldg.selectedPlant) ||
                      (sewageMethod === "공공하수처리시설" ? defaultPlant : null);

    for (const floor of bldg.floors) {
      const allocatedUses = _allocateCommonArea(floor);

      for (const use of allocatedUses) {
        if (use.isNonSewage || !use.major || !use.mid) continue;
        if (use.finalValue <= 0) continue;

        const factors = _getFactors(use.major, use.mid, use.minor);
        if (!factors || !factors.sewage) continue;

        const 오수발생유량 = _r(use.finalValue * factors.sewage / 1000);
        if (오수발생유량 <= 0) continue;

        // 중간값 (문서 기록용)
        const flowDetail = _calcBizFlow(오수발생유량);
        const loadDetail = _calcBizLoad(오수발생유량, { BOD: factors.bod, TN: factors.tn, TP: factors.tp });

        // 배출부하량 (새 방식)
        const dischargeResult = _calcDischargeLoad(
          오수발생유량, loadDetail.발생부하량, sewageMethod, plantInfo
        );

        const row = {
          // 위치
          buildingNo: bldg.buildingNo,
          floorNo:    floor.floorNo,
          // 용도
          major:    use.major,
          mid:      use.mid,
          minor:    use.minor || "",
          unitType: use.unitType,
          unitText: use.unitText,
          // 면적
          전용면적:  _pn(use.inputValue),
          공용배분:  _r(use.commonAlloc || 0),
          적용면적:  _r(use.finalValue),
          // 원단위
          오수발생원단위: factors.sewage,
          BOD농도:        factors.bod,
          TN농도:         factors.tn,
          TP농도:         factors.tp,
          // 오수발생유량 (분뇨/잡배수 세부)
          오수발생유량,
          ...flowDetail,          // 사용유량, 분뇨발생유량, 잡배수발생유량
          // 발생부하량 (분뇨/잡배수 세부)
          발생부하량:       loadDetail.발생부하량,
          분뇨발생부하량:   loadDetail.분뇨발생부하량,
          잡배수발생부하량: loadDetail.잡배수발생부하량,
          // 배출부하량 (관거이송 세부)
          ...dischargeResult,     // 배출부하량, 방류부하량, 관거배출부하량, 관거이송량 등
          // 처리방법
          sewageMethod,
          plantName: plantInfo?.name || "",
          // 비오수 제외 사유 (Word 주석용)
          excludeReason: use.excludeReason || "",
        };

        rows.push(row);
        오수발생유량합계 = _r(오수발생유량합계 + 오수발생유량);
        발생부하량합계   = _add(발생부하량합계, loadDetail.발생부하량);
        배출부하량합계   = _add(배출부하량합계, dischargeResult.배출부하량);
      }
    }
  }

  return {
    rows,
    합계: {
      오수발생유량: 오수발생유량합계,
      발생부하량:   발생부하량합계,
      배출부하량:   배출부하량합계,
    },
  };
}

// ──────────────────────────────────────────────
// 9. 생활계 전체 계산 (가정 + 영업 합산)
// ──────────────────────────────────────────────
function _calcLifeSection(moduleState, params) {
  const { urbanType, popUnit, defaultSewageMethod, defaultPlant } = params;

  // 가정인구
  const households = _pn(moduleState.householdCount);
  const hhResult   = (households > 0 && popUnit > 0)
    ? _calcHousehold(households, popUnit, urbanType, defaultSewageMethod, defaultPlant)
    : null;

  // 영업인구 (defaultPlant 전달)
  const bizResult = _calcBusinessRows(moduleState.buildings, urbanType, defaultPlant);

  // 합산
  const totalSewage = _r((hhResult?.오수발생유량 || 0) + bizResult.합계.오수발생유량);
  const total발생    = _add(hhResult?.발생부하량 || _zero(), bizResult.합계.발생부하량);
  const total배출    = _add(hhResult?.배출부하량 || _zero(), bizResult.합계.배출부하량);

  return {
    가정인구: hhResult,
    영업인구: bizResult,
    합계: {
      오수발생유량: totalSewage,
      발생부하량:   total발생,
      배출부하량:   total배출,
    },
  };
}

// ──────────────────────────────────────────────
// 10. 토지계 계산
// ──────────────────────────────────────────────
function _calcLand(landObj) {
  const rows = [];
  let total = _zero();

  for (const [jmok, rawArea] of Object.entries(landObj)) {
    const area = _pn(rawArea);
    if (area <= 0) continue;
    const unit = CALC_CONSTS.LAND_UNIT[jmok];
    if (!unit) continue;

    // kg/㎢·일 × ㎡ / 1,000,000 = kg/일
    const 발생부하량 = {
      BOD: _r(unit.BOD * area / 1e6),
      TN:  _r(unit.TN  * area / 1e6),
      TP:  _r(unit.TP  * area / 1e6),
    };
    rows.push({ jmok, area, 발생부하량, 원단위: unit });
    total = _add(total, 발생부하량);
  }

  return {
    rows,
    합계: {
      발생부하량: total,
      배출부하량: total,   // 별도 삭감시설 없으면 발생 = 배출
    },
  };
}

// ──────────────────────────────────────────────
// 11. DB 조회 헬퍼
// ──────────────────────────────────────────────
function _getFactors(major, mid, minor) {
  if (typeof LIFE_FACTOR_MAP === "undefined") return null;
  return LIFE_FACTOR_MAP[`${major}|${mid}|${minor || ""}`]
      || LIFE_FACTOR_MAP[`${major}|${mid}|`]
      || null;
}

function _getPlantInfo(plantName) {
  if (!plantName || typeof SEWAGE_PLANT_DB === "undefined") return null;
  return SEWAGE_PLANT_DB.find(p => p.name === plantName || p.code === plantName) || null;
}

function _getPopUnit(sido, sigun) {
  if (typeof POPULATION_UNIT_DB === "undefined" || !sido || !sigun) return 2.63;
  const found = POPULATION_UNIT_DB.find(p =>
    p.sigun === sigun || (p.sido === sido && p.sigun === sigun)
  );
  return found?.unit || 2.63;
}

// ──────────────────────────────────────────────
// 12. UI에서 파라미터 수집
// ──────────────────────────────────────────────
function _collectParams() {
  const get = (id, fallback = "") => document.getElementById(id)?.value || fallback;

  const sido      = get("sigunguSido");
  const sigun     = get("sigunguSigun");
  const urbanType = get("urbanTypeSelect") || "비시가화";
  const popUnit   = _pn(get("popUnitInput")) || _getPopUnit(sido, sigun);

  const beforeMethod = get("beforeDefaultMethod") || "개인오수처리시설";
  const beforePlant  = _getPlantInfo(get("beforePlantSelect"));
  const afterMethod  = get("afterDefaultMethod")  || "공공하수처리시설";
  const afterPlant   = _getPlantInfo(get("afterPlantSelect"));

  return { sido, sigun, urbanType, popUnit, beforeMethod, beforePlant, afterMethod, afterPlant };
}

// ──────────────────────────────────────────────
// 13. 메인 계산 실행
// ──────────────────────────────────────────────
function runCalc() {
  const p = _collectParams();

  // 생활계 사업전
  const lifeBefore_result = _calcLifeSection(
    window.lifeBefore?.state ?? { householdCount: "", buildings: [] },
    { urbanType: p.urbanType, popUnit: p.popUnit, defaultSewageMethod: p.beforeMethod, defaultPlant: p.beforePlant }
  );

  // 생활계 사업후
  const lifeAfter_result = _calcLifeSection(
    window.lifeAfter?.state ?? { householdCount: "", buildings: [] },
    { urbanType: p.urbanType, popUnit: p.popUnit, defaultSewageMethod: p.afterMethod, defaultPlant: p.afterPlant }
  );

  // 생활계 증감 (후 - 전)
  const lifeDelta = {
    점오염: {
      BOD: _r(lifeAfter_result.합계.배출부하량.BOD - lifeBefore_result.합계.배출부하량.BOD),
      TN:  _r(lifeAfter_result.합계.배출부하량.TN  - lifeBefore_result.합계.배출부하량.TN),
      TP:  _r(lifeAfter_result.합계.배출부하량.TP  - lifeBefore_result.합계.배출부하량.TP),
    },
    비점오염: _zero(),
  };

  // 토지계
  const landBefore_result = _calcLand(window.landState?.before ?? {});
  const landAfter_result  = _calcLand(window.landState?.after  ?? {});
  const landDelta = {
    BOD: _r(landAfter_result.합계.배출부하량.BOD - landBefore_result.합계.배출부하량.BOD),
    TN:  _r(landAfter_result.합계.배출부하량.TN  - landBefore_result.합계.배출부하량.TN),
    TP:  _r(landAfter_result.합계.배출부하량.TP  - landBefore_result.합계.배출부하량.TP),
  };

  // 종합 최종
  const finalDelta = {
    점오염:  lifeDelta.점오염,
    비점오염: {
      BOD: _r(lifeDelta.비점오염.BOD + landDelta.BOD),
      TN:  _r(lifeDelta.비점오염.TN  + landDelta.TN),
      TP:  _r(lifeDelta.비점오염.TP  + landDelta.TP),
    },
  };

  const result = {
    params: p,
    생활계: {
      사업전: lifeBefore_result,
      사업후: lifeAfter_result,
      증감:   lifeDelta,
    },
    토지계: {
      사업전: landBefore_result,
      사업후: landAfter_result,
      증감:   landDelta,
    },
    최종배출부하량: finalDelta,
    계산일시: new Date().toLocaleString("ko-KR"),
  };

  window.LAST_CALC_RESULT = result;
  console.log("[calc.js v2] 계산 완료:", result);
  return result;
}

// ──────────────────────────────────────────────
// 14. 숫자 포맷 헬퍼 (Word 표 생성용)
// ──────────────────────────────────────────────
const CalcFormat = {
  load: v => (typeof v === "number" ? v.toFixed(4) : "-"),
  flow: v => (typeof v === "number" ? v.toFixed(4) : "-"),
  pct:  v => (typeof v === "number" ? v.toFixed(4) : "-"),
  int:  v => (typeof v === "number" ? Math.round(v).toLocaleString("ko-KR") : "-"),
  area: v => (typeof v === "number" ? v.toFixed(2) : "-"),
};

// 외부 노출
window.runCalc      = runCalc;
window.CalcFormat   = CalcFormat;
window.CALC_CONSTS  = CALC_CONSTS;
