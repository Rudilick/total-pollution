// ================================================================
// db-loader.js  v5
// [변경]
//   시트3(인구수): row[0]=광역, row[1]=기초 (A열 빈칸 보정)
//   시트5(분뇨처리장): FECES_PLANT_DB
//   시트6(단위유역):   UNIT_BASIN_LIST
//   마지막시트(시군구동읍면리): DONG_RI_DB
// ================================================================

const DB_EXCEL_URL = (typeof CONFIG !== "undefined") ? CONFIG.DB_EXCEL_URL : "";

let LIFE_FACTOR_MAP    = {};
let SEWAGE_PLANT_DB    = [];
let POPULATION_UNIT_DB = [];
let SIDO_SIGUN_LIST    = [];
let LIFE_USE_DB        = {};
let LIFE_USE_FLAT_INDEX = []; // 건축물 용도 자동완성용: 모든 대/중/소분류 노드를 평탄화한 검색 인덱스
let FECES_PLANT_DB     = [];   // [{ sigun, name, linkedPlant }]
let UNIT_BASIN_LIST    = [];   // [{ sigun, basins:[] }]
let DONG_RI_DB         = {};   // { sido: { sigun: { dong: [리,...] } } }

async function loadExcelDB(url) {
  const statusEl      = document.getElementById("lifeExcelStatus");
  const loadingBanner = document.getElementById("db-loading-banner");
  try {
    if (loadingBanner) loadingBanner.style.display = "flex";
    if (statusEl)      statusEl.textContent = "원단위 DB 로딩 중...";
    const bustUrl = url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
    const resp = await fetch(bustUrl, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    applyExcelBuffer(await resp.arrayBuffer(), "(GitHub 자동 로드)");
    if (loadingBanner) loadingBanner.style.display = "none";
  } catch (err) {
    console.warn("[원단위 DB] GitHub 로드 실패, 로컬 폴백 시도:", err);
    const localUrl = (typeof CONFIG !== "undefined" && CONFIG.DB_EXCEL_URL_LOCAL)
      ? CONFIG.DB_EXCEL_URL_LOCAL : "./data.xlsx";
    try {
      const resp2 = await fetch(localUrl, { cache: "no-cache" });
      if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
      applyExcelBuffer(await resp2.arrayBuffer(), "(로컬 폴백)");
      if (loadingBanner) loadingBanner.style.display = "none";
    } catch (err2) {
      if (loadingBanner) {
        loadingBanner.innerHTML = `<span>⚠️ DB 로드 실패. 수동 업로드를 이용하세요. (${err.message} / ${err2.message})</span>`;
        loadingBanner.style.background  = "#fef3c7";
        loadingBanner.style.borderColor = "#f59e0b";
      }
      if (statusEl) statusEl.textContent = "DB 로드 실패 - 수동 업로드 필요";
    }
  }
}

function applyExcelBuffer(buf, sourceLabel) {
  const wb       = XLSX.read(buf, { type: "array" });
  const statusEl = document.getElementById("lifeExcelStatus");

  // ── 시트1: 건축물용도별 오수발생량 및 부하량 원단위 ──────────
  const sn1  = wb.SheetNames.find(n => n.includes("원단위") && n.includes("용도")) || wb.SheetNames[0];
  const aoa1 = XLSX.utils.sheet_to_json(wb.Sheets[sn1], { header: 1, defval: "" });
  const lifeRows = [];
  LIFE_FACTOR_MAP = {};
  for (let r = 1; r < aoa1.length; r++) {
    const row = aoa1[r] || [];
    const major = String(row[1]??"").trim(), mid = String(row[2]??"").trim();
    let minor = String(row[3]??"").trim();
    const unit = String(row[4]??"").trim();
    const comment = String(row[6]??"").trim();
    const sewage=parseFloat(row[7])||0, bod=parseFloat(row[8])||0;
    const tn=parseFloat(row[9])||0, tp=parseFloat(row[10])||0;
    // 열11: V 표시 시 buildingUse=중분류, buildingNote=소분류
    const vFlag=String(row[11]??"").trim().toUpperCase()==="V";
    const buildingUse=vFlag?mid:"";
    const buildingNote=vFlag?minor:"";
    if (["-","–","—"].includes(minor.replace(/\s/g,""))) minor="";
    if (!major||!mid) continue;
    lifeRows.push([major,mid,minor,unit,vFlag]);
    LIFE_FACTOR_MAP[`${major}|${mid}|${minor}`]={sewage,bod,tn,tp,unit,buildingUse,buildingNote,comment};
  }
  LIFE_USE_DB = _buildLifeDB(lifeRows);
  LIFE_USE_FLAT_INDEX = _buildLifeUseFlatIndex(LIFE_USE_DB);

  // ── 시트2: 하수처리장 ─────────────────────────────────────
  // 열22: 단위유역 (새로 추가된 열)
  const sn2 = wb.SheetNames.find(n => n.includes("하수처리")) || wb.SheetNames[1];
  if (sn2 && wb.Sheets[sn2]) {
    const aoa2 = XLSX.utils.sheet_to_json(wb.Sheets[sn2], { header:1, defval:"" });
    SEWAGE_PLANT_DB = [];
    const pf=(row,i)=>parseFloat(row[i])||0;
    for (let r=1; r<aoa2.length; r++) {
      const row=aoa2[r]||[]; if (!row[3]) continue;
      SEWAGE_PLANT_DB.push({
        code:String(row[0]||"").trim(), sido:String(row[1]||"").trim(),
        sigun:String(row[2]||"").trim(), name:String(row[3]||"").trim(),
        capacity:pf(row,4),
        leakRatioFlow:pf(row,5),  leakRatioBOD:pf(row,6),  leakRatioTN:pf(row,7),  leakRatioTP:pf(row,8),
        overflowRatioFlow:pf(row,9), overflowRatioBOD:pf(row,10), overflowRatioTN:pf(row,11), overflowRatioTP:pf(row,12),
        untreatRatioFlow:pf(row,13), untreatRatioBOD:pf(row,14), untreatRatioTN:pf(row,15), untreatRatioTP:pf(row,16),
        efflBOD:pf(row,17), efflTN:pf(row,18), efflTP:pf(row,19),
        efflFlowRatio:pf(row,20)||1.0,
        unitBasin:String(row[21]||"").trim(),   // 단위유역
      });
    }
  }

  // ── 시트3: 인구수 원단위 ─────────────────────────────────
  // A열 전체 빈칸 → XLSX.js 인덱스: 0=광역(B열), 1=기초(C열), 2=인구수(D열)
  const sn3 = wb.SheetNames.find(n => n.includes("인구")) || wb.SheetNames[2];
  if (sn3 && wb.Sheets[sn3]) {
    const aoa3 = XLSX.utils.sheet_to_json(wb.Sheets[sn3], { header:1, defval:"" });
    POPULATION_UNIT_DB = [];
    const sidoMap = new Map();
    for (let r=1; r<aoa3.length; r++) {
      const row=aoa3[r]||[];
      const sido=String(row[0]||"").trim();
      const sigun=String(row[1]||"").trim();
      const unit=parseFloat(row[2])||0;
      if (!sigun) continue;
      POPULATION_UNIT_DB.push({sido,sigun,unit});
      if (sido) {
        if (!sidoMap.has(sido)) sidoMap.set(sido,[]);
        const arr=sidoMap.get(sido);
        if (!arr.includes(sigun)) arr.push(sigun);
      }
    }
    SIDO_SIGUN_LIST = Array.from(sidoMap.entries()).map(([sido,siguns])=>({sido,siguns}));
  }

  // ── 시트5: 분뇨처리장 ─────────────────────────────────────
  // 열: 0시군구, 1분뇨처리시설명, 2연계처리 하수처리시설
  const sn5 = wb.SheetNames.find(n => n.includes("분뇨")) || null;
  if (sn5 && wb.Sheets[sn5]) {
    const aoa5 = XLSX.utils.sheet_to_json(wb.Sheets[sn5], { header:1, defval:"" });
    FECES_PLANT_DB = [];
    for (let r=1; r<aoa5.length; r++) {
      const row=aoa5[r]||[];
      const sigun=String(row[0]||"").trim();
      const name=String(row[1]||"").trim();
      const linkedPlant=String(row[2]||"").trim();
      if (!sigun||!name) continue;
      FECES_PLANT_DB.push({sigun,name,linkedPlant});
    }
  }

  // ── 시트6: 단위유역 ──────────────────────────────────────
  // 열: 0기초자치단체, 1단위유역, 2특대유역
  // 특대유역 있으면 특대유역을 최종 선택지, 없으면 단위유역, '-'는 제외
  const sn6 = wb.SheetNames.find(n => n.includes("단위유역")) || null;
  if (sn6 && wb.Sheets[sn6]) {
    const aoa6 = XLSX.utils.sheet_to_json(wb.Sheets[sn6], { header:1, defval:"" });
    const basinMap = new Map();
    for (let r=1; r<aoa6.length; r++) {
      const row=aoa6[r]||[];
      const sigun=String(row[0]||"").trim();
      const basin=String(row[1]||"").trim();
      const sub=String(row[2]||"").trim();
      if (!sigun||!basin||basin==="-") continue;
      if (!basinMap.has(sigun)) basinMap.set(sigun,new Set());
      basinMap.get(sigun).add((sub&&sub!=="-") ? sub : basin);
    }
    UNIT_BASIN_LIST = Array.from(basinMap.entries()).map(([sigun,set])=>({
      sigun, basins:Array.from(set)
    }));
  }

  // ── 마지막 시트: 시군구동읍면리 ─────────────────────────────
  // 열: 0광역자치단체, 1기초자치단체, 2읍면동, 3리(없으면 빈 문자)
  // 헤더 없음 - 첫 행부터 데이터
  // 이름 매칭이 불안정하므로 항상 마지막 시트를 참조
  const snAddr = wb.SheetNames[wb.SheetNames.length - 1];
  if (snAddr && wb.Sheets[snAddr]) {
    const aoaAddr = XLSX.utils.sheet_to_json(wb.Sheets[snAddr], { header:1, defval:"" });
    DONG_RI_DB = {};
    for (let r = 0; r < aoaAddr.length; r++) {
      const row = aoaAddr[r] || [];
      const sido  = String(row[0]||"").trim();
      const sigun = String(row[1]||"").trim();
      const dong  = String(row[2]||"").trim();
      const ri    = String(row[3]||"").trim();
      if (!sido || !sigun || !dong) continue;
      if (!DONG_RI_DB[sido])               DONG_RI_DB[sido] = {};
      if (!DONG_RI_DB[sido][sigun])        DONG_RI_DB[sido][sigun] = {};
      if (!DONG_RI_DB[sido][sigun][dong])  DONG_RI_DB[sido][sigun][dong] = [];
      if (ri && !DONG_RI_DB[sido][sigun][dong].includes(ri))
        DONG_RI_DB[sido][sigun][dong].push(ri);
    }
  }

  // UI 갱신
  if (statusEl) {
    const ts=new Date().toLocaleString("ko-KR",{hour12:false});
    statusEl.textContent=`DB 적용 완료 ${sourceLabel} | 원단위 ${Object.keys(LIFE_FACTOR_MAP).length}건 | 처리장 ${SEWAGE_PLANT_DB.length}개소 | ${ts}`;
  }
  if (typeof lifeBefore!=="undefined"){ lifeBefore.render(); lifeAfter.render(); }
  if (typeof refreshBeforeProofVisibility==="function") refreshBeforeProofVisibility();
  if (typeof fillSidoSelect==="function")   fillSidoSelect();
  if (typeof fillPlantSelects==="function") fillPlantSelects();
}

function getFactors(major,mid,minor){
  return LIFE_FACTOR_MAP[`${major}|${mid}|${minor??""}`]||LIFE_FACTOR_MAP[`${major}|${mid}|`]||null;
}
function inferUnit(unitRaw){
  const u=(unitRaw||"").toString().trim(); if(!u) return{unitType:"",unitText:""};
  const s=u.replace(/\s/g,"").toLowerCase();
  if(u.includes("㎡")||s.includes("m2")) return{unitType:"area",unitText:u};
  if(u.includes("인")||u.includes("명")) return{unitType:"person",unitText:u};
  return{unitType:"custom",unitText:u};
}
function _buildLifeDB(rows){
  const db={};
  for(const it of(rows||[])){
    const major=String(it[0]??"").trim(), mid=String(it[1]??"").trim();
    let minor=String(it[2]??"").trim(); const unit=String(it[3]??"").trim();
    const vFlag=!!it[4];
    if(["-","–","—"].includes(minor.replace(/\s/g,""))) minor="";
    if(!major||!mid) continue;
    const uinfo=inferUnit(unit);
    if(!db[major]) db[major]={};
    if(!db[major][mid]) db[major][mid]={terminal:true,unitType:uinfo.unitType,unitText:uinfo.unitText,minors:[]};
    const node=db[major][mid];
    if(minor){
      if(node.terminal){node.terminal=false;node.unitType="";node.unitText="";node.minors=[];}
      if(!node.minors.some(m=>m.name===minor)) node.minors.push({name:minor,unitType:uinfo.unitType,unitText:uinfo.unitText,vFlag});
    } else { if(node.terminal){node.unitType=uinfo.unitType;node.unitText=uinfo.unitText;} }
  }
  // 소분류가 실제 용도가 아니라 "조건"(예: 일반음식점 > 중식/한식 등, 병원 > 급식시설 있음/없음)인
  // 경우를 판별한다: 한 중분류의 소분류가 전부 V표시(엑셀 L열)면 조건형으로 보고, 중분류 자체를
  // 검색에서 바로 선택 가능한 말단으로 승격시키고, 소분류 목록은 별도 "조건" 드롭박스용으로 옮긴다.
  for(const major of Object.keys(db)){
    for(const mid of Object.keys(db[major])){
      const node=db[major][mid];
      if(node.terminal||!node.minors.length) continue;
      if(node.minors.every(m=>m.vFlag)){
        node.conditions=node.minors.map(({name,unitType,unitText})=>({name,unitType,unitText}));
        node.terminal=true;
        node.unitType=node.conditions[0]?.unitType||"";
        node.unitText=node.conditions[0]?.unitText||"";
        node.minors=[];
      }
    }
  }
  return db;
}
// major/mid가 조건형(위 참고)이면 조건 이름 배열을, 아니면 null을 반환한다.
function getLifeUseConditions(major,mid){
  const node=(LIFE_USE_DB||{})[major]?.[mid];
  return (node&&node.conditions&&node.conditions.length) ? node.conditions.map(c=>c.name) : null;
}
// ── 건축물 용도 자동완성: 평탄화 인덱스 + 자식 조회 ───────────
// 트리의 모든 노드(대분류/중분류/소분류)를 한 줄짜리 항목으로 펴서, 검색창에 뭘 치든
// 깊이와 무관하게 바로 찾을 수 있게 한다. 분기(branch)는 클릭해도 끝나지 않고 하위목록을
// 펼치기만 하며, 말단(leaf)만 최종 선택으로 끝난다.
function _buildLifeUseFlatIndex(db){
  const flat=[];
  for(const major of Object.keys(db)){
    flat.push({path:[major],label:major,fullLabel:major,isLeaf:false});
    for(const mid of Object.keys(db[major])){
      const node=db[major][mid];
      const midPath=[major,mid], midFull=`${major} > ${mid}`;
      if(node.terminal){
        flat.push({path:midPath,label:mid,fullLabel:midFull,isLeaf:true,unitType:node.unitType,unitText:node.unitText});
      } else {
        flat.push({path:midPath,label:mid,fullLabel:midFull,isLeaf:false});
        (node.minors||[]).forEach(m=>{
          flat.push({path:[major,mid,m.name],label:m.name,fullLabel:`${midFull} > ${m.name}`,isLeaf:true,unitType:m.unitType,unitText:m.unitText});
        });
      }
    }
  }
  return flat;
}
// path=[] → 최상위(대분류) 목록, path=[major] → 그 중분류 목록, path=[major,mid](비말단) → 소분류 목록
function getLifeUseChildren(path){
  path=path||[];
  if(path.length===0){
    return Object.keys(LIFE_USE_DB||{}).map(major=>({path:[major],label:major,isLeaf:false}));
  }
  if(path.length===1){
    const major=path[0], midMap=(LIFE_USE_DB||{})[major]||{};
    return Object.keys(midMap).map(mid=>{
      const node=midMap[mid];
      return node.terminal
        ?{path:[major,mid],label:mid,isLeaf:true,unitType:node.unitType,unitText:node.unitText}
        :{path:[major,mid],label:mid,isLeaf:false};
    });
  }
  if(path.length===2){
    const [major,mid]=path, node=(LIFE_USE_DB||{})[major]?.[mid];
    if(!node||node.terminal) return [];
    return (node.minors||[]).map(m=>({path:[major,mid,m.name],label:m.name,isLeaf:true,unitType:m.unitType,unitText:m.unitText}));
  }
  return [];
}
// 전체 평탄화 인덱스에서 부분일치 검색 (대소문자 무시, 공백 제거 비교)
function searchLifeUse(query,limit){
  limit=limit||15;
  const q=String(query||"").trim().toLowerCase().replace(/\s/g,"");
  if(!q) return [];
  return (LIFE_USE_FLAT_INDEX||[])
    .filter(it=>it.fullLabel.toLowerCase().replace(/\s/g,"").includes(q))
    .slice(0,limit);
}
window.getLifeUseChildren=getLifeUseChildren;
window.searchLifeUse=searchLifeUse;
window.getLifeUseConditions=getLifeUseConditions;

async function loadLifeExcelFile(file){ applyExcelBuffer(await file.arrayBuffer(),`(수동: ${file.name})`); }
function resetLifeUseDB(){ loadExcelDB(DB_EXCEL_URL); }
function bindLifeExcelUpload(){
  const input=document.getElementById("lifeExcel"); if(!input) return;
  input.addEventListener("change",async()=>{
    const f=input.files?.[0]; if(!f) return;
    try{ await loadLifeExcelFile(f); }catch(err){ alert("엑셀 적용 실패: "+(err?.message||err)); }
    finally{ input.value=""; }
  });
}
