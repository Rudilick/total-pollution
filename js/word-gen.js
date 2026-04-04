// ================================================================
// word-gen.js  v4
// 마스터규칙서 v0.9 기준 — calc.js v4 결과 연동
// ================================================================

// ── 페이지 여백 (twip) ──────────────────────────────────────────
const A4_HEIGHT_TWIP    = 16833;
const MARGIN_TOP        = 1100;
const MARGIN_BOTTOM     = 1100;
const MARGIN_LEFT       = 1000;
const MARGIN_RIGHT      = 1000;
const USABLE_HEIGHT_TWIP = A4_HEIGHT_TWIP - MARGIN_TOP - MARGIN_BOTTOM;

// ── 숫자 포매터 ──────────────────────────────────────────────────
const F = {
  f2: v => (typeof v === "number" && isFinite(v)) ? v.toFixed(2)  : "-",
  f3: v => (typeof v === "number" && isFinite(v)) ? v.toFixed(3)  : "-",
  f4: v => (typeof v === "number" && isFinite(v)) ? v.toFixed(4)  : "-",
  f7: v => (typeof v === "number" && isFinite(v)) ? v.toFixed(7)  : "-",
  // 총괄/할당부하량 반올림
  bod: v => (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "0.00",
  tp:  v => (typeof v === "number" && isFinite(v)) ? v.toFixed(3) : "0.000",
  // 증감이 음수면 ≒0
  bodDelta: v => {
    if (typeof v !== "number" || !isFinite(v)) return "0.00";
    return v <= 0.005 ? `${v.toFixed(2)}(≒0.00)` : v.toFixed(2);
  },
  tpDelta: v => {
    if (typeof v !== "number" || !isFinite(v)) return "0.000";
    return v <= 0.0005 ? `${v.toFixed(3)}(≒0.000)` : v.toFixed(3);
  },
  area: v => (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "-",
  pct:  v => (typeof v === "number" && isFinite(v)) ? v.toFixed(4) : "0.0000",
};

const getVal = (id, fallback = "") => {
  const el = document.getElementById(id);
  return el ? (el.value ?? fallback) : fallback;
};

// ══════════════════════════════════════════════════════════════════
//  표지 제목 자동 줄바꿈
// ══════════════════════════════════════════════════════════════════
const COVER_NAME_MAX_WIDTH_PX = 660;
const FONT_CANDIDATES_PT = [20, 18, 16, 14, 12];

function ptToPx(pt) { return pt * (96 / 72); }

function measureWidthPx(text, fontPt, fontFamily = "맑은 고딕") {
  const canvas = measureWidthPx._c || (measureWidthPx._c = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = `${ptToPx(fontPt)}px "${fontFamily}"`;
  return ctx.measureText(text).width;
}

function smartWrapBusinessName(text) {
  const cleaned = (text || "").trim().replace(/\s+/g, " ") || "{사업명}";
  for (const pt of FONT_CANDIDATES_PT) {
    const wFull = measureWidthPx(cleaned, pt);
    if (wFull <= COVER_NAME_MAX_WIDTH_PX) return { line1: cleaned, line2: "", fontPt: pt };
    const tokens = cleaned.split(" ");
    let best = null;
    for (let i = 1; i < tokens.length; i++) {
      const l1 = tokens.slice(0, i).join(" ");
      const l2 = tokens.slice(i).join(" ");
      if (measureWidthPx(l1, pt) <= COVER_NAME_MAX_WIDTH_PX &&
          measureWidthPx(l2, pt) <= COVER_NAME_MAX_WIDTH_PX) {
        const score = Math.abs(measureWidthPx(l1, pt) - measureWidthPx(l2, pt));
        if (!best || score < best.score) best = { line1: l1, line2: l2, fontPt: pt, score };
      }
    }
    if (best) return best;
  }
  const fp = FONT_CANDIDATES_PT[FONT_CANDIDATES_PT.length - 1];
  return { line1: cleaned, line2: "", fontPt: fp };
}

// ══════════════════════════════════════════════════════════════════
//  공통 빌더 헬퍼
// ══════════════════════════════════════════════════════════════════
function makeDocxHelpers(docx) {
  const { Paragraph, TextRun, Table, TableRow, TableCell,
          AlignmentType, BorderStyle, WidthType, VerticalAlign } = docx;

  const FONT = "맑은 고딕";
  const SZ   = 20; // 10pt
  const SZ_H = 22; // 11pt
  const SZ_S = 18; // 9pt

  const nb  = { style: BorderStyle.SINGLE, size: 4,  color: "000000" };
  const tb  = { style: BorderStyle.SINGLE, size: 10, color: "000000" };
  const non = { style: BorderStyle.NONE,   size: 0,  color: "FFFFFF" };
  const ALL_BORDERS = { top: nb, bottom: nb, left: nb, right: nb,
                        insideHorizontal: nb, insideVertical: nb };
  const THICK_BORDERS = { top: tb, bottom: tb, left: tb, right: tb,
                          insideHorizontal: nb, insideVertical: nb };

  // ── paragraph 헬퍼 ──────────────────────────────────────────
  function p(text = "", { center = false, right = false, bold = false,
                           size = SZ, indent = 0, spacing = {}, color } = {}) {
    const runs = String(text).split("\n").flatMap((line, i) =>
      i === 0 ? [new TextRun({ text: line, font: FONT, bold, size, color })]
              : [new TextRun({ text: "", break: 1, font: FONT, bold, size, color }),
                 new TextRun({ text: line, font: FONT, bold, size, color })]
    );
    return new Paragraph({
      alignment: center ? AlignmentType.CENTER : right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      indent: indent ? { left: indent } : undefined,
      spacing,
      children: runs,
    });
  }

  // ── TableCell 헬퍼 ──────────────────────────────────────────
  function tc(children, { cs = 1, rs = 1, w, wPct, shading, borders, vAlign } = {}) {
    return new TableCell({
      children: Array.isArray(children) ? children : [children],
      columnSpan: cs,
      rowSpan: rs,
      width: wPct ? { size: wPct, type: WidthType.PERCENTAGE }
                  : w    ? { size: w, type: WidthType.DXA } : undefined,
      shading: shading ? { fill: shading, type: "clear" } : undefined,
      borders: borders || ALL_BORDERS,
      verticalAlign: vAlign || VerticalAlign.CENTER,
    });
  }

  // ── TableRow 헬퍼 ────────────────────────────────────────────
  function tr(cells, height) {
    return new TableRow({
      children: cells,
      height: height ? { value: height } : undefined,
    });
  }

  // ── 단순 표 ──────────────────────────────────────────────────
  // headers: string[], rows: string[][], colWidths(DXA)[]
  function simpleTable(headers, rows, colWidths, { thick = false, headShade = "D9E2F3" } = {}) {
    const borders = thick ? THICK_BORDERS : ALL_BORDERS;
    const totalW = colWidths.reduce((a, b) => a + b, 0);

    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => tc(
        p(h, { center: true, bold: true, size: SZ_S }),
        { w: colWidths[i], shading: headShade }
      )),
    });

    const dataRows = rows.map(row => new TableRow({
      children: row.map((cell, i) => tc(
        p(String(cell ?? ""), { center: i > 0, size: SZ_S }),
        { w: colWidths[i] }
      )),
    }));

    return new Table({
      width: { size: totalW, type: WidthType.DXA },
      borders: ALL_BORDERS,
      rows: [headerRow, ...dataRows],
    });
  }

  // ── 섹션 제목 ────────────────────────────────────────────────
  function heading1(text) {
    return new Paragraph({
      spacing: { before: 300, after: 160 },
      children: [new TextRun({ text, font: FONT, bold: true, size: 26 })],
    });
  }
  function heading2(text) {
    return new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, font: FONT, bold: true, size: 24 })],
    });
  }
  function heading3(text) {
    return new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text, font: FONT, bold: true, size: SZ })],
    });
  }
  function note(text) {
    return p(text, { size: SZ_S, color: "444444" });
  }
  function blank() { return new Paragraph(""); }

  return { p, tc, tr, simpleTable, heading1, heading2, heading3, note, blank,
           FONT, SZ, SZ_H, SZ_S, nb, tb, non, ALL_BORDERS, THICK_BORDERS,
           Paragraph, TextRun, Table, TableRow, TableCell,
           AlignmentType, BorderStyle, WidthType, VerticalAlign };
}

