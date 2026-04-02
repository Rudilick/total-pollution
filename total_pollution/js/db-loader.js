// ================================================================
// db-loader.js  ─  원단위 DB 로드 & 파싱
// [v3 변경]
//   SIDO_SIGUN_LIST  : 인구수 원단위 시트 → 광역/기초 드롭박스용
//   SEWAGE_PLANT_DB  : 관로비율 전체 파싱 (누수/월류/배제비)
// ================================================================

const DB_EXCEL_URL = (typeof CONFIG !== "undefined") ? CONFIG.DB_EXCEL_URL : "";

let LIFE_FACTOR_MAP    = {};
let SEWAGE_PLANT_DB    = [];
let POPULATION_UNIT_DB = [];
let SIDO_SIGUN_LIST    = [];   // [{ sido, siguns:[] }, ...]
let LIFE_USE_DB        = {};

// ── GitHub Raw URL에서 엑셀 로드 ────────────────────────────
async function loadExcelDB(url) {
  const statusEl      = document.getElementById("lifeExcelStatus");
  const loadingBanner = document.getElementById("db-loading-banner");
  try {
    if (loadingBanner) loadingBanner.style.display = "flex";
    if (statusEl)      statusEl.textContent = "원단위 DB 로딩 중...";
    const resp = await fetch(url, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    applyExcelBuffer(buf, "(GitHub 자동 로드)");
    if (loadingBanner) loadingBanner.style.display = "none";
  } catch (err) {
    console.warn("[원단위 DB] GitHub 로드 실패, 로컬 폴백 시도:", err);
    const localUrl = (typeof CONFIG !== "undefined" && CONFIG.DB_EXCEL_URL_LOCAL) ? CONFIG.DB_EXCEL_URL_LOCAL : "./data.xlsx";
    try {
      const resp2 = await fetch(localUrl, { cache: "no-cache" });
      if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
      const buf2 = await resp2.arrayBuffer();
      applyExcelBuffer(buf2, "(로컬 폴백)");
      if (loadingBanner) loadingBanner.style.display = "none";
    } catch (err2) {
      if (loadingBanner) {
        loadingBanner.innerHTML = `<span>⚠️ DB 로드 실패. 수동 업로드를 이용하세요. (GitHub: ${err.message} / 로컬: ${err2.message})</span>`;
        loadingBanner.style.background  = "#fef3c7";
        loadingBanner.style.borderColor = "#f59e0b";
      }
      if (statusEl) statusEl.textContent = "DB 로드 실패 - 수동 업로드 필요";
    }
  }
}

// ── ArrayBuffer → 파싱 → DB 갱신 ────────────────────────────
function applyExcelBuffer(buf, sourceLabel) {
  const wb       = XLSX.read(buf, { type: "array" });
  const statusEl = document.getElementById("lifeExcelStatus");

  // ── 시트1: 건축물용도별 오수발생량 및 부하량 원단위 ──────────
  const sn1  = wb.SheetNames.find(n => n.includes("원단위") && n.includes("용도")) || wb.SheetNames[0];
  const aoa1 = XLSX.utils.sheet_to_json(wb.Sheets[sn1], { header: 1, defval: "" });
  const lifeRows = [];
  LIFE_FACTOR_MAP = {};

  for (let r = 1; r < aoa1.length; r++) {
    const row   = aoa1[r] || [];
    const major = String(row[1] ?? "").trim();
    const mid   = String(row[2] ?? "").trim();
    let   minor = String(row[3] ?? "").trim();
    const unit  = String(row[4] ?? "").trim();
    const sewage= parseFloat(row[7])  || 0;
    const bod   = parseFloat(row[8])  || 0;
    const tn    = parseFloat(row[9])  || 0;
    const tp    = parseFloat(row[10]) || 0;
    const slim  = minor.replace(/\s/g,"");
    if (["-","–","—"].includes(slim)) minor = "";
    if (!major || !mid) continue;
    lifeRows.push([major, mid, minor, unit]);
    LIFE_FACTOR_MAP[`${major}|${mid}|${minor}`] = { sewage, bod, tn, tp, unit };
  }
  LIFE_USE_DB = _buildLifeDB(lifeRows);

  // ── 시트2: 하수처리장 ──────────────────────────────────────
  // 열: 0코드 1광역 2기초 3처리장명 4용량
  //     5~8  누수비(유량/BOD/TN/TP)
  //     9~12 월류비  13~16 배제비
  //     17BOD 18TN 19TP 20방류유량비
  const sn2  = wb.SheetNames.find(n => n.includes("하수처리")) || wb.SheetNames[1];
  if (sn2 && wb.Sheets[sn2]) {
    const aoa2 = XLSX.utils.sheet_to_json(wb.Sheets[sn2], { header: 1, defval: "" });
    SEWAGE_PLANT_DB = [];
    const pf = (row, i) => parseFloat(row[i]) || 0;
    for (let r = 1; r < aoa2.length; r++) {
      const row = aoa2[r] || [];
      if (!row[3]) continue;
      SEWAGE_PLANT_DB.push({
        code: String(row[0]||"").trim(),
        sido: String(row[1]||"").trim(),
        sigun: String(row[2]||"").trim(),
        name: String(row[3]||"").trim(),
        capacity: pf(row,4),
        leakRatioFlow: pf(row,5), leakRatioBOD: pf(row,6), leakRatioTN: pf(row,7), leakRatioTP: pf(row,8),
        overflowRatioFlow: pf(row,9), overflowRatioBOD: pf(row,10), overflowRatioTN: pf(row,11), overflowRatioTP: pf(row,12),
        untreatRatioFlow: pf(row,13), untreatRatioBOD: pf(row,14), untreatRatioTN: pf(row,15), untreatRatioTP: pf(row,16),
        efflBOD: pf(row,17), efflTN: pf(row,18), efflTP: pf(row,19),
        efflFlowRatio: pf(row,20) || 1.0,
      });
    }
  }

  // ── 시트3: 인구수 원단위 ──────────────────────────────────
  // 열: 0(unused) 1광역 2기초 3세대당인구수
  const sn3  = wb.SheetNames.find(n => n.includes("인구")) || wb.SheetNames[2];
  if (sn3 && wb.Sheets[sn3]) {
    const aoa3 = XLSX.utils.sheet_to_json(wb.Sheets[sn3], { header: 1, defval: "" });
    POPULATION_UNIT_DB = [];
    const sidoMap = {};  // sido → [siguns]
    for (let r = 1; r < aoa3.length; r++) {
      const row  = aoa3[r] || [];
      if (!row[2]) continue;
      const sido  = String(row[1]||"").trim();
      const sigun = String(row[2]||"").trim();
      const unit  = parseFloat(row[3]) || 0;
      POPULATION_UNIT_DB.push({ sido, sigun, unit });
      if (sido) {
        if (!sidoMap[sido]) sidoMap[sido] = [];
        sidoMap[sido].push(sigun);
      }
    }
    SIDO_SIGUN_LIST = Object.entries(sidoMap).map(([sido, siguns]) => ({ sido, siguns }));
  }

  // UI 갱신
  if (statusEl) {
    const ts = new Date().toLocaleString("ko-KR", { hour12:false });
    statusEl.textContent = `DB 적용 완료 ${sourceLabel} | 원단위 ${Object.keys(LIFE_FACTOR_MAP).length}건 | 처리장 ${SEWAGE_PLANT_DB.length}개소 | ${ts}`;
  }

  // 콜백
  if (typeof lifeBefore !== "undefined") { lifeBefore.render(); lifeAfter.render(); }
  if (typeof refreshBeforeProofVisibility === "function") refreshBeforeProofVisibility();
  if (typeof fillSidoSelect === "function") fillSidoSelect();
  if (typeof fillPlantSelects === "function") fillPlantSelects();
}

// ── 헬퍼 ────────────────────────────────────────────────────
function getFactors(major, mid, minor) {
  return LIFE_FACTOR_MAP[`${major}|${mid}|${minor??""}`]
      || LIFE_FACTOR_MAP[`${major}|${mid}|`] || null;
}

function inferUnit(unitRaw) {
  const u = (unitRaw||"").toString().trim();
  if (!u) return { unitType:"", unitText:"" };
  const s = u.replace(/\s/g,"").toLowerCase();
  if (u.includes("㎡")||s.includes("m2")) return { unitType:"area",   unitText:u };
  if (u.includes("인")||u.includes("명")) return { unitType:"person", unitText:u };
  return { unitType:"custom", unitText:u };
}

function _buildLifeDB(rows) {
  const db = {};
  for (const it of (rows||[])) {
    const major = String(it[0]??"").trim();
    const mid   = String(it[1]??"").trim();
    let   minor = String(it[2]??"").trim();
    const unit  = String(it[3]??"").trim();
    const slim  = minor.replace(/\s/g,"");
    if (["-","–","—"].includes(slim)) minor = "";
    if (!major||!mid) continue;
    const uinfo = inferUnit(unit);
    if (!db[major]) db[major]={};
    if (!db[major][mid]) db[major][mid]={ terminal:true, unitType:uinfo.unitType, unitText:uinfo.unitText, minors:[] };
    const node = db[major][mid];
    if (minor) {
      if (node.terminal) { node.terminal=false; node.unitType=""; node.unitText=""; node.minors=[]; }
      if (!node.minors.some(m=>m.name===minor)) node.minors.push({ name:minor, unitType:uinfo.unitType, unitText:uinfo.unitText });
    } else {
      if (node.terminal) { node.unitType=uinfo.unitType; node.unitText=uinfo.unitText; }
    }
  }
  return db;
}

// ── 수동 업로드 ─────────────────────────────────────────────
async function loadLifeExcelFile(file) {
  applyExcelBuffer(await file.arrayBuffer(), `(수동: ${file.name})`);
}
function resetLifeUseDB() { loadExcelDB(DB_EXCEL_URL); }
function bindLifeExcelUpload() {
  const input = document.getElementById("lifeExcel");
  if (!input) return;
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { await loadLifeExcelFile(f); }
    catch(err){ alert("엑셀 적용 실패: "+(err?.message||err)); }
    finally { input.value=""; }
  });
}
