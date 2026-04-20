// ================================================================
// calc.js  v5
// [변경]
//   - _calcHousehold: 오수발생량 단순화 (세대수×인구단위×200or170L/인/일)
//   - window.isEupMyeon으로 급수원단위 170/200 분기
//   - 기타 구조 동일
// ================================================================

const CALC_CONSTS = {
  FECES_FLOW_UNIT: { "시가화":0.00115, "비시가화":0.00134 },
  BIZ_FECES_RATIO: 0.006,
  GRAY_CONV_RATE:  0.88,
  BIZ_FLOW_DENOM:  0.006+(1-0.006)*0.88,
  WATER_SUPPLY:    { "시가화":200, "비시가화":200, "읍면":170 },
  HH_LOAD_UNIT: {
    "시가화":  { BOD:50.7, TN:10.6, TP:1.24 },
    "비시가화": { BOD:48.6, TN:13.0, TP:1.45 },
  },
  FECES_LOAD_RATIO: { BOD:0.45, TN:0.8, TP:0.8 },
  DIRECT_TRANSFER_COEF: {
    "개인하수처리시설": { flow:1.000, BOD:0.079, TN:0.080, TP:0.081 },
    "정화조":           { flow:1.00,  BOD:0.16,  TN:0.20,  TP:0.20  },
  },
  DIRECT_TRANSFER_RATIO: 1.0,
  INDIVIDUAL_STD: {
    large: { BOD:10, TN:20, TP:2 },
    small: { BOD:20, TN:40, TP:4 },
  },
  URBAN_ZONES: ["주거지역","상업지역","공업지역"],
  LAND_UNIT: {
    "전":{BOD:4.38,TN:3.409,TP:1.400},"답":{BOD:4.24,TN:2.920,TP:0.467},
    "과수원":{BOD:2.69,TN:1.562,TP:0.630},"목장용지":{BOD:3.71,TN:3.986,TP:0.295},
    "공원":{BOD:3.71,TN:3.986,TP:0.295},"묘지":{BOD:3.71,TN:3.986,TP:0.295},
    "사적지":{BOD:3.71,TN:3.986,TP:0.295},"임야":{BOD:1.49,TN:2.522,TP:0.056},
    "광천지":{BOD:0.96,TN:0.759,TP:0.027},"염전":{BOD:0.96,TN:0.759,TP:0.027},
    "제방":{BOD:0.96,TN:0.759,TP:0.027},"하천":{BOD:0.96,TN:0.759,TP:0.027},
    "구거":{BOD:0.96,TN:0.759,TP:0.027},"유지":{BOD:0.96,TN:0.759,TP:0.027},
    "양어장":{BOD:0.96,TN:0.759,TP:0.027},"잡종지":{BOD:0.96,TN:0.759,TP:0.027},
    "대지":{BOD:10.28,TN:11.360,TP:0.600},"공장용지":{BOD:33.10,TN:9.423,TP:0.885},
    "학교":{BOD:7.25,TN:8.431,TP:0.447},"창고":{BOD:7.25,TN:8.431,TP:0.447},
    "종교":{BOD:7.25,TN:8.431,TP:0.447},"주차장":{BOD:12.42,TN:7.553,TP:0.391},
    "도로":{BOD:12.42,TN:7.553,TP:0.391},"철도":{BOD:12.42,TN:7.553,TP:0.391},
    "수도":{BOD:12.42,TN:7.553,TP:0.391},"주유소":{BOD:75.02,TN:13.588,TP:1.385},
    "체육용지":{BOD:5.39,TN:3.611,TP:0.738},"유원지":{BOD:14.87,TN:5.976,TP:0.609},
  },
};

function _pn(v){ if(typeof parseNum==="function") return parseNum(v); const n=Number(String(v??"").replace(/,/g,"")); return Number.isFinite(n)?n:0; }
const _zero=()=>({BOD:0,TN:0,TP:0});
function _add(a,b){return{BOD:a.BOD+b.BOD,TN:a.TN+b.TN,TP:a.TP+b.TP};}
function _r(v,d=6){return Math.round(v*10**d)/10**d;}