// ══════════════════════════════════════════════════════════════════
//  표지 섹션
// ══════════════════════════════════════════════════════════════════
function buildCoverSection(docx, data) {
  const { Paragraph, TextRun, Table, TableRow, TableCell,
          AlignmentType, UnderlineType, WidthType, BorderStyle, VerticalAlign, SectionType } = docx;

  const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      insideVertical:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };

  const wrapped = smartWrapBusinessName(data.projectName);
  const nameRuns = [new TextRun({ text: wrapped.line1, font: "맑은 고딕", bold: true, size: wrapped.fontPt * 2 })];
  if (wrapped.line2) {
    nameRuns.push(new TextRun({ text: wrapped.line2, break: 1, font: "맑은 고딕", bold: true, size: wrapped.fontPt * 2 }));
  }

  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const bc = children => new TableCell({ borders: noBorders, children });

  // 빈 행 높이 계산
  const usedH = 600 + 1843 + 3984 + 3701 + 1266;
  const row7H = Math.max(800, USABLE_HEIGHT_TWIP - usedH - 300);

  const coverTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({ height: { value: 600 },  children: [bc([new Paragraph("")])] }),
      new TableRow({ height: { value: 1843 }, children: [new TableCell({
        borders: noBorders, verticalAlign: VerticalAlign.BOTTOM,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: nameRuns })]
      })] }),
      new TableRow({ children: [bc([new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "수질오염총량검토서", font: "맑은 고딕", bold: true, size: 96,
                                 underline: { type: UnderlineType.DOUBLE } })]
      })])] }),
      new TableRow({ height: { value: 3984 }, children: [bc([new Paragraph("")])] }),
      new TableRow({ height: { value: 3701 }, children: [bc([new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: data.작성일자 || "", font: "맑은 고딕", bold: true, size: 40 })]
      })])] }),
      new TableRow({ children: [bc([new Paragraph("")])] }),
      new TableRow({ height: { value: 1266 }, children: [bc([new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: data.ownerName || "", font: "맑은 고딕", bold: true, size: 40 })]
      })])] }),
      new TableRow({ height: { value: row7H }, children: [bc([new Paragraph("")])] }),
    ]
  });

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT } }
    },
    children: [coverTable]
  };
}

