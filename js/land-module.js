// ================================================================
// land-module.js  v2
// [변경]
//   28개 지목을 고정으로 다 늘어놓던 방식 -> 지목 검색+자동완성으로 필요한 것만
//   골라 담는 동적 행 방식으로 전환 (life-module의 용도 검색 UX와 동일한 패턴).
//   면적 입력칸은 "3333+3333+33+" 처럼 +로 이어 입력하면 실시간 합산되고,
//   +를 누를 때마다 그 직전 숫자가 색깔별로 구분되어 굵게 표시된다.
// ================================================================

const LAND_ITEMS = [
  "전","답","과수원","목장용지","공원","묘지","사적지",
  "임야","광천지","염전","제방","하천","구거","유지","양어장","잡종지",
  "대지","공장용지","학교","창고","종교",
  "주차장","도로","철도","수도",
  "주유소","체육용지","유원지"
];

function _newLandRow(){ return { name:"", terms:[], termColors:[], pending:"" }; }

const landRows = { before:[_newLandRow()], after:[_newLandRow()] };
// 지목명 -> 합산 면적(숫자). calc.js가 그대로 소비하는 기존 계약을 유지한다.
const landState = { before:{}, after:{} };

// ── 지목 검색 드롭다운 포털 (life-module의 용도 검색 포털과 동일한 패턴) ──
let _activeLandDropdownKey = null;
function _getLandPortalDropdown(){
  let el = document.getElementById("landUsePortalDropdown");
  if(!el){
    el=document.createElement("div");
    el.id="landUsePortalDropdown";
    el.className="landDropdown";
    document.body.appendChild(el);
  }
  return el;
}
function _positionLandPortalDropdown(inputEl){
  const portal=_getLandPortalDropdown();
  const rect=inputEl.getBoundingClientRect();
  const maxH=220;
  const spaceBelow=window.innerHeight-rect.bottom;
  const openUpward=spaceBelow<maxH && rect.top>maxH;
  portal.style.position="fixed";
  portal.style.left=rect.left+"px";
  portal.style.right="auto";
  portal.style.width=rect.width+"px";
  portal.style.zIndex="9999";
  if(openUpward){ portal.style.top="auto"; portal.style.bottom=(window.innerHeight-rect.top+2)+"px"; }
  else { portal.style.bottom="auto"; portal.style.top=(rect.bottom+2)+"px"; }
  return portal;
}
function _hideLandPortalDropdown(){
  _activeLandDropdownKey=null;
  const el=document.getElementById("landUsePortalDropdown");
  if(el){ el.classList.remove("open"); el.innerHTML=""; }
}
window.addEventListener("scroll", _hideLandPortalDropdown, true);
window.addEventListener("resize", _hideLandPortalDropdown);

function _searchLandItems(q){
  const s=String(q||"").trim();
  if(!s) return LAND_ITEMS.slice();
  return LAND_ITEMS.filter(n=>n.includes(s));
}
function _openLandDropdown(mode, idx, items){
  const inputEl=document.getElementById(`landSearch_${mode}_${idx}`); if(!inputEl) return;
  const drop=_positionLandPortalDropdown(inputEl);
  _activeLandDropdownKey=`${mode}_${idx}`;
  drop.innerHTML = items.length
    ? items.map(n=>`<div class="item" data-name="${escAttr(n)}">${escHtml(n)}</div>`).join("")
    : `<div class="landDropdownEmpty">일치하는 지목이 없습니다</div>`;
  drop.classList.add("open");
  drop.querySelectorAll(".item").forEach(el=>{
    el.addEventListener("mousedown",(e)=>{
      e.preventDefault(); // input의 blur보다 먼저 처리되도록
      _pickLandItem(mode, idx, el.dataset.name);
    });
  });
}
function _closeLandDropdown(mode, idx){
  const key=`${mode}_${idx}`;
  if(_activeLandDropdownKey!==key) return;
  _hideLandPortalDropdown();
}
function _pickLandItem(mode, idx, name){
  if(!name) return;
  const row=landRows[mode][idx];
  const isFirstPick=!row.name;
  row.name=name;
  _closeLandDropdown(mode, idx);
  // 맨 마지막 행에서 처음으로 지목을 고른 경우에만 아래에 새 빈 행을 이어붙인다
  if(isFirstPick && idx===landRows[mode].length-1){
    landRows[mode].push(_newLandRow());
  }
  _rebuildLandList(mode);
  const vb=document.getElementById(`landValue_${mode}_${idx}`);
  if(vb) vb.focus();
}
function onLandSearchFocus(mode, idx){
  _openLandDropdown(mode, idx, _searchLandItems(""));
}
function onLandSearchInput(mode, idx, text){
  _openLandDropdown(mode, idx, _searchLandItems(text));
}
function onLandSearchKeydown(mode, idx, e){
  if(e.key!=="Enter") return;
  e.preventDefault();
  const key=`${mode}_${idx}`;
  if(_activeLandDropdownKey!==key) return;
  const first=document.getElementById("landUsePortalDropdown")?.querySelector(".item");
  if(!first) return;
  _pickLandItem(mode, idx, first.dataset.name);
}
function onLandSearchBlur(mode, idx){
  _closeLandDropdown(mode, idx);
  const row=landRows[mode][idx];
  const inputEl=document.getElementById(`landSearch_${mode}_${idx}`);
  if(inputEl) inputEl.value=row.name||"";
}

