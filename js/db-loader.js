// ================================================================
// db-loader.js  ─  원단위 DB 로드 & 파싱
// GitHub Raw URL에서 엑셀을 fetch해서 파싱합니다.
// URL은 js/config.js의 CONFIG.DB_EXCEL_URL에서 관리합니다.
//
// [변경사항]
//   SEWAGE_PLANT_DB 파싱: 관로누수비/월류비/미처리배제비 전 열 파싱 추가
//   (col 5~16: 비율값, col 20: 방류유량비)
// ================================================================

const DB_EXCEL_URL = (typeof CONFIG !== "undefined") ? CONFIG.DB_EXCEL_URL : "";

// 원단위 수치 조회용 맵: "대분류|중분류|소분류" → { sewage, bod, tn, tp }
let LIFE_FACTOR_MAP = {};

// 하수처리장 DB
let SEWAGE_PLANT_DB = [];

// 인구수 원단위 DB
let POPULATION_UNIT_DB = [];

// ── GitHub Raw URL에서 엑셀 로드 (페이지 로드 시 자동 실행) ──
async function loadExcelDB(url) {
  const statusEl      = document.getElementById("lifeExcelStatus");
  const loadingBanner = document.getElementById("db-loading-banner");

  try {
    if (loadingBanner) loadingBanner.style.display = "flex";
    if (statusEl)      statusEl.textContent = "원단위 DB 로딩 중...";

    const resp = await fetch(url, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);

    const buf = await resp.arrayBuffer();
    applyExcelBuffer(buf, "(GitHub 자동 로드)");

    if (loadingBanner) loadingBanner.style.display = "none";

  } catch (err) {
    console.warn("[원단위 DB] 로드 실패:", err);
    if (loadingBanner) {
      loadingBanner.innerHTML = `
        <span>⚠️ 원단위 DB를 자동으로 불러오지 못했습니다. 엑셀 수동 업로드를 이용하거나, GitHub URL을 확인하세요.</span>
        <span style="color:#6b7280; font-size:12px; margin-left:8px;">(${err.message})</span>
      `;
      loadingBanner.style.background  = "#fef3c7";
      loadingBanner.style.borderColor = "#f59e0b";
    }
    if (statusEl) statusEl.textContent = "GitHub 로드 실패 - 수동 업로드 필요";
  }
}

// ── 버퍼(ArrayBuffer) → 파싱 → DB 갱신 ──────────────────────
function applyExcelBuffer(buf, sourceLabel) {
  const wb      = XLSX.read(buf, { type: "array" });
  const statusEl = document.getElementById("lifeExcelStatus");

  // ── 시트 1: 건축물용도별 오수발생량 및 부하량 원단위 ─────────
  const sheetName1 = wb.SheetNames.find(n => n.includes("원단위") && n.includes("용도")) || wb.SheetNames[0];
  const ws1  = wb.Sheets[sheetName1];
  const aoa1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: "" });

  const lifeRows = [];
  LIFE_FACTOR_MAP = {};

  for (let r = 1; r < aoa1.length; r++) {
    const row = aoa1[r] || [];
    // 컬럼: 코드(0) 대분류(1) 중분류(2) 소분류(3) 단위(4) 레벨(5) 코멘트(6) 오수(7) BOD(8) TN(9) TP(10)
    const major  = String(row[1] ?? "").trim();
    const mid    = String(row[2] ?? "").trim();
    let   minor  = String(row[3] ?? "").trim();
    const unit   = String(row[4] ?? "").trim();
    const sewage = parseFloat(row[7])  || 0;
    const bod    = parseFloat(row[8])  || 0;
    const tn     = parseFloat(row[9])  || 0;
    const tp     = parseFloat(row[10]) || 0;

    const minorSlim = minor.replace(/\s/g, "");
    if (["-", "–", "—"].includes(minorSlim)) minor = "";
    if (!major || !mid) continue;

    lifeRows.push([major, mid, minor, unit]);

    const key = `${major}|${mid}|${minor}`;
    LIFE_FACTOR_MAP[key] = { sewage, bod, tn, tp, unit };
  }

  LIFE_USE_DB = buildLifeDBFromRows(lifeRows);

  // ── 시트 2: 하수처리장 ───────────────────────────────────────
  // 열 구조 (0-based):
  //  0: 코드  1: 광역  2: 기초  3: 처리장명  4: 시설용량
  //  5: 누수비_유량  6: 누수비_BOD  7: 누수비_TN  8: 누수비_TP
  //  9: 월류비_유량 10: 월류비_BOD 11: 월류비_TN 12: 월류비_TP
  // 13: 배제비_유량 14: 배제비_BOD 15: 배제비_TN 16: 배제비_TP
  // 17: 방류수질_BOD 18: 방류수질_TN 19: 방류수질_TP
  // 20: 방류유량비
  const sheetName2 = wb.SheetNames.find(n => n.includes("하수처리")) || wb.SheetNames[1];
  if (sheetName2 && wb.Sheets[sheetName2]) {
    const ws2  = wb.Sheets[sheetName2];
    const aoa2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: "" });
    SEWAGE_PLANT_DB = [];

    for (let r = 1; r < aoa2.length; r++) {
      const row = aoa2[r] || [];
      if (!row[3]) continue;   // 처리장명 없으면 스킵

      const pf = (idx) => parseFloat(row[idx]) || 0;

      SEWAGE_PLANT_DB.push({
        code:     String(row[0] || "").trim(),
        sido:     String(row[1] || "").trim(),
        sigun:    String(row[2] || "").trim(),
        name:     String(row[3] || "").trim(),
        capacity: pf(4),

        // 관로누수비 (소수 형태: 3.0453% → 0.030453)
        leakRatioFlow: pf(5),
        leakRatioBOD:  pf(6),
        leakRatioTN:   pf(7),
        leakRatioTP:   pf(8),

        // 관로월류비
        overflowRatioFlow: pf(9),
        overflowRatioBOD:  pf(10),
        overflowRatioTN:   pf(11),
        overflowRatioTP:   pf(12),

        // 미처리배제비
        untreatRatioFlow: pf(13),
        untreatRatioBOD:  pf(14),
        untreatRatioTN:   pf(15),
        untreatRatioTP:   pf(16),

        // 방류수질 (mg/L)
        efflBOD: pf(17),
        efflTN:  pf(18),
        efflTP:  pf(19),

        // 방류유량비 = 1 - (누수비+월류비+배제비)_유량
        efflFlowRatio: pf(20) || 1.0,
      });
    }
  }

  // ── 시트 3: 인구수 원단위 ────────────────────────────────────
  const sheetName3 = wb.SheetNames.find(n => n.includes("인구")) || wb.SheetNames[2];
  if (sheetName3 && wb.Sheets[sheetName3]) {
    const ws3  = wb.Sheets[sheetName3];
    const aoa3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: "" });
    POPULATION_UNIT_DB = [];
    for (let r = 1; r < aoa3.length; r++) {
      const row = aoa3[r] || [];
      if (!row[2]) continue;
      POPULATION_UNIT_DB.push({
        sido:  String(row[1] || "").trim(),
        sigun: String(row[2] || "").trim(),
        unit:  parseFloat(row[3]) || 0,
      });
    }
  }

  // UI 갱신
  if (statusEl) {
    const ts = new Date().toLocaleString("ko-KR", { hour12: false });
    statusEl.textContent = `DB 적용 완료 ${sourceLabel} | 원단위 ${Object.keys(LIFE_FACTOR_MAP).length}건 | 처리장 ${SEWAGE_PLANT_DB.length}개소 | ${ts}`;
  }

  if (typeof lifeBefore !== "undefined") {
    lifeBefore.render();
    lifeAfter.render();
    if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  }
  if (typeof fillPlantSelects === "function") fillPlantSelects();
}

