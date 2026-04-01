// =========================================================
    // Word 생성 로직 (예전 양식 그대로: 사업의 개요 표 포함)
    // =========================================================
    const getVal = (id, fallback="") => {
      const el = document.getElementById(id);
      if(!el) return fallback;
      return (el.value ?? fallback);
    };

    const A4_HEIGHT_TWIP = 16833;
    const MARGIN_TOP = 1100;
    const MARGIN_BOTTOM = 1100;
    const MARGIN_LEFT = 1000;
    const MARGIN_RIGHT = 1000;

    const USABLE_HEIGHT_TWIP = A4_HEIGHT_TWIP - MARGIN_TOP - MARGIN_BOTTOM;

    const ROW0 = 600;
    const ROW1 = 1843;
    const ROW3 = 3984;
    const ROW4 = 3701;
    const ROW6 = 1266;

    const ROW2_EST = 1500;
    const ROW5_EST = 800;

    function calcRow7Height() {
      const used = ROW0 + ROW1 + ROW2_EST + ROW3 + ROW4 + ROW5_EST + ROW6;
      const SAFETY_TWIP = 300;
      const remaining = USABLE_HEIGHT_TWIP - used - SAFETY_TWIP;
      return Math.max(800, remaining);
    }

    const COVER_NAME_MAX_WIDTH_PX = 660;
    const FONT_CANDIDATES_PT = [20, 18, 16, 14, 12];

    function ptToPx(pt) { return pt * (96 / 72); }

    function measureWidthPx(text, fontPt, fontFamily = "맑은 고딕") {
      const canvas = measureWidthPx._canvas || (measureWidthPx._canvas = document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      ctx.font = `${ptToPx(fontPt)}px "${fontFamily}"`;
      return ctx.measureText(text).width;
    }

    function wrapTo1or2LinesBySpaces(text, fontPt, maxWidthPx) {
      const cleaned = (text || "").trim().replace(/\s+/g, " ");
      if (!cleaned) return { ok: true, line1: "{사업명}", line2: "", fontPt };

      const wFull = measureWidthPx(cleaned, fontPt);
      if (wFull <= maxWidthPx) return { ok: true, line1: cleaned, line2: "", fontPt };

      const tokens = cleaned.split(" ");
      if (tokens.length === 1) return { ok: false, line1: cleaned, line2: "", fontPt };

      let best = null;
      for (let i = 1; i <= tokens.length - 1; i++) {
        const line1 = tokens.slice(0, i).join(" ");
        const line2 = tokens.slice(i).join(" ");
        const w1 = measureWidthPx(line1, fontPt);
        const w2 = measureWidthPx(line2, fontPt);
        if (w1 <= maxWidthPx && w2 <= maxWidthPx) {
          const score = Math.abs(w1 - w2);
          if (!best || score < best.score) best = { ok: true, line1, line2, fontPt, score };
        }
      }
      return best || { ok: false, line1: cleaned, line2: "", fontPt };
    }

    function smartWrapBusinessName(text) {
      for (const pt of FONT_CANDIDATES_PT) {
        const c = wrapTo1or2LinesBySpaces(text, pt, COVER_NAME_MAX_WIDTH_PX);
        if (c.ok) return c;
      }
      const fallbackPt = FONT_CANDIDATES_PT[FONT_CANDIDATES_PT.length - 1];
      const cleaned = (text || "").trim().replace(/\s+/g, " ") || "{사업명}";
      return { ok: false, line1: cleaned, line2: "", fontPt: fallbackPt };
    }

    // ===== 저감계획 표(기존 유지) =====
    function buildJeogamPlanTable(docx, data) {
      const { Table, TableRow, TableCell, Paragraph, TextRun, AlignmentType, BorderStyle, VerticalAlign } = docx;

      const font = "맑은 고딕";
      const FONT_SIZE = 24;

      const normalBorder = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
      const thickBorder  = { style: BorderStyle.SINGLE, size: 10, color: "000000" };
      const noneBorder   = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

      const tableBorders = {
        top: thickBorder,
        left: thickBorder,
        right: thickBorder,
        bottom: thickBorder,
        insideHorizontal: normalBorder,
        insideVertical: normalBorder,
      };

      let COL_PCT = [15.19, 18.2, 14.37, 15.96, 18.13, 18.15];
      const lastSum = COL_PCT[4] + COL_PCT[5];
      COL_PCT[4] = lastSum / 2;
      COL_PCT[5] = lastSum / 2;

      function isUnitText(t) {
        const s = (t ?? "").trim();
        if (!s) return false;
        const unitTokens = ["mg/L", "m³/day", "m³/d", "m3/day", "m3/d", "개소"];
        return unitTokens.includes(s);
      }

      function pSmart(text, align=AlignmentType.CENTER, bold=false) {
        const t = (text ?? "");
        const parts = t.split("\n");
        const runs = [];
        for (let i = 0; i < parts.length; i++) {
          runs.push(new TextRun({ text: parts[i], font, size: FONT_SIZE, bold }));
          if (i < parts.length - 1) runs.push(new TextRun({ text: "", break: 1, font, size: FONT_SIZE, bold }));
        }
        return new Paragraph({ alignment: align, children: runs });
      }

      const TEMPLATE = [
        [{"cs":1,"rs":15,"text":"오수처리"},{"cs":1,"rs":4,"text":"■ 공공"},{"cs":1,"rs":1,"text":"처리시설명"},{"cs":3,"rs":1,"text":""}],
        [{"cs":1,"rs":1,"text":"시설용량"},{"cs":3,"rs":1,"text":""}],
        [{"cs":1,"rs":2,"text":"방류기준"},{"cs":1,"rs":1,"text":"BOD"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":1,"text":"T-P"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":11,"text":"□ 개별"},{"cs":1,"rs":3,"text":"1"},{"cs":1,"rs":1,"text":"처리공법"},{"cs":2,"rs":1,"text":""}],
        [{"cs":1,"rs":1,"text":"시설용량"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"m³/day"}],
        [{"cs":1,"rs":1,"text":"시설개소수"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"개소"}],
        [{"cs":1,"rs":3,"text":"2"},{"cs":1,"rs":1,"text":"처리공법"},{"cs":2,"rs":1,"text":""}],
        [{"cs":1,"rs":1,"text":"시설용량"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"m³/day"}],
        [{"cs":1,"rs":1,"text":"시설개소수"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"개소"}],
        [{"cs":1,"rs":2,"text":"방류기준"},{"cs":1,"rs":1,"text":"BOD"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":1,"text":"T-P"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":2,"text":"강화기준"},{"cs":1,"rs":1,"text":"BOD"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":1,"text":"T-P"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":2,"rs":1,"text":"관련근거(기술검증번호)"},{"cs":2,"rs":1,"text":""}],

        [{"cs":1,"rs":8,"text":"폐수처리"},{"cs":1,"rs":4,"text":"■ 공공"},{"cs":1,"rs":1,"text":"처리시설명"},{"cs":3,"rs":1,"text":""}],
        [{"cs":1,"rs":1,"text":"시설용량"},{"cs":3,"rs":1,"text":""}],
        [{"cs":1,"rs":2,"text":"방류기준"},{"cs":1,"rs":1,"text":"BOD"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":1,"text":"T-P"},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":"mg/L"}],
        [{"cs":1,"rs":4,"text":"□ 개별"},{"cs":1,"rs":1,"text":"처리공법"},{"cs":3,"rs":1,"text":""}],
        [{"cs":1,"rs":1,"text":"시설용량"},{"cs":2,"rs":1,"text":""},{"cs":1,"rs":1,"text":"m³/day"}],
        [{"cs":1,"rs":2,"text":"방류기준"},{"cs":3,"rs":1,"text":"BOD"}],
        [{"cs":3,"rs":1,"text":"T-P"}],

        [{"cs":1,"rs":4,"text":"비점오염\n저감계획"},{"cs":1,"rs":2,"text":"시설종류"},{"cs":1,"rs":2,"text":"설치용량"},{"cs":1,"rs":2,"text":"설치면적"},{"cs":2,"rs":1,"text":"삭감량(kg/day)"}],
        [{"cs":1,"rs":1,"text":"BOD"},{"cs":1,"rs":1,"text":"T-P"}],
        [{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""}],
        [{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""},{"cs":1,"rs":1,"text":""}],
      ];

      const sewageMode = data?.sewageMode || "public";
      const wasteMode  = data?.wasteMode  || "public";
      function isChecked(mode, target){ return mode === target; }
      function mark(mode, target) { return isChecked(mode, target) ? "■" : "□"; }

      function mapTextByRow(r, text) {
        if (!text) return text;
        if (r <= 14) {
          if (text.endsWith("공공")) return `${mark(sewageMode, "public")} 공공`;
          if (text.endsWith("개별")) return `${mark(sewageMode, "private")} 개별`;
          return text;
        }
        if (r >= 15 && r <= 22) {
          if (text.endsWith("공공")) return `${mark(wasteMode, "public")} 공공`;
          if (text.endsWith("개별")) return `${mark(wasteMode, "private")} 개별`;
          return text;
        }
        return text;
      }

      const ROW_H = 383;
      const COLS = 6;
      const occupied = new Array(COLS).fill(0);

      function nextFreeCol(start) {
        let c = start;
        while (c < COLS && occupied[c] > 0) c++;
        return c;
      }

      function markOccupied(colStart, colSpan, rowSpan) {
        const remain = Math.max(0, (rowSpan || 1) - 1);
        for (let c = colStart; c < colStart + colSpan; c++) {
          if (c >= 0 && c < COLS) occupied[c] = Math.max(occupied[c], remain);
        }
      }

      function makeCell(paragraph, { colSpan=1, rowSpan=1, widthPct=null, noLeft=false, noRight=false }={}) {
        const borders = {
          top: normalBorder,
          bottom: normalBorder,
          left: noLeft ? noneBorder : normalBorder,
          right: noRight ? noneBorder : normalBorder,
        };
        return new TableCell({
          children: [paragraph],
          columnSpan: colSpan,
          rowSpan,
          width: widthPct ? { size: widthPct, type: docx.WidthType.PERCENTAGE } : undefined,
          verticalAlign: VerticalAlign.CENTER,
          borders,
        });
      }

      const rows = [];

      for (let r = 0; r < TEMPLATE.length; r++) {
        for (let c = 0; c < COLS; c++) if (occupied[c] > 0) occupied[c]--;

        const row = TEMPLATE[r];
        const pending = [];
        let cursor = 0;

        for (let i = 0; i < row.length; i++) {
          const spec = row[i];
          const cs = spec.cs || 1;
          const rs = spec.rs || 1;
          const rawText = spec.text ?? "";
          const txt = mapTextByRow(r, rawText);
          const col = nextFreeCol(cursor);

          pending.push({ col, cs, rs, txt, isUnit: isUnitText(txt) });
          markOccupied(col, cs, rs);
          cursor = col + cs;
        }

        pending.sort((a,b)=>a.col-b.col);

        for (let i = 0; i < pending.length; i++) {
          if (!pending[i].isUnit) continue;
          pending[i].noLeft = true;

          for (let j = i - 1; j >= 0; j--) {
            const prev = pending[j];
            if (prev.col + prev.cs === pending[i].col) {
              prev.noRight = true;
              break;
            }
          }
        }

        const children = [];
        for (const it of pending) {
          const widthPct = COL_PCT.slice(it.col, it.col + it.cs).reduce((a,b)=>a+b, 0);
          children.push(
            makeCell(
              pSmart(it.txt),
              { colSpan: it.cs, rowSpan: it.rs, widthPct, noLeft: !!it.noLeft, noRight: !!it.noRight }
            )
          );
        }

        rows.push(new TableRow({ height: { value: ROW_H }, children }));
      }

      return new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        borders: tableBorders,
        rows
      });
    }

    function buildJeogamPlanBlock(docx, data) {
      const { Paragraph } = docx;
      return [
        new Paragraph(""),
        new Paragraph({ text: "3. 저감계획", heading: docx.HeadingLevel.HEADING_1 }),
        buildJeogamPlanTable(docx, data),
        new Paragraph(""),
      ];
    }

    // ===== 총괄(사업의 개요) 표: 생략 없이 풀버전 =====
    function buildChongGwalBlock(docx, data) {
      const {
        Paragraph, TextRun,
        AlignmentType,
        Table, TableRow, TableCell,
        WidthType,
        BorderStyle,
        VerticalAlign
      } = docx;

      const font = "맑은 고딕";
      const FONT_PT = 12;
      const FONT_SIZE = FONT_PT * 2;

      const normalBorder = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
      const thickBorder  = { style: BorderStyle.SINGLE, size: 14, color: "000000" };
      const noneBorder   = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

      const tableBorders = {
        top: normalBorder,
        left: normalBorder,
        insideHorizontal: normalBorder,
        insideVertical: normalBorder,
        right: thickBorder,
        bottom: thickBorder,
      };

      const cellBorders = (over = {}) => ({
        top: over.top ?? normalBorder,
        bottom: over.bottom ?? normalBorder,
        left: over.left ?? normalBorder,
        right: over.right ?? normalBorder,
      });

      function bordersNoVertRight() { return cellBorders({ right: noneBorder }); }
      function bordersNoVertLeft()  { return cellBorders({ left: noneBorder  }); }
      function bordersNoVertBoth()  { return cellBorders({ left: noneBorder, right: noneBorder }); }

      const run = (text, { bold=false, size=FONT_SIZE } = {}) =>
        new TextRun({ text, font, bold, size });

      const para = (text, { center=false, right=false, bold=false, size=FONT_SIZE } = {}) =>
        new Paragraph({
          alignment: center
            ? AlignmentType.CENTER
            : right
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT,
          children: [run(text ?? "", { bold, size })],
        });

      const cell = (children, opts = {}) => new TableCell({
        children: Array.isArray(children) ? children : [children],
        borders: opts.borders ?? cellBorders(),
        columnSpan: opts.colSpan ?? 1,
        rowSpan: opts.rowSpan ?? 1,
        width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
        verticalAlign: opts.vAlign ?? VerticalAlign.CENTER,
      });

      const W1 = 12;
      const W2 = 22;
      const RIGHT_TOTAL = 100 - (W1 + W2);
      const U = 11;
      const THIRD = 2 * U;
      const HALF = 3 * U;

      const ROW_H_DOUBLE = 720;

      const markYesNo = (yes) => yes ? "■ 해당" : "□ 해당";
      const markNo = (yes) => yes ? "□ 해당 없음" : "■ 해당 없음";

      const riverLeft = markYesNo(!!data.envRiver);
      const riverRight = markNo(!!data.envRiver);

      const waterLeft = markYesNo(!!data.envWaterSource);
      const waterRight = markNo(!!data.envWaterSource);

      let specialLeftText, specialRightText;
      if (data.envSpecial === "1") {
        specialLeftText = "■ 해당 (1권역)";
        specialRightText = "□ 해당 없음";
      } else if (data.envSpecial === "2") {
        specialLeftText = "■ 해당 (2권역)";
        specialRightText = "□ 해당 없음";
      } else {
        specialLeftText = "□ 해당 (1·2권역)";
        specialRightText = "■ 해당 없음";
      }

      const titleBox = new Table({
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: {
          top: normalBorder, bottom: normalBorder, left: normalBorder, right: normalBorder,
          insideHorizontal: normalBorder, insideVertical: normalBorder,
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: cellBorders(),
                shading: { type: "clear", color: "auto", fill: "EDEDED" },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [ new TextRun({ text: "총  괄", font, bold: true, size: 28 }) ]
                  })
                ]
              })
            ]
          })
        ]
      });

      const underline = new Paragraph({ border: { bottom: normalBorder } });

      const sectionTitle = new Paragraph({
        spacing: { before: 200, after: 160 },
        children: [ new TextRun({ text: "1. 사업의 개요", font, bold: false, size: 28 }) ]
      });

      const mainTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders,
        rows: [
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("사 업 명", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.projectName || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("소 재 지", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.projectLocation || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("사업기간", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.bizPeriodText || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("사업시행자", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.ownerName || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("용도지역", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.zoneText || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("사업의 종류", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.bizType || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),

          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("면 적", { center: true }), { rowSpan: 6, widthPct: W1 }),
              cell(para("부지면적", { center: true }), { rowSpan: 3, widthPct: W2 }),
              cell(para("전체부지", { center: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertRight() }),
              cell(para(data.areaTotalSite ?? "", { right: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertBoth() }),
              cell(para("m²"), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("건축부지", { center: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertRight() }),
              cell(para(data.areaBuildSite ?? "", { right: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertBoth() }),
              cell(para("m²"), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("도로부지", { center: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertRight() }),
              cell(para(data.areaRoadSite ?? "", { right: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertBoth() }),
              cell(para("m²"), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("건축연면적", { center: true }), { widthPct: W2 }),
              cell(para("", { center: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertRight() }),
              cell(para(data.areaGrossFloor ?? "", { right: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertBoth() }),
              cell(para("m²"), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("도 로", { center: true }), { rowSpan: 2, widthPct: W2 }),
              cell(para("노선길이", { center: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertRight() }),
              cell(para(data.roadLength ?? "", { right: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertBoth() }),
              cell(para("m"), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("폭", { center: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertRight() }),
              cell(para(data.roadWidth ?? "", { right: true }), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertBoth() }),
              cell(para("m"), { colSpan: 2, widthPct: THIRD, borders: bordersNoVertLeft() }),
            ]
          }),

          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("환경현황", { center: true }), { rowSpan: 3, widthPct: W1 }),
              cell(para("수변구역", { center: true }), { widthPct: W2 }),
              cell(para(riverLeft, { center: true }), { colSpan: 3, widthPct: HALF, borders: bordersNoVertRight() }),
              cell(para(riverRight, { center: true }), { colSpan: 3, widthPct: HALF, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("상수원보호구역", { center: true }), { widthPct: W2 }),
              cell(para(waterLeft, { center: true }), { colSpan: 3, widthPct: HALF, borders: bordersNoVertRight() }),
              cell(para(waterRight, { center: true }), { colSpan: 3, widthPct: HALF, borders: bordersNoVertLeft() }),
            ]
          }),
          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("특별대책 지역", { center: true }), { widthPct: W2 }),
              cell(para(specialLeftText, { center: true }), { colSpan: 3, widthPct: HALF, borders: bordersNoVertRight() }),
              cell(para(specialRightText, { center: true }), { colSpan: 3, widthPct: HALF, borders: bordersNoVertLeft() }),
            ]
          }),

          new TableRow({
            height: { value: ROW_H_DOUBLE },
            children: [
              cell(para("사업의 추진경위", { center: true }), { colSpan: 2, widthPct: W1 + W2 }),
              cell(para(data.bizHistory || "", { center: true }), { colSpan: 6, widthPct: RIGHT_TOTAL }),
            ]
          }),
        ]
      });

      const writerLine = new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 180, after: 0 },
        children: [
          run("검토서 작성자: ", { bold: false, size: FONT_SIZE }),
          run(data.writerName || "", { bold: true, size: FONT_SIZE }),
          run(" (☎", { bold: false, size: FONT_SIZE }),
          run(data.writerContact || "", { bold: false, size: FONT_SIZE }),
          run(")", { bold: false, size: FONT_SIZE }),
        ]
      });

      return [ titleBox, underline, new Paragraph(""), sectionTitle, mainTable, writerLine, new Paragraph("") ];
    }

    function generateDoc() {
      try {
        const { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType, Table, TableRow, TableCell,
                WidthType, VerticalAlign, BorderStyle, SectionType } = docx;

        const projectName = getVal("projectName", "");
        const projectLocation = getVal("projectLocation", "");

        const year = getVal("yearSelect", "");
        const month = getVal("monthSelect", "");
        const 작성일자 = (year && month) ? `${year}. ${month}.` : "";

        const startYear = getVal("startYearSelect", "");
        const completeYear = getVal("completeYearSelect", "");
        const bizPeriodText = (startYear && completeYear) ? `${startYear}년 ~ ${completeYear}년` : "";

        const ownerName = getVal("ownerName", "");

        const zoneMain = getVal("zoneMainSelect", "");
        const zoneSub = getVal("zoneSubSelect", "");
        const zoneText = (zoneMain && zoneSub) ? `${zoneMain} / ${zoneSub}` : "";

        const bizType = getVal("bizTypeSelect", "");

        const areaTotalSite  = formatNumberWithComma(getVal("areaTotalSite", ""));
        const areaBuildSite  = formatNumberWithComma(getVal("areaBuildSite", ""));
        const areaRoadSite   = formatNumberWithComma(getVal("areaRoadSite", ""));
        const areaGrossFloor = formatNumberWithComma(getVal("areaGrossFloor", ""));

        const roadLength = formatNumberWithComma(getVal("roadLength", ""));
        const roadWidth  = formatNumberWithComma(getVal("roadWidth", ""));

        const envRiver = document.querySelector('input[name="env_river"]:checked')?.value === "해당";
        const envWaterSource = document.querySelector('input[name="env_water"]:checked')?.value === "해당";
        const envSpecial = document.querySelector('input[name="env_special"]:checked')?.value || "none";

        const bizHistory = getVal("bizHistory", "");
        const writerName = getVal("writerName", "");
        const writerContact = getVal("writerContact", "");

        // 현재 UI에서는 저감계획 “공공/개별” 선택 UI를 안 달았으니 기본값 공공으로 유지
        const sewageMode = "public";
        const wasteMode  = "public";

        const data = {
          projectName, projectLocation, bizPeriodText, ownerName, zoneText, bizType,
          areaTotalSite, areaBuildSite, areaRoadSite, areaGrossFloor,
          roadLength, roadWidth,
          envRiver, envWaterSource, envSpecial,
          bizHistory, writerName, writerContact,
          sewageMode, wasteMode
        };

        const wrapped = smartWrapBusinessName(projectName);
        const businessNameRuns = [
          new TextRun({ text: wrapped.line1, font: "맑은 고딕", bold: true, size: wrapped.fontPt * 2 })
        ];
        if (wrapped.line2) {
          businessNameRuns.push(
            new TextRun({ text: wrapped.line2, break: 1, font: "맑은 고딕", bold: true, size: wrapped.fontPt * 2 })
          );
        }

        const row7 = calcRow7Height();

        const noBorders = {
          top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideVertical:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        };

        const coverTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorders,
          rows: [
            new TableRow({ cantSplit: true, height: { value: 600 }, children: [new TableCell({ borders: noBorders, children: [new Paragraph("")] })] }),
            new TableRow({
              cantSplit: true, height: { value: 1843 },
              children: [new TableCell({
                borders: noBorders, verticalAlign: VerticalAlign.BOTTOM,
                children: [ new Paragraph({ alignment: AlignmentType.CENTER, children: businessNameRuns }) ]
              })]
            }),
            new TableRow({
              cantSplit: true,
              children: [new TableCell({
                borders: noBorders,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: "수질오염총량검토서",
                        font: "맑은 고딕",
                        bold: true,
                        size: 96,
                        underline: { type: UnderlineType.DOUBLE }
                      })
                    ]
                  })
                ]
              })]
            }),
            new TableRow({ cantSplit: true, height: { value: 3984 }, children: [new TableCell({ borders: noBorders, children: [new Paragraph("")] })] }),
            new TableRow({
              cantSplit: true, height: { value: 3701 },
              children: [new TableCell({
                borders: noBorders,
                children: [ new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 작성일자, font: "맑은 고딕", bold: true, size: 40 })] }) ]
              })]
            }),
            new TableRow({ cantSplit: true, children: [new TableCell({ borders: noBorders, children: [new Paragraph("")] })] }),
            new TableRow({
              cantSplit: true, height: { value: 1266 },
              children: [new TableCell({
                borders: noBorders,
                children: [ new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ownerName, font: "맑은 고딕", bold: true, size: 40 })] }) ]
              })]
            }),
            new TableRow({ cantSplit: true, height: { value: row7 }, children: [new TableCell({ borders: noBorders, children: [new Paragraph("")] })] }),
          ]
        });

        const coverSection = {
          properties: {
            type: SectionType.NEXT_PAGE,
            page: { margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT } }
          },
          children: [coverTable]
        };

        const makePlaceholderTable = (rows, cols) =>
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: Array.from({ length: rows }, (_, r) => new TableRow({
              cantSplit: true,
              children: Array.from({ length: cols }, (_, c) =>
                new TableCell({ children: [new Paragraph(r === 0 ? `헤더${c+1}` : "")] })
              )
            }))
          });

        const bodySection = {
          properties: {
            page: { margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT } }
          },
          children: [
            ...buildChongGwalBlock(docx, data),

            new Paragraph({ text: "유역위치도", heading: docx.HeadingLevel.HEADING_1 }),
            new Paragraph("[유역위치도 이미지 삽입 영역]"),
            new Paragraph("파일: {{유역위치도_파일}}" ),

            new Paragraph(""),
            new Paragraph({ text: "토지이용계획도", heading: docx.HeadingLevel.HEADING_1 }),
            new Paragraph("[토지이용계획도 이미지 삽입 영역]"),
            new Paragraph("파일: {{토지이용계획도_파일}}" ),

            ...buildJeogamPlanBlock(docx, data),

            new Paragraph(""),
            new Paragraph({ text: "부하량산정", heading: docx.HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "생활계 (사업시행 전/후)", heading: docx.HeadingLevel.HEADING_2 }),
            new Paragraph("표 1. 생활계 산정(전)"),
            makePlaceholderTable(2, 6),
            new Paragraph("표 2. 생활계 산정(후)"),
            makePlaceholderTable(2, 6),

            new Paragraph(""),
            new Paragraph({ text: "토지계 (사업시행 전/후)", heading: docx.HeadingLevel.HEADING_2 }),
            new Paragraph("표 3. 토지계 산정(전)"),
            makePlaceholderTable(2, 6),
            new Paragraph("표 4. 토지계 산정(후)"),
            makePlaceholderTable(2, 6),

            new Paragraph(""),
            new Paragraph({ text: "결과 요약", heading: docx.HeadingLevel.HEADING_2 }),
            new Paragraph("표 5. 전/후 비교 및 증감"),
            makePlaceholderTable(2, 7),

            new Paragraph(""),
            new Paragraph({ text: "부록", heading: docx.HeadingLevel.HEADING_1 }),
            new Paragraph("건축물대장: {{건축물대장_파일}}"),
            new Paragraph("토지대장: {{토지대장_파일}}"),
          ]
        };

        const doc = new Document({ sections: [coverSection, bodySection] });
        Packer.toBlob(doc).then(blob => saveAs(blob, (typeof CONFIG !== "undefined" ? CONFIG.DOCX_FILENAME : "수질오염총량검토서.docx")));
      } catch (err) {
        console.error(err);
        alert("Word 생성 중 오류가 발생했어요. 콘솔(F12)에서 에러를 확인해 주세요.\n\n" + (err?.message || err));
      }
    }
