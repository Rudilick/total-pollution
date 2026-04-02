// ================================================================
// ui-basic.js  ─  탭/셀렉트 초기화, DOMContentLoaded 단일 관리
// [변경] fillPlantSelects: 처리장 용량·관거비율 정보 툴팁 추가
//        계산 결과 요약 테이블 업데이트
// ================================================================

// ── 탭 로직 ─────────────────────────────────────────────────
(function initTabs() {
  const btns   = Array.from(document.querySelectorAll(".tabBtn"));
  const panels = Array.from(document.querySelectorAll(".tabPanel"));

  function activate(id) {
    btns.forEach(b   => b.classList.toggle("active", b.dataset.tab === id));
    panels.forEach(p => p.classList.toggle("active", p.id === id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  btns.forEach(b => b.addEventListener("click", () => activate(b.dataset.tab)));
})();

// ── 기본 Select 데이터 ────────────────────────────────────────
const zoneMap = {
  "주거지역": ["전용주거지역", "일반주거지역", "준주거지역"],
  "상업지역": ["중심상업지역", "일반상업지역", "근린상업지역", "유통상업지역"],
  "공업지역": ["전용공업지역", "일반공업지역", "준공업지역"],
  "녹지지역": ["보전녹지지역", "생산녹지지역", "자연녹지지역"],
  "관리지역": ["계획관리지역", "생산관리지역", "보전관리지역"],
  "자연보전지역": ["자연보전지역"],
};

const bizTypes = [
  "「국토의 계획 및 이용에 관한 법률」제30조에 따른 관계기관 협의사업",
  "「농어촌정비법」에 따른 농어촌생활환경정비사업",
  "「건축법」제2조에 따른 공동주택을 30세대 이상 건축하는 사업",
  "　30세대 이상의 주택과 주택외의 시설물을 동일건축물로 건축하는 사업",
  "「수도권정비계획법 시행령」제3조제4호에서 정의하고 있는 업무용·판매용·복합 건축물을 건축하는 사업",
  "「환경영향평가법」제2조제4호에 따른 환경영향평가 등의 대상사업",
  "　특대유역에서 「하수도법」 제2조제1호에 따른 하수를 배출하는 건축물이나 그 밖의 시설물을 설치하는 사업",
];

function pad2(n) { return String(n).padStart(2, "0"); }

// ── 년월 셀렉트 ──────────────────────────────────────────────
function fillYearMonthSelects() {
  const now       = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  const yearSel        = document.getElementById("yearSelect");
  const monthSel       = document.getElementById("monthSelect");
  const startYearSel   = document.getElementById("startYearSelect");
  const completeYearSel= document.getElementById("completeYearSelect");
  if (!yearSel || !monthSel || !startYearSel || !completeYearSel) return;

  const startYear = thisYear - 10;
  const endYear   = thisYear + 10;

  yearSel.innerHTML = "";
  for (let y = endYear; y >= startYear; y--) {
    const opt = document.createElement("option");
    opt.value = String(y); opt.textContent = `${y}년`;
    if (y === thisYear) opt.selected = true;
    yearSel.appendChild(opt);
  }

  monthSel.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = pad2(m); opt.textContent = `${m}월`;
    if (m === thisMonth) opt.selected = true;
    monthSel.appendChild(opt);
  }

  [startYearSel, completeYearSel].forEach(sel => {
    sel.innerHTML = "";
    for (let y = startYear; y <= endYear; y++) {
      const opt = document.createElement("option");
      opt.value = String(y); opt.textContent = `${y}년`;
      if (y === thisYear) opt.selected = true;
      sel.appendChild(opt);
    }
  });
}

// ── 용도지역 셀렉트 ──────────────────────────────────────────
function fillZoneSelects() {
  const mainSel = document.getElementById("zoneMainSelect");
  const subSel  = document.getElementById("zoneSubSelect");
  if (!mainSel || !subSel) return;

  mainSel.innerHTML = "";
  Object.keys(zoneMap).forEach((k, idx) => {
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = k;
    if (idx === 0) opt.selected = true;
    mainSel.appendChild(opt);
  });

  function refreshSub() {
    const subs = zoneMap[mainSel.value] || [];
    subSel.innerHTML = "";
    subs.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      if (idx === 0) opt.selected = true;
      subSel.appendChild(opt);
    });
  }
  mainSel.addEventListener("change", refreshSub);
  refreshSub();
}

// ── 사업종류 셀렉트 ──────────────────────────────────────────
function fillBizTypeSelect() {
  const sel = document.getElementById("bizTypeSelect");
  if (!sel) return;
  sel.innerHTML = "";
  bizTypes.forEach((t, idx) => {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    if (idx === 0) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── 처리장 드롭다운 채우기 ───────────────────────────────────
function fillPlantSelects() {
  const db = typeof SEWAGE_PLANT_DB !== "undefined" ? SEWAGE_PLANT_DB : [];

  ["beforePlantSelect", "afterPlantSelect"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">처리장 선택</option>';

    db.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.name;

      // 관거배출유량비 계산 (% 표시)
      const leakPct = ((p.leakRatioFlow || 0) * 100).toFixed(4);

      opt.textContent = `${p.name}` +
        ` | BOD ${p.efflBOD} T-P ${p.efflTP} mg/L` +
        (Number(leakPct) > 0 ? ` | 누수비 ${leakPct}%` : "");
      sel.appendChild(opt);
    });

    if (cur) sel.value = cur;
  });
}

