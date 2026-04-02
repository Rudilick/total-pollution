// =========================
    // 숫자 유틸
    // =========================
    function formatNumberWithComma(val) {
      if (val === null || val === undefined || val === "") return "";
      const str = String(val).trim();
      if (str.includes(",")) return str;
      const normalized = str.replace(/\s+/g, "");
      const num = Number(normalized);
      if (!isNaN(num)) return num.toLocaleString("ko-KR");
      return str;
    }
    function parseNum(val){
      const s = String(val ?? "").trim();
      if(!s) return 0;
      const n = Number(s.replaceAll(",",""));
      return Number.isFinite(n) ? n : 0;
    }
    function fmtNum(n){
      if(!Number.isFinite(n)) return "";
      return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    }

    // ================================