function _allocateCommonArea(floor){
  const common=_pn(floor.commonArea),uses=floor.uses;
  const sumArea=uses.filter(u=>u.unitType==="area"&&!u.isNonSewage).reduce((s,u)=>s+_pn(u.inputValue),0);
  return uses.map(u=>{
    if(u.isNonSewage) return{...u,finalValue:0,commonAlloc:0};
    const base=_pn(u.inputValue);
    if(u.unitType==="area"){const alloc=sumArea>0?common*(base/sumArea):0;return{...u,finalValue:base+alloc,commonAlloc:alloc};}
    return{...u,finalValue:base,commonAlloc:0};
  });
}

function _calcBizFlow(v){
  const 사용유량=_r(v/CALC_CONSTS.BIZ_FLOW_DENOM);
  const 분뇨발생유량=_r(사용유량*CALC_CONSTS.BIZ_FECES_RATIO);
  return{사용유량,분뇨발생유량,잡배수발생유량:_r(v-분뇨발생유량)};
}

function _calcBizLoad(v,conc){
  const R=CALC_CONSTS.FECES_LOAD_RATIO;
  const gen={BOD:_r(v*conc.BOD/1000),TN:_r(v*conc.TN/1000),TP:_r(v*conc.TP/1000)};
  return{
    발생부하량:gen,
    분뇨발생부하량:{BOD:_r(R.BOD*gen.BOD),TN:_r(R.TN*gen.TN),TP:_r(R.TP*gen.TP)},
    잡배수발생부하량:{BOD:_r((1-R.BOD)*gen.BOD),TN:_r((1-R.TN)*gen.TN),TP:_r((1-R.TP)*gen.TP)},
  };
}

function _calcDirectTransfer(분뇨발생유량, method1, fecesFacility){
  const coef=CALC_CONSTS.DIRECT_TRANSFER_COEF[method1];
  if(!coef||!fecesFacility) return null;
  const linkedPlant=_getPlantInfo(fecesFacility.linkedPlant);
  if(!linkedPlant) return{직접이송유량:0,방류부하량:_zero(),처리장:fecesFacility.linkedPlant||"(미연결)",unitBasin:""};
  const 직접이송유량=_r(분뇨발생유량*CALC_CONSTS.DIRECT_TRANSFER_RATIO);
  const 방류부하량={
    BOD:_r(직접이송유량*linkedPlant.efflBOD/1000),
    TN: _r(직접이송유량*(linkedPlant.efflTN||0)/1000),
    TP: _r(직접이송유량*linkedPlant.efflTP/1000),
  };
  return{직접이송유량,방류부하량,처리장:linkedPlant.name,unitBasin:linkedPlant.unitBasin||""};
}