// ══════════════════════════════════════════════════════════════════
//  총괄표 (사업의 개요)
// ══════════════════════════════════════════════════════════════════
function buildChongGwalBlock(docx, data) {
  const H = makeDocxHelpers(docx);
  const { Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign } = docx;
  const FONT = H.FONT;

  const nb = { style: BorderStyle.SINGLE, size: 6,  color: "000000" };
  const tb = { style: BorderStyle.SINGLE, size: 14, color: "000000" };
  const non = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cb  = (over={}) => ({ top: over.top??nb, bottom: over.bottom??nb, left: over.left??nb, right: over.right??nb });

  const cell = (children, opts={}) => new TableCell({
    children: Array.isArray(children) ? children : [children],
    borders: opts.borders ?? cb(),
    columnSpan: opts.colSpan ?? 1,
    rowSpan: opts.rowSpan ?? 1,
    width: opts.wPct ? { size: opts.wPct, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: opts.vAlign ?? VerticalAlign.CENTER,
    shading: opts.shading ? { fill: opts.shading, type: "clear" } : undefined,
  });

  const para = (text, { center=false, right=false, bold=false, size=H.SZ }={}) =>
    H.p(text, { center, right, bold, size });

  const ROW_H = 680;
  const W1 = 12, W2 = 22;
  const RIGHT = 100 - W1 - W2;
  const U = 11, THIRD = 2 * U, HALF = 3 * U;

  const markYN = (yes) => yes ? "■ 해당" : "□ 해당";
  const markNo = (yes) => yes ? "□ 해당 없음" : "■ 해당 없음";

  const { envRiver, envWaterSource, envSpecial } = data;
  const riverL = markYN(envRiver), riverR = markNo(envRiver);
  const waterL = markYN(envWaterSource), waterR = markNo(envWaterSource);
  let spL, spR;
  if (envSpecial === "1권역")         { spL = "■ 해당 (1권역)"; spR = "□ 해당 없음"; }
  else if (envSpecial === "2권역")    { spL = "■ 해당 (2권역)"; spR = "□ 해당 없음"; }
  else                                { spL = "□ 해당 (1·2권역)"; spR = "■ 해당 없음"; }

  const calcResult = data.calcResult;
  const finalBOD = calcResult?.최종배출부하량?.점오염?.BOD ?? 0;
  const finalTP  = calcResult?.최종배출부하량?.점오염?.TP  ?? 0;
  const bisBOD   = calcResult?.최종배출부하량?.비점오염?.BOD ?? 0;
  const bisTP    = calcResult?.최종배출부하량?.비점오염?.TP  ?? 0;
  const unitBasin = calcResult?.params?.unitBasin || "-";

  const tableBorders = {
    top: nb, left: nb, insideHorizontal: nb, insideVertical: nb,
    right: tb, bottom: tb,
  };

  // 할당부하량 행 값
  const bodPt  = finalBOD <= 0.005 ? "0.00" : F.bod(finalBOD);
  const tpPt   = finalTP  <= 0.0005 ? "0.000" : F.tp(finalTP);
  const bodBis = bisBOD <= 0.005 ? "0.00" : F.bod(bisBOD);
  const tpBis  = bisTP  <= 0.0005 ? "0.000" : F.tp(bisTP);

  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      // 사업명
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("사 업 명", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.projectName||"", { center:true }), { colSpan:6, wPct: RIGHT }),
      ]}),
      // 소재지
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("소 재 지", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.projectLocation||"", { center:true }), { colSpan:6, wPct: RIGHT }),
      ]}),
      // 사업기간
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("사업기간(준공예정년도)", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.bizPeriodText||"", { center:true }), { colSpan:6, wPct: RIGHT }),
      ]}),
      // 사업시행자
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("사 업 시 행 자", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.ownerName||"", { center:true }), { colSpan:6, wPct: RIGHT }),
      ]}),
      // 용도지역
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("용 도 지 역", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.zoneText||"", { center:true }), { colSpan:6, wPct: RIGHT }),
      ]}),
      // 사업의 종류
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("사업의 종류", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.bizType||"", { center:true }), { colSpan:6, wPct: RIGHT }),
      ]}),
      // 면적 - 전체부지
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("면 적", { center:true }), { rowSpan:6, wPct: W1 }),
        cell(para("부지면적", { center:true }), { rowSpan:3, wPct: W2 }),
        cell(para("전체부지", { center:true }), { colSpan:2, wPct: THIRD, borders: cb({ right: non }) }),
        cell(para(data.areaTotalSite||"", { right:true }), { colSpan:2, wPct: THIRD, borders: cb({ left:non, right:non }) }),
        cell(para("㎡"), { colSpan:2, wPct: THIRD, borders: cb({ left:non }) }),
      ]}),
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("건축부지", { center:true }), { colSpan:2, wPct: THIRD, borders: cb({ right:non }) }),
        cell(para(data.areaBuildSite||"", { right:true }), { colSpan:2, wPct: THIRD, borders: cb({ left:non, right:non }) }),
        cell(para("㎡"), { colSpan:2, wPct: THIRD, borders: cb({ left:non }) }),
      ]}),
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("도로부지", { center:true }), { colSpan:2, wPct: THIRD, borders: cb({ right:non }) }),
        cell(para(data.areaRoadSite||"", { right:true }), { colSpan:2, wPct: THIRD, borders: cb({ left:non, right:non }) }),
        cell(para("㎡"), { colSpan:2, wPct: THIRD, borders: cb({ left:non }) }),
      ]}),
      // 건축연면적
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("건축연면적", { center:true }), { wPct: W2 }),
        cell(para("", { center:true }), { colSpan:2, wPct: THIRD, borders: cb({ right:non }) }),
        cell(para(data.areaGrossFloor||"", { right:true }), { colSpan:2, wPct: THIRD, borders: cb({ left:non, right:non }) }),
        cell(para("㎡"), { colSpan:2, wPct: THIRD, borders: cb({ left:non }) }),
      ]}),
      // 도로 길이
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("도 로", { center:true }), { rowSpan:2, wPct: W2 }),
        cell(para("노선길이", { center:true }), { colSpan:2, wPct: THIRD, borders: cb({ right:non }) }),
        cell(para(data.roadLength||"", { right:true }), { colSpan:2, wPct: THIRD, borders: cb({ left:non, right:non }) }),
        cell(para("m"), { colSpan:2, wPct: THIRD, borders: cb({ left:non }) }),
      ]}),
      // 도로 폭
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("폭", { center:true }), { colSpan:2, wPct: THIRD, borders: cb({ right:non }) }),
        cell(para(data.roadWidth||"", { right:true }), { colSpan:2, wPct: THIRD, borders: cb({ left:non, right:non }) }),
        cell(para("m"), { colSpan:2, wPct: THIRD, borders: cb({ left:non }) }),
      ]}),
      // 환경현황
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("환경현황", { center:true }), { rowSpan:3, wPct: W1 }),
        cell(para("수변구역", { center:true }), { wPct: W2 }),
        cell(para(riverL, { center:true }), { colSpan:3, wPct: HALF, borders: cb({ right:non }) }),
        cell(para(riverR, { center:true }), { colSpan:3, wPct: HALF, borders: cb({ left:non }) }),
      ]}),
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("상수원보호구역", { center:true }), { wPct: W2 }),
        cell(para(waterL, { center:true }), { colSpan:3, wPct: HALF, borders: cb({ right:non }) }),
        cell(para(waterR, { center:true }), { colSpan:3, wPct: HALF, borders: cb({ left:non }) }),
      ]}),
      new TableRow({ height: { value: ROW_H }, children: [
        cell(para("특별대책지역", { center:true }), { wPct: W2 }),
        cell(para(spL, { center:true }), { colSpan:3, wPct: HALF, borders: cb({ right:non }) }),
        cell(para(spR, { center:true }), { colSpan:3, wPct: HALF, borders: cb({ left:non }) }),
      ]}),
      // 사업의 추진경위
      new TableRow({ height: { value: ROW_H * 2 }, children: [
        cell(para("사업의 추진경위", { center:true }), { colSpan:2, wPct: W1+W2 }),
        cell(para(data.bizHistory||"[여기에 직접 입력하세요]"), { colSpan:6, wPct: RIGHT }),
      ]}),
    ]
  });

  // 할당부하량 표
  const allotTable = H.simpleTable(
    ["구분", "단위유역", "준공년도", "BOD 점", "BOD 비점", "T-P 점", "T-P 비점"],
    [
      ["최초개발", unitBasin, data.completeYear||"-", "-", "-", "-", "-"],
      ["추  가",   unitBasin, data.completeYear||"-", bodPt, bodBis, tpPt, tpBis],
      ["합  계",   unitBasin, data.completeYear||"-", bodPt, bodBis, tpPt, tpBis],
    ],
    [1400, 1100, 1000, 900, 900, 900, 900]
  );

  const writerLine = H.p(
    `검토서 작성자 : ${data.writerName||""} (☎ ${data.writerContact||""})`,
    { right: true, size: H.SZ_S }
  );

  return [
    H.heading1("사업의 개요"),
    mainTable,
    H.blank(),
    H.heading2("2. 할당부하량"),
    allotTable,
    H.blank(),
    writerLine,
    H.blank(),
  ];
}

