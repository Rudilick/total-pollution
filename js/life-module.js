// ================================
// life-module.js  ─  생활계 UI 모듈
// [변경] DOMContentLoaded 제거 → ui-basic.js 단일 관리
// ================================

function createLifeModule(opts) {
  const { rootId, listClassName, householdInputId } = opts;

  const state = {
    householdCount: "",
    buildings: [
      {
        buildingNo: 1,
        sewageMethod: "공공하수처리시설",
        selectedPlant: "",
        floors: [{
          floorNo: 1,
          commonArea: "",
          uses: [{ major: "", mid: "", minor: "", inputValue: "", unitType: "", unitText: "", isNonSewage: false, excludeReason: "" }]
        }]
      }
    ]
  };

  function unitLabelFromRow(u) {
    return u?.unitText || (u?.unitType === "area" ? "㎡" : u?.unitType === "person" ? "인" : "");
  }

  function computeFloorCalcs(floor) {
    const common  = parseNum(floor.commonArea);
    const bases   = floor.uses.map(u => parseNum(u.inputValue));
    const targets = floor.uses
      .map((u, idx) => ({ u, idx, base: bases[idx] }))
      .filter(x => x.u.unitType === "area" && !x.u.isNonSewage && x.base > 0);
    const sumArea = targets.reduce((a, x) => a + x.base, 0);

    const map = {};
    floor.uses.forEach((u, idx) => {
      const base = bases[idx];
      if (u.isNonSewage) { map[idx] = { base, alloc: 0, final: 0, note: "비오수 제외" }; return; }
      if (u.unitType === "area") {
        const alloc = sumArea > 0 ? common * (base / sumArea) : 0;
        map[idx] = { base, alloc, final: base + alloc, note: "" };
        return;
      }
      map[idx] = { base, alloc: 0, final: base, note: "" };
    });
    return { common, sumArea, map };
  }

  function updateFloorCalcs(bIdx, fIdx) {
    const floor = state.buildings[bIdx]?.floors[fIdx];
    if (!floor) return;
    const { map } = computeFloorCalcs(floor);

    floor.uses.forEach((u, uIdx) => {
      const el   = document.getElementById(`calc_${rootId}_${bIdx}_${fIdx}_${uIdx}`);
      if (!el) return;
      const c    = map[uIdx];
      const unit = unitLabelFromRow(u);

      if (!u.unitType)    { el.textContent = ""; return; }
      if (u.isNonSewage)  { el.textContent = `비오수 제외 | 입력: ${fmtNum(c.base)} ${unit || ""}`.trim(); return; }
      if (u.unitType === "area")   { el.textContent = `연면적: ${fmtNum(c.base)} ㎡ | 공용배분: ${fmtNum(c.alloc)} ㎡ | 최종: ${fmtNum(c.final)} ㎡`; return; }
      if (u.unitType === "person") { el.textContent = `인원: ${fmtNum(c.base)} ${unit || "인"}`; return; }
      el.textContent = unit ? `입력: ${fmtNum(c.base)} ${unit}` : "";
    });
  }

  function updateAllCalcs() {
    state.buildings.forEach((b, bIdx) => b.floors.forEach((f, fIdx) => updateFloorCalcs(bIdx, fIdx)));
  }

  // ── 렌더 ────────────────────────────────────────────────
  function render() {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = `<div class="${listClassName}"></div>`;
    const list = root.querySelector(`.${listClassName}`);

    state.buildings.forEach((b, bIdx) => {
      const buildingCard = document.createElement("div");
      buildingCard.className = "buildingCard";
      buildingCard.innerHTML = `
        <div class="buildingHead">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div class="buildingTitle">${b.buildingNo}동</div>
            <select class="miniSelect" style="min-width:220px;"
              onchange="window.__lifeOnSewageMethodChange('${rootId}', ${bIdx}, this.value)">
              <option value="공공하수처리시설" ${b.sewageMethod==="공공하수처리시설"?"selected":""}>공공하수처리시설</option>
              <option value="개인오수처리시설" ${b.sewageMethod==="개인오수처리시설"?"selected":""}>개인오수처리시설</option>
              <option value="재래식화장실"     ${b.sewageMethod==="재래식화장실"    ?"selected":""}>재래식화장실</option>
            </select>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="miniBtn"       data-act="addFloor"      data-b="${bIdx}">+ 층 추가</button>
            <button type="button" class="miniBtnDanger" data-act="removeBuilding" data-b="${bIdx}">동 삭제</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${b.floors.map((f, fIdx) => renderFloorBlock(bIdx, fIdx)).join("")}
        </div>
      `;
      list.appendChild(buildingCard);
    });

    root.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        const b   = Number(btn.dataset.b);
        const f   = btn.dataset.f !== undefined ? Number(btn.dataset.f) : null;
        const u   = btn.dataset.u !== undefined ? Number(btn.dataset.u) : null;
        if (act === "addFloor")      addFloor(b);
        if (act === "removeBuilding") removeBuilding(b);
        if (act === "addUseRow")     addUseRow(b, f);
        if (act === "removeFloor")   removeFloor(b, f);
        if (act === "removeUseRow")  removeUseRow(b, f, u);
      });
    });

    updateAllCalcs();
  }

  function renderFloorBlock(bIdx, fIdx) {
    const floor = state.buildings[bIdx].floors[fIdx];
    return `
      <div class="floorBlock">
        <div class="floorHead">
          <div class="floorTitle">${floor.floorNo}층</div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div style="font-weight:900; color:#111827;">공용면적(㎡)</div>
            <input type="text" inputmode="decimal"
              value="${floor.commonArea ?? ""}"
              placeholder="예: 123.45"
              oninput="window.__lifeOnCommonAreaChange('${rootId}', ${bIdx}, ${fIdx}, this.value)"
              style="width:160px;"
            />
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-left:auto;">
            <button type="button" class="miniBtn"       data-act="addUseRow"   data-b="${bIdx}" data-f="${fIdx}">+ 건축물용도 추가</button>
            <button type="button" class="miniBtnDanger" data-act="removeFloor" data-b="${bIdx}" data-f="${fIdx}">층 삭제</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${floor.uses.map((u, uIdx) => renderUseRow(bIdx, fIdx, uIdx)).join("")}
        </div>
      </div>
    `;
  }

  function resolveUnitForMid(major, mid) {
    const node = LIFE_USE_DB?.[major]?.[mid] || null;
    if (!node) return { unitType: "", unitText: "" };
    if (node.terminal === true) return { unitType: node.unitType || "", unitText: node.unitText || "" };
    return { unitType: "", unitText: "" };
  }

  function resolveUnitForMinor(major, mid, minor) {
    const node = LIFE_USE_DB?.[major]?.[mid] || null;
    if (!node || node.terminal !== false) return { unitType: "", unitText: "" };
    const found = (node.minors || []).find(m => m.name === minor);
    return { unitType: found?.unitType || "", unitText: found?.unitText || "" };
  }

  function renderUseRow(bIdx, fIdx, uIdx) {
    const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];

    const majorKeys = Object.keys(LIFE_USE_DB || {});
    const majorOptions = [
      `<option value="" disabled ${u.major?"":"selected"} hidden style="display:none;">대분류</option>`,
      ...majorKeys.map(k => `<option value="${k}" ${u.major===k?"selected":""}>${k}</option>`)
    ].join("");

    const midKeys = u.major ? Object.keys(LIFE_USE_DB[u.major] || {}) : [];
    const midOptions = [
      `<option value="" disabled ${u.mid?"":"selected"} hidden style="display:none;">중분류</option>`,
      ...midKeys.map(k => `<option value="${k}" ${u.mid===k?"selected":""}>${k}</option>`)
    ].join("");

    const midNode  = (u.major && u.mid) ? (LIFE_USE_DB?.[u.major]?.[u.mid] || null) : null;
    const hasMinor = !!(midNode && midNode.terminal===false && Array.isArray(midNode.minors) && midNode.minors.length>0);

    const minorSelectHtml = hasMinor ? `
      <select onchange="window.__lifeOnMinorChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.value)">
        <option value="" disabled ${u.minor?"":"selected"} hidden style="display:none;">소분류</option>
        ${(midNode.minors||[]).map(m=>`<option value="${m.name}" ${u.minor===m.name?"selected":""}>${m.name}</option>`).join("")}
      </select>` : "";

    // 단위 결정
    let resolvedUnit = u.unitType
      ? { unitType: u.unitType, unitText: u.unitText }
      : (hasMinor && u.minor
          ? resolveUnitForMinor(u.major, u.mid, u.minor)
          : (u.mid ? resolveUnitForMid(u.major, u.mid) : { unitType: "", unitText: "" }));

    const unitLabel = resolvedUnit.unitText || (resolvedUnit.unitType==="area"?"㎡":resolvedUnit.unitType==="person"?"인":"");
    const showInput = !!resolvedUnit.unitType;

    const nsWrapHtml = `
      <div class="nsWrap">
        <label class="nsTag">
          <input type="checkbox" ${u.isNonSewage?"checked":""} onchange="window.__lifeOnNonSewageChange('${rootId}',${bIdx},${fIdx},${uIdx},this.checked)" />
          비오수제외
        </label>
        ${u.isNonSewage ? `
          <select class="miniSelect"
            onchange="window.__lifeOnExcludeReasonChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">
            <option value="">사유선택</option>
            <option value="기계실"     ${u.excludeReason==="기계실"    ?"selected":""}>기계실</option>
            <option value="전기실"     ${u.excludeReason==="전기실"    ?"selected":""}>전기실</option>
            <option value="부설주차장" ${u.excludeReason==="부설주차장"?"selected":""}>부설주차장</option>
            <option value="캐노피"     ${u.excludeReason==="캐노피"    ?"selected":""}>캐노피</option>
            <option value="기타"       ${u.excludeReason==="기타"      ?"selected":""}>기타</option>
          </select>` : ""}
      </div>`;

    const hasNoMinor = !hasMinor;
    const gridClass = hasNoMinor ? "useRow noMinor" : "useRow";

    return `
      <div class="${gridClass}">
        <select onchange="window.__lifeOnMajorChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">${majorOptions}</select>
        <select onchange="window.__lifeOnMidChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)">${midOptions}</select>
        ${minorSelectHtml}
        ${showInput ? `
          <input type="text" inputmode="decimal"
            value="${u.inputValue??""}"
            placeholder="면적 또는 인원"
            oninput="window.__lifeOnValueChange('${rootId}',${bIdx},${fIdx},${uIdx},this.value)"
          />
          <div class="unitCell">${unitLabel}</div>
        ` : `<div class="unitCell" style="grid-column:span 2; color:#9ca3af;">용도 선택 후 입력</div>`}
        ${nsWrapHtml}
        <button type="button" class="miniBtnDanger" data-act="removeUseRow" data-b="${bIdx}" data-f="${fIdx}" data-u="${uIdx}">삭제</button>
        <div class="calcHint" id="calc_${rootId}_${bIdx}_${fIdx}_${uIdx}"></div>
      </div>
    `;
  }

  // ── state mutation ───────────────────────────────────────
  function onCommonAreaChange(bIdx, fIdx, val) {
    state.buildings[bIdx].floors[fIdx].commonArea = val;
    updateFloorCalcs(bIdx, fIdx);
  }

  function onSewageMethodChange(bIdx, val) {
    state.buildings[bIdx].sewageMethod = val;
  }

  function onMajorChange(bIdx, fIdx, uIdx, val) {
    const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
    u.major = val; u.mid = ""; u.minor = ""; u.unitType = ""; u.unitText = "";
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function onMidChange(bIdx, fIdx, uIdx, val) {
    const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
    u.mid = val; u.minor = "";
    const resolved = resolveUnitForMid(u.major, val);
    u.unitType = resolved.unitType; u.unitText = resolved.unitText;
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function onMinorChange(bIdx, fIdx, uIdx, val) {
    const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
    u.minor = val;
    const resolved = resolveUnitForMinor(u.major, u.mid, val);
    u.unitType = resolved.unitType; u.unitText = resolved.unitText;
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function onValueChange(bIdx, fIdx, uIdx, val) {
    state.buildings[bIdx].floors[fIdx].uses[uIdx].inputValue = val;
    updateFloorCalcs(bIdx, fIdx);
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function onNonSewageChange(bIdx, fIdx, uIdx, checked) {
    state.buildings[bIdx].floors[fIdx].uses[uIdx].isNonSewage = checked;
    if (!checked) state.buildings[bIdx].floors[fIdx].uses[uIdx].excludeReason = "";
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function onExcludeReasonChange(bIdx, fIdx, uIdx, reason) {
    state.buildings[bIdx].floors[fIdx].uses[uIdx].excludeReason = reason;
  }

  // ── 동/층/용도 추가·삭제 ─────────────────────────────────
  function addBuilding() {
    const nextNo = state.buildings.length
      ? Math.max(...state.buildings.map(b => b.buildingNo)) + 1 : 1;
    state.buildings.push({
      buildingNo: nextNo,
      sewageMethod: "공공하수처리시설",
      selectedPlant: "",
      floors: [{
        floorNo: 1, commonArea: "",
        uses: [{ major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:"" }]
      }]
    });
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function removeBuilding(bIdx) {
    state.buildings.splice(bIdx, 1);
    if (state.buildings.length === 0) addBuilding();
    else render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function addFloor(bIdx) {
    const b      = state.buildings[bIdx];
    const nextNo = b.floors.length ? Math.max(...b.floors.map(f => f.floorNo)) + 1 : 1;
    b.floors.push({
      floorNo: nextNo, commonArea: "",
      uses: [{ major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:"" }]
    });
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function removeFloor(bIdx, fIdx) {
    state.buildings[bIdx].floors.splice(fIdx, 1);
    if (state.buildings[bIdx].floors.length === 0) {
      state.buildings[bIdx].floors.push({
        floorNo:1, commonArea:"",
        uses:[{ major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:"" }]
      });
    }
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function addUseRow(bIdx, fIdx) {
    state.buildings[bIdx].floors[fIdx].uses.push(
      { major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:"" }
    );
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function removeUseRow(bIdx, fIdx, uIdx) {
    state.buildings[bIdx].floors[fIdx].uses.splice(uIdx, 1);
    if (state.buildings[bIdx].floors[fIdx].uses.length === 0) {
      state.buildings[bIdx].floors[fIdx].uses.push(
        { major:"",mid:"",minor:"",inputValue:"",unitType:"",unitText:"",isNonSewage:false,excludeReason:"" }
      );
    }
    render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }

  function bindHouseholdInput() {
    const hc = document.getElementById(householdInputId);
    if (!hc) return;
    hc.addEventListener("input", (e) => {
      state.householdCount = e.target.value;
      if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
    });
  }

  function hasAnyData() {
    if (String(state.householdCount || "").trim() !== "") return true;
    for (const b of state.buildings) {
      for (const f of b.floors) {
        if (String(f.commonArea || "").trim() !== "") return true;
        for (const u of f.uses) {
          if (u.major || u.mid || u.minor || u.inputValue || u.isNonSewage) return true;
        }
      }
    }
    return false;
  }

  return {
    state, render, addBuilding,
    onCommonAreaChange, onSewageMethodChange, onNonSewageChange, onExcludeReasonChange,
    onMajorChange, onMidChange, onMinorChange, onValueChange,
    bindHouseholdInput, hasAnyData,
  };
}

// ── 글로벌 이벤트 브릿지 ─────────────────────────────────────
window.__lifeModules = {};
window.__lifeOnMajorChange        = (id,b,f,u,v) => window.__lifeModules[id]?.onMajorChange(b,f,u,v);
window.__lifeOnMidChange          = (id,b,f,u,v) => window.__lifeModules[id]?.onMidChange(b,f,u,v);
window.__lifeOnMinorChange        = (id,b,f,u,v) => window.__lifeModules[id]?.onMinorChange(b,f,u,v);
window.__lifeOnValueChange        = (id,b,f,u,v) => window.__lifeModules[id]?.onValueChange(b,f,u,v);
window.__lifeOnCommonAreaChange   = (id,b,f,v)   => window.__lifeModules[id]?.onCommonAreaChange(b,f,v);
window.__lifeOnSewageMethodChange = (id,b,v)     => window.__lifeModules[id]?.onSewageMethodChange(b,v);
window.__lifeOnNonSewageChange    = (id,b,f,u,c) => window.__lifeModules[id]?.onNonSewageChange(b,f,u,c);
window.__lifeOnExcludeReasonChange= (id,b,f,u,r) => window.__lifeModules[id]?.onExcludeReasonChange(b,f,u,r);

// ── 인스턴스 생성 ───────────────────────────────────────────
const lifeBefore = createLifeModule({
  rootId: "livingContainer_before",
  listClassName: "buildingList",
  householdInputId: "householdCount_before",
});
const lifeAfter = createLifeModule({
  rootId: "livingContainer_after",
  listClassName: "buildingList",
  householdInputId: "householdCount_after",
});

window.lifeBefore = lifeBefore;
window.lifeAfter  = lifeAfter;

// ── 사업전 입력 비활성화 ─────────────────────────────────────
function setBeforeDisabled(disabled) {
  const el = document.getElementById("beforeInputs");
  if (!el) return;
  el.classList.toggle("lifeDisabled", disabled);
}

function refreshBeforeProofVisibility() {
  const chk  = document.getElementById("beforeNoSource");
  const wrap = document.getElementById("beforeProofWrap");
  if (!chk || !wrap) return;
  if (chk.checked) { wrap.classList.add("hidden"); return; }
  lifeBefore.hasAnyData() ? wrap.classList.remove("hidden") : wrap.classList.add("hidden");
}

function bindBeforeNoSource() {
  const chk = document.getElementById("beforeNoSource");
  if (!chk) return;
  chk.addEventListener("change", () => {
    setBeforeDisabled(chk.checked);
    refreshBeforeProofVisibility();
  });
}

function bindBeforeProofUpload() {
  const input = document.getElementById("beforeProof");
  const list  = document.getElementById("beforeProofList");
  if (!input || !list) return;
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (!files.length) { list.textContent = ""; return; }
    list.innerHTML = files.map(f =>
      `• ${String(f.name).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")} (${Math.ceil(f.size/1024)} KB)`
    ).join("<br/>");
  });
}

function bindBeforeInputWatcher() {
  const el = document.getElementById("beforeInputs");
  if (!el) return;
  el.addEventListener("input",  () => refreshBeforeProofVisibility(), true);
  el.addEventListener("change", () => refreshBeforeProofVisibility(), true);
}

// ★ DOMContentLoaded는 ui-basic.js에서 단일 관리 ★
// (이 파일에서는 선언만, 실행은 ui-basic.js의 DOMContentLoaded 안에서)
window.__lifeModules["livingContainer_before"] = lifeBefore;
window.__lifeModules["livingContainer_after"]  = lifeAfter;