// ── 면적 입력칸: "3333+3333+33+" 형태로 이어 입력하면 실시간 합산 ──────
// (실제 합산 로직은 utils.js의 buildSumBoxInnerHtml/deriveSumFromDom 등 공용 유틸을 쓴다)
function _landRowTotal(row){ return sumTermsTotal(row.terms, row.pending); }
function _updateLandTotalDisplay(mode, idx){
  const row=landRows[mode][idx];
  const totalEl=document.getElementById(`landTotal_${mode}_${idx}`);
  if(!totalEl) return;
  if(row.terms.length>0){
    totalEl.style.visibility="visible";
    totalEl.textContent=fmtNum(_landRowTotal(row));
  } else {
    totalEl.style.visibility="hidden";
    totalEl.textContent="";
  }
}
function onLandValueInput(mode, idx, el){
  const row=landRows[mode][idx];
  const derived=deriveSumFromDom(el);
  row.terms=derived.terms; row.termColors=derived.colors; row.pending=derived.pending;
  _updateLandTotalDisplay(mode, idx);
  _recomputeLandState(mode);
}
function onLandValueKeydown(mode, idx, e, el){
  if(e.key!=="+") return;
  e.preventDefault();
  const derived=deriveSumFromDom(el);
  const pendingNum=parseNum(derived.pending);
  if(!derived.pending||!pendingNum) return; // 숫자 없이 +만 누르면 무시
  const newTerms=[...derived.terms, derived.pending];
  const newColors=[...derived.colors, randomSumColor()];
  el.innerHTML=buildSumBoxInnerHtml(newTerms, newColors, "");
  const row=landRows[mode][idx];
  row.terms=newTerms; row.termColors=newColors; row.pending="";
  placeCaretAtEnd(el);
  _updateLandTotalDisplay(mode, idx);
  _recomputeLandState(mode);
}

function _recomputeLandState(mode){
  const flat={};
  landRows[mode].forEach(row=>{
    if(!row.name) return;
    const total=_landRowTotal(row);
    if(total<=0) return;
    flat[row.name]=(flat[row.name]||0)+total;
  });
  landState[mode]=flat;
}

function onLandRemoveRow(mode, idx){
  landRows[mode].splice(idx,1);
  if(!landRows[mode].length) landRows[mode].push(_newLandRow());
  _rebuildLandList(mode);
}

// ── 렌더 ─────────────────────────────────────────────────────
function _renderLandRowHtml(mode, idx){
  const row=landRows[mode][idx];
  const hasName=!!row.name;
  const showTotal=row.terms.length>0;
  return `
    <div class="landRow" data-mode="${mode}" data-idx="${idx}">
      <div class="landSearchWrap" ${hasName?"":'style="grid-column:1 / -1;"'}>
        <input type="text" id="landSearch_${mode}_${idx}" class="landSearchInput" autocomplete="off"
          value="${escAttr(row.name)}" placeholder="지목 검색"
          oninput="window.__landOnSearchInput('${mode}',${idx},this.value)"
          onfocus="window.__landOnSearchFocus('${mode}',${idx})"
          onblur="setTimeout(()=>window.__landOnSearchBlur('${mode}',${idx}),120)"
          onkeydown="window.__landOnSearchKeydown('${mode}',${idx},event)" />
      </div>
      ${hasName?`
      <div class="sumBox" id="landValue_${mode}_${idx}" contenteditable="true"
        oninput="window.__landOnValueInput('${mode}',${idx},this)"
        onkeydown="window.__landOnValueKeydown('${mode}',${idx},event,this)"
        >${buildSumBoxInnerHtml(row.terms,row.termColors,row.pending)}</div>
      <div class="sumTotalBox" id="landTotal_${mode}_${idx}" style="${showTotal?"":"visibility:hidden;"}">${showTotal?fmtNum(_landRowTotal(row)):""}</div>
      <div class="landUnit">m²</div>
      <button type="button" class="miniBtnDanger landRowDel" onclick="window.__landRemoveRow('${mode}',${idx})">×</button>`:""}
    </div>`;
}
function _rebuildLandList(mode){
  const el=document.querySelector(`.landList[data-mode="${mode}"]`);
  if(!el) return;
  el.innerHTML=landRows[mode].map((_,i)=>_renderLandRowHtml(mode,i)).join("");
  _recomputeLandState(mode);
}
function renderLandList(targetId, mode){
  const root=document.getElementById(targetId);
  if(!root) return;
  root.innerHTML=`<div class="landList" data-mode="${mode}"></div>`;
  _rebuildLandList(mode);
}

// ── window 노출 ──────────────────────────────────────────────
window.landState=landState;
window.renderLandList=renderLandList;
window.__landOnSearchInput  = (mode,idx,v) => onLandSearchInput(mode,idx,v);
window.__landOnSearchFocus  = (mode,idx)   => onLandSearchFocus(mode,idx);
window.__landOnSearchBlur   = (mode,idx)   => onLandSearchBlur(mode,idx);
window.__landOnSearchKeydown= (mode,idx,e) => onLandSearchKeydown(mode,idx,e);
window.__landOnValueInput   = (mode,idx,el)  => onLandValueInput(mode,idx,el);
window.__landOnValueKeydown = (mode,idx,e,el)=> onLandValueKeydown(mode,idx,e,el);
window.__landRemoveRow      = (mode,idx)   => onLandRemoveRow(mode,idx);