// ══════════════════════════════════════════════════════════════════
//  저감계획표
// ══════════════════════════════════════════════════════════════════
function buildJeogamBlock(docx, data) {
  const H = makeDocxHelpers(docx);
  const { Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign } = docx;

  const nb = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
  const tb = { style: BorderStyle.SINGLE, size: 10, color: "000000" };
  const non = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cb = (over={}) => ({ top:over.top??nb, bottom:over.bottom??nb, left:over.left??nb, right:over.right??nb });

  const cell = (children, opts={}) => new TableCell({
    children: Array.isArray(children) ? children : [children],
    borders: opts.borders ?? cb(),
    columnSpan: opts.colSpan ?? 1,
    rowSpan: opts.rowSpan ?? 1,
    width: opts.wPct ? { size: opts.wPct, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: opts.vAlign ?? VerticalAlign.CENTER,
  });

  const p = (t="", center=false, bold=false) => H.p(t, { center, bold, size: H.SZ_S });

  // 사업후 처리방식 파악
  const cr = data.calcResult;
  const afterMethod = data.afterMethod1 || "개인하수처리시설";
  const isPublicAfter = afterMethod === "공공하수처리시설";
  const markPub  = isPublicAfter ? "■" : "□";
  const markPriv = isPublicAfter ? "□" : "■";

  const plantName = data.afterPlantName || "";
  const efflBOD   = data.afterEfflBOD != null ? String(data.afterEfflBOD) : "20";
  const efflTP    = data.afterEfflTP  != null ? String(data.afterEfflTP)  : "4";
  const capacity  = data.afterCapacity || "";

  const ROW_H = 400;

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top:tb, bottom:tb, left:tb, right:tb, insideHorizontal:nb, insideVertical:nb },
    rows: [
      // 오수처리 - 공공
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("오수처리계획", true), { rowSpan:14, wPct:12 }),
        cell(p(`${markPub} 공공`, true), { rowSpan:3, wPct:15 }),
        cell(p("처리시설명", true), { wPct:15 }),
        cell(p(isPublicAfter ? plantName : "", true), { colSpan:3, wPct:58 }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("시설용량", true), { wPct:15 }),
        cell(p(isPublicAfter ? (capacity?`${capacity} ㎥/d`:"") : "", true), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("㎥/d"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("방류기준 BOD", true), { wPct:15 }),
        cell(p(isPublicAfter ? String(efflBOD) : "", true), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("mg/L"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      // 개별
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p(`${markPriv} 개별`, true), { rowSpan:11, wPct:15 }),
        cell(p("처리공법", true), { wPct:15 }),
        cell(p(isPublicAfter ? "" : (data.afterProcessMethod||"MBR공법"), true), { colSpan:2, wPct:40 }),
        cell(p(""), { wPct:18 }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("시설용량", true), { wPct:15 }),
        cell(p(isPublicAfter ? "" : (capacity?`${capacity}`:"-"), true), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("㎥/d"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("개소수", true), { wPct:15 }),
        cell(p(isPublicAfter ? "" : "1"), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("개소"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("방류기준 BOD", true), { wPct:15 }),
        cell(p(isPublicAfter ? "" : String(efflBOD), true), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("mg/L"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("방류기준 T-P", true), { wPct:15 }),
        cell(p(isPublicAfter ? "" : String(efflTP), true), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("mg/L"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("강화기준 BOD", true), { wPct:15 }),
        cell(p(""), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("mg/L"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("강화기준 T-P", true), { wPct:15 }),
        cell(p(""), { colSpan:2, wPct:40, borders:cb({right:non}) }),
        cell(p("mg/L"), { wPct:18, borders:cb({left:non}) }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("1회/2회 처리대상인원", true), { wPct:15 }),
        cell(p(""), { colSpan:3, wPct:58 }),
      ]}),
      new TableRow({ height:{value:ROW_H*2}, children:[
        cell(p("관련근거(기술검증번호)", true), { colSpan:2, wPct:30 }),
        cell(p(data.techCertNo||"[기술검증번호]", true), { colSpan:2, wPct:58 }),
      ]}),
      // 비점오염
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("비점오염저감계획", true), { rowSpan:3, wPct:12 }),
        cell(p("종류", true), { wPct:15 }),
        cell(p("시설용량(㎥)", true), { wPct:20 }),
        cell(p("삭감량(BOD, kg/일)", true), { wPct:25 }),
        cell(p("삭감량(T-P, kg/일)", true), { wPct:28 }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("-"), { wPct:15 }),
        cell(p("-"), { wPct:20 }),
        cell(p("-"), { wPct:25 }),
        cell(p("-"), { wPct:28 }),
      ]}),
      new TableRow({ height:{value:ROW_H}, children:[
        cell(p("-"), { wPct:15 }),
        cell(p("-"), { wPct:20 }),
        cell(p("-"), { wPct:25 }),
        cell(p("-"), { wPct:28 }),
      ]}),
    ]
  });

  return [H.heading2("3. 저감계획"), table, H.blank()];
}

// ══════════════════════════════════════════════════════════════════
//  생활계 부하량 산정 — 사업전/후 전체
// ══════════════════════════════════════════════════════════════════
function buildLifeSection(docx, calcResult, isWaterBuffer) {
  const H = makeDocxHelpers(docx);
  const elements = [];

  elements.push(H.heading1("제2장 부하량 산정결과"));
  elements.push(H.heading2("2.1 생활계"));

  const before = calcResult?.생활계?.사업전;
  const after  = calcResult?.생활계?.사업후;

  elements.push(...buildLifeBefore(docx, H, before, isWaterBuffer));
  elements.push(...buildLifeAfter(docx, H, after, isWaterBuffer));
  elements.push(...buildLifeSummary(docx, H, before, after));

  return elements;
}

// ── 사업시행 전 생활계 ───────────────────────────────────────────
function buildLifeBefore(docx, H, before, isWaterBuffer) {
  const els = [];
  els.push(H.heading2("2.1.1 사업시행 전"));

  if (!before || (!before.가정인구 && !(before.영업인구?.rows?.length))) {
    els.push(H.p("◦ 본 사업부지는 사업시행 전 점오염원(생활계)에 의한 배출부하량은 없는 것으로 조사되었습니다."));
    return els;
  }

  const hh  = before.가정인구;
  const biz = before.영업인구;

  // ── 가정인구 ──────────────────────────────────────────────────
  if (hh) {
    els.push(H.heading3("가. 가정인구"));
    els.push(H.p(`◦ 계획인구 : ${Math.round(hh.population)}인 (세대당 ${F.f2(hh.population / Math.round(hh.population / hh.급수원단위 * hh.급수원단위))}인/세대 적용)`, { size: H.SZ_S }));

    // 오수발생량
    els.push(H.blank());
    els.push(H.p("[표] 가정인구 오수발생량", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["구분", "계획인구(인)", "급수원단위(L/인/일)", "일평균급수량(㎥/일)", "오수발생량(㎥/일)"],
      [["가정인구", Math.round(hh.population), F.f2(hh.급수원단위), F.f4(hh.일평균급수량), F.f4(hh.오수발생유량)]],
      [1200, 1400, 1800, 1800, 1800]
    ));

    // 발생부하량
    els.push(H.blank());
    els.push(H.p("[표] 가정인구 발생부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["구분", "인구수(인)", "BOD원단위(g/인/일)", "BOD발생량(kg/일)", "T-P원단위(g/인/일)", "T-P발생량(kg/일)"],
      [["가정인구", Math.round(hh.population),
        CALC_CONSTS?.HH_LOAD_UNIT?.["비시가화"]?.BOD ?? 48.6,
        F.f4(hh.발생부하량?.BOD),
        CALC_CONSTS?.HH_LOAD_UNIT?.["비시가화"]?.TP ?? 1.45,
        F.f4(hh.발생부하량?.TP)]],
      [1200, 1200, 1600, 1500, 1600, 1500]
    ));
  }

  // ── 영업인구 ──────────────────────────────────────────────────
  if (biz?.rows?.length) {
    els.push(H.heading3("나. 영업인구"));
    const bizRows = biz.rows.map(r => [
      `${r.buildingNo}동 ${r.floorNo}층`,
      r.mid + (r.minor ? `(${r.minor})` : ""),
      F.area(r.적용면적) + (r.unitType === "area" ? "㎡" : "인"),
      r.오수발생원단위,
      F.f4(r.오수발생유량),
      F.f4(r.발생부하량?.BOD),
      F.f4(r.발생부하량?.TP),
    ]);
    bizRows.push(["합  계", "", "", "",
      F.f4(biz.합계.오수발생유량),
      F.f4(biz.합계.발생부하량?.BOD),
      F.f4(biz.합계.발생부하량?.TP)]);

    els.push(H.blank());
    els.push(H.p("[표] 영업인구 오수발생량 및 발생부하량 (단위: ㎥/일, kg/일)", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["위치", "용도", "면적/인원", "오수원단위", "오수발생량", "발생BOD", "발생T-P"],
      bizRows,
      [1100, 1500, 1200, 1100, 1300, 1300, 1300]
    ));
  }

  // ── 합계 ──────────────────────────────────────────────────────
  if (hh && biz?.rows?.length) {
    const sumSewage = (hh.오수발생유량 || 0) + (biz.합계.오수발생유량 || 0);
    const sumBOD    = (hh.발생부하량?.BOD || 0) + (biz.합계.발생부하량?.BOD || 0);
    const sumTP     = (hh.발생부하량?.TP  || 0) + (biz.합계.발생부하량?.TP  || 0);

    els.push(H.blank());
    els.push(H.p("[표] 사업시행 전 생활계 오수발생량 합계 (단위: ㎥/일)", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["구분", "오수발생량(㎥/일)", "분뇨발생량(㎥/일)", "잡배수발생량(㎥/일)"],
      [
        ["가정인구", F.f4(hh.오수발생유량), F.f7(hh.분뇨발생유량), F.f4(hh.잡배수발생유량)],
        ["영업인구", F.f4(biz.합계.오수발생유량), "-", "-"],
        ["합  계",   F.f4(sumSewage), "-", "-"],
      ],
      [1800, 1800, 1800, 1800]
    ));
  }

  // ── 배출부하량 ────────────────────────────────────────────────
  els.push(H.heading3("다. 배출부하량"));
  els.push(...buildDischargeCalc(docx, H, before, "before", isWaterBuffer));

  return els;
}

