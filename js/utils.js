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

    // =========================
    // "+"로 이어 입력하면 실시간 합산되는 contenteditable 합산칸 유틸
    // (토지계/생활계 면적칸이 공유해서 쓴다)
    // =========================
    const SUM_TERM_COLORS = [
      "#dc2626","#ea580c","#d97706","#65a30d","#16a34a","#0d9488",
      "#0891b2","#2563eb","#4f46e5","#7c3aed","#c026d3","#db2777"
    ];
    function randomSumColor(){ return SUM_TERM_COLORS[Math.floor(Math.random()*SUM_TERM_COLORS.length)]; }
    function escHtml(s){ return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
    function escAttr(s){ return escHtml(s).replace(/"/g,"&quot;"); }
    // 확정된 항(term)마다 색깔 입힌 span + 구분자 '+' + 입력 중인 나머지(pending)로 합산칸 내용을 만든다.
    // term/plus span은 contenteditable=false로 박아서, 지울 때 글자 단위가 아니라 항 단위로 다뤄지게 한다.
    function buildSumBoxInnerHtml(terms, colors, pending){
      const parts=terms.map((t,i)=>
        `<span class="sumTerm" contenteditable="false" style="color:${colors[i]}">${escHtml(t)}</span>`+
        `<span class="sumPlus" contenteditable="false">+</span>`);
      parts.push(escHtml(pending||""));
      return parts.join("");
    }
    // 합산칸의 실제 DOM을 읽어서 {terms, colors, pending}로 되돌린다 (DOM이 진실의 원천).
    function deriveSumFromDom(el){
      const terms=[], colors=[]; let pending="";
      el.childNodes.forEach(node=>{
        if(node.nodeType===1 && node.classList.contains("sumTerm")){
          terms.push(node.textContent.trim());
          colors.push(node.style.color||"#111827");
        } else if(node.nodeType===1 && node.classList.contains("sumPlus")){
          // 구분자, 무시
        } else if(node.nodeType===3){
          pending+=node.textContent;
        }
      });
      return { terms, colors, pending: pending.trim() };
    }
    function placeCaretAtEnd(el){
      el.focus();
      const range=document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function sumTermsTotal(terms, pending){
      const sum=(terms||[]).reduce((s,t)=>s+(parseNum(t)||0),0);
      return sum+(parseNum(pending)||0);
    }

    // ================================
