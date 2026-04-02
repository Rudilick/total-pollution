// ================================================================
// ui-basic.js  v3
// [변경]
//   sido/sigun 드롭박스 추가 (인구수 원단위 시트 파싱)
//   계산파라미터 관련 코드 제거
//   DOMContentLoaded 단일 진입점
// ================================================================

// ── 탭 ──────────────────────────────────────────────────────
(function initTabs(){
  const btns   = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll(".tabPanel"));
  function activate(id){ btns.forEach(b=>b.classList.toggle("active",b.dataset.tab===id)); panels.forEach(p=>p.classList.toggle("active",p.id===id)); window.scrollTo({top:0,behavior:"smooth"}); }
  btns.forEach(b=>b.addEventListener("click",()=>activate(b.dataset.tab)));
})();

// ── 용도지역 데이터 ──────────────────────────────────────────
const zoneMap = {
  "주거지역":      ["전용주거지역","일반주거지역","준주거지역"],
  "상업지역":      ["중심상업지역","일반상업지역","근린상업지역","유통상업지역"],
  "공업지역":      ["전용공업지역","일반공업지역","준공업지역"],
  "녹지지역":      ["보전녹지지역","생산녹지지역","자연녹지지역"],
  "관리지역":      ["계획관리지역","생산관리지역","보전관리지역"],
  "농림지역":      [],   // 세부 없음
  "자연보전지역":   ["자연보전지역"],
};

const bizTypes = [
  "「국토의 계획 및 이용에 관한 법률」제30조에 따른 관계기관 협의사업",
  "「농어촌정비법」에 따른 농어촌생활환경정비사업",
  "「건축법」제2조에 따른 공동주택을 30세대 이상 건축하는 사업",
  "　30세대 이상의 주택과 주택외의 시설물을 동일건축물로 건축하는 사업",
  "「수도권정비계획법 시행령」제3조제4호 업무용·판매용·복합 건축물을 건축하는 사업",
  "「환경영향평가법」제2조제4호에 따른 환경영향평가 등의 대상사업",
  "　특대유역에서 「하수도법」제2조제1호에 따른 하수를 배출하는 건축물 설치 사업",
];

function pad2(n){ return String(n).padStart(2,"0"); }

// ── 년월 셀렉트 ─────────────────────────────────────────────
function fillYearMonthSelects(){
  const now=new Date(), thisYear=now.getFullYear(), thisMonth=now.getMonth()+1;
  const yearSel=document.getElementById("yearSelect");
  const monthSel=document.getElementById("monthSelect");
  const startYearSel=document.getElementById("startYearSelect");
  const completeYearSel=document.getElementById("completeYearSelect");
  if(!yearSel||!monthSel) return;
  const startYear=thisYear-10, endYear=thisYear+10;
  yearSel.innerHTML="";
  for(let y=endYear;y>=startYear;y--){ const o=document.createElement("option"); o.value=String(y); o.textContent=`${y}년`; if(y===thisYear)o.selected=true; yearSel.appendChild(o); }
  monthSel.innerHTML="";
  for(let m=1;m<=12;m++){ const o=document.createElement("option"); o.value=pad2(m); o.textContent=`${m}월`; if(m===thisMonth)o.selected=true; monthSel.appendChild(o); }
  [startYearSel,completeYearSel].forEach(sel=>{ if(!sel)return; sel.innerHTML=""; for(let y=startYear;y<=endYear;y++){ const o=document.createElement("option"); o.value=String(y); o.textContent=`${y}년`; if(y===thisYear)o.selected=true; sel.appendChild(o); } });
}

