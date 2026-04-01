// ================================================================
// db-loader.js  ─  원단위 DB 로드 & 파싱
// GitHub Raw URL에서 엑셀을 fetch해서 파싱합니다.
// URL은 js/config.js의 CONFIG.DB_EXCEL_URL에서 관리합니다.
// ================================================================

const DB_EXCEL_URL = (typeof CONFIG !== "undefined") ? CONFIG.DB_EXCEL_URL : "";

    // 원단위 수치 조회용 맵: "대분류|중분류|소분류" → { sewage, bod, tn, tp }
    let LIFE_FACTOR_MAP = {};

    // 하수처리장 DB
    let SEWAGE_PLANT_DB = [];

    // 인구수 원단위 DB
    let POPULATION_UNIT_DB = [];

    // GitHub Raw URL에서 엑셀 로드 (페이지 로드 시 자동 실행)
    async function loadExcelDB(url) {
      const statusEl = document.getElementById("lifeExcelStatus");
      const loadingBanner = document.getElementById("db-loading-banner");

      try {
        if (loadingBanner) loadingBanner.style.display = "flex";
        if (statusEl) statusEl.textContent = "원단위 DB 로딩 중...";

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
          loadingBanner.style.background = "#fef3c7";
          loadingBanner.style.borderColor = "#f59e0b";
        }
        if (statusEl) statusEl.textContent = "GitHub 로드 실패 - 수동 업로드 필요";
      }
    }

    // 버퍼(ArrayBuffer) → 파싱 → DB 갱신 (수동 업로드와 공용)
    function applyExcelBuffer(buf, sourceLabel) {
      const wb = XLSX.read(buf, { type: "array" });
      const statusEl = document.getElementById("lifeExcelStatus");

      // ── 시트 1: 건축물용도별 오수발생량 및 부하량 원단위 ──
      const sheetName1 = wb.SheetNames.find(n => n.includes("원단위") && n.includes("용도")) || wb.SheetNames[0];
      const ws1 = wb.Sheets[sheetName1];
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
        const sewage = parseFloat(row[7]) || 0;
        const bod    = parseFloat(row[8]) || 0;
        const tn     = parseFloat(row[9]) || 0;
        const tp     = parseFloat(row[10]) || 0;

        const minorSlim = minor.replace(/\s/g, "");
        if (["-","–","—"].includes(minorSlim)) minor = "";

        if (!major || !mid) continue;

        lifeRows.push([major, mid, minor, unit]);

        // 원단위 수치 맵 저장
        const key = `${major}|${mid}|${minor}`;
        LIFE_FACTOR_MAP[key] = { sewage, bod, tn, tp, unit };
      }

      LIFE_USE_DB = buildLifeDBFromRows(lifeRows);

      // ── 시트 2: 하수처리장 ──
      const sheetName2 = wb.SheetNames.find(n => n.includes("하수처리")) || wb.SheetNames[1];
      if (sheetName2 && wb.Sheets[sheetName2]) {
        const ws2 = wb.Sheets[sheetName2];
        const aoa2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: "" });
        SEWAGE_PLANT_DB = [];
        for (let r = 1; r < aoa2.length; r++) {
          const row = aoa2[r] || [];
          if (!row[3]) continue;  // 처리장명 없으면 스킵
          SEWAGE_PLANT_DB.push({
            code: String(row[0] || "").trim(),
            sido: String(row[1] || "").trim(),
            sigun: String(row[2] || "").trim(),
            name: String(row[3] || "").trim(),
            capacity: parseFloat(row[4]) || 0,
            efflBOD: parseFloat(row[17]) || 0,
            efflTN:  parseFloat(row[18]) || 0,
            efflTP:  parseFloat(row[19]) || 0,
          });
        }
      }

      // ── 시트 3: 인구수 원단위 ──
      const sheetName3 = wb.SheetNames.find(n => n.includes("인구")) || wb.SheetNames[2];
      if (sheetName3 && wb.Sheets[sheetName3]) {
        const ws3 = wb.Sheets[sheetName3];
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

      if (typeof lifeBefore !== "undefined") { lifeBefore.render(); lifeAfter.render(); refreshBeforeProofVisibility(); }
    }

    // ── 원단위 수치 조회 헬퍼 ──
    function getFactors(major, mid, minor) {
      const key = `${major}|${mid}|${minor ?? ""}`;
      return LIFE_FACTOR_MAP[key] || LIFE_FACTOR_MAP[`${major}|${mid}|`] || null;
    }

    // LIFE_USE_DB: GitHub에서 로드한 엑셀로 채워집니다 (하드코딩 없음)
    let LIFE_USE_DB = {};

    async function loadLifeExcelFile(file){
      const buf = await file.arrayBuffer();
      applyExcelBuffer(buf, `(수동: ${file.name})`);
    }

    function resetLifeUseDB(){
      // GitHub에서 재로드로 초기화
      loadExcelDB(DB_EXCEL_URL);
    }

    function bindLifeExcelUpload(){
      const input = document.getElementById("lifeExcel");
      if(!input) return;
      input.addEventListener("change", async ()=>{
        const f = input.files?.[0];
        if(!f) return;
        try{
          await loadLifeExcelFile(f);
        } catch(err){
          console.error(err);
          alert("엑셀 적용 실패: " + (err?.message || err));
        } finally {
          input.value = "";
        }
      });
    }