function _calcDischargeLoad(오수발생유량,발생부하량,method1,method2,method3,isWaterBuffer,plantInfo,fecesFacility,분뇨발생유량){
  if(method1==="공공하수처리시설"&&plantInfo){
    const 방류유량비=plantInfo.efflFlowRatio??1.0;
    const 관거이송량=_r(오수발생유량*방류유량비);
    const 관거배출유량=_r(오수발생유량-관거이송량);
    const 방류부하량={BOD:_r(관거이송량*plantInfo.efflBOD/1000),TN:_r(관거이송량*(plantInfo.efflTN||0)/1000),TP:_r(관거이송량*plantInfo.efflTP/1000)};
    const 유실BOD=_r((plantInfo.leakRatioBOD||0)+(plantInfo.overflowRatioBOD||0)+(plantInfo.untreatRatioBOD||0));
    const 유실TN =_r((plantInfo.leakRatioTN ||0)+(plantInfo.overflowRatioTN ||0)+(plantInfo.untreatRatioTN ||0));
    const 유실TP =_r((plantInfo.leakRatioTP ||0)+(plantInfo.overflowRatioTP ||0)+(plantInfo.untreatRatioTP ||0));
    const 관거배출부하량={BOD:_r(발생부하량.BOD*유실BOD),TN:_r(발생부하량.TN*유실TN),TP:_r(발생부하량.TP*유실TP)};
    return{
      배출부하량:{BOD:_r(방류부하량.BOD+관거배출부하량.BOD),TN:_r(방류부하량.TN+관거배출부하량.TN),TP:_r(방류부하량.TP+관거배출부하량.TP)},
      방류부하량,관거배출부하량,관거이송량,관거배출유량,
      관거배출유량비_pct:_r((1-방류유량비)*100),
      관거유실율_pct:{BOD:_r(유실BOD*100),TN:_r(유실TN*100),TP:_r(유실TP*100)},
      처리장정보:{name:plantInfo.name,capacity:plantInfo.capacity,efflBOD:plantInfo.efflBOD,efflTN:plantInfo.efflTN,efflTP:plantInfo.efflTP,unitBasin:plantInfo.unitBasin||""},
      직접이송결과:null,
    };
  }
  if(method1==="개인하수처리시설"){
    const isLarge=(method3!=="50톤미만");
    const std={BOD:(isWaterBuffer||isLarge)?10:20,TN:isLarge?20:40,TP:isLarge?2:4};
    const 잡배수유량=_r(오수발생유량-(분뇨발생유량||0));
    const 개별배출부하량={BOD:_r(잡배수유량*std.BOD/1000),TN:_r(잡배수유량*std.TN/1000),TP:_r(잡배수유량*std.TP/1000)};
    const 직접이송결과=_calcDirectTransfer(분뇨발생유량||0,method1,fecesFacility);
    return{배출부하량:개별배출부하량,방류부하량:{...개별배출부하량},관거배출부하량:_zero(),관거이송량:잡배수유량,관거배출유량:0,관거배출유량비_pct:0,관거유실율_pct:{BOD:0,TN:0,TP:0},처리장정보:null,직접이송결과,개인처리기준:{grade:method2,capacity:method3,std,isWaterBuffer}};
  }
  if(method1==="정화조"){
    const R=CALC_CONSTS.FECES_LOAD_RATIO;
    const 잡배수발생부하량={BOD:_r((1-R.BOD)*발생부하량.BOD),TN:_r((1-R.TN)*발생부하량.TN),TP:_r((1-R.TP)*발생부하량.TP)};
    const 개별배출부하량={BOD:_r(잡배수발생부하량.BOD*(1-0.25)),TN:잡배수발생부하량.TN,TP:잡배수발생부하량.TP};
    const 직접이송결과=_calcDirectTransfer(분뇨발생유량||0,method1,fecesFacility);
    return{배출부하량:개별배출부하량,방류부하량:{...개별배출부하량},관거배출부하량:_zero(),관거이송량:_r(오수발생유량-(분뇨발생유량||0)),관거배출유량:0,관거배출유량비_pct:0,관거유실율_pct:{BOD:0,TN:0,TP:0},처리장정보:null,직접이송결과};
  }
  return{배출부하량:{...발생부하량},방류부하량:_zero(),관거배출부하량:_zero(),관거이송량:오수발생유량,관거배출유량:0,관거배출유량비_pct:0,관거유실율_pct:{BOD:0,TN:0,TP:0},처리장정보:null,직접이송결과:null};
}