// ── 원단위 수치 조회 헬퍼 ───────────────────────────────────────
function getFactors(major, mid, minor) {
  const key = `${major}|${mid}|${minor ?? ""}`;
  return LIFE_FACTOR_MAP[key] || LIFE_FACTOR_MAP[`${major}|${mid}|`] || null;
}

// ── 단위 타입 판별 ──────────────────────────────────────────────
function inferUnit(unitRaw) {
  const u = (unitRaw || "").toString().trim();
  if (!u) return { unitType: "", unitText: "" };
  const s = u.replace(/\s/g, "").toLowerCase();
  if (u.includes("㎡") || s.includes("m²") || s.includes("m2") || u.includes("제곱"))
    return { unitType: "area", unitText: u };
  if (u.includes("인") || u.includes("명") || s.includes("person"))
    return { unitType: "person", unitText: u };
  return { unitType: "custom", unitText: u };
}

// ── 대/중/소 계층 DB 빌드 ───────────────────────────────────────
function buildLifeDBFromRows(rows) {
  const db = {};
  for (const it of (rows || [])) {
    const major = String(it[0] ?? "").trim();
    const mid   = String(it[1] ?? "").trim();
    let   minor = String(it[2] ?? "").trim();
    const unit  = String(it[3] ?? "").trim();

    const minorSlim = minor.replace(/\s/g, "");
    if (["-", "–", "—"].includes(minorSlim)) minor = "";
    if (!major || !mid) continue;

    const uinfo = inferUnit(unit);

    if (!db[major]) db[major] = {};
    if (!db[major][mid]) {
      db[major][mid] = { terminal: true, unitType: uinfo.unitType, unitText: uinfo.unitText, minors: [] };
    }

    const node = db[major][mid];
    if (minor) {
      if (node.terminal) { node.terminal = false; node.unitType = ""; node.unitText = ""; node.minors = []; }
      if (!node.minors.some(m => m.name === minor)) {
        node.minors.push({ name: minor, unitType: uinfo.unitType, unitText: uinfo.unitText });
      }
    } else {
      if (node.terminal) { node.unitType = uinfo.unitType; node.unitText = uinfo.unitText; }
    }
  }
  return db;
}

// LIFE_USE_DB: 엑셀 로드 후 채워짐
let LIFE_USE_DB = {};

// ── 수동 업로드 ─────────────────────────────────────────────────
async function loadLifeExcelFile(file) {
  const buf = await file.arrayBuffer();
  applyExcelBuffer(buf, `(수동: ${file.name})`);
}

function resetLifeUseDB() {
  loadExcelDB(DB_EXCEL_URL);
}

function bindLifeExcelUpload() {
  const input = document.getElementById("lifeExcel");
  if (!input) return;
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      await loadLifeExcelFile(f);
    } catch (err) {
      console.error(err);
      alert("엑셀 적용 실패: " + (err?.message || err));
    } finally {
      input.value = "";
    }
  });
}