// ── 용도지역 셀렉트 ─────────────────────────────────────────
function fillZoneSelects(){
  const mainSel=document.getElementById("zoneMainSelect");
  const subSel=document.getElementById("zoneSubSelect");
  if(!mainSel||!subSel) return;
  mainSel.innerHTML="";
  Object.keys(zoneMap).forEach((k,idx)=>{ const o=document.createElement("option"); o.value=k; o.textContent=k; if(idx===0)o.selected=true; mainSel.appendChild(o); });
  function refreshSub(){
    const subs=zoneMap[mainSel.value]||[];
    subSel.innerHTML="";
    if(subs.length===0){ const o=document.createElement("option"); o.value=""; o.textContent="(해당없음)"; subSel.appendChild(o); return; }
    subs.forEach((s,idx)=>{ const o=document.createElement("option"); o.value=s; o.textContent=s; if(idx===0)o.selected=true; subSel.appendChild(o); });
  }
  mainSel.addEventListener("change", refreshSub);
  refreshSub();
}

// ── 사업종류 셀렉트 ─────────────────────────────────────────
function fillBizTypeSelect(){
  const sel=document.getElementById("bizTypeSelect"); if(!sel) return;
  sel.innerHTML="";
  bizTypes.forEach((t,idx)=>{ const o=document.createElement("option"); o.value=t; o.textContent=t; if(idx===0)o.selected=true; sel.appendChild(o); });
}

// ── 광역/기초 드롭박스 ──────────────────────────────────────
function fillSidoSelect(){
  const sidoSel=document.getElementById("sidoSelect"); if(!sidoSel) return;
  const list=typeof SIDO_SIGUN_LIST!=="undefined" ? SIDO_SIGUN_LIST : [];
  const cur=sidoSel.value;
  sidoSel.innerHTML=`<option value="" disabled selected>광역자치단체</option>`;
  list.forEach(({sido})=>{ const o=document.createElement("option"); o.value=sido; o.textContent=sido; sidoSel.appendChild(o); });
  if(cur) sidoSel.value=cur;
  _refreshSigunSelect();
}

function _refreshSigunSelect(){
  const sidoSel=document.getElementById("sidoSelect");
  const sigunSel=document.getElementById("sigunSelect");
  if(!sigunSel) return;
  const sido=sidoSel?.value||"";
  const list=typeof SIDO_SIGUN_LIST!=="undefined" ? SIDO_SIGUN_LIST : [];
  const entry=list.find(e=>e.sido===sido);
  const siguns=entry?.siguns||[];
  sigunSel.innerHTML=`<option value="" disabled selected>기초자치단체</option>`;
  siguns.forEach(sg=>{ const o=document.createElement("option"); o.value=sg; o.textContent=sg; sigunSel.appendChild(o); });
}

function onSidoChange(){
  _refreshSigunSelect();
  // 기초자치단체 초기화 시 popUnit도 초기화
  if(typeof refreshLifeModulePlants==="function") refreshLifeModulePlants();
}

function onSigunChange(){
  // popUnit 자동 조회는 calc.js에서 처리
  // 처리장 목록 갱신
  if(typeof refreshLifeModulePlants==="function") refreshLifeModulePlants();
}

window.onSidoChange  = onSidoChange;
window.onSigunChange = onSigunChange;

// ── 처리장 드롭박스 (기타 용도) ─────────────────────────────
function fillPlantSelects(){ /* life-module.js에서 직접 관리 */ }
window.fillPlantSelects = fillPlantSelects;

// ── 계산 실행 ────────────────────────────────────────────────
function runAndGenerate(){
  if(typeof runCalc!=="function"){ alert("calc.js 로드 오류"); return; }
  const result=runCalc(); _showCalcSummary(result);
  if(typeof generateDoc==="function") generateDoc(result);
}
function runCalcOnly(){
  if(typeof runCalc!=="function"){ alert("calc.js 로드 오류"); return; }
  const result=runCalc(); _showCalcSummary(result);
}