// ── 가정인구 계산 (v5: 단순화) ───────────────────────────────
// 오수발생량 = 세대수 × 세대당인구수 × 급수원단위(200 또는 170) / 1000
// 급수원단위: window.isEupMyeon === true → 170 L/인/일, 그 외 → 200 L/인/일
function _calcHousehold(households, popUnit, urbanType, method1, method2, method3, isWaterBuffer, plantInfo, fecesFacility){
  if(!households||households<=0) return null;
  const ut=urbanType||"비시가화";
  const population=Math.ceil(households*popUnit);
  // ★ v5: 단순 급수원단위 적용 (200 or 170)
  const 급수원단위=window.isEupMyeon===true ? 170 : 200;
  const 오수발생유량=_r(population*급수원단위/1000);
  const 일평균급수량=오수발생유량; // 단순화: 오수=물사용량으로 동일 표기
  // 분뇨/잡배수는 기술지침 계수 유지 (발생부하량 산정용)
  const 분뇨발생유량=_r(population*CALC_CONSTS.FECES_FLOW_UNIT[ut]);
  const 잡배수발생유량=_r(오수발생유량-분뇨발생유량);
  const R=CALC_CONSTS.FECES_LOAD_RATIO;
  const loadUnit=CALC_CONSTS.HH_LOAD_UNIT[ut];
  const 발생부하량={BOD:_r(population*loadUnit.BOD/1000),TN:_r(population*loadUnit.TN/1000),TP:_r(population*loadUnit.TP/1000)};
  const 분뇨발생부하량={BOD:_r(R.BOD*발생부하량.BOD),TN:_r(R.TN*발생부하량.TN),TP:_r(R.TP*발생부하량.TP)};
  const 잡배수발생부하량={BOD:_r((1-R.BOD)*발생부하량.BOD),TN:_r((1-R.TN)*발생부하량.TN),TP:_r((1-R.TP)*발생부하량.TP)};
  const dr=_calcDischargeLoad(오수발생유량,발생부하량,method1,method2,method3,isWaterBuffer,plantInfo,fecesFacility,분뇨발생유량);
  return{population,급수원단위,일평균급수량,분뇨발생유량,잡배수발생유량,오수발생유량,발생부하량,분뇨발생부하량,잡배수발생부하량,...dr};
}

function _calcBusinessRows(buildings, urbanType, isWaterBuffer){
  const rows=[]; let 오수합계=0, 발생합계=_zero(), 배출합계=_zero();
  for(const bldg of buildings){
    const m1=bldg.method1||"공공하수처리시설";
    const m2=bldg.method2||"", m3=bldg.method3||"", m4=bldg.method4||"";
    const plantInfo=(m1==="공공하수처리시설")?_getPlantInfo(m2):null;
    const fecesFacility=(m1==="개인하수처리시설"||m1==="정화조")?_getFecesPlantInfo(m4):null;
    for(const floor of bldg.floors){
      for(const use of _allocateCommonArea(floor)){
        if(use.isNonSewage||!use.major||!use.mid||use.finalValue<=0) continue;
        const factors=_getFactors(use.major,use.mid,use.minor);
        if(!factors||!factors.sewage) continue;
        const 오수발생유량=_r(use.finalValue*factors.sewage/1000);
        if(오수발생유량<=0) continue;
        const flowDetail=_calcBizFlow(오수발생유량);
        const loadDetail=_calcBizLoad(오수발생유량,{BOD:factors.bod,TN:factors.tn,TP:factors.tp});
        const dr=_calcDischargeLoad(오수발생유량,loadDetail.발생부하량,m1,m2,m3,isWaterBuffer,plantInfo,fecesFacility,flowDetail.분뇨발생유량);
        rows.push({
          buildingNo:bldg.buildingNo,floorNo:floor.floorNo,
          major:use.major,mid:use.mid,minor:use.minor||"",
          unitType:use.unitType,unitText:use.unitText,
          전용면적:_pn(use.inputValue),공용배분:_r(use.commonAlloc||0),적용면적:_r(use.finalValue),
          오수발생원단위:factors.sewage,BOD농도:factors.bod,TN농도:factors.tn,TP농도:factors.tp,
          오수발생유량,...flowDetail,
          발생부하량:loadDetail.발생부하량,분뇨발생부하량:loadDetail.분뇨발생부하량,잡배수발생부하량:loadDetail.잡배수발생부하량,
          ...dr,
          sewageMethod1:m1,sewageMethod2:m2,sewageMethod3:m3,sewageMethod4:m4,
          plantName:plantInfo?.name||"",excludeReason:use.excludeReason||"",
        });
        오수합계=_r(오수합계+오수발생유량);
        발생합계=_add(발생합계,loadDetail.발생부하량);
        배출합계=_add(배출합계,dr.배출부하량);
      }
    }
  }
  return{rows,합계:{오수발생유량:오수합계,발생부하량:발생합계,배출부하량:배출합계}};
}