// ── 사업시행 후 생활계 ───────────────────────────────────────────
function buildLifeAfter(docx, H, after, isWaterBuffer) {
  const els = [];
  els.push(H.heading2("2.1.2 사업시행 후"));

  if (!after || (!after.가정인구 && !(after.영업인구?.rows?.length))) {
    els.push(H.p("◦ 사업시행 후 생활계 배출부하량은 없는 것으로 산정됩니다."));
    return els;
  }

  const hh  = after.가정인구;
  const biz = after.영업인구;

  if (hh) {
    els.push(H.heading3("가. 가정인구"));
    els.push(H.simpleTable(
      ["구분", "계획인구(인)", "급수원단위(L/인/일)", "일평균급수량(㎥/일)", "오수발생량(㎥/일)"],
      [["가정인구", Math.round(hh.population), F.f2(hh.급수원단위), F.f4(hh.일평균급수량), F.f4(hh.오수발생유량)]],
      [1200, 1400, 1800, 1800, 1800]
    ));
  }

  if (biz?.rows?.length) {
    els.push(H.heading3("나. 영업인구"));
    const bizRows = biz.rows.map(r => [
      `${r.buildingNo}동 ${r.floorNo}층`,
      r.mid + (r.minor ? `(${r.minor})` : ""),
      F.area(r.적용면적) + (r.unitType === "area" ? "㎡" : "인"),
      r.오수발생원단위,
      F.f4(r.오수발생유량),
      F.f4(r.발생부하량?.BOD),
      F.f4(r.발생부하량?.TP),
    ]);
    bizRows.push(["합  계", "", "", "",
      F.f4(biz.합계.오수발생유량),
      F.f4(biz.합계.발생부하량?.BOD),
      F.f4(biz.합계.발생부하량?.TP)]);

    els.push(H.blank());
    els.push(H.p("[표] 영업인구 오수발생량 및 발생부하량 (단위: ㎥/일, kg/일)", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["위치", "용도", "면적/인원", "오수원단위", "오수발생량", "발생BOD", "발생T-P"],
      bizRows,
      [1100, 1500, 1200, 1100, 1300, 1300, 1300]
    ));
  }

  els.push(H.heading3("다. 배출부하량"));
  els.push(...buildDischargeCalc(docx, H, after, "after", isWaterBuffer));

  return els;
}

