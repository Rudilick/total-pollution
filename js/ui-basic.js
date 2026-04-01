// =========================
    // 탭 로직
    // =========================
    (function initTabs(){
      const btns = Array.from(document.querySelectorAll(".tabBtn"));
      const panels = Array.from(document.querySelectorAll(".tabPanel"));

      function activate(id){
        btns.forEach(b => b.classList.toggle("active", b.dataset.tab === id));
        panels.forEach(p => p.classList.toggle("active", p.id === id));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      btns.forEach(b => b.addEventListener("click", () => activate(b.dataset.tab)));
    })();

    // =========================
    // 기본 select 채우기
    // =========================
    const zoneMap = {
      "주거지역": ["전용주거지역", "일반주거지역", "준주거지역"],
      "상업지역": ["중심상업지역", "일반상업지역", "근린상업지역", "유통상업지역"],
      "공업지역": ["전용공업지역", "일반공업지역", "준공업지역"],
      "녹지지역": ["보전녹지지역", "생산녹지지역", "자연녹지지역"],
      "관리지역": ["계획관리지역", "생산관리지역", "보전관리지역"],
      "자연보전지역": ["자연보전지역"]
    };

    const bizTypes = [
      "「국토의 계획 및 이용에 관한 법률」제30조에 따른 관계기관 협의사업",
      "「농어촌정비법」에 따른 농어촌생활환경정비사업",
      "「건축법」제2조에 따른 공동주택을 30세대 이상 건축하는 사업",
      "　30세대 이상의 주택과 주택외의 시설물을 동일건축물로 건축하는 사업",
      "「수도권정비계획법 시행령」제3조제4호에서 정의하고 있는 업무용 건축물, 판매용 건축물, 복합 건축물을 건축하는 사업",
      "「환경영향평가법」제2조제4호에 따른 환경영향평가 등의 대상사업",
      "　특대유역에서 「하수도법」 제2조제1호에 따른 하수를 배출하는 건축물이나 그 밖의 시설물을 설치하는 사업"
    ];

    function pad2(n){ return String(n).padStart(2, "0"); }

    function fillYearMonthSelects() {
      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth() + 1;

      const yearSel = document.getElementById("yearSelect");
      const monthSel = document.getElementById("monthSelect");
      const startYearSel = document.getElementById("startYearSelect");
      const completeYearSel = document.getElementById("completeYearSelect");

      if(!yearSel || !monthSel || !startYearSel || !completeYearSel) return;

      const startYear = thisYear - 10;
      const endYear = thisYear + 10;

      yearSel.innerHTML = "";
      for (let y = endYear; y >= startYear; y--) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = `${y}년`;
        if (y === thisYear) opt.selected = true;
        yearSel.appendChild(opt);
      }

      monthSel.innerHTML = "";
      for (let m = 1; m <= 12; m++) {
        const opt = document.createElement("option");
        opt.value = pad2(m);
        opt.textContent = `${m}월`;
        if (m === thisMonth) opt.selected = true;
        monthSel.appendChild(opt);
      }

      const years = [];
      for (let y = startYear; y <= endYear; y++) years.push(y);

      startYearSel.innerHTML = "";
      completeYearSel.innerHTML = "";
      years.forEach(y => {
        const o1 = document.createElement("option");
        o1.value = String(y);
        o1.textContent = `${y}년`;
        if (y === thisYear) o1.selected = true;
        startYearSel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = String(y);
        o2.textContent = `${y}년`;
        if (y === thisYear) o2.selected = true;
        completeYearSel.appendChild(o2);
      });
    }

    function fillZoneSelects() {
      const mainSel = document.getElementById("zoneMainSelect");
      const subSel = document.getElementById("zoneSubSelect");
      if(!mainSel || !subSel) return;

      mainSel.innerHTML = "";
      Object.keys(zoneMap).forEach((k, idx) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        if (idx === 0) opt.selected = true;
        mainSel.appendChild(opt);
      });

      function refreshSub() {
        const main = mainSel.value;
        const subs = zoneMap[main] || [];
        subSel.innerHTML = "";
        subs.forEach((s, idx) => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          if (idx === 0) opt.selected = true;
          subSel.appendChild(opt);
        });
      }

      mainSel.addEventListener("change", refreshSub);
      refreshSub();
    }

    function fillBizTypeSelect() {
      const sel = document.getElementById("bizTypeSelect");
      if(!sel) return;
      sel.innerHTML = "";
      bizTypes.forEach((t, idx) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (idx === 0) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    document.addEventListener("DOMContentLoaded", () => {
      fillYearMonthSelects();
      fillZoneSelects();
      fillBizTypeSelect();
    });

    // 생활계/토지계 모듈 초기화 (life-module.js, land-module.js 로드 후 실행됨)
    document.addEventListener("DOMContentLoaded", () => {
      // 모듈 등록
      window.__lifeModules = window.__lifeModules || {};
      window.__lifeModules["livingContainer_before"] = window.lifeBefore;
      window.__lifeModules["livingContainer_after"]  = window.lifeAfter;

      bindLifeExcelUpload();

      // ★ GitHub에서 원단위 엑셀 자동 로드 → 완료 후 UI 렌더
      loadExcelDB(DB_EXCEL_URL).finally(() => {
        if (window.lifeBefore) { window.lifeBefore.render(); window.lifeBefore.bindHouseholdInput(); }
        if (window.lifeAfter)  { window.lifeAfter.render();  window.lifeAfter.bindHouseholdInput(); }
        refreshBeforeProofVisibility();
      });

      bindBeforeNoSource();
      bindBeforeProofUpload();
      bindBeforeInputWatcher();
      setBeforeDisabled(false);
      refreshBeforeProofVisibility();

      renderLandList("landContainer_before", "before");
      renderLandList("landContainer_after", "after");
    });