function _showCalcSummary(result){
  const el=document.getElementById("calc-result-summary"); if(!el||!result) return;
  const f=n=>typeof n==="number"?n.toFixed(4):"-";
  const d=result.최종배출부하량;
  const ls=result.생활계.사업후.합계;
  const lb=result.생활계.사업전.합계;
  const ts=result.토지계;
  const ut=result.params?.urbanType||"-";

  el.style.display="block";
  el.innerHTML=`
    <strong>✅ 계산 완료 (${result.계산일시})</strong>
    <span style="margin-left:12px;font-size:12px;color:#6b7280;">용도지역: ${result.params?.zoneMain||"-"} → <b>${ut}</b> 적용</span>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;">
      <tr style="background:#dbeafe;"><th style="padding:4px 8px;text-align:left;border:1px solid #93c5fd;">구분</th><th style="border:1px solid #93c5fd;padding:4px 8px;">발생BOD</th><th style="border:1px solid #93c5fd;padding:4px 8px;">배출BOD</th><th style="border:1px solid #93c5fd;padding:4px 8px;">발생T-P</th><th style="border:1px solid #93c5fd;padding:4px 8px;">배출T-P</th></tr>
      <tr><td style="padding:4px 8px;border:1px solid #bfdbfe;">생활계 사업전</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(lb.발생부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(lb.배출부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(lb.발생부하량?.TP)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(lb.배출부하량?.TP)}</td></tr>
      <tr><td style="padding:4px 8px;border:1px solid #bfdbfe;">생활계 사업후</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ls.발생부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ls.배출부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ls.발생부하량?.TP)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ls.배출부하량?.TP)}</td></tr>
      <tr><td style="padding:4px 8px;border:1px solid #bfdbfe;">토지계 사업전</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업전.합계.발생부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업전.합계.배출부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업전.합계.발생부하량?.TP)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업전.합계.배출부하량?.TP)}</td></tr>
      <tr><td style="padding:4px 8px;border:1px solid #bfdbfe;">토지계 사업후</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업후.합계.발생부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업후.합계.배출부하량?.BOD)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업후.합계.발생부하량?.TP)}</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;">${f(ts.사업후.합계.배출부하량?.TP)}</td></tr>
      <tr style="background:#fef9c3;"><td style="padding:4px 8px;border:1px solid #fde047;font-weight:bold;">점오염 증가량</td><td style="text-align:center;border:1px solid #fde047;padding:4px 8px;font-weight:bold;" colspan="2">${f(d.점오염?.BOD)} kg/일</td><td style="text-align:center;border:1px solid #fde047;padding:4px 8px;font-weight:bold;" colspan="2">${f(d.점오염?.TP)} kg/일</td></tr>
      <tr><td style="padding:4px 8px;border:1px solid #bfdbfe;">비점오염 증가량</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;" colspan="2">${f(d.비점오염?.BOD)} kg/일</td><td style="text-align:center;border:1px solid #bfdbfe;padding:4px 8px;" colspan="2">${f(d.비점오염?.TP)} kg/일</td></tr>
    </table>`;
}

window.runAndGenerate = runAndGenerate;
window.runCalcOnly    = runCalcOnly;
window.fillSidoSelect = fillSidoSelect;

// ── DOMContentLoaded 단일 진입점 ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fillYearMonthSelects();
  fillZoneSelects();
  fillBizTypeSelect();

  bindLifeExcelUpload();
  bindBeforeNoSource();
  bindBeforeProofUpload();
  bindBeforeInputWatcher();
  setBeforeDisabled(false);
  refreshBeforeProofVisibility();

  // GitHub에서 원단위 엑셀 자동 로드
  loadExcelDB(DB_EXCEL_URL).finally(() => {
    fillSidoSelect();
    if(window.lifeBefore){ window.lifeBefore.render(); window.lifeBefore.bindHouseholdInput(); }
    if(window.lifeAfter) { window.lifeAfter.render();  window.lifeAfter.bindHouseholdInput(); }
    refreshBeforeProofVisibility();
  });

  renderLandList("landContainer_before","before");
  renderLandList("landContainer_after","after");
});
