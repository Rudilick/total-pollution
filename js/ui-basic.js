// ================================================================
// ui-basic.js  v4
// [변경]
//   - 결과탭(tab-result) 추가 대응
//   - runCalcOnly: 결과탭으로 전환 + 상세 결과 표시
//   - runAndGenerate: Word 다운로드만 (탭 전환 없음)
//   - _showDetailedResults: 종합 결과 HTML 생성
//   - 수동업로드/재로드 버튼 제거 (HTML에서 이미 제거)
// ================================================================

// ── 탭 ──────────────────────────────────────────────────────
(function initTabs(){
  const btns   = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll(".tabPanel"));
  function activate(id){
    btns.forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
    panels.forEach(p=>p.classList.toggle("active",p.id===id));
    window.scrollTo({top:0,behavior:"smooth"});
  }
  btns.forEach(b=>b.addEventListener("click",()=>activate(b.dataset.tab)));
  window._activateTab = activate;
})();

// ── 용도지역 데이터 ──────────────────────────────────────────
const zoneMap = {
  "주거지역":     ["전용주거지역","일반주거지역","준주거지역"],
  "상업지역":     ["중심상업지역","일반상업지역","근린상업지역","유통상업지역"],
  "공업지역":     ["전용공업지역","일반공업지역","준공업지역"],
  "녹지지역":     ["보전녹지지역","생산녹지지역","자연녹지지역"],
  "관리지역":     ["계획관리지역","생산관리지역","보전관리지역"],
  "농림지역":     [],
  "자연보전지역":  ["자연보전지역"],
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

function pad2(n){return String(n).padStart(2,"0");}

// ── 년월 셀렉트 ─────────────────────────────────────────────
function fillYearMonthSelects(){
  const now=new Date(),y=now.getFullYear(),m=now.getMonth()+1;
  const sy=y-10, ey=y+10;
  const ys=document.getElementById("yearSelect");
  const ms=document.getElementById("monthSelect");
  const ss=document.getElementById("startYearSelect");
  const cs=document.getElementById("completeYearSelect");
  if(!ys||!ms) return;
  ys.innerHTML=""; for(let i=ey;i>=sy;i--){const o=document.createElement("option");o.value=String(i);o.textContent=`${i}년`;if(i===y)o.selected=true;ys.appendChild(o);}
  ms.innerHTML=""; for(let i=1;i<=12;i++){const o=document.createElement("option");o.value=pad2(i);o.textContent=`${i}월`;if(i===m)o.selected=true;ms.appendChild(o);}
  [ss,cs].forEach(sel=>{if(!sel)return;sel.innerHTML="";for(let i=sy;i<=ey;i++){const o=document.createElement("option");o.value=String(i);o.textContent=`${i}년`;if(i===y)o.selected=true;sel.appendChild(o);}});
}

// ── 용도지역 셀렉트 ─────────────────────────────────────────
function fillZoneSelects(){
  const ms=document.getElementById("zoneMainSelect"),ss=document.getElementById("zoneSubSelect");
  if(!ms||!ss) return;
  ms.innerHTML="";
  Object.keys(zoneMap).forEach((k,i)=>{const o=document.createElement("option");o.value=k;o.textContent=k;if(i===0)o.selected=true;ms.appendChild(o);});
  function ref(){
    const subs=zoneMap[ms.value]||[];
    ss.innerHTML="";
    if(!subs.length){const o=document.createElement("option");o.value="";o.textContent="(해당없음)";ss.appendChild(o);return;}
    subs.forEach((s,i)=>{const o=document.createElement("option");o.value=s;o.textContent=s;if(i===0)o.selected=true;ss.appendChild(o);});
  }
  ms.addEventListener("change",ref); ref();
}

// ── 사업종류 셀렉트 ─────────────────────────────────────────
function fillBizTypeSelect(){
  const s=document.getElementById("bizTypeSelect");if(!s)return;
  s.innerHTML="";
  bizTypes.forEach((t,i)=>{const o=document.createElement("option");o.value=t;o.textContent=t;if(i===0)o.selected=true;s.appendChild(o);});
}

// ── sido/sigun 드롭박스 ─────────────────────────────────────
function fillSidoSelect(){
  const ss=document.getElementById("sidoSelect"); if(!ss) return;
  const list=typeof SIDO_SIGUN_LIST!=="undefined" ? SIDO_SIGUN_LIST : [];
  const cur=ss.value;
  // placeholder는 selected 유지 (아무것도 선택 안 된 기본 상태)
  ss.innerHTML=`<option value="" disabled selected>광역자치단체 선택</option>`;
  list.forEach(({sido})=>{
    const o=document.createElement("option");
    o.value=sido; o.textContent=sido;
    ss.appendChild(o);
  });
  if(cur){ ss.value=cur; }  // 이전 선택값 복원
  _refreshSigunSelect();
}

function _refreshSigunSelect(){
  const ss=document.getElementById("sidoSelect");
  const gs=document.getElementById("sigunSelect");
  if(!gs) return;
  const sido=ss?.value||"";
  const list=typeof SIDO_SIGUN_LIST!=="undefined" ? SIDO_SIGUN_LIST : [];
  const entry=list.find(e=>e.sido===sido);
  const siguns=entry?.siguns||[];
  gs.innerHTML=`<option value="" disabled selected>기초자치단체 선택</option>`;
  siguns.forEach(sg=>{
    const o=document.createElement("option");
    o.value=sg; o.textContent=sg;
    gs.appendChild(o);
  });
}

function onSidoChange(){_refreshSigunSelect();if(typeof refreshLifeModulePlants==="function")refreshLifeModulePlants();}
function onSigunChange(){if(typeof refreshLifeModulePlants==="function")refreshLifeModulePlants();}
window.onSidoChange=onSidoChange;
window.onSigunChange=onSigunChange;
window.fillSidoSelect=fillSidoSelect;
window.fillPlantSelects=function(){};

// ── 계산 실행 ────────────────────────────────────────────────
function runAndGenerate(){
  if(typeof runCalc!=="function"){alert("calc.js 로드 오류");return;}
  const r=runCalc();
  if(typeof generateDoc==="function") generateDoc(r);
}

function runCalcOnly(){
  if(typeof runCalc!=="function"){alert("calc.js 로드 오류");return;}
  const r=runCalc();
  _showDetailedResults(r);
  if(typeof window._activateTab==="function") window._activateTab("tab-result");
}

window.runAndGenerate=runAndGenerate;
window.runCalcOnly=runCalcOnly;

// ── 상세 결과 표시 ───────────────────────────────────────────
function _showDetailedResults(result){
  const el=document.getElementById("calc-result-detail");
  if(!el||!result) return;

  const f4 = n => typeof n==="number" ? n.toFixed(4) : "-";
  const f2 = n => typeof n==="number" ? n.toFixed(2)  : "-";

  const th  = "padding:5px 8px;background:#f1f5f9;border:1px solid #e2e8f0;text-align:center;font-weight:900;font-size:12px;";
  const td  = "padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;";
  const tdl = "padding:5px 8px;border:1px solid #e2e8f0;text-align:left;font-size:12px;";
  const tds = "padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;font-weight:900;background:#f0fdf4;";
  const tbl = "width:100%;border-collapse:collapse;margin-top:8px;";

  // ── 계산 기준 ──
  const p=result.params||{};
  const infoHtml=`
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
      <span><b>계산일시:</b> ${result.계산일시}</span>
      <span><b>용도지역:</b> ${p.zoneMain||"-"} → <b style="color:${p.urbanType==="시가화"?"#2563eb":"#16a34a"}">${p.urbanType||"-"}</b></span>
      <span><b>기초자치단체:</b> ${p.sigun||"미입력"}</span>
      <span><b>수변구역:</b> <span style="color:${p.isWaterBuffer?"#dc2626":"#6b7280"};font-weight:900;">${p.isWaterBuffer?"해당":"해당없음"}</span></span>
    </div>`;

  // ── 생활계 섹션 빌더 ──
  function buildLifeSection(label, color, lifeData){
    if(!lifeData) return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px;"><b style="color:${color};">${label}</b><p style="font-size:12px;color:#9ca3af;margin-top:8px;">데이터 없음</p></div>`;
    let h=`<div style="border:1px solid var(--border);border-radius:12px;padding:14px;">`;
    h+=`<div style="font-weight:900;font-size:14px;color:${color};margin-bottom:10px;">${label}</div>`;

    // 가정인구
    const hh=lifeData.가정인구;
    if(hh){
      h+=`<div style="font-size:12px;font-weight:900;color:#374151;margin:0 0 4px;">[ 가정인구 ]</div>`;
      h+=`<table style="${tbl}"><tr><th style="${th}">인구수</th><th style="${th}">오수(㎥/일)</th><th style="${th}">발생BOD</th><th style="${th}">배출BOD</th><th style="${th}">발생T-P</th><th style="${th}">배출T-P</th></tr>
        <tr><td style="${td}">${Math.round(hh.population||0)}인</td><td style="${td}">${f2(hh.오수발생유량)}</td><td style="${td}">${f4(hh.발생부하량?.BOD)}</td><td style="${td}">${f4(hh.배출부하량?.BOD)}</td><td style="${td}">${f4(hh.발생부하량?.TP)}</td><td style="${td}">${f4(hh.배출부하량?.TP)}</td></tr>
      </table>`;
    }

    // 영업인구
    const bRows=lifeData.영업인구?.rows||[];
    if(bRows.length>0){
      h+=`<div style="font-size:12px;font-weight:900;color:#374151;margin:12px 0 4px;">[ 영업인구 ]</div>`;
      h+=`<div style="overflow-x:auto;"><table style="${tbl}"><tr>
        <th style="${th}">위치</th><th style="${th}">용도</th><th style="${th}">적용면적</th>
        <th style="${th}">오수(㎥/일)</th><th style="${th}">발생BOD</th><th style="${th}">발생T-P</th>
        <th style="${th}">배출BOD</th><th style="${th}">배출T-P</th><th style="${th}">처리방법</th></tr>`;
      bRows.forEach(r=>{
        const loc=`${r.buildingNo}동 ${r.floorNo}층`;
        const use=r.mid+(r.minor?`(${r.minor})`:"");
        const area=r.unitType==="area"?`${f2(r.적용면적)}㎡`:`${r.적용면적}인`;
        const method=r.sewageMethod1==="공공하수처리시설"?`공공(${r.plantName||"미선택"})`:r.sewageMethod1;
        h+=`<tr><td style="${tdl}">${loc}</td><td style="${tdl}">${use}</td><td style="${td}">${area}</td>
          <td style="${td}">${f2(r.오수발생유량)}</td><td style="${td}">${f4(r.발생부하량?.BOD)}</td><td style="${td}">${f4(r.발생부하량?.TP)}</td>
          <td style="${td}">${f4(r.배출부하량?.BOD)}</td><td style="${td}">${f4(r.배출부하량?.TP)}</td><td style="${tdl}">${method}</td></tr>`;
      });
      h+=`</table></div>`;
    }

    // 합계
    const t=lifeData.합계;
    h+=`<table style="${tbl};margin-top:10px;"><tr>
      <th style="${th}">합계</th><th style="${th}">오수(㎥/일)</th>
      <th style="${th}">발생BOD(kg/일)</th><th style="${th}">배출BOD(kg/일)</th>
      <th style="${th}">발생T-P(kg/일)</th><th style="${th}">배출T-P(kg/일)</th></tr>
      <tr><td style="${tds}">생활계</td><td style="${tds}">${f2(t.오수발생유량)}</td>
      <td style="${tds}">${f4(t.발생부하량?.BOD)}</td><td style="${tds}">${f4(t.배출부하량?.BOD)}</td>
      <td style="${tds}">${f4(t.발생부하량?.TP)}</td><td style="${tds}">${f4(t.배출부하량?.TP)}</td></tr>
    </table>`;
    h+=`</div>`;
    return h;
  }

  // ── 토지계 섹션 빌더 ──
  function buildLandSection(label, color, landData){
    let h=`<div style="border:1px solid var(--border);border-radius:12px;padding:14px;">`;
    h+=`<div style="font-weight:900;font-size:14px;color:${color};margin-bottom:10px;">${label}</div>`;
    const rows=landData?.rows||[];
    if(!rows.length){h+=`<p style="font-size:12px;color:#9ca3af;">입력된 면적 없음</p></div>`;return h;}
    h+=`<table style="${tbl}"><tr><th style="${th}">지목</th><th style="${th}">면적(㎡)</th><th style="${th}">BOD원단위</th><th style="${th}">T-P원단위</th><th style="${th}">발생BOD(kg/일)</th><th style="${th}">발생T-P(kg/일)</th></tr>`;
    rows.forEach(r=>{h+=`<tr><td style="${tdl}">${r.jmok}</td><td style="${td}">${r.area.toLocaleString()}</td><td style="${td}">${r.원단위.BOD}</td><td style="${td}">${r.원단위.TP}</td><td style="${td}">${f4(r.발생부하량?.BOD)}</td><td style="${td}">${f4(r.발생부하량?.TP)}</td></tr>`;});
    const t=landData.합계.발생부하량;
    h+=`<tr><td style="${tds}" colspan="4">합계</td><td style="${tds}">${f4(t.BOD)}</td><td style="${tds}">${f4(t.TP)}</td></tr>`;
    h+=`</table></div>`;
    return h;
  }

  // ── 최종 결과 ──
  const d=result.최종배출부하량;
  const lb=result.생활계.사업전.합계, ls=result.생활계.사업후.합계;
  const tb=result.토지계.사업전.합계.배출부하량, ta=result.토지계.사업후.합계.배출부하량;
  const finalHtml=`
    <div style="font-weight:900;font-size:13px;color:#374151;margin:16px 0 6px;">최종 배출부하량 증감</div>
    <table style="${tbl}">
      <tr><th style="${th}" rowspan="2">구분</th><th style="${th}" colspan="2">점오염원 (생활계)</th><th style="${th}" colspan="2">비점오염원 (토지계)</th></tr>
      <tr><th style="${th}">BOD (kg/일)</th><th style="${th}">T-P (kg/일)</th><th style="${th}">BOD (kg/일)</th><th style="${th}">T-P (kg/일)</th></tr>
      <tr><td style="${tdl}">생활계 사업전 배출</td><td style="${td}">${f4(lb.배출부하량?.BOD)}</td><td style="${td}">${f4(lb.배출부하량?.TP)}</td><td style="${td}">-</td><td style="${td}">-</td></tr>
      <tr><td style="${tdl}">생활계 사업후 배출</td><td style="${td}">${f4(ls.배출부하량?.BOD)}</td><td style="${td}">${f4(ls.배출부하량?.TP)}</td><td style="${td}">-</td><td style="${td}">-</td></tr>
      <tr><td style="${tdl}">토지계 사업전 배출</td><td style="${td}">-</td><td style="${td}">-</td><td style="${td}">${f4(tb?.BOD)}</td><td style="${td}">${f4(tb?.TP)}</td></tr>
      <tr><td style="${tdl}">토지계 사업후 배출</td><td style="${td}">-</td><td style="${td}">-</td><td style="${td}">${f4(ta?.BOD)}</td><td style="${td}">${f4(ta?.TP)}</td></tr>
      <tr style="background:#fef9c3;">
        <td style="padding:6px 8px;border:1px solid #fde047;font-weight:900;font-size:13px;color:#92400e;">증가량 (후-전)</td>
        <td style="padding:6px 8px;border:1px solid #fde047;text-align:center;font-weight:900;font-size:15px;color:#92400e;">${f4(d.점오염?.BOD)}</td>
        <td style="padding:6px 8px;border:1px solid #fde047;text-align:center;font-weight:900;font-size:15px;color:#92400e;">${f4(d.점오염?.TP)}</td>
        <td style="padding:6px 8px;border:1px solid #fde047;text-align:center;font-weight:900;font-size:15px;color:#92400e;">${f4(d.비점오염?.BOD)}</td>
        <td style="padding:6px 8px;border:1px solid #fde047;text-align:center;font-weight:900;font-size:15px;color:#92400e;">${f4(d.비점오염?.TP)}</td>
      </tr>
    </table>`;

  el.innerHTML = infoHtml
    + `<div style="font-weight:900;font-size:13px;color:#374151;margin:0 0 6px;">생활계 오염원</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">`
    + buildLifeSection("▶ 사업전","#6b7280",result.생활계.사업전)
    + buildLifeSection("▶ 사업후","#2563eb",result.생활계.사업후)
    + `</div>`
    + `<div style="font-weight:900;font-size:13px;color:#374151;margin:0 0 6px;">토지계 오염원 (비점)</div>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">`
    + buildLandSection("▶ 사업전","#6b7280",result.토지계.사업전)
    + buildLandSection("▶ 사업후","#2563eb",result.토지계.사업후)
    + `</div>`
    + finalHtml;
}

// ── DOMContentLoaded ─────────────────────────────────────────
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

  loadExcelDB(DB_EXCEL_URL).finally(() => {
    fillSidoSelect();
    if(window.lifeBefore){window.lifeBefore.render();window.lifeBefore.bindHouseholdInput();}
    if(window.lifeAfter) {window.lifeAfter.render(); window.lifeAfter.bindHouseholdInput();}
    refreshBeforeProofVisibility();
  });

  renderLandList("landContainer_before","before");
  renderLandList("landContainer_after","after");
});