// ── 지자체 변경 시 인구수 원단위 자동 입력 ────────────────────
function onSigunChange() {
  const sido   = document.getElementById("sigunguSido")?.value  || "";
  const sigun  = document.getElementById("sigunguSigun")?.value || "";
  const popInput = document.getElementById("popUnitInput");
  if (!popInput || !sigun) return;

  const db    = typeof POPULATION_UNIT_DB !== "undefined" ? POPULATION_UNIT_DB : [];
  const found = db.find(p => p.sigun === sigun || (p.sido === sido && p.sigun === sigun));
  if (found) {
    popInput.value = found.unit;
    popInput.style.background = "#f0fdf4";
  } else {
    popInput.style.background = "";
  }
}
window.onSigunChange = onSigunChange;

// ── 계산 실행 ─────────────────────────────────────────────────
function runAndGenerate() {
  if (typeof runCalc !== "function") { alert("calc.js가 로드되지 않았습니다."); return; }
  const result = runCalc();
  _showCalcSummary(result);
  if (typeof generateDoc === "function") generateDoc(result);
}

function runCalcOnly() {
  if (typeof runCalc !== "function") { alert("calc.js가 로드되지 않았습니다."); return; }
  const result = runCalc();
  _showCalcSummary(result);
}

function _showCalcSummary(result) {
  const el = document.getElementById("calc-result-summary");
  if (!el || !result) return;

  const f  = n => (typeof n === "number" ? n.toFixed(4) : "-");
  const d  = result.최종배출부하량;
  const ls = result.생활계.사업후.합계;
  const lb = result.생활계.사업전.합계;
  const ts = result.토지계;

  el.style.display = "block";
  el.innerHTML = `
    <strong>✅ 계산 완료 (${result.계산일시})</strong>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;">
      <tr style="background:#dbeafe;">
        <th style="padding:4px 8px;text-align:left;border:1px solid #93c5fd;">구분</th>
        <th style="padding:4px 8px;border:1px solid #93c5fd;">오수발생량(㎥/일)</th>
        <th style="padding:4px 8px;border:1px solid #93c5fd;">발생BOD(kg/일)</th>
        <th style="padding:4px 8px;border:1px solid #93c5fd;">배출BOD(kg/일)</th>
        <th style="padding:4px 8px;border:1px solid #93c5fd;">발생T-P(kg/일)</th>
        <th style="padding:4px 8px;border:1px solid #93c5fd;">배출T-P(kg/일)</th>
      </tr>
      <tr>
        <td style="padding:4px 8px;border:1px solid #bfdbfe;">생활계 사업전</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(lb.오수발생유량)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(lb.발생부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(lb.배출부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(lb.발생부하량.TP)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(lb.배출부하량.TP)}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;border:1px solid #bfdbfe;">생활계 사업후</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ls.오수발생유량)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ls.발생부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ls.배출부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ls.발생부하량.TP)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ls.배출부하량.TP)}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;border:1px solid #bfdbfe;">토지계 사업전</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">-</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업전.합계.발생부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업전.합계.배출부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업전.합계.발생부하량.TP)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업전.합계.배출부하량.TP)}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;border:1px solid #bfdbfe;">토지계 사업후</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">-</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업후.합계.발생부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업후.합계.배출부하량.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업후.합계.발생부하량.TP)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(ts.사업후.합계.배출부하량.TP)}</td>
      </tr>
      <tr style="background:#fef9c3;">
        <td style="padding:4px 8px;border:1px solid #fde047;font-weight:bold;">점오염 증가량</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #fde047;">-</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #fde047;font-weight:bold;">${f(d.점오염.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #fde047;">-</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #fde047;font-weight:bold;">${f(d.점오염.TP)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #fde047;">-</td>
      </tr>
      <tr>
        <td style="padding:4px 8px;border:1px solid #bfdbfe;">비점오염 증가량</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">-</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(d.비점오염.BOD)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">-</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">${f(d.비점오염.TP)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #bfdbfe;">-</td>
      </tr>
    </table>
  `;
}

window.runAndGenerate   = runAndGenerate;
window.runCalcOnly      = runCalcOnly;
window.fillPlantSelects = fillPlantSelects;

// ── DOMContentLoaded (단일 진입점) ────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fillYearMonthSelects();
  fillZoneSelects();
  fillBizTypeSelect();

  // life-module.js에서 이미 선언된 모듈 등록
  window.__lifeModules["livingContainer_before"] = window.lifeBefore;
  window.__lifeModules["livingContainer_after"]  = window.lifeAfter;

  bindLifeExcelUpload();
  bindBeforeNoSource();
  bindBeforeProofUpload();
  bindBeforeInputWatcher();
  setBeforeDisabled(false);
  refreshBeforeProofVisibility();

  // ★ GitHub에서 원단위 엑셀 자동 로드 → 완료 후 UI 렌더
  loadExcelDB(DB_EXCEL_URL).finally(() => {
    if (window.lifeBefore) {
      window.lifeBefore.render();
      window.lifeBefore.bindHouseholdInput();
    }
    if (window.lifeAfter) {
      window.lifeAfter.render();
      window.lifeAfter.bindHouseholdInput();
    }
    refreshBeforeProofVisibility();
    fillPlantSelects();
  });

  renderLandList("landContainer_before", "before");
  renderLandList("landContainer_after",  "after");
});