function _calcLifeSection(moduleState, urbanType, isWaterBuffer){
  const popUnit=_getPopUnit(document.getElementById("sidoSelect")?.value||"",document.getElementById("sigunSelect")?.value||"");

  // 가정인구 배열 처리 (v5: households 배열)
  const hhList = moduleState.households||[{count:moduleState.householdCount||"",method1:moduleState.householdMethod1||"공공하수처리시설",method2:moduleState.householdMethod2||"",method3:moduleState.householdMethod3||"",method4:moduleState.householdMethod4||""}];
  const hhResults = hhList.map(hh=>{
    const cnt=_pn(hh.count);
    if(!cnt||cnt<=0||!popUnit) return null;
    const m1=hh.method1||"공공하수처리시설", m2=hh.method2||"", m3=hh.method3||"", m4=hh.method4||"";
    const plantInfo=(m1==="공공하수처리시설")?_getPlantInfo(m2):null;
    const fecesFacility=(m1==="개인하수처리시설"||m1==="정화조")?_getFecesPlantInfo(m4):null;
    return _calcHousehold(cnt,popUnit,urbanType,m1,m2,m3,isWaterBuffer,plantInfo,fecesFacility);
  }).filter(Boolean);

  // 합산 (word-gen 하위호환: 첫 번째 결과를 가정인구로, 나머지는 합산)
  let hhCombined = null;
  if(hhResults.length===1){
    hhCombined = hhResults[0];
  } else if(hhResults.length>1){
    // 여러 가정인구 그룹을 합산한 가상 결과 생성
    hhCombined = hhResults.reduce((acc,r)=>{
      if(!acc) return r;
      return{
        population:_r(acc.population+r.population),
        급수원단위:acc.급수원단위, // 대표값
        일평균급수량:_r(acc.일평균급수량+r.일평균급수량),
        분뇨발생유량:_r(acc.분뇨발생유량+r.분뇨발생유량),
        잡배수발생유량:_r(acc.잡배수발생유량+r.잡배수발생유량),
        오수발생유량:_r(acc.오수발생유량+r.오수발생유량),
        발생부하량:_add(acc.발생부하량,r.발생부하량),
        배출부하량:_add(acc.배출부하량,r.배출부하량),
        분뇨발생부하량:_add(acc.분뇨발생부하량,r.분뇨발생부하량),
        잡배수발생부하량:_add(acc.잡배수발생부하량,r.잡배수발생부하량),
        // 처리장정보는 첫번째 것 사용
        처리장정보:acc.처리장정보||r.처리장정보,
        직접이송결과:acc.직접이송결과||r.직접이송결과,
        개인처리기준:acc.개인처리기준||r.개인처리기준,
        _groups:hhResults, // 상세 접근용
      };
    },null);
  }

  const bizResult=_calcBusinessRows(moduleState.buildings,urbanType,isWaterBuffer);
  const totalSewage=_r((hhCombined?.오수발생유량||0)+bizResult.합계.오수발생유량);
  const total발생=_add(hhCombined?.발생부하량||_zero(),bizResult.합계.발생부하량);
  const total배출=_add(hhCombined?.배출부하량||_zero(),bizResult.합계.배출부하량);
  return{가정인구:hhCombined,가정인구목록:hhResults,영업인구:bizResult,합계:{오수발생유량:totalSewage,발생부하량:total발생,배출부하량:total배출}};
}

function _calcLand(landObj){
  const rows=[]; let total=_zero();
  for(const[jmok,rawArea]of Object.entries(landObj)){
    const area=_pn(rawArea); if(area<=0) continue;
    const unit=CALC_CONSTS.LAND_UNIT[jmok]; if(!unit) continue;
    const 발생부하량={BOD:_r(unit.BOD*area/1e6),TN:_r(unit.TN*area/1e6),TP:_r(unit.TP*area/1e6)};
    rows.push({jmok,area,발생부하량,원단위:unit});
    total=_add(total,발생부하량);
  }
  return{rows,합계:{발생부하량:total,배출부하량:total}};
}