// ── 배출부하량 계산 (처리방식별 분기) ───────────────────────────
function buildDischargeCalc(docx, H, lifeSection, phase, isWaterBuffer) {
  const els = [];
  if (!lifeSection) return els;

  // 모든 영업인구 row의 처리방식 확인
  const rows = lifeSection.영업인구?.rows || [];
  const hh   = lifeSection.가정인구;

  // 처리방식 목록 수집
  const methods = new Set();
  if (hh?.처리장정보?.name) methods.add("공공하수처리시설:" + hh.처리장정보.name);
  else if (hh) methods.add(hh.개인처리기준 ? "개인하수처리시설" : "공공하수처리시설");

  rows.forEach(r => {
    if (r.처리장정보?.name) methods.add("공공하수처리시설:" + r.처리장정보.name);
    else methods.add(r.sewageMethod1 || "개인하수처리시설");
  });

  // ── 공공하수처리시설이 포함된 경우 ─────────────────────────
  const publicRows = rows.filter(r => r.처리장정보?.name || r.sewageMethod1 === "공공하수처리시설");
  const indivRows  = rows.filter(r => r.sewageMethod1 === "개인하수처리시설");
  const septicRows = rows.filter(r => r.sewageMethod1 === "정화조");

  if (hh?.처리장정보?.name || publicRows.length > 0) {
    const plantName = hh?.처리장정보?.name || publicRows[0]?.처리장정보?.name || "-";
    const efflBOD   = hh?.처리장정보?.efflBOD ?? publicRows[0]?.처리장정보?.efflBOD ?? "-";
    const efflTP    = hh?.처리장정보?.efflTP  ?? publicRows[0]?.처리장정보?.efflTP  ?? "-";

    els.push(H.p(`◦ 발생오수는 ${plantName}으로 유입·처리됩니다.`, { size: H.SZ_S }));
    els.push(H.blank());
    els.push(H.p("[표] 공공하수처리시설 방류부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));

    const pubDischarge = (hh?.방류부하량?.BOD ?? 0) + publicRows.reduce((s, r) => s + (r.방류부하량?.BOD || 0), 0);
    const pubDisTP     = (hh?.방류부하량?.TP  ?? 0) + publicRows.reduce((s, r) => s + (r.방류부하량?.TP  || 0), 0);
    const pubFlowSum   = (hh?.관거이송량 ?? 0) + publicRows.reduce((s, r) => s + (r.오수발생유량 || 0), 0);

    els.push(H.simpleTable(
      ["구분", "관거이송유량(㎥/일)", "방류농도BOD(mg/L)", "방류농도T-P(mg/L)", "방류부하량BOD(kg/일)", "방류부하량T-P(kg/일)"],
      [[plantName, F.f4(pubFlowSum), String(efflBOD), String(efflTP), F.f4(pubDischarge), F.f4(pubDisTP)]],
      [1400, 1600, 1400, 1400, 1600, 1600]
    ));
  }

  // ── 개인하수처리시설 ───────────────────────────────────────
  if ((hh?.개인처리기준) || indivRows.length > 0) {
    const std = hh?.개인처리기준?.std || indivRows[0]?.개인처리기준?.std || { BOD: 20, TP: 4 };

    els.push(H.blank());
    els.push(H.p(`◦ 개인오수처리시설 방류수질기준 : BOD ${std.BOD}mg/L, T-P ${std.TP}mg/L`, { size: H.SZ_S }));

    const indivBOD = (hh?.배출부하량?.BOD ?? 0) + indivRows.reduce((s, r) => s + (r.배출부하량?.BOD || 0), 0);
    const indivTP  = (hh?.배출부하량?.TP  ?? 0) + indivRows.reduce((s, r) => s + (r.배출부하량?.TP  || 0), 0);
    const indivFlow = (hh?.오수발생유량 ?? 0) + indivRows.reduce((s, r) => s + (r.오수발생유량 || 0), 0);

    els.push(H.blank());
    els.push(H.p("[표] 개인오수처리시설 배출부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["구분", "오수발생량(㎥/일)", "방류농도BOD(mg/L)", "방류농도T-P(mg/L)", "배출부하량BOD(kg/일)", "배출부하량T-P(kg/일)"],
      [["개인오수처리시설", F.f4(indivFlow), String(std.BOD), String(std.TP), F.f4(indivBOD), F.f4(indivTP)]],
      [1600, 1600, 1400, 1400, 1600, 1600]
    ));
  }

  // ── 정화조 ─────────────────────────────────────────────────
  if (septicRows.length > 0) {
    const sepBOD  = septicRows.reduce((s, r) => s + (r.배출부하량?.BOD || 0), 0);
    const sepTP   = septicRows.reduce((s, r) => s + (r.배출부하량?.TP  || 0), 0);
    const sepFlow = septicRows.reduce((s, r) => s + (r.오수발생유량 || 0), 0);
    const genBOD  = septicRows.reduce((s, r) => s + (r.발생부하량?.BOD || 0), 0);

    els.push(H.blank());
    els.push(H.p("◦ 정화조 처리 배출부하량 (BOD 25% 개별삭감 적용)", { size: H.SZ_S }));
    els.push(H.blank());
    els.push(H.p("[표] 정화조 배출부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["구분", "오수발생량(㎥/일)", "발생부하량BOD", "개별삭감량BOD", "배출부하량BOD", "배출부하량T-P"],
      [["정화조", F.f4(sepFlow), F.f4(genBOD), F.f4(genBOD * 0.25), F.f4(sepBOD), F.f4(sepTP)]],
      [1200, 1600, 1400, 1400, 1400, 1400]
    ));
  }

  // ── 최종 배출부하량 총괄 ───────────────────────────────────
  const totalDis = lifeSection.합계?.배출부하량;
  if (totalDis) {
    els.push(H.blank());
    els.push(H.p(`[표] 사업시행 ${phase === "before" ? "전" : "후"} 생활계 배출부하량 총괄 (단위: kg/일)`,
      { bold: true, size: H.SZ_S }));
    els.push(H.simpleTable(
      ["구분", "점오염(BOD)", "점오염(T-P)", "비점오염(BOD)", "비점오염(T-P)"],
      [["생활계", F.f4(totalDis.BOD), F.f4(totalDis.TP), "-", "-"]],
      [1800, 1600, 1600, 1600, 1600]
    ));
  }

  return els;
}

// ── 생활계 총괄 ─────────────────────────────────────────────────
function buildLifeSummary(docx, H, before, after) {
  const els = [];
  els.push(H.heading2("2.1.3 생활계 배출부하량 총괄"));

  const bDis = before?.합계?.배출부하량 || { BOD: 0, TP: 0 };
  const aDis = after?.합계?.배출부하량  || { BOD: 0, TP: 0 };
  const dBOD = aDis.BOD - bDis.BOD;
  const dTP  = aDis.TP  - bDis.TP;

  els.push(H.p(
    `◦ 생활계 총 배출부하량은 사업시행 후 BOD ${F.f4(aDis.BOD)}kg/일, T-P ${F.f4(aDis.TP)}kg/일, ` +
    `사업시행 전 BOD ${F.f4(bDis.BOD)}kg/일, T-P ${F.f4(bDis.TP)}kg/일로 산정됩니다.`,
    { size: H.SZ_S }
  ));

  els.push(H.blank());
  els.push(H.simpleTable(
    ["구분", "사업시행 후 ①(kg/일)", "사업시행 전 ②(kg/일)", "최종 배출(①-②)(kg/일)"],
    [
      ["BOD(점오염)", F.f4(aDis.BOD), F.f4(bDis.BOD), F.bodDelta(dBOD)],
      ["T-P(점오염)", F.f4(aDis.TP),  F.f4(bDis.TP),  F.tpDelta(dTP)],
    ],
    [2000, 2000, 2000, 2000]
  ));
  els.push(H.note("주) 최종 배출부하량이 음수인 경우 ≒0.00으로 처리"));
  els.push(H.blank());

  return els;
}

// ══════════════════════════════════════════════════════════════════
//  토지계 부하량 산정
// ══════════════════════════════════════════════════════════════════
function buildLandSection(docx, calcResult, unitBasin) {
  const H = makeDocxHelpers(docx);
  const elements = [];

  elements.push(H.heading1("2.2 토지계"));

  const lBefore = calcResult?.토지계?.사업전;
  const lAfter  = calcResult?.토지계?.사업후;

  // ── 사업시행 전 토지계 ──────────────────────────────────────
  elements.push(H.heading2("2.2.1 사업시행 전"));
  elements.push(H.p(
    "◦ 비점오염원 발생부하량 = 지목별 면적 × 지목별 연평균발생부하원단위",
    { size: H.SZ_S }
  ));

  if (lBefore?.rows?.length) {
    const bRows = lBefore.rows.map(r => [
      r.jmok, F.area(r.area),
      F.f2(r.원단위.BOD), F.f2(r.원단위.TP),
      F.f4(r.발생부하량.BOD), F.f4(r.발생부하량.TP),
    ]);
    bRows.push(["합  계", F.area(lBefore.rows.reduce((s, r) => s + r.area, 0)),
      "", "", F.f4(lBefore.합계.발생부하량.BOD), F.f4(lBefore.합계.발생부하량.TP)]);

    elements.push(H.blank());
    elements.push(H.p("[표] 사업시행 전 토지계 발생 및 배출부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));
    elements.push(H.simpleTable(
      ["지목", "편입면적(㎡)", "BOD원단위(kg/㎢·일)", "T-P원단위(kg/㎢·일)", "발생BOD(kg/일)", "발생T-P(kg/일)"],
      bRows,
      [1200, 1400, 1600, 1600, 1600, 1600]
    ));
  } else {
    elements.push(H.p("◦ 사업시행 전 토지계 발생부하량은 없는 것으로 조사되었습니다."));
  }

  // ── 사업시행 후 토지계 ──────────────────────────────────────
  elements.push(H.heading2("2.2.2 사업시행 후"));

  if (lAfter?.rows?.length) {
    const aRows = lAfter.rows.map(r => [
      r.jmok, F.area(r.area),
      F.f2(r.원단위.BOD), F.f2(r.원단위.TP),
      F.f4(r.발생부하량.BOD), F.f4(r.발생부하량.TP),
    ]);
    aRows.push(["합  계", F.area(lAfter.rows.reduce((s, r) => s + r.area, 0)),
      "", "", F.f4(lAfter.합계.발생부하량.BOD), F.f4(lAfter.합계.발생부하량.TP)]);

    elements.push(H.blank());
    elements.push(H.p("[표] 사업시행 후 토지계 발생 및 배출부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));
    elements.push(H.simpleTable(
      ["지목", "편입면적(㎡)", "BOD원단위(kg/㎢·일)", "T-P원단위(kg/㎢·일)", "발생BOD(kg/일)", "발생T-P(kg/일)"],
      aRows,
      [1200, 1400, 1600, 1600, 1600, 1600]
    ));

    elements.push(H.blank());
    elements.push(H.p("[표] 사업시행 후 토지계 배출부하량 (삭감시설 없음)", { bold: true, size: H.SZ_S }));
    elements.push(H.simpleTable(
      ["구분", "발생부하량BOD(kg/일)", "삭감부하량BOD", "배출부하량BOD(kg/일)", "발생부하량T-P(kg/일)", "배출부하량T-P(kg/일)"],
      [["비점오염",
        F.f4(lAfter.합계.발생부하량.BOD), "-",
        F.f4(lAfter.합계.배출부하량.BOD),
        F.f4(lAfter.합계.발생부하량.TP),
        F.f4(lAfter.합계.배출부하량.TP)]],
      [1200, 1600, 1200, 1600, 1600, 1600]
    ));
  } else {
    elements.push(H.p("◦ 사업시행 후 발생하는 토지계 부하량은 없는 것으로 산정됩니다."));
  }

  // ── 토지계 총괄 ─────────────────────────────────────────────
  elements.push(H.heading2("2.2.3 토지계 배출부하량 총괄"));
  const tbBOD = lBefore?.합계?.배출부하량?.BOD ?? 0;
  const tbTP  = lBefore?.합계?.배출부하량?.TP  ?? 0;
  const taBOD = lAfter?.합계?.배출부하량?.BOD  ?? 0;
  const taTP  = lAfter?.합계?.배출부하량?.TP   ?? 0;
  const dBOD  = taBOD - tbBOD;
  const dTP   = taTP  - tbTP;

  elements.push(H.blank());
  elements.push(H.simpleTable(
    ["구분", "사업전(①)(kg/일)", "사업후(②)(kg/일)", "삭감량(③)(kg/일)", "최종배출(②-①-③)(kg/일)"],
    [
      [`BOD(${unitBasin||"단위유역"}, 비점)`, F.f4(tbBOD), F.f4(taBOD), "-", F.bodDelta(dBOD)],
      [`T-P(${unitBasin||"단위유역"}, 비점)`, F.f4(tbTP),  F.f4(taTP),  "-", F.tpDelta(dTP)],
    ],
    [1800, 1600, 1600, 1400, 1800]
  ));
  elements.push(H.note("주) 증감이 음수인 경우 ≒0.00으로 처리"));
  elements.push(H.blank());

  return elements;
}

// ══════════════════════════════════════════════════════════════════
//  최종 배출부하량
// ══════════════════════════════════════════════════════════════════
function buildFinalSection(docx, calcResult, unitBasin) {
  const H = makeDocxHelpers(docx);
  const elements = [];

  elements.push(H.heading1("2.3 총 배출부하량"));

  const pt  = calcResult?.최종배출부하량?.점오염  || { BOD: 0, TP: 0 };
  const bis = calcResult?.최종배출부하량?.비점오염 || { BOD: 0, TP: 0 };

  elements.push(H.p(
    `◦ 금회 사업으로 인한 점오염원(생활계) 최종 배출부하량은 BOD ${F.bod(pt.BOD)}kg/일, ` +
    `T-P ${F.tp(pt.TP)}kg/일이며, 비점오염원(토지계) 최종 배출부하량은 ` +
    `BOD ${F.bod(bis.BOD)}kg/일, T-P ${F.tp(bis.TP)}kg/일로 산정되었습니다.`,
    { size: H.SZ_S }
  ));

  elements.push(H.blank());
  elements.push(H.p("[표] 최종 배출부하량 (단위: kg/일)", { bold: true, size: H.SZ_S }));

  // 단위유역별 배출
  const byBasin = calcResult?.단위유역별배출 || {};
  const basinRows = [];
  for (const [basin, data] of Object.entries(byBasin)) {
    basinRows.push([
      basin, "점오염",
      F.bod(data.점오염?.BOD ?? 0),
      F.tp(data.점오염?.TP ?? 0),
    ]);
    if (data.비점오염) {
      basinRows.push([
        basin, "비점오염",
        F.bod(data.비점오염?.BOD ?? 0),
        F.tp(data.비점오염?.TP ?? 0),
      ]);
    }
  }

  if (basinRows.length === 0) {
    basinRows.push([
      unitBasin || "-", "점오염",   F.bod(pt.BOD),  F.tp(pt.TP),
    ]);
    basinRows.push([
      unitBasin || "-", "비점오염", F.bod(bis.BOD), F.tp(bis.TP),
    ]);
  }

  elements.push(H.simpleTable(
    ["단위유역", "배출구분", "BOD(kg/일)", "T-P(kg/일)"],
    basinRows,
    [2200, 1800, 1800, 1800]
  ));

  elements.push(H.blank());

  return elements;
}

// ══════════════════════════════════════════════════════════════════
//  저감방안 섹션
// ══════════════════════════════════════════════════════════════════
function buildMitigationSection(docx, data) {
  const H = makeDocxHelpers(docx);
  const isPublicAfter = data.afterMethod1 === "공공하수처리시설";
  const plantName = data.afterPlantName || "[처리장명]";

  return [
    H.heading1("제3장 저감방안"),
    H.heading2("3.1 오수처리계획"),
    H.p(
      isPublicAfter
        ? `◦ 본 사업지구는 하수처리구역 내 지역으로 사업지구 내 발생오수는 전량 ${plantName}으로 유입하여 처리할 계획입니다.`
        : `◦ 본 사업지구는 하수처리구역 외 지역으로 개인오수처리시설(MBR공법)을 설치하여 처리할 계획입니다.`,
      { size: H.SZ_S }
    ),
    H.blank(),
    H.heading2("3.2 비점오염원 처리계획"),
    H.p("◦ 비점오염물질 발생억제 방안", { bold: true, size: H.SZ_S }),
    H.p("  [여기에 직접 입력하세요]", { size: H.SZ_S }),
    H.p("◦ 지표면 오염물질 제거 방안", { bold: true, size: H.SZ_S }),
    H.p("  [여기에 직접 입력하세요]", { size: H.SZ_S }),
    H.p("◦ 부지 내 강우 유출수 및 오염물질 저감 방안", { bold: true, size: H.SZ_S }),
    H.p("  [여기에 직접 입력하세요]", { size: H.SZ_S }),
    H.blank(),
    H.heading2("3.3 폐수처리계획"),
    H.p("◦ 해당사항 없음.", { size: H.SZ_S }),
    H.blank(),
  ];
}

// ══════════════════════════════════════════════════════════════════
//  부록 섹션
// ══════════════════════════════════════════════════════════════════
function buildAppendixSection(docx) {
  const H = makeDocxHelpers(docx);
  return [
    H.heading1("제4장 부록"),
    H.p("[토지·임야대장 첨부]", { size: H.SZ_S }),
    H.blank(),
    H.p("[건축물대장 첨부]", { size: H.SZ_S }),
    H.blank(),
    H.p("[건축평면도 첨부]", { size: H.SZ_S }),
    H.blank(),
  ];
}

// ══════════════════════════════════════════════════════════════════
//  진입점 — generateDoc
// ══════════════════════════════════════════════════════════════════
function generateDoc(calcResult) {
  // 마지막 계산 결과 사용
  if (!calcResult) {
    calcResult = window.LAST_CALC_RESULT;
    if (!calcResult && typeof runCalc === "function") {
      calcResult = runCalc();
    }
  }

  try {
    // docx UMD 는 window.docx 또는 전역 docx 로 노출됨
    const _docx = (typeof docx !== "undefined") ? docx : window.docx;
    if (!_docx) throw new Error("docx 라이브러리가 로드되지 않았습니다. (unpkg CDN 확인)");
    const { Document, Packer, SectionType } = _docx;

    // ── UI 값 수집 ─────────────────────────────────────────────
    const projectName    = getVal("projectName", "");
    const sigun          = getVal("sigunSelect", "");
    const sido           = getVal("sidoSelect", "");
    const locationDetail = getVal("projectLocationDetail", "");
    const projectLocation = [sido, sigun, locationDetail].filter(Boolean).join(" ");

    const year     = getVal("yearSelect", "");
    const month    = getVal("monthSelect", "");
    const 작성일자 = (year && month) ? `${year}. ${month}.` : "";

    const startYear    = getVal("startYearSelect", "");
    const completeYear = getVal("completeYearSelect", "");
    const bizPeriodText = (startYear && completeYear)
      ? `${startYear}년 ~ ${completeYear}년` : "";

    const ownerName  = getVal("ownerName", "");
    const zoneMain   = getVal("zoneMainSelect", "");
    const zoneSub    = getVal("zoneSubSelect", "");
    const zoneText   = zoneSub ? `${zoneMain} / ${zoneSub}` : zoneMain;
    const bizType    = getVal("bizTypeSelect", "");

    const areaTotalSite  = formatNumberWithComma(getVal("areaTotalSite",  ""));
    const areaBuildSite  = formatNumberWithComma(getVal("areaBuildSite",  ""));
    const areaRoadSite   = formatNumberWithComma(getVal("areaRoadSite",   ""));
    const areaGrossFloor = formatNumberWithComma(getVal("areaGrossFloor", ""));
    const roadLength     = formatNumberWithComma(getVal("roadLength", ""));
    const roadWidth      = formatNumberWithComma(getVal("roadWidth",  ""));

    const envRiver       = document.querySelector('input[name="env_river"]:checked')?.value === "해당";
    const envWaterSource = document.querySelector('input[name="env_water"]:checked')?.value === "해당";
    const envSpecial     = document.querySelector('input[name="env_special"]:checked')?.value || "none";

    const bizHistory   = getVal("bizHistory", "");
    const writerName   = getVal("writerName", "");
    const writerContact = getVal("writerContact", "");
    const unitBasin    = getVal("unitBasinSelect", "");

    // 사업후 처리방식 정보 추출
    const afterState = window.lifeAfter?.state;
    const afterBldg  = afterState?.buildings?.[0];
    const afterMethod1  = afterBldg?.method1  || afterState?.householdMethod1 || "개인하수처리시설";
    const afterMethod2  = afterBldg?.method2  || afterState?.householdMethod2 || "";
    const afterPlantInfo = (typeof SEWAGE_PLANT_DB !== "undefined" && afterMethod2)
      ? SEWAGE_PLANT_DB.find(p => p.name === afterMethod2) : null;

    const data = {
      projectName, projectLocation, 작성일자, bizPeriodText,
      ownerName, zoneText, bizType, completeYear, startYear,
      areaTotalSite, areaBuildSite, areaRoadSite, areaGrossFloor,
      roadLength, roadWidth,
      envRiver, envWaterSource, envSpecial,
      bizHistory, writerName, writerContact, unitBasin,
      afterMethod1,
      afterPlantName:  afterPlantInfo?.name || afterMethod2 || "",
      afterEfflBOD:    afterPlantInfo?.efflBOD ?? null,
      afterEfflTP:     afterPlantInfo?.efflTP  ?? null,
      afterCapacity:   afterPlantInfo?.capacity ?? "",
      afterProcessMethod: "MBR공법",
      techCertNo: "[기술검증번호]",
      calcResult,
    };

    // ── 섹션 조립 ──────────────────────────────────────────────
    const coverSection = buildCoverSection(_docx, data);

    const bodyChildren = [
      ...buildChongGwalBlock(_docx, data),
      ...buildJeogamBlock(_docx, data),
      ...buildLifeSection(_docx, calcResult, envRiver),
      ...buildLandSection(_docx, calcResult, unitBasin),
      ...buildFinalSection(_docx, calcResult, unitBasin),
      ...buildMitigationSection(_docx, data),
      ...buildAppendixSection(_docx),
    ];

    const bodySection = {
      properties: {
        page: { margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM,
                          left: MARGIN_LEFT, right: MARGIN_RIGHT } }
      },
      children: bodyChildren,
    };

    const doc = new Document({ sections: [coverSection, bodySection] });

    Packer.toBlob(doc).then(blob => {
      saveAs(blob, (typeof CONFIG !== "undefined" ? CONFIG.DOCX_FILENAME : "수질오염총량검토서.docx"));
    });

  } catch (err) {
    console.error("[word-gen.js]", err);
    alert("Word 생성 중 오류가 발생했습니다.\n\n" + (err?.message || err));
  }
}

window.generateDoc = generateDoc;
