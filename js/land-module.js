// ================================
    // 토지계
    // ================================
    const LAND_ITEMS = [
      "전","답","과수원","목장용지","공원","묘지","사적지",
      "임야","광천지","염전","제방","하천","구거","유지","양어장","잡종지",
      "대지","공장용지","학교","창고","종교",
      "주차장","도로","철도","수도",
      "주유소","체육용지","유원지"
    ];
    const LAND_GROUP_DIVIDER_STARTS = new Set(["광천지","학교","주차장"]);

    const landState = {
      before: Object.fromEntries(LAND_ITEMS.map(k => [k, ""])),
      after:  Object.fromEntries(LAND_ITEMS.map(k => [k, ""]))
    };

    function onLandChange(mode, name, val){
      landState[mode][name] = val;
    }

    function renderLandList(targetId, mode){
      const root = document.getElementById(targetId);
      if(!root) return;

      const list = document.createElement("div");
      list.className = "landList";

      LAND_ITEMS.forEach((name)=>{
        const row = document.createElement("div");
        row.className = "landRow";
        if(LAND_GROUP_DIVIDER_STARTS.has(name)) row.classList.add("groupDivider");

        row.innerHTML = `
          <div class="landLabel">${name}</div>
          <input type="text" inputmode="decimal" placeholder="면적 입력" value="${landState[mode][name] ?? ""}" />
          <div class="landUnit">m²</div>
        `;

        const input = row.querySelector("input");
        input.addEventListener("input", (e)=> onLandChange(mode, name, e.target.value));

        list.appendChild(row);
      });

      root.innerHTML = "";
      root.appendChild(list);
    }

// ── window 노출 (calc.js에서 window.landState로 접근) ──────────
window.landState = landState;
window.renderLandList = renderLandList;
window.onLandChange = onLandChange;