function _calcByUnitBasin(lifeAfter,lifeBefore,landAfter,landBefore,projectBasin){
  const result={};
  const addTo=(basin,type,val)=>{
    if(!basin||!val) return;
    if(!result[basin]) result[basin]={};
    if(!result[basin][type]) result[basin][type]={BOD:0,TN:0,TP:0};
    result[basin][type]=_add(result[basin][type],val);
  };
  const 토지증감={BOD:_r(landAfter.합계.배출부하량.BOD-landBefore.합계.배출부하량.BOD),TN:_r(landAfter.합계.배출부하량.TN-landBefore.합계.배출부하량.TN),TP:_r(landAfter.합계.배출부하량.TP-landBefore.합계.배출부하량.TP)};
  addTo(projectBasin,"비점오염",토지증감);
  function extractBasinLoads(lifeData,sign){
    const hh=lifeData?.가정인구;
    if(hh){
      if(hh.처리장정보?.unitBasin){addTo(hh.처리장정보.unitBasin,"점오염",{BOD:_r(hh.방류부하량.BOD*sign),TN:_r((hh.방류부하량.TN||0)*sign),TP:_r(hh.방류부하량.TP*sign)});addTo(projectBasin,"점오염",{BOD:_r(hh.관거배출부하량.BOD*sign),TN:_r((hh.관거배출부하량.TN||0)*sign),TP:_r(hh.관거배출부하량.TP*sign)});}
      else{addTo(projectBasin,"점오염",{BOD:_r(hh.배출부하량.BOD*sign),TN:_r((hh.배출부하량.TN||0)*sign),TP:_r(hh.배출부하량.TP*sign)});}
      if(hh.직접이송결과?.unitBasin){addTo(hh.직접이송결과.unitBasin,"점오염",{BOD:_r(hh.직접이송결과.방류부하량.BOD*sign),TN:0,TP:_r(hh.직접이송결과.방류부하량.TP*sign)});}
    }
    (lifeData?.영업인구?.rows||[]).forEach(r=>{
      if(r.처리장정보?.unitBasin){addTo(r.처리장정보.unitBasin,"점오염",{BOD:_r(r.방류부하량.BOD*sign),TN:_r((r.방류부하량.TN||0)*sign),TP:_r(r.방류부하량.TP*sign)});addTo(projectBasin,"점오염",{BOD:_r(r.관거배출부하량.BOD*sign),TN:_r((r.관거배출부하량.TN||0)*sign),TP:_r(r.관거배출부하량.TP*sign)});}
      else{addTo(projectBasin,"점오염",{BOD:_r(r.배출부하량.BOD*sign),TN:_r((r.배출부하량.TN||0)*sign),TP:_r(r.배출부하량.TP*sign)});}
      if(r.직접이송결과?.unitBasin){addTo(r.직접이송결과.unitBasin,"점오염",{BOD:_r(r.직접이송결과.방류부하량.BOD*sign),TN:0,TP:_r(r.직접이송결과.방류부하량.TP*sign)});}
    });
  }
  extractBasinLoads(lifeAfter,1);
  extractBasinLoads(lifeBefore,-1);
  for(const basin of Object.keys(result)){
    for(const type of Object.keys(result[basin])){
      let {BOD,TN,TP}=result[basin][type];
      BOD=_r(BOD);TN=_r(TN);TP=_r(TP);
      if(Math.abs(BOD)<0.02)BOD=0;
      if(Math.abs(TP)<0.002)TP=0;
      result[basin][type]={BOD,TN,TP};
    }
  }
  return result;
}

