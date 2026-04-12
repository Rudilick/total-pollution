// ================================================================
// life-module.js  v5
// [변경]
//   - 가정인구 배열화: 여러 가정인구 그룹 추가 가능
//   - 각 가정인구 항목: 세대수 + 처리방법(공공/개인/정화조) 한 줄
//   - 사업전/후 타이틀 큰 글자 유지
// ================================================================

function createLifeModule(opts) {
  const { rootId, listClassName, householdInputId } = opts;

  const state = {
    // 가정인구: 배열로 변경
    households: [
      { count:"", method1:"공공하수처리시설", method2:"", method3:"", method4:"" }
    ],
    // 하위호환: 기존 단일 필드 (calc.js에서 참조)
    get householdCount(){ return this.households[0]?.count||""; },
    get householdMethod1(){ return this.households[0]?.method1||"공공하수처리시설"; },
    get householdMethod2(){ return this.households[0]?.method2||""; },
    get householdMethod3(){ return this.households[0]?.method3||""; },
    get householdMethod4(){ return this.households[0]?.method4||""; },
    buildings: [{
      buildingNo: 1,
      method1: "공공하수처리시설", method2: "", method3: "", method4: "",
      floors: [{
        floorNo: 1, commonArea: "",
        uses: [{ major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }]
      }]
    }]
  };

  function _getFilteredPlants() {
    const sigun = document.getElementById("sigunSelect")?.value || "";
    const db = typeof SEWAGE_PLANT_DB !== "undefined" ? SEWAGE_PLANT_DB : [];
    return sigun ? db.filter(p => p.sigun === sigun) : db;
  }

  function _renderFecesDrop(rootId, idPrefix, m4, sigun) {
    const flist = (typeof FECES_PLANT_DB !== "undefined") ? FECES_PLANT_DB.filter(p => p.sigun === sigun) : [];
    if (flist.length === 0) return `<span style="font-size:12px;color:#9ca3af;white-space:nowrap;">분뇨처리시설 없음</span>`;
    const opts = flist.map(p=>`<option value="${p.name}" ${m4===p.name?"selected":""}>${p.name}</option>`).join("");
    return `<select style="font-size:12px;min-width:150px;"
        onchange="window.__lifeOnMethod4Change('${rootId}','${idPrefix}',this.value)">
        <option value="" disabled ${m4?"":"selected"} hidden>분뇨처리시설</option>
        ${opts}
      </select>`;
  }

  function _renderMethodCascade(m1, m2, m3, m4, idPrefix) {
    const plants = _getFilteredPlants();
    const sigun = document.getElementById("sigunSelect")?.value || "";
    let html = `<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;flex:1;min-width:0;">`;

    html += `<select style="font-size:12px;min-width:140px;flex-shrink:0;"
        onchange="window.__lifeOnMethod1Change('${rootId}','${idPrefix}',this.value)">
        <option value="공공하수처리시설" ${m1==="공공하수처리시설"?"selected":""}>공공하수처리시설</option>
        <option value="개인하수처리시설" ${m1==="개인하수처리시설"?"selected":""}>개인하수처리시설</option>
        <option value="정화조" ${m1==="정화조"?"selected":""}>정화조</option>
      </select>`;

    if (m1 === "공공하수처리시설") {
      const opts = plants.length > 0
        ? plants.map(p=>`<option value="${p.name}" ${m2===p.name?"selected":""}>${p.name}</option>`).join("")
        : `<option value="">${sigun?"처리장 없음":"시군 선택 필요"}</option>`;
      html += `<select style="font-size:12px;min-width:160px;max-width:220px;flex-shrink:0;"
          onchange="window.__lifeOnMethod2Change('${rootId}','${idPrefix}',this.value)">
          <option value="" disabled ${m2?"":"selected"} hidden>처리장 선택</option>
          ${opts}
        </select>`;
    } else if (m1 === "개인하수처리시설") {
      html += `<select style="font-size:12px;min-width:80px;flex-shrink:0;"
          onchange="window.__lifeOnMethod2Change('${rootId}','${idPrefix}',this.value)">
          <option value="고도처리" ${m2==="고도처리"?"selected":""}>고도처리</option>
          <option value="일반처리" ${m2==="일반처리"?"selected":""}>일반처리</option>
        </select>
        <select style="font-size:12px;min-width:90px;flex-shrink:0;"
          onchange="window.__lifeOnMethod3Change('${rootId}','${idPrefix}',this.value)">
          <option value="50톤이상" ${m3==="50톤이상"||!m3?"selected":""}>50톤 이상</option>
          <option value="50톤미만" ${m3==="50톤미만"?"selected":""}>50톤 미만</option>
        </select>
        ${_renderFecesDrop(rootId, idPrefix, m4, sigun)}`;
    } else if (m1 === "정화조") {
      html += _renderFecesDrop(rootId, idPrefix, m4, sigun);
    }
    html += `</div>`;
    return html;
  }

  // ── 가정인구 렌더 ─────────────────────────────────────────
  function _renderHouseholds() {
    const container = document.getElementById(`hhMethod_${rootId}`);
    if (!container) return;

    let html = `<div style="display:flex;flex-direction:column;gap:6px;width:100%;">`;
    state.households.forEach((hh, idx) => {
      const idPrefix = `hh${idx}`;
      const methodHtml = _renderMethodCascade(hh.method1, hh.method2, hh.method3, hh.method4||"", idPrefix);
      html += `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;">
          <div class="inputWrap" style="flex:0 0 auto;display:flex;align-items:center;gap:4px;">
            <input id="hhCount_${rootId}_${idx}" type="text" inputmode="numeric"
              value="${hh.count||""}" placeholder="세대수"
              style="width:80px;font-size:12px;"
              oninput="window.__lifeOnHHCountChange('${rootId}',${idx},this.value)" />
            <span style="font-size:12px;color:#6b7280;white-space:nowrap;">세대</span>
          </div>
          ${methodHtml}
          ${state.households.length > 1
            ? `<button type="button" class="miniBtnDanger" style="font-size:11px;flex-shrink:0;"
                onclick="window.__lifeRemoveHH('${rootId}',${idx})">삭제</button>`
            : ""}
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // ── 영업인구 렌더 ─────────────────────────────────────────
  function render() {
    const root = document.getElementById(rootId); if(!root) return;
    root.innerHTML = `<div class="${listClassName}"></div>`;
    const list = root.querySelector(`.${listClassName}`);

    _renderHouseholds();

    state.buildings.forEach((b, bIdx) => {
      const methodHtml = _renderMethodCascade(b.method1, b.method2, b.method3, b.method4||"", `b${bIdx}`);
      const card = document.createElement("div");
      card.className = "buildingCard";
      card.innerHTML = `
        <div class="buildingHead">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;flex-wrap:wrap;">
            <span class="buildingTitle" style="flex-shrink:0;font-size:13px;">${b.buildingNo}동</span>
            ${methodHtml}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button type="button" class="miniBtn" data-act="addFloor" data-b="${bIdx}" style="font-size:11px;">+ 층</button>
            <button type="button" class="miniBtnDanger" data-act="removeBuilding" data-b="${bIdx}" style="font-size:11px;">동 삭제</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${b.floors.map((_,fIdx)=>_renderFloorBlock(bIdx,fIdx)).join("")}
        </div>`;
      list.appendChild(card);
    });

    root.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const act=btn.dataset.act, b=Number(btn.dataset.b);
        const f=btn.dataset.f!==undefined?Number(btn.dataset.f):null;
        const u=btn.dataset.u!==undefined?Number(btn.dataset.u):null;
        if(act==="addFloor")       addFloor(b);
        if(act==="removeBuilding") removeBuilding(b);
        if(act==="addUseRow")      addUseRow(b,f);
        if(act==="removeFloor")    removeFloor(b,f);
        if(act==="removeUseRow")   removeUseRow(b,f,u);
      });
    });
    updateAllCalcs();
  }

  function _renderFloorBlock(bIdx, fIdx) {
    const floor = state.buildings[bIdx].floors[fIdx];
    return `
      <div class="floorBlock">
        <div class="floorHead">
          <span class="floorTitle" style="font-size:12px;">${floor.floorNo}층</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:12px;font-weight:700;color:#374151;white-space:nowrap;">공용면적(㎡)</span>
            <input type="text" inputmode="decimal" value="${floor.commonArea??""}" placeholder="예: 123.45"
              oninput="window.__lifeOnCommonAreaChange('${rootId}',${bIdx},${fIdx},this.value)"
              style="width:100px;font-size:12px;" />
          </div>
          <div style="display:flex;gap:6px;margin-left:auto;flex-shrink:0;">
            <button type="button" class="miniBtn" data-act="addUseRow" data-b="${bIdx}" data-f="${fIdx}" style="font-size:11px;">+ 용도</button>
            <button type="button" class="miniBtnDanger" data-act="removeFloor" data-b="${bIdx}" data-f="${fIdx}" style="font-size:11px;">층 삭제</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${floor.uses.map((_,uIdx) => _renderUseRow(bIdx,fIdx,uIdx)).join("")}
        </div>
      </div>`;
  }

  function _resolveUnitForMid(major, mid) {
    const node = LIFE_USE_DB?.[major]?.[mid]||null;
    if (!node||node.terminal!==true) return { unitType:"", unitText:"" };
    return { unitType:node.unitType||"", unitText:node.unitText||"" };
  }
  function _resolveUnitForMinor(major, mid, minor) {
    const node = LIFE_USE_DB?.[major]?.[mid]||null;
    if (!node||node.terminal!==false) return { unitType:"", unitText:"" };
    const found = (node.minors||[]).find(m=>m.name===minor);
    return { unitType:found?.unitType||"", unitText:found?.unitText||"" };
  }

  function _renderUseRow(bIdx, fIdx, uIdx) {
    const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
    const majorKeys = Object.keys(LIFE_USE_DB||{});
    const majorOpts = [`<option value="" disabled ${u.major?"":"selected"} hidden>대분류</option>`,
      ...majorKeys.map(k=>`<option value="${k}" ${u.major===k?"selected":""}>${k}</option>`)].join("");
    const midKeys = u.major ? Object.keys(LIFE_USE_DB[u.major]||{}) : [];
    const midOpts = [`<option value="" disabled ${u.mid?"":"selected"} hidden>중분류</option>`,
      ...midKeys.map(k=>`<option value="${k}" ${u.mid===k?"selected":""}>${k}</option>`)].join("");
    const midNode = (u.major&&u.mid)?(LIFE_USE_DB?.[u.major]?.[u.mid]||null):null;
    const hasMinor = !!(midNode&&midNode.terminal===false&&(midNode.minors||[]).length>0);
    const minorHtml = hasMinor ? `
      <select style="font-size:12px;" onchange="window.__lifeOnMinorChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">
        <option value="" disabled ${u.minor?"":"selected"} hidden>소분류</option>
        ${(midNode.minors||[]).map(m=>`<option value="${m.name}" ${u.minor===m.name?"selected":""}>${m.name}</option>`).join("")}
      </select>` : "";
    let res = u.unitType ? {unitType:u.unitType,unitText:u.unitText}
      : hasMinor&&u.minor ? _resolveUnitForMinor(u.major,u.mid,u.minor)
      : u.mid ? _resolveUnitForMid(u.major,u.mid) : {unitType:"",unitText:""};
    const ul = res.unitText||(res.unitType==="area"?"㎡":res.unitType==="person"?"인":"");
    const showInput = !!res.unitType;
    const nsHtml = `
      <div class="nsWrap" style="font-size:12px;">
        <label class="nsTag" style="font-size:11px;">
          <input type="checkbox" ${u.isNonSewage?"checked":""}
            onchange="window.__lifeOnNonSewageChange('${rootId}',${bIdx},${fIdx},${uIdx},this.checked)" />비오수
        </label>
        ${u.isNonSewage?`<select class="miniSelect" style="font-size:11px;"
          onchange="window.__lifeOnExcludeReasonChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">
          <option value="">사유</option>
          ${["기계실","전기실","부설주차장","캐노피","기타"].map(s=>`<option value="${s}" ${u.excludeReason===s?"selected":""}>${s}</option>`).join("")}
          </select>`:""}
      </div>`;
    const gridClass = hasMinor ? "useRow" : "useRow noMinor";
    return `
      <div class="${gridClass}" style="font-size:12px;">
        <select style="font-size:12px;" onchange="window.__lifeOnMajorChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">${majorOpts}</select>
        <select style="font-size:12px;" onchange="window.__lifeOnMidChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">${midOpts}</select>
        ${minorHtml}
        ${showInput?`<input type="text" inputmode="decimal" value="${u.inputValue??""}" placeholder="면적/인원"
          style="font-size:12px;" oninput="window.__lifeOnValueChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)" />
          <div class="unitCell" style="font-size:12px;">${ul}</div>`
        :`<div class="unitCell" style="grid-column:span 2;color:#9ca3af;font-size:11px;">용도 선택 후 입력</div>`}
        ${nsHtml}
        <button type="button" class="miniBtnDanger" style="font-size:11px;" data-act="removeUseRow" data-b="${bIdx}" data-f="${fIdx}" data-u="${uIdx}">삭제</button>
        <div class="calcHint" style="font-size:11px;" id="calc_${rootId}_${bIdx}_${fIdx}_${uIdx}"></div>
      </div>`;
  }

  function computeFloorCalcs(floor) {
    const common=parseNum(floor.commonArea), bases=floor.uses.map(u=>parseNum(u.inputValue));
    const realSum=floor.uses.reduce((s,u,i)=>(u.unitType==="area"&&!u.isNonSewage?s+bases[i]:s),0);
    const map={};
    floor.uses.forEach((u,idx)=>{
      const base=bases[idx];
      if(u.isNonSewage){map[idx]={base,alloc:0,final:0};return;}
      if(u.unitType==="area"){const alloc=realSum>0?common*(base/realSum):0;map[idx]={base,alloc,final:base+alloc};return;}
      map[idx]={base,alloc:0,final:base};
    });
    return{common,realSum,map};
  }
  function updateFloorCalcs(bIdx,fIdx){
    const floor=state.buildings[bIdx]?.floors[fIdx]; if(!floor) return;
    const{map}=computeFloorCalcs(floor);
    floor.uses.forEach((u,uIdx)=>{
      const el=document.getElementById(`calc_${rootId}_${bIdx}_${fIdx}_${uIdx}`); if(!el) return;
      const c=map[uIdx], ul=u.unitText||(u.unitType==="area"?"㎡":u.unitType==="person"?"인":"");
      if(!u.unitType){el.textContent="";return;}
      if(u.isNonSewage){el.textContent=`비오수 제외 | 입력: ${fmtNum(c.base)} ${ul}`.trim();return;}
      if(u.unitType==="area"){el.textContent=`전용: ${fmtNum(c.base)} ㎡ | 공용배분: ${fmtNum(c.alloc)} ㎡ | 최종: ${fmtNum(c.final)} ㎡`;return;}
      if(u.unitType==="person"){el.textContent=`인원: ${fmtNum(c.base)} ${ul||"인"}`;return;}
      el.textContent=ul?`입력: ${fmtNum(c.base)} ${ul}`:"";
    });
  }
  function updateAllCalcs(){state.buildings.forEach((b,bIdx)=>b.floors.forEach((_,fIdx)=>updateFloorCalcs(bIdx,fIdx)));}

  // ── 가정인구 state 변경 ──────────────────────────────────
  function addHousehold() {
    state.households.push({count:"",method1:"공공하수처리시설",method2:"",method3:"",method4:""});
    _renderHouseholds();
  }
  function removeHousehold(idx) {
    state.households.splice(idx,1);
    if(!state.households.length) state.households.push({count:"",method1:"공공하수처리시설",method2:"",method3:"",method4:""});
    _renderHouseholds();
  }
  function onHHCountChange(idx,val){ state.households[idx].count=val; _refreshProof(); }

  function onMethod1Change(prefix, val) {
    if (prefix.startsWith("hh")) {
      const idx=Number(prefix.replace("hh",""))||0;
      state.households[idx].method1=val; state.households[idx].method2=""; state.households[idx].method3=""; state.households[idx].method4="";
    } else {
      const bIdx=Number(prefix.replace("b",""));
      state.buildings[bIdx].method1=val; state.buildings[bIdx].method2=""; state.buildings[bIdx].method3=""; state.buildings[bIdx].method4="";
    }
    render();
  }
  function onMethod2Change(prefix, val) {
    if(prefix.startsWith("hh")){const idx=Number(prefix.replace("hh",""))||0;state.households[idx].method2=val;}
    else{const bIdx=Number(prefix.replace("b",""));state.buildings[bIdx].method2=val;}
  }
  function onMethod3Change(prefix, val) {
    if(prefix.startsWith("hh")){const idx=Number(prefix.replace("hh",""))||0;state.households[idx].method3=val;}
    else{const bIdx=Number(prefix.replace("b",""));state.buildings[bIdx].method3=val;}
  }
  function onMethod4Change(prefix, val) {
    if(prefix.startsWith("hh")){const idx=Number(prefix.replace("hh",""))||0;state.households[idx].method4=val;}
    else{const bIdx=Number(prefix.replace("b",""));state.buildings[bIdx].method4=val;}
  }

  function onCommonAreaChange(bIdx,fIdx,val){state.buildings[bIdx].floors[fIdx].commonArea=val;updateFloorCalcs(bIdx,fIdx);}
  function onMajorChange(bIdx,fIdx,uIdx,val){const u=state.buildings[bIdx].floors[fIdx].uses[uIdx];u.major=val;u.mid="";u.minor="";u.unitType="";u.unitText="";render();_refreshProof();}
  function onMidChange(bIdx,fIdx,uIdx,val){const u=state.buildings[bIdx].floors[fIdx].uses[uIdx];u.mid=val;u.minor="";const r=_resolveUnitForMid(u.major,val);u.unitType=r.unitType;u.unitText=r.unitText;render();_refreshProof();}
  function onMinorChange(bIdx,fIdx,uIdx,val){const u=state.buildings[bIdx].floors[fIdx].uses[uIdx];u.minor=val;const r=_resolveUnitForMinor(u.major,u.mid,val);u.unitType=r.unitType;u.unitText=r.unitText;render();_refreshProof();}
  function onValueChange(bIdx,fIdx,uIdx,val){state.buildings[bIdx].floors[fIdx].uses[uIdx].inputValue=val;updateFloorCalcs(bIdx,fIdx);_refreshProof();}
  function onNonSewageChange(bIdx,fIdx,uIdx,checked){const u=state.buildings[bIdx].floors[fIdx].uses[uIdx];u.isNonSewage=checked;if(!checked)u.excludeReason="";render();_refreshProof();}
  function onExcludeReasonChange(bIdx,fIdx,uIdx,reason){state.buildings[bIdx].floors[fIdx].uses[uIdx].excludeReason=reason;}
  function _refreshProof(){if(typeof refreshBeforeProofVisibility==="function")refreshBeforeProofVisibility();}

  function addBuilding(){
    const nextNo=state.buildings.length?Math.max(...state.buildings.map(b=>b.buildingNo))+1:1;
    state.buildings.push({buildingNo:nextNo,method1:"공공하수처리시설",method2:"",method3:"",method4:"",floors:[{floorNo:1,commonArea:"",uses:[{major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:""}]}]});
    render();_refreshProof();
  }
  function removeBuilding(bIdx){state.buildings.splice(bIdx,1);if(!state.buildings.length)addBuilding();else render();_refreshProof();}
  function addFloor(bIdx){const b=state.buildings[bIdx];const nextNo=b.floors.length?Math.max(...b.floors.map(f=>f.floorNo))+1:1;b.floors.push({floorNo:nextNo,commonArea:"",uses:[{major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:""}]});render();_refreshProof();}
  function removeFloor(bIdx,fIdx){state.buildings[bIdx].floors.splice(fIdx,1);if(!state.buildings[bIdx].floors.length)addFloor(bIdx);else render();_refreshProof();}
  function addUseRow(bIdx,fIdx){state.buildings[bIdx].floors[fIdx].uses.push({major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:""});render();_refreshProof();}
  function removeUseRow(bIdx,fIdx,uIdx){const uses=state.buildings[bIdx].floors[fIdx].uses;uses.splice(uIdx,1);if(!uses.length)addUseRow(bIdx,fIdx);else render();_refreshProof();}

  function bindHouseholdInput() {
    // v5: 세대수 입력은 oninput으로 직접 처리됨, 여기선 첫번째 항목만 바인딩 (하위호환)
    const hc=document.getElementById(householdInputId); if(!hc) return;
    hc.addEventListener("input",e=>{state.households[0].count=e.target.value;_refreshProof();});
  }
  function hasAnyData(){
    if(state.households.some(hh=>String(hh.count||"").trim())) return true;
    for(const b of state.buildings) for(const f of b.floors) for(const u of f.uses)
      if(u.major||u.mid||u.inputValue||u.isNonSewage) return true;
    return false;
  }

  return{state,render,addBuilding,addHousehold,removeHousehold,onHHCountChange,
    onCommonAreaChange,onMethod1Change,onMethod2Change,onMethod3Change,onMethod4Change,
    onMajorChange,onMidChange,onMinorChange,onValueChange,onNonSewageChange,onExcludeReasonChange,
    bindHouseholdInput,hasAnyData};
}

window.__lifeModules={};
window.__lifeOnMajorChange         = (id,b,f,u,v) => window.__lifeModules[id]?.onMajorChange(b,f,u,v);
window.__lifeOnMidChange           = (id,b,f,u,v) => window.__lifeModules[id]?.onMidChange(b,f,u,v);
window.__lifeOnMinorChange         = (id,b,f,u,v) => window.__lifeModules[id]?.onMinorChange(b,f,u,v);
window.__lifeOnValueChange         = (id,b,f,u,v) => window.__lifeModules[id]?.onValueChange(b,f,u,v);
window.__lifeOnCommonAreaChange    = (id,b,f,v)   => window.__lifeModules[id]?.onCommonAreaChange(b,f,v);
window.__lifeOnNonSewageChange     = (id,b,f,u,c) => window.__lifeModules[id]?.onNonSewageChange(b,f,u,c);
window.__lifeOnExcludeReasonChange = (id,b,f,u,r) => window.__lifeModules[id]?.onExcludeReasonChange(b,f,u,r);
window.__lifeOnMethod1Change = (rootId,prefix,val) => window.__lifeModules[rootId]?.onMethod1Change(prefix,val);
window.__lifeOnMethod2Change = (rootId,prefix,val) => window.__lifeModules[rootId]?.onMethod2Change(prefix,val);
window.__lifeOnMethod3Change = (rootId,prefix,val) => window.__lifeModules[rootId]?.onMethod3Change(prefix,val);
window.__lifeOnMethod4Change = (rootId,prefix,val) => window.__lifeModules[rootId]?.onMethod4Change(prefix,val);
window.__lifeOnHHCountChange = (rootId,idx,val)    => window.__lifeModules[rootId]?.onHHCountChange(idx,val);
window.__lifeRemoveHH        = (rootId,idx)        => window.__lifeModules[rootId]?.removeHousehold(idx);

const lifeBefore=createLifeModule({rootId:"livingContainer_before",listClassName:"buildingList",householdInputId:"householdCount_before"});
const lifeAfter =createLifeModule({rootId:"livingContainer_after", listClassName:"buildingList",householdInputId:"householdCount_after"});
window.lifeBefore=lifeBefore; window.lifeAfter=lifeAfter;
window.__lifeModules["livingContainer_before"]=lifeBefore;
window.__lifeModules["livingContainer_after"] =lifeAfter;

function setBeforeDisabled(d){document.getElementById("beforeInputs")?.classList.toggle("lifeDisabled",d);}
function refreshBeforeProofVisibility(){
  const chk=document.getElementById("beforeNoSource"),wrap=document.getElementById("beforeProofWrap");
  if(!chk||!wrap) return;
  if(chk.checked){wrap.classList.add("hidden");return;}
  lifeBefore.hasAnyData()?wrap.classList.remove("hidden"):wrap.classList.add("hidden");
}
function bindBeforeNoSource(){const chk=document.getElementById("beforeNoSource");if(!chk)return;chk.addEventListener("change",()=>{setBeforeDisabled(chk.checked);refreshBeforeProofVisibility();});}
function bindBeforeProofUpload(){
  const input=document.getElementById("beforeProof"),list=document.getElementById("beforeProofList");
  if(!input||!list) return;
  input.addEventListener("change",()=>{const files=Array.from(input.files||[]);list.innerHTML=files.map(f=>`• ${f.name} (${Math.ceil(f.size/1024)} KB)`).join("<br/>");});
}
function bindBeforeInputWatcher(){
  const el=document.getElementById("beforeInputs");if(!el)return;
  el.addEventListener("input",()=>refreshBeforeProofVisibility(),true);
  el.addEventListener("change",()=>refreshBeforeProofVisibility(),true);
}
function refreshLifeModulePlants(){window.lifeBefore?.render();window.lifeAfter?.render();}
window.refreshLifeModulePlants=refreshLifeModulePlants;
