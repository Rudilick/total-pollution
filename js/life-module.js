// ================================
    // 생활계 모듈 (진짜 동적 UI + 비오수 + 공용면적 배분 + (1번) 동별 처리방식 B)
    // ================================
    function createLifeModule(opts){
      const { rootId, listClassName, householdInputId } = opts;

      const state = {
        householdCount: "",
        buildings: [
          { buildingNo: 1, sewageMethod: "공공하수처리시설", floors: [
            {
              floorNo: 1,
              commonArea: "",
              uses: [ { major: "", mid: "", minor: "", inputValue: "", unitType: "", unitText: "", isNonSewage: false, excludeReason: "" } ]
            }
          ] }
        ]
      };

      function unitLabelFromRow(u){
        return u?.unitText || (u?.unitType === "area" ? "㎡" : u?.unitType === "person" ? "인" : "");
      }

      function computeFloorCalcs(floor){
        const common = parseNum(floor.commonArea);
        const bases = floor.uses.map(u => parseNum(u.inputValue));
        const targets = floor.uses
          .map((u, idx)=>({u, idx, base: bases[idx]}))
          .filter(x => x.u.unitType === "area" && !x.u.isNonSewage && x.base > 0);

        const sumArea = targets.reduce((a,x)=>a+x.base,0);

        const map = {};
        floor.uses.forEach((u, idx)=>{
          const base = bases[idx];

          if(u.isNonSewage){
            map[idx] = { base, alloc: 0, final: 0, note: "비오수 제외" };
            return;
          }

          if(u.unitType === "area"){
            const alloc = sumArea > 0 ? common * (base / sumArea) : 0;
            map[idx] = { base, alloc, final: base + alloc, note: "" };
            return;
          }

          map[idx] = { base, alloc: 0, final: base, note: "" };
        });

        return { common, sumArea, map };
      }

      function updateFloorCalcs(bIdx, fIdx){
        const floor = state.buildings[bIdx]?.floors[fIdx];
        if(!floor) return;

        const { map } = computeFloorCalcs(floor);

        floor.uses.forEach((u, uIdx)=>{
          const el = document.getElementById(`calc_${rootId}_${bIdx}_${fIdx}_${uIdx}`);
          if(!el) return;

          const c = map[uIdx];
          const unit = unitLabelFromRow(u);

          if(!u.unitType){
            el.textContent = "";
            return;
          }

          if(u.isNonSewage){
            el.textContent = `비오수 제외 | 입력: ${fmtNum(c.base)} ${unit || ""}`.trim();
            return;
          }

          if(u.unitType === "area"){
            el.textContent = `연면적: ${fmtNum(c.base)} ㎡ | 공용배분: ${fmtNum(c.alloc)} ㎡ | 최종: ${fmtNum(c.final)} ㎡`;
            return;
          }

          if(u.unitType === "person"){
            el.textContent = `인원: ${fmtNum(c.base)} ${unit || "인"}`;
            return;
          }

          el.textContent = unit ? `입력: ${fmtNum(c.base)} ${unit}` : "";
        });
      }

      function updateAllCalcs(){
        state.buildings.forEach((b, bIdx)=> b.floors.forEach((f, fIdx)=> updateFloorCalcs(bIdx, fIdx)));
      }

      function render(){
        const root = document.getElementById(rootId);
        if(!root) return;

        root.innerHTML = `<div class="${listClassName}"></div>`;
        const list = root.querySelector(`.${listClassName}`);

        state.buildings.forEach((b, bIdx)=>{
          const buildingCard = document.createElement("div");
          buildingCard.className = "buildingCard";

          buildingCard.innerHTML = `
            <div class="buildingHead">
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <div class="buildingTitle">${b.buildingNo}동</div>
                <select class="miniSelect" style="min-width:220px;" onchange="window.__lifeOnSewageMethodChange(\'${rootId}\', ${bIdx}, this.value)">
                  <option value="공공하수처리시설" ${b.sewageMethod==="공공하수처리시설"?"selected":""}>공공하수처리시설</option>
                  <option value="개인오수처리시설" ${b.sewageMethod==="개인오수처리시설"?"selected":""}>개인오수처리시설</option>
                  <option value="재래식화장실" ${b.sewageMethod==="재래식화장실"?"selected":""}>재래식화장실</option>
                </select>
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="miniBtn" data-act="addFloor" data-b="${bIdx}">+ 층 추가</button>
                <button type="button" class="miniBtnDanger" data-act="removeBuilding" data-b="${bIdx}">동 삭제</button>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
              ${b.floors.map((f, fIdx)=> renderFloorBlock(bIdx, fIdx)).join("")}
            </div>
          `;
          list.appendChild(buildingCard);
        });

        root.querySelectorAll("[data-act]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const act = btn.dataset.act;
            const b = Number(btn.dataset.b);
            const f = btn.dataset.f !== undefined ? Number(btn.dataset.f) : null;
            const u = btn.dataset.u !== undefined ? Number(btn.dataset.u) : null;

            if(act === "addFloor") addFloor(b);
            if(act === "removeBuilding") removeBuilding(b);
            if(act === "addUseRow") addUseRow(b, f);
            if(act === "removeFloor") removeFloor(b, f);
            if(act === "removeUseRow") removeUseRow(b, f, u);
          });
        });

        updateAllCalcs();
      }

      function renderFloorBlock(bIdx, fIdx){
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
                <button type="button" class="miniBtn" data-act="addUseRow" data-b="${bIdx}" data-f="${fIdx}">+ 건축물용도 추가</button>
                <button type="button" class="miniBtnDanger" data-act="removeFloor" data-b="${bIdx}" data-f="${fIdx}">층 삭제</button>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
              ${floor.uses.map((u, uIdx)=> renderUseRow(bIdx, fIdx, uIdx)).join("")}
            </div>
          </div>
        `;
      }

      function resolveUnitForMid(major, mid){
        const node = LIFE_USE_DB?.[major]?.[mid] || null;
        if(!node) return { unitType:"", unitText:"" };
        if(node.terminal === true){
          return { unitType: node.unitType || "", unitText: node.unitText || "" };
        }
        return { unitType:"", unitText:"" };
      }

      function resolveUnitForMinor(major, mid, minor){
        const node = LIFE_USE_DB?.[major]?.[mid] || null;
        if(!node || node.terminal !== false) return { unitType:"", unitText:"" };
        const found = (node.minors || []).find(m => m.name === minor);
        return { unitType: found?.unitType || "", unitText: found?.unitText || "" };
      }

      function renderUseRow(bIdx, fIdx, uIdx){
        const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];

        const majorKeys = Object.keys(LIFE_USE_DB || {});
        const majorOptions = [
          `<option value="" disabled ${u.major ? "" : "selected"} hidden style="display:none;">대분류</option>`,
          ...majorKeys.map(k => `<option value="${k}" ${u.major===k?"selected":""}>${k}</option>`)
        ].join("");

        const midKeys = u.major ? Object.keys(LIFE_USE_DB[u.major] || {}) : [];
        const midOptions = [
          `<option value="" disabled ${u.mid ? "" : "selected"} hidden style="display:none;">중분류</option>`,
          ...midKeys.map(k => `<option value="${k}" ${u.mid===k?"selected":""}>${k}</option>`)
        ].join("");

        const midNode = (u.major && u.mid) ? (LIFE_USE_DB?.[u.major]?.[u.mid] || null) : null;
        const hasMinor = !!(midNode && midNode.terminal === false && Array.isArray(midNode.minors) && midNode.minors.length > 0);

        const minorSelectHtml = hasMinor ? `
          <select onchange="window.__lifeOnMinorChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.value)">
            <option value="" disabled ${u.minor ? "" : "selected"} hidden style="display:none;">소분류</option>
            ${midNode.minors.map(obj => `<option value="${obj.name}" ${u.minor===obj.name?"selected":""}>${obj.name}</option>`).join("")}
          </select>
        ` : "";

        const unitText = unitLabelFromRow(u) || "-";

        const canInput = !!u.unitType;
        const placeholder = !u.major ? "대분류 선택" : (!u.mid ? "중분류 선택" : (hasMinor && !u.minor ? "소분류 선택" : (u.unitType==="person" ? "인원 입력" : "면적 입력")));

        const reasonOptions = [
          `<option value="">예외사유(선택)</option>`,
          `<option value="기계실" ${u.excludeReason==="기계실"?"selected":""}>기계실</option>`,
          `<option value="전기실" ${u.excludeReason==="전기실"?"selected":""}>전기실</option>`,
          `<option value="부속주차장" ${u.excludeReason==="부속주차장"?"selected":""}>부속주차장</option>`,
          `<option value="기타" ${u.excludeReason==="기타"?"selected":""}>기타</option>`
        ].join("");

        return `
          <div class="useRow ${hasMinor ? "" : "noMinor"}">
            <select onchange="window.__lifeOnMajorChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.value)">${majorOptions}</select>
            <select onchange="window.__lifeOnMidChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.value)">${midOptions}</select>

            ${minorSelectHtml}

            <input type="text" inputmode="decimal"
              placeholder="${placeholder}"
              value="${u.inputValue ?? ""}"
              ${canInput ? "" : "disabled"}
              oninput="window.__lifeOnValueChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.value)"
            />

            <div class="unitCell">${unitText}</div>

            <div class="nsWrap">
              <label class="nsTag" title="비오수배출시설(오수 산정 제외)">
                <input type="checkbox" ${u.isNonSewage ? "checked" : ""}
                  onchange="window.__lifeOnNonSewageChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.checked)"
                />
                비오수
              </label>
              <select class="miniSelect"
                onchange="window.__lifeOnExcludeReasonChange('${rootId}', ${bIdx},${fIdx},${uIdx}, this.value)"
              >${reasonOptions}</select>
            </div>

            <button type="button" class="miniBtnDanger" data-act="removeUseRow" data-b="${bIdx}" data-f="${fIdx}" data-u="${uIdx}">삭제</button>

            <div class="calcHint" id="calc_${rootId}_${bIdx}_${fIdx}_${uIdx}"></div>
          </div>
        `;
      }

      function onCommonAreaChange(bIdx, fIdx, val){
        state.buildings[bIdx].floors[fIdx].commonArea = val;
        updateFloorCalcs(bIdx, fIdx);
        refreshBeforeProofVisibility();
      }

      function onExcludeReasonChange(bIdx, fIdx, uIdx, reason){
        const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
        u.excludeReason = reason || "";
        if(reason){
          u.isNonSewage = true;
        }
        render();
        refreshBeforeProofVisibility();
      }

      function onSewageMethodChange(bIdx, val){
        const b = state.buildings[bIdx];
        if(!b) return;
        b.sewageMethod = val || "공공하수처리시설";
        refreshBeforeProofVisibility();
      }

      function onNonSewageChange(bIdx, fIdx, uIdx, checked){
        const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
        u.isNonSewage = !!checked;
        if(!u.isNonSewage){
          u.excludeReason = "";
        }
        updateFloorCalcs(bIdx, fIdx);
        refreshBeforeProofVisibility();
      }

      function onMajorChange(bIdx,fIdx,uIdx,val){
        const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
        u.major = val;
        u.mid = "";
        u.minor = "";
        u.unitType = "";
        u.unitText = "";
        u.inputValue = "";
        u.isNonSewage = false;
        u.excludeReason = "";
        render();
        refreshBeforeProofVisibility();
      }

      function onMidChange(bIdx,fIdx,uIdx,val){
        const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
        u.mid = val;
        u.minor = "";
        u.inputValue = "";
        u.isNonSewage = false;
        u.excludeReason = "";

        const midNode = (u.major && u.mid) ? (LIFE_USE_DB?.[u.major]?.[u.mid] || null) : null;
        if(midNode && midNode.terminal === true){
          const unit = resolveUnitForMid(u.major, u.mid);
          u.unitType = unit.unitType;
          u.unitText = unit.unitText;
        } else {
          u.unitType = "";
          u.unitText = "";
        }

        render();
        refreshBeforeProofVisibility();
      }

      function onMinorChange(bIdx,fIdx,uIdx,val){
        const u = state.buildings[bIdx].floors[fIdx].uses[uIdx];
        u.minor = val;
        u.inputValue = "";
        u.isNonSewage = false;
        u.excludeReason = "";

        const unit = resolveUnitForMinor(u.major, u.mid, u.minor);
        u.unitType = unit.unitType;
        u.unitText = unit.unitText;

        render();
        refreshBeforeProofVisibility();
      }

      function onValueChange(bIdx,fIdx,uIdx,val){
        state.buildings[bIdx].floors[fIdx].uses[uIdx].inputValue = val;
        updateFloorCalcs(bIdx, fIdx);
        refreshBeforeProofVisibility();
      }

      function addBuilding(){
        const nextNo = state.buildings.length
          ? Math.max(...state.buildings.map(b=>b.buildingNo)) + 1
          : 1;

        state.buildings.push({
          buildingNo: nextNo,
          sewageMethod: "공공하수처리시설",
          floors: [{
            floorNo: 1,
            commonArea: "",
            uses: [{ major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }]
          }]
        });
        render();
        refreshBeforeProofVisibility();
      }

      function removeBuilding(bIdx){
        state.buildings.splice(bIdx, 1);
        if(state.buildings.length === 0){
          state.buildings.push({
            buildingNo: 1,
            sewageMethod: "공공하수처리시설",
            floors: [{
              floorNo: 1,
              commonArea: "",
              uses: [{ major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }]
            }]
          });
        }
        render();
        refreshBeforeProofVisibility();
      }

      function addFloor(bIdx){
        const b = state.buildings[bIdx];
        const nextNo = b.floors.length ? Math.max(...b.floors.map(f=>f.floorNo)) + 1 : 1;
        b.floors.push({
          floorNo: nextNo,
          commonArea: "",
          uses: [{ major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }]
        });
        render();
        refreshBeforeProofVisibility();
      }

      function removeFloor(bIdx, fIdx){
        state.buildings[bIdx].floors.splice(fIdx, 1);
        if(state.buildings[bIdx].floors.length === 0){
          state.buildings[bIdx].floors.push({
            floorNo: 1,
            commonArea: "",
            uses: [{ major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }]
          });
        }
        render();
        refreshBeforeProofVisibility();
      }

      function addUseRow(bIdx, fIdx){
        state.buildings[bIdx].floors[fIdx].uses.push(
          { major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }
        );
        render();
        refreshBeforeProofVisibility();
      }

      function removeUseRow(bIdx, fIdx, uIdx){
        state.buildings[bIdx].floors[fIdx].uses.splice(uIdx, 1);
        if(state.buildings[bIdx].floors[fIdx].uses.length === 0){
          state.buildings[bIdx].floors[fIdx].uses.push(
            { major:"", mid:"", minor:"", inputValue:"", unitType:"", unitText:"", isNonSewage:false, excludeReason:"" }
          );
        }
        render();
        refreshBeforeProofVisibility();
      }

      function bindHouseholdInput(){
        const hc = document.getElementById(householdInputId);
        if(!hc) return;
        hc.addEventListener("input", (e)=>{
          state.householdCount = e.target.value;
          refreshBeforeProofVisibility();
        });
      }

      function hasAnyData(){
        if(String(state.householdCount || "").trim() !== "") return true;

        for(const b of state.buildings){
          if(String(b.sewageMethod||"").trim()) return true;
          for(const f of b.floors){
            if(String(f.commonArea || "").trim() !== "") return true;
            for(const u of f.uses){
              if(String(u.major||"").trim()) return true;
              if(String(u.mid||"").trim()) return true;
              if(String(u.minor||"").trim()) return true;
              if(String(u.inputValue||"").trim()) return true;
              if(String(u.unitType||"").trim()) return true;
              if(u.isNonSewage) return true;
              if(String(u.excludeReason||"").trim()) return true;
            }
          }
        }
        return false;
      }

      return {
        state,
        render,
        addBuilding,
        onCommonAreaChange,
        onSewageMethodChange,
        onNonSewageChange,
        onExcludeReasonChange,
        onMajorChange,
        onMidChange,
        onMinorChange,
        onValueChange,
        bindHouseholdInput,
        hasAnyData
      };
    }

    window.__lifeModules = {};
    window.__lifeOnMajorChange = (rootId,b,f,u,val)=> window.__lifeModules[rootId]?.onMajorChange(b,f,u,val);
    window.__lifeOnMidChange   = (rootId,b,f,u,val)=> window.__lifeModules[rootId]?.onMidChange(b,f,u,val);
    window.__lifeOnMinorChange = (rootId,b,f,u,val)=> window.__lifeModules[rootId]?.onMinorChange(b,f,u,val);
    window.__lifeOnValueChange = (rootId,b,f,u,val)=> window.__lifeModules[rootId]?.onValueChange(b,f,u,val);
    window.__lifeOnCommonAreaChange    = (rootId,b,f,val)=> window.__lifeModules[rootId]?.onCommonAreaChange(b,f,val);
    window.__lifeOnSewageMethodChange  = (rootId,b,val)=> window.__lifeModules[rootId]?.onSewageMethodChange(b,val);
    window.__lifeOnNonSewageChange     = (rootId,b,f,u,checked)=> window.__lifeModules[rootId]?.onNonSewageChange(b,f,u,checked);
    window.__lifeOnExcludeReasonChange = (rootId,b,f,u,reason)=> window.__lifeModules[rootId]?.onExcludeReasonChange(b,f,u,reason);

    const lifeBefore = createLifeModule({
      rootId: "livingContainer_before",
      listClassName: "buildingList",
      householdInputId: "householdCount_before"
    });
    const lifeAfter = createLifeModule({
      rootId: "livingContainer_after",
      listClassName: "buildingList",
      householdInputId: "householdCount_after"
    });

    window.lifeBefore = lifeBefore;
    window.lifeAfter = lifeAfter;

    function setBeforeDisabled(disabled){
      const beforeInputs = document.getElementById("beforeInputs");
      if(!beforeInputs) return;
      beforeInputs.classList.toggle("lifeDisabled", disabled);
    }

    function refreshBeforeProofVisibility(){
      const chk = document.getElementById("beforeNoSource");
      const wrap = document.getElementById("beforeProofWrap");
      if(!chk || !wrap) return;

      if(chk.checked){
        wrap.classList.add("hidden");
        return;
      }

      if(lifeBefore.hasAnyData()){
        wrap.classList.remove("hidden");
      } else {
        wrap.classList.add("hidden");
      }
    }

    function bindBeforeNoSource(){
      const chk = document.getElementById("beforeNoSource");
      if(!chk) return;

      chk.addEventListener("change", ()=>{
        setBeforeDisabled(chk.checked);
        refreshBeforeProofVisibility();
      });
    }

    function bindBeforeProofUpload(){
      const input = document.getElementById("beforeProof");
      const list = document.getElementById("beforeProofList");
      if(!input || !list) return;

      input.addEventListener("change", ()=>{
        const files = Array.from(input.files || []);
        if(files.length === 0){
          list.textContent = "";
          return;
        }
        list.innerHTML = files.map(f => `• ${escapeHtml(f.name)} (${Math.ceil(f.size/1024)} KB)`).join("<br/>");
      });
    }

    function escapeHtml(str){
      return String(str)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

    function bindBeforeInputWatcher(){
      const beforeInputs = document.getElementById("beforeInputs");
      if(!beforeInputs) return;

      beforeInputs.addEventListener("input", ()=> refreshBeforeProofVisibility(), true);
      beforeInputs.addEventListener("change", ()=> refreshBeforeProofVisibility(), true);
    }

    document.addEventListener("DOMContentLoaded", ()=>{
      window.__lifeModules["livingContainer_before"] = lifeBefore;
      window.__lifeModules["livingContainer_after"] = lifeAfter;

      bindLifeExcelUpload();

      // ★ GitHub에서 원단위 엑셀 자동 로드 (로드 완료 후 render 포함)
      loadExcelDB(DB_EXCEL_URL).finally(() => {
        lifeBefore.render();
        lifeAfter.render();
        refreshBeforeProofVisibility();
      });

      lifeBefore.bindHouseholdInput();
      lifeAfter.bindHouseholdInput();

      bindBeforeNoSource();
      bindBeforeProofUpload();
      bindBeforeInputWatcher();

      setBeforeDisabled(false);
      refreshBeforeProofVisibility();

      renderLandList("landContainer_before", "before");
      renderLandList("landContainer_after", "after");
    });