function _getFactors(major,mid,minor){if(typeof LIFE_FACTOR_MAP==="undefined")return null;return LIFE_FACTOR_MAP[`${major}|${mid}|${minor||""}`]||LIFE_FACTOR_MAP[`${major}|${mid}|`]||null;}
function _getPlantInfo(name){if(!name||typeof SEWAGE_PLANT_DB==="undefined")return null;return SEWAGE_PLANT_DB.find(p=>p.name===name||p.code===name)||null;}
function _getFecesPlantInfo(name){if(!name||typeof FECES_PLANT_DB==="undefined")return null;return FECES_PLANT_DB.find(p=>p.name===name)||null;}
function _getPopUnit(sido,sigun){if(typeof POPULATION_UNIT_DB==="undefined"||!sigun)return 2.63;const found=POPULATION_UNIT_DB.find(p=>p.sigun===sigun||(p.sido===sido&&p.sigun===sigun));return found?.unit||2.63;}

function _collectParams(){
  const get=(id,fb="")=>document.getElementById(id)?.value||fb;
  const zoneMain=get("zoneMainSelect");
  const urbanType=CALC_CONSTS.URBAN_ZONES.includes(zoneMain)?"시가화":"비시가화";
  const isWaterBuffer=document.querySelector('input[name="env_river"][value="해당"]')?.checked||false;
  const sido=get("sidoSelect"),sigun=get("sigunSelect"),unitBasin=get("unitBasinSelect");
  return{sido,sigun,urbanType,isWaterBuffer,zoneMain,unitBasin};
}

function runCalc(){
  const p=_collectParams();
  const lifeBefore_result=_calcLifeSection(window.lifeBefore?.state??{householdCount:"",householdMethod1:"개인하수처리시설",householdMethod2:"",householdMethod3:"",householdMethod4:"",buildings:[]},p.urbanType,p.isWaterBuffer);
  const lifeAfter_result=_calcLifeSection(window.lifeAfter?.state??{householdCount:"",householdMethod1:"공공하수처리시설",householdMethod2:"",householdMethod3:"",householdMethod4:"",buildings:[]},p.urbanType,p.isWaterBuffer);
  const lifeDelta={점오염:{BOD:_r(lifeAfter_result.합계.배출부하량.BOD-lifeBefore_result.합계.배출부하량.BOD),TN:_r(lifeAfter_result.합계.배출부하량.TN-lifeBefore_result.합계.배출부하량.TN),TP:_r(lifeAfter_result.합계.배출부하량.TP-lifeBefore_result.합계.배출부하량.TP)},비점오염:_zero()};
  const landBefore_result=_calcLand(window.landState?.before??{});
  const landAfter_result=_calcLand(window.landState?.after??{});
  const landDelta={BOD:_r(landAfter_result.합계.배출부하량.BOD-landBefore_result.합계.배출부하량.BOD),TN:_r(landAfter_result.합계.배출부하량.TN-landBefore_result.합계.배출부하량.TN),TP:_r(landAfter_result.합계.배출부하량.TP-landBefore_result.합계.배출부하량.TP)};
  const 단위유역별배출=_calcByUnitBasin(lifeAfter_result,lifeBefore_result,landAfter_result,landBefore_result,p.unitBasin);
  const result={
    params:p,
    생활계:{사업전:lifeBefore_result,사업후:lifeAfter_result,증감:lifeDelta},
    토지계:{사업전:landBefore_result,사업후:landAfter_result,증감:landDelta},
    최종배출부하량:{점오염:lifeDelta.점오염,비점오염:{BOD:_r(lifeDelta.비점오염.BOD+landDelta.BOD),TN:_r(lifeDelta.비점오염.TN+landDelta.TN),TP:_r(lifeDelta.비점오염.TP+landDelta.TP)}},
    단위유역별배출,
    계산일시:new Date().toLocaleString("ko-KR"),
  };
  window.LAST_CALC_RESULT=result;
  console.log("[calc.js v5] 계산 완료:",result);
  return result;
}

const CalcFormat={load:v=>typeof v==="number"?v.toFixed(4):"-",flow:v=>typeof v==="number"?v.toFixed(4):"-",pct:v=>typeof v==="number"?v.toFixed(4):"-",int:v=>typeof v==="number"?Math.round(v).toLocaleString("ko-KR"):"-",area:v=>typeof v==="number"?v.toFixed(2):"-"};
window.runCalc=runCalc;
window.CalcFormat=CalcFormat;
window.CALC_CONSTS=CALC_CONSTS;
