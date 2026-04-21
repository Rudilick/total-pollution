// ================================================================
// word-gen.js  v9
// 수정사항:
//   1. 표지 다음 목차 페이지 앞 공백 제거
//   2. 사업개요 표 - 입력값 셀 가운데 정렬
//   3. 사업의 종류 - 적절한 위치에서 줄바꿈
//   4. 평가대행자 → 총량검토서 작성자
//   5. 저감계획 표 - 샘플 참고하여 개선 (비점오염: 적용면적/처리용량/삭감량 구조)
//   6. 토지계 word-gen 반영 (기존 유지, landState window 노출로 해결)
//   7. 표마다 제목 추가, 하수처리시설 관거비 표 명칭 개선
//   8. 영업인구 표 - 공용면적 있으면 연면적/배분면적 열 분리
//   9. 기술지침 분뇨발생비/잡배수비 원단위 표 추가
// ================================================================

var A4_HEIGHT_TWIP=16833,MARGIN_TOP=1100,MARGIN_BOTTOM=1100,MARGIN_LEFT=1000,MARGIN_RIGHT=1000;
var USABLE_HEIGHT_TWIP=A4_HEIGHT_TWIP-MARGIN_TOP-MARGIN_BOTTOM;

var F={
  f2:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(2):"-";},
  f3:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(3):"-";},
  f4:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(4):"-";},
  f7:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(7):"-";},
  bod:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(2):"0.00";},
  tp:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(3):"0.000";},
  finalBod:function(v){if(typeof v!=="number"||!isFinite(v))return"0.00";return v<0.02?"0.00":v.toFixed(2);},
  finalTp:function(v){if(typeof v!=="number"||!isFinite(v))return"0.000";return v<0.002?"0.000":v.toFixed(3);},
  bodDelta:function(v){if(typeof v!=="number"||!isFinite(v))return"0.00";return v<=0.005?(v.toFixed(2)+"(≒0.00)"):v.toFixed(2);},
  tpDelta:function(v){if(typeof v!=="number"||!isFinite(v))return"0.000";return v<=0.0005?(v.toFixed(3)+"(≒0.000)"):v.toFixed(3);},
  area:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(2):"-";}
};

function getVal(id,fb){
  if(fb===undefined)fb="";
  var el=document.getElementById(id);
  return el?(el.value!=null?el.value:fb):fb;
}

// 소분류가 "있음"/"없음"으로 끝나는 조건 선택형 여부 판별
function _isConditionMinor(minor){
  if(!minor)return false;
  var t=minor.trim();
  return t.endsWith("있음")||t.endsWith("없음");
}
function useLabel(r){
  // 엑셀 열11(buildingUse) 우선
  if(typeof LIFE_FACTOR_MAP!=="undefined"){
    var _key=(r.major||"")+"|"+(r.mid||"")+"|"+(r.minor||"");
    var _f=LIFE_FACTOR_MAP[_key];
    if(_f&&_f.buildingUse)return _f.buildingUse;
  }
  // 조건형 소분류(있음/없음): 중분류를 용도로 표시
  if(r.minor&&_isConditionMinor(r.minor))return r.mid||r.major||"";
  if(r.minor)return r.minor;
  if(r.mid)return r.mid;
  return r.major||"";
}
function useBuildingNote(r){
  // 엑셀 열12(buildingNote) 우선
  if(typeof LIFE_FACTOR_MAP!=="undefined"){
    var _key=(r.major||"")+"|"+(r.mid||"")+"|"+(r.minor||"");
    var _f=LIFE_FACTOR_MAP[_key];
    if(_f&&_f.buildingNote)return _f.buildingNote;
  }
  // 조건형 소분류: 소분류 자체를 비고로
  if(r.minor&&_isConditionMinor(r.minor))return r.minor;
  return "";
}

// ── 사업의 종류 줄바꿈 ──────────────────────────────────────
// 각 bizType 항목별로 적절한 어절에서 줄바꿈 위치를 하드코딩
var BIZ_TYPE_WRAP={
  "「국토의 계획 및 이용에 관한 법률」제30조에 따른 관계기관 협의사업":
    "「국토의 계획 및 이용에 관한 법률」제30조에 따른\n관계기관 협의사업",
  "「농어촌정비법」에 따른 농어촌생활환경정비사업":
    "「농어촌정비법」에 따른\n농어촌생활환경정비사업",
  "「건축법」제2조에 따른 공동주택을 30세대 이상 건축하는 사업":
    "「건축법」제2조에 따른\n공동주택을 30세대 이상 건축하는 사업",
  "　30세대 이상의 주택과 주택외의 시설물을 동일건축물로 건축하는 사업":
    "　30세대 이상의 주택과 주택외의 시설물을\n동일건축물로 건축하는 사업",
  "「수도권정비계획법 시행령」제3조제4호 업무용·판매용·복합 건축물을 건축하는 사업":
    "「수도권정비계획법 시행령」제3조제4호\n업무용·판매용·복합 건축물을 건축하는 사업",
  "「환경영향평가법」제2조제4호에 따른 환경영향평가 등의 대상사업":
    "「환경영향평가법」제2조제4호에 따른\n환경영향평가 등의 대상사업",
  "　특대유역에서 「하수도법」제2조제1호에 따른 하수를 배출하는 건축물 설치 사업":
    "　특대유역에서 「하수도법」제2조제1호에 따른\n하수를 배출하는 건축물 설치 사업",
};
function wrapBizType(t){return BIZ_TYPE_WRAP[t]||t;}

// 표지 줄바꿈
var COVER_MAX_PX=660;
var FONT_PTS=[20,18,16,14,12];
function ptToPx(pt){return pt*(96/72);}
function measureW(t,pt){
  if(!measureW._c)measureW._c=document.createElement("canvas");
  var ctx=measureW._c.getContext("2d");
  ctx.font=ptToPx(pt)+'px "맑은 고딕"';
  return ctx.measureText(t).width;
}
function smartWrap(text){
  var t=(text||"").trim().replace(/\s+/g," ")||"{사업명}";
  for(var pi=0;pi<FONT_PTS.length;pi++){
    var pt=FONT_PTS[pi];
    if(measureW(t,pt)<=COVER_MAX_PX)return{line1:t,line2:"",fontPt:pt};
    var tok=t.split(" ");
    var best=null;
    for(var i=1;i<tok.length;i++){
      var l1=tok.slice(0,i).join(" "),l2=tok.slice(i).join(" ");
      if(measureW(l1,pt)<=COVER_MAX_PX&&measureW(l2,pt)<=COVER_MAX_PX){
        var sc=Math.abs(measureW(l1,pt)-measureW(l2,pt));
        if(!best||sc<best.score)best={line1:l1,line2:l2,fontPt:pt,score:sc};
      }
    }
    if(best)return best;
  }
  return{line1:t,line2:"",fontPt:FONT_PTS[FONT_PTS.length-1]};
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────
function makeH(docx){
  var Paragraph=docx.Paragraph,TextRun=docx.TextRun,Table=docx.Table;
  var TableRow=docx.TableRow,TableCell=docx.TableCell;
  var AlignmentType=docx.AlignmentType,BorderStyle=docx.BorderStyle;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;

  var FONT="맑은 고딕";
  var SZ=21,SZ_TBL=16,SZ_HDR=16,SZ_SM=18,SZ_H1=26,SZ_H2=24,SZ_H3=22,SZ_H4=21;
  var SP_H1={before:280,after:120,line:276,lineRule:"auto"};
  var SP_H2={before:200,after:100,line:276,lineRule:"auto"};
  var SP_H3={before:160,after:80,line:276,lineRule:"auto"};
  var SP_H4={before:120,after:60,line:276,lineRule:"auto"};
  var SP_TBL={before:0,after:0,line:276,lineRule:"auto"};
  var SP_AFT={before:0,after:120};
  var BT={style:BorderStyle.SINGLE,size:12,color:"000000"};
  var BN={style:BorderStyle.SINGLE,size:4,color:"000000"};
  var BO={style:BorderStyle.NONE,size:0,color:"FFFFFF"};
  var TBLB={top:BT,bottom:BT,left:BT,right:BT,insideHorizontal:BN,insideVertical:BN};
  var CELLB={top:BN,bottom:BN,left:BN,right:BN};

  function p(text,opts){
    text=text||"";opts=opts||{};
    var center=opts.center||false,right=opts.right||false,bold=opts.bold||false;
    var size=opts.size!=null?opts.size:SZ_TBL;
    var spacing=opts.spacing||SP_TBL;
    var color=opts.color;
    var vanish=opts.vanish||false;
    var parts=String(text).split("\n");
    var runs=[];
    for(var i=0;i<parts.length;i++){
      if(i>0)runs.push(new TextRun({text:"",break:1,font:FONT,bold:bold,size:size,color:color,vanish:vanish}));
      runs.push(new TextRun({text:parts[i],font:FONT,bold:bold,size:size,color:color,vanish:vanish}));
    }
    var al=center?AlignmentType.CENTER:(right?AlignmentType.RIGHT:AlignmentType.LEFT);
    return new Paragraph({alignment:al,spacing:spacing,children:runs});
  }

  function pageBreak(){
    // PageBreak 문자를 이전 페이지 끝에 삽입 → 새 페이지 첫줄에 아무 흔적 없음
    if(docx.PageBreak){
      return new Paragraph({spacing:{before:0,after:0},children:[new docx.PageBreak()]});
    }
    // fallback
    return new Paragraph({pageBreakBefore:true,spacing:{before:0,after:0},children:[new TextRun({text:" ",size:2,color:"FFFFFF"})]});
  }

  function tc(ch,opts){
    opts=opts||{};
    return new TableCell({
      children:Array.isArray(ch)?ch:[ch],
      columnSpan:opts.cs||1,rowSpan:opts.rs||1,
      width:opts.wPct?{size:opts.wPct,type:WidthType.PERCENTAGE}:(opts.w?{size:opts.w,type:WidthType.DXA}:undefined),
      borders:opts.borders||CELLB,
      verticalAlign:opts.vAlign||VerticalAlign.CENTER
    });
  }

  var PAGE_W=9638;
  function simpleTable(headers,rows,colRatios){
    var total=colRatios.reduce(function(a,b){return a+b;},0);
    var colWidths;
    if(total<=100){
      colWidths=colRatios.map(function(r){return Math.round(PAGE_W*r/100);});
    } else {
      var scale=PAGE_W/total;
      colWidths=colRatios.map(function(r){return Math.round(r*scale);});
    }
    // 반올림 오차 보정: 마지막 셀 너비를 나머지 값으로 맞춤
    var sumW=colWidths.reduce(function(a,b){return a+b;},0);
    if(sumW!==PAGE_W)colWidths[colWidths.length-1]+=PAGE_W-sumW;
    var hdrCells=headers.map(function(h,i){
      return tc(p(String(h),{center:true,bold:true,size:SZ_HDR}),{w:colWidths[i]});
    });
    var hdrRow=new TableRow({tableHeader:true,children:hdrCells});
    var dataRows=rows.map(function(row){
      var cells=row.map(function(cell,i){
        return tc(p(String(cell!=null?cell:""),{center:true,size:SZ_TBL}),{w:colWidths[i]});
      });
      return new TableRow({children:cells});
    });
    return new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:TBLB,rows:[hdrRow].concat(dataRows)});
  }

  // 표 제목 단락
  function tableTitle(t){
    return new Paragraph({
      spacing:{before:160,after:40},
      children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_SM})]
    });
  }

  // TOC 목차행
  function tocRow(label,pageNum,indent){
    indent=indent||0;
    var indentStr="";
    for(var i=0;i<indent;i++)indentStr+="  ";
    var labelText=indentStr+label;
    return new Paragraph({
      spacing:{before:60,after:60,line:276,lineRule:"auto"},
      tabStops:[{type:"right",position:8600,leader:"dot"}],
      children:[
        new TextRun({text:labelText,font:FONT,size:SZ_TBL}),
        new TextRun({text:"\t"+pageNum,font:FONT,size:SZ_TBL})
      ]
    });
  }

  // 장 제목용: 흰색 1pt로 완전히 보이지 않지만 TOC에 Heading1으로 등록됨
  function chapterTitle(t){return new Paragraph({style:"Heading1",spacing:{before:0,after:0},children:[new TextRun({text:t,font:FONT,bold:true,size:2,color:"FFFFFF"})]});}
  // 기존 heading들은 한 레벨씩 내려 Heading2~4 스타일 사용 (TOC 범위 1-2에서 가나다/(1)(2)(3) 제외됨)
  function heading1(t){return new Paragraph({style:"Heading2",spacing:SP_H1,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H1})]});}
  function heading2(t){return new Paragraph({style:"Heading3",spacing:SP_H2,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H2})]});}
  function heading3(t){return new Paragraph({style:"Heading4",spacing:SP_H3,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H3})]});}
  function heading4(t){return new Paragraph({style:"Heading4",spacing:SP_H4,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H4})]});}
  function note(t){return new Paragraph({spacing:{before:40,after:40},children:[new TextRun({text:String(t),font:FONT,size:SZ_SM})]});}
  function blank(){return new Paragraph({spacing:SP_AFT,children:[]});}

  // 장 타이틀 박스
  function chapterBox(title){
    var box=new Table({
      width:{size:30,type:WidthType.PERCENTAGE},
      borders:{top:BN,bottom:BN,left:BN,right:BN,insideHorizontal:BN,insideVertical:BN},
      rows:[new TableRow({children:[new TableCell({
        borders:{top:BN,bottom:BN,left:BN,right:BN},
        shading:{type:"clear",color:"auto",fill:"EDEDED"},
        children:[new Paragraph({alignment:AlignmentType.CENTER,
          children:[new TextRun({text:title,font:FONT,bold:true,size:28})]})]
      })]})]
    });
    var line=new Paragraph({
      border:{bottom:{style:BorderStyle.SINGLE,size:6,color:"000000"}},
      spacing:{before:80,after:160},children:[]
    });
    return [chapterTitle(title),box,line];
  }

  function inputBox(hint){
    return new Table({
      width:{size:100,type:WidthType.PERCENTAGE},
      borders:{top:BN,bottom:BN,left:BN,right:BN,insideHorizontal:BO,insideVertical:BO},
      rows:[new TableRow({height:{value:1800},children:[new TableCell({
        borders:{top:BN,bottom:BN,left:BN,right:BN},
        shading:{type:"clear",color:"auto",fill:"F5F5F5"},
        children:[new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:200,after:200},
          children:[new TextRun({text:hint||"[ 여기에 직접 입력하세요 ]",font:FONT,size:SZ_SM,color:"888888",italics:true})]})]
      })]})]
    });
  }

  function imagePlaceholder(label,heightVal){
    return new Table({
      width:{size:100,type:WidthType.PERCENTAGE},
      borders:{top:BT,bottom:BT,left:BT,right:BT,insideHorizontal:BO,insideVertical:BO},
      rows:[new TableRow({height:{value:heightVal||5000},children:[new TableCell({
        borders:{top:BT,bottom:BT,left:BT,right:BT},
        shading:{type:"clear",color:"auto",fill:"F0F0F0"},
        children:[new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:300,after:300},
          children:[new TextRun({text:label||"[ 이미지를 삽입하세요 ]",font:FONT,size:SZ_SM,color:"888888",italics:true})]})]
      })]})]
    });
  }

  // 숨김 텍스트 안내 (인쇄 시 안 보임)
  function hiddenNote(t){
    return new Paragraph({
      spacing:{before:60,after:60},
      children:[new TextRun({
        text:t,font:FONT,size:SZ_SM,
        color:"FF0000",bold:true,vanish:true
      })]
    });
  }

  return{
    p:p,pageBreak:pageBreak,tc:tc,simpleTable:simpleTable,tableTitle:tableTitle,tocRow:tocRow,
    chapterTitle:chapterTitle,heading1:heading1,heading2:heading2,heading3:heading3,heading4:heading4,
    note:note,blank:blank,chapterBox:chapterBox,inputBox:inputBox,imagePlaceholder:imagePlaceholder,
    hiddenNote:hiddenNote,
    FONT:FONT,SZ:SZ,SZ_TBL:SZ_TBL,SZ_HDR:SZ_HDR,SZ_SM:SZ_SM,
    SZ_H1:SZ_H1,SZ_H2:SZ_H2,SZ_H3:SZ_H3,SZ_H4:SZ_H4,
    BT:BT,BN:BN,BO:BO,TBLB:TBLB,CELLB:CELLB,
    SP_TBL:SP_TBL,PAGE_W:PAGE_W,
    Paragraph:Paragraph,TextRun:TextRun,Table:Table,
    TableRow:TableRow,TableCell:TableCell,
    AlignmentType:AlignmentType,BorderStyle:BorderStyle,
    WidthType:WidthType,VerticalAlign:VerticalAlign
  };
}

// ── 표지 ─────────────────────────────────────────────────────────
function buildCoverSection(docx,data){
  var Paragraph=docx.Paragraph,TextRun=docx.TextRun,Table=docx.Table;
  var TableRow=docx.TableRow,TableCell=docx.TableCell;
  var AlignmentType=docx.AlignmentType,UnderlineType=docx.UnderlineType;
  var WidthType=docx.WidthType,BorderStyle=docx.BorderStyle;
  var VerticalAlign=docx.VerticalAlign,SectionType=docx.SectionType;
  var NOB={
    top:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},bottom:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    left:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},right:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    insideHorizontal:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},insideVertical:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}
  };
  function bc(ch){return new TableCell({borders:NOB,children:ch});}
  var w=smartWrap(data.projectName);
  var nameRuns=[new TextRun({text:w.line1,font:"맑은 고딕",bold:true,size:w.fontPt*2})];
  if(w.line2)nameRuns.push(new TextRun({text:w.line2,break:1,font:"맑은 고딕",bold:true,size:w.fontPt*2}));
  var row7H=Math.max(800,USABLE_HEIGHT_TWIP-(600+1843+3984+3701+1266)-300);
  var coverTable=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},borders:NOB,
    rows:[
      new TableRow({height:{value:600},children:[bc([new Paragraph("")])]}),
      new TableRow({height:{value:1843},children:[new TableCell({
        borders:NOB,verticalAlign:VerticalAlign.BOTTOM,
        children:[new Paragraph({alignment:AlignmentType.CENTER,children:nameRuns})]
      })]}),
      new TableRow({children:[bc([new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({text:"수질오염총량검토서",font:"맑은 고딕",bold:true,size:96,underline:{type:UnderlineType.DOUBLE}})]
      })])]}),
      new TableRow({height:{value:3984},children:[bc([new Paragraph("")])]}),
      new TableRow({height:{value:3701},children:[bc([new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({text:data.작성일자||"",font:"맑은 고딕",bold:true,size:40})]
      })])]}),
      new TableRow({children:[bc([new Paragraph("")])]}),
      new TableRow({height:{value:1266},children:[bc([new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({text:data.ownerName||"",font:"맑은 고딕",bold:true,size:40})]
      })])]}),
      new TableRow({height:{value:row7H},children:[bc([new Paragraph("")])]})
    ]
  });
  return{
    properties:{type:SectionType.NEXT_PAGE,page:{margin:{top:MARGIN_TOP,bottom:MARGIN_BOTTOM,left:MARGIN_LEFT,right:MARGIN_RIGHT}}},
    children:[coverTable]
  };
}

// ── 목차 (Word TOC 필드) ─────────────────────────────────────────
function buildTocBlock(docx){
  var H=makeH(docx);
  var Paragraph=docx.Paragraph,TextRun=docx.TextRun,BorderStyle=docx.BorderStyle;
  var els=[];

  // ★ 수정1: 목차 앞 빈 단락 제거 (표지→목차 사이 공백 없애기)
  els.push(new Paragraph({
    alignment:"center",
    spacing:{before:0,after:300},
    children:[new TextRun({text:"목  차",font:"맑은 고딕",bold:true,size:32})]
  }));
  els.push(new Paragraph({
    border:{bottom:{style:BorderStyle.SINGLE,size:6,color:"000000"}},
    spacing:{before:0,after:200},children:[]
  }));

  // 숨김 텍스트 안내 (인쇄 시 안 보임)
  els.push(H.hiddenNote("※ 목차 페이지 번호 업데이트: Ctrl+A → F9 (인쇄/PDF 출력 전 실행하세요. 이 안내문은 인쇄 시 보이지 않습니다)"));

  if(typeof docx.TableOfContents==="function"){
    try{
      els.push(new docx.TableOfContents("목  차",{headingStyleRange:"1-2",hyperlink:true}));
      return els;
    }catch(e){}
  }
  if(typeof docx.SimpleField==="function"){
    try{
      els.push(new Paragraph({spacing:{before:0,after:0},children:[new docx.SimpleField(' TOC \\o "1-2" \\h \\z \\u ')]}));
      return els;
    }catch(e){}
  }
  els.push(H.p("[ 목차 — Word에서 Ctrl+A → F9를 누르면 페이지 번호가 채워집니다 ]",{size:H.SZ_SM,color:"888888"}));
  return els;
}

// ── 제1장: 총괄 ──────────────────────────────────────────────────
function buildChapter1(docx,data){
  var H=makeH(docx);
  var Table=docx.Table,TableRow=docx.TableRow,TableCell=docx.TableCell;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;
  var AlignmentType=docx.AlignmentType,BorderStyle=docx.BorderStyle;

  var nb=H.BN,non=H.BO;
  function cb(ov){ov=ov||{};return{top:ov.top||nb,bottom:ov.bottom||nb,left:ov.left||nb,right:ov.right||nb};}
  function cell(ch,o){
    o=o||{};
    return new TableCell({
      children:Array.isArray(ch)?ch:[ch],
      borders:o.borders||cb(),columnSpan:o.cs||1,rowSpan:o.rs||1,
      width:o.wPct?{size:o.wPct,type:WidthType.PERCENTAGE}:undefined,
      verticalAlign:o.vAlign||VerticalAlign.CENTER,shading:o.shading||undefined
    });
  }
  // ★ 수정2: 입력값 셀도 가운데 정렬
  function pp(t,o){o=o||{};return H.p(t,{center:o.center!==undefined?o.center:true,right:o.right||false,bold:o.bold||false,size:o.size||H.SZ_TBL});}

  var ROW_H=500;
  var W1=12,W2=22,RIGHT=66,U=11,THIRD=2*U,HALF=3*U;
  var er=data.envRiver,ew=data.envWaterSource,es=data.envSpecial;
  var riverL=er?"■ 해당":"□ 해당",riverR=er?"□ 해당 없음":"■ 해당 없음";
  var waterL=ew?"■ 해당":"□ 해당",waterR=ew?"□ 해당 없음":"■ 해당 없음";
  var spL,spR;
  if(es==="1권역"){spL="■ 해당 (1권역)";spR="□ 해당 없음";}
  else if(es==="2권역"){spL="■ 해당 (2권역)";spR="□ 해당 없음";}
  else{spL="□ 해당 (1·2권역)";spR="■ 해당 없음";}

  var cr=data.calcResult;
  var fBOD=cr&&cr.최종배출부하량&&cr.최종배출부하량.점오염?cr.최종배출부하량.점오염.BOD:0;
  var fTP=cr&&cr.최종배출부하량&&cr.최종배출부하량.점오염?cr.최종배출부하량.점오염.TP:0;
  var bBOD=cr&&cr.최종배출부하량&&cr.최종배출부하량.비점오염?cr.최종배출부하량.비점오염.BOD:0;
  var bTP=cr&&cr.최종배출부하량&&cr.최종배출부하량.비점오염?cr.최종배출부하량.비점오염.TP:0;
  var ub=cr&&cr.params?cr.params.unitBasin||"-":"-";
  var cy=data.completeYear||"-";

  // ★ 수정3: 사업의 종류 줄바꿈 적용
  var bizTypeWrapped=wrapBizType(data.bizType||"");

  var mainTable=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},borders:H.TBLB,
    rows:[
      new TableRow({height:{value:ROW_H},children:[cell(pp("사 업 명"),{cs:2,wPct:W1+W2}),cell(pp(data.projectName||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("소 재 지"),{cs:2,wPct:W1+W2}),cell(pp(data.projectLocation||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("사업기간(준공예정년도)"),{cs:2,wPct:W1+W2}),cell(pp(data.bizPeriodText||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("사 업 시 행 자"),{cs:2,wPct:W1+W2}),cell(pp(data.ownerName||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("용 도 지 역"),{cs:2,wPct:W1+W2}),cell(pp(data.zoneText||""),{cs:6,wPct:RIGHT})]}),
      // ★ 수정3: 사업의 종류 - 줄바꿈 적용
      new TableRow({height:{value:ROW_H*2},children:[cell(pp("사 업 의 종 류"),{cs:2,wPct:W1+W2}),cell(pp(bizTypeWrapped),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("면 적"),{rs:6,wPct:W1}),
        cell(pp("부지면적"),{rs:3,wPct:W2}),
        cell(pp("전체부지"),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaTotalSite||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("건축부지"),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaBuildSite||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("도로부지"),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaRoadSite||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("건축연면적"),{wPct:W2}),
        cell(pp("",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaGrossFloor||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("도 로"),{rs:2,wPct:W2}),
        cell(pp("노선길이"),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.roadLength||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("m"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("폭"),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.roadWidth||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("m"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("환경현황"),{rs:3,wPct:W1}),
        cell(pp("수변구역"),{wPct:W2}),
        cell(pp(riverL),{cs:3,wPct:HALF,borders:cb({right:non})}),
        cell(pp(riverR),{cs:3,wPct:HALF,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("상수원보호구역"),{wPct:W2}),
        cell(pp(waterL),{cs:3,wPct:HALF,borders:cb({right:non})}),
        cell(pp(waterR),{cs:3,wPct:HALF,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("특별대책지역"),{wPct:W2}),
        cell(pp(spL),{cs:3,wPct:HALF,borders:cb({right:non})}),
        cell(pp(spR),{cs:3,wPct:HALF,borders:cb({left:non})})
      ]}),
      // ★ 수정4: 평가대행자 → 총량검토서 작성자
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("총량검토서 작성자"),{cs:2,wPct:W1+W2}),
        cell(pp((data.writerName||"")+"  (☎ "+(data.writerContact||"")+")"),{cs:6,wPct:RIGHT})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("사 업 의 추 진 경 위"),{cs:2,wPct:W1+W2}),
        cell(pp(data.bizHistory||"[여기에 직접 입력하세요]"),{cs:6,wPct:RIGHT})
      ]})
    ]
  });

  // 할당부하량 표
  var CW=[14,16,13,14,14,14,15];
  var PAGE_W=9638;
  var cwDxa=CW.map(function(r){return Math.round(PAGE_W*r/100);});
  function tc2(ch,o){
    o=o||{};
    return new TableCell({
      children:Array.isArray(ch)?ch:[ch],
      columnSpan:o.cs||1,rowSpan:o.rs||1,
      width:o.w?{size:o.w,type:WidthType.DXA}:undefined,
      borders:o.borders||H.CELLB,
      verticalAlign:o.vAlign||VerticalAlign.CENTER
    });
  }
  function ap(t,bold){return H.p(String(t),{center:true,bold:!!bold,size:H.SZ_TBL});}
  var allotTable=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},borders:H.TBLB,
    rows:[
      new TableRow({tableHeader:true,children:[
        tc2(ap("구 분",true),{rs:2,w:cwDxa[0]}),tc2(ap("단위유역",true),{rs:2,w:cwDxa[1]}),
        tc2(ap("준공년도",true),{rs:2,w:cwDxa[2]}),
        tc2(ap("BOD",true),{cs:2,w:cwDxa[3]+cwDxa[4]}),tc2(ap("T-P",true),{cs:2,w:cwDxa[5]+cwDxa[6]})
      ]}),
      new TableRow({tableHeader:true,children:[
        tc2(ap("점",true),{w:cwDxa[3]}),tc2(ap("비점",true),{w:cwDxa[4]}),
        tc2(ap("점",true),{w:cwDxa[5]}),tc2(ap("비점",true),{w:cwDxa[6]})
      ]}),
      new TableRow({children:[
        tc2(ap("합  계"),{w:cwDxa[0]}),tc2(ap(ub),{w:cwDxa[1]}),tc2(ap(cy),{w:cwDxa[2]}),
        tc2(ap(F.finalBod(fBOD)),{w:cwDxa[3]}),tc2(ap(F.finalBod(bBOD)),{w:cwDxa[4]}),
        tc2(ap(F.finalTp(fTP)),{w:cwDxa[5]}),tc2(ap(F.finalTp(bTP)),{w:cwDxa[6]})
      ]})
    ]
  });

  // ── 저감계획 표 (v7 원본 그대로) ─────────────────────────────
  var Table2=docx.Table,TableRow2=docx.TableRow,TableCell2=docx.TableCell;
  var nb2=H.BN,non2=H.BO;
  function cb2(ov){ov=ov||{};return{top:ov.top||nb2,bottom:ov.bottom||nb2,left:ov.left||nb2,right:ov.right||nb2};}
  function cell2(ch,o){
    o=o||{};
    return new TableCell2({
      children:Array.isArray(ch)?ch:[ch],
      borders:o.borders||cb2(),columnSpan:o.cs||1,rowSpan:o.rs||1,
      width:o.wPct?{size:o.wPct,type:WidthType.PERCENTAGE}:undefined,
      verticalAlign:o.vAlign||VerticalAlign.CENTER
    });
  }
  function p2(t,ctr,bold){return H.p(t||"",{center:!!ctr,bold:!!bold,size:H.SZ_TBL});}
  var iP=data.afterMethod1==="공공하수처리시설";
  var mPub=iP?"■":"□",mPrv=iP?"□":"■";
  var pn2=data.afterPlantName||"";
  var eBOD=data.afterEfflBOD!=null?String(data.afterEfflBOD):"20";
  var eTP=data.afterEfflTP!=null?String(data.afterEfflTP):"4";
  var cap=data.afterCapacity||"";
  var capVal=cap?cap:"-";
  var ROW=400;
  var jeogamTable=new Table2({
    width:{size:100,type:WidthType.PERCENTAGE},borders:H.TBLB,
    rows:[
      new TableRow2({height:{value:ROW},children:[cell2(p2("오수처리계획",true),{rs:15,wPct:15}),cell2(p2(mPub+" 공공",true),{rs:4,wPct:17}),cell2(p2("처리시설명",true),{cs:2,wPct:30}),cell2(p2(iP?pn2:"",true),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설용량",true),{cs:2,wPct:30}),cell2(p2(iP?capVal:"",true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("㎥/d"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("방류기준",true),{rs:2,wPct:15}),cell2(p2("BOD",true),{wPct:15}),cell2(p2(iP?String(eBOD):"",true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("T-P",true),{wPct:15}),cell2(p2(iP?"-":"",true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2(mPrv+" 개별",true),{rs:11,wPct:17}),cell2(p2("1",true),{rs:3,wPct:9}),cell2(p2("처리공법",true),{wPct:21}),cell2(p2(iP?"":(data.afterProcessMethod||"FRP 호기성생물학적방법"),true),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설용량",true),{wPct:21}),cell2(p2(iP?"":capVal,true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("㎥/d"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설개소수",true),{wPct:21}),cell2(p2(iP?"":"1",true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("개소"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("2",true),{rs:3,wPct:9}),cell2(p2("처리공법",true),{wPct:21}),cell2(p2(""),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설용량",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("㎥/d"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설개소수",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("개소"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("방류기준",true),{rs:2,wPct:9}),cell2(p2("BOD",true),{wPct:21}),cell2(p2(iP?"":String(eBOD),true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("T-P",true),{wPct:21}),cell2(p2(iP?"":String(eTP),true),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("강화기준",true),{rs:2,wPct:9}),cell2(p2("BOD",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("T-P",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("관련근거  "+(data.techCertNo||"[기술검증번호]"),true),{cs:2,wPct:30}),cell2(p2(""),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("폐수처리계획",true),{rs:12,wPct:12}),cell2(p2("□ 공공",true),{rs:4,wPct:15}),cell2(p2("처리시설명",true),{cs:2,wPct:30}),cell2(p2(""),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설용량",true),{cs:2,wPct:30}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("㎥/d"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("방류기준",true),{rs:2,wPct:15}),cell2(p2("BOD",true),{wPct:15}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("T-P",true),{wPct:15}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("□ 개별",true),{rs:8,wPct:15}),cell2(p2("1",true),{rs:3,wPct:9}),cell2(p2("처리공법",true),{wPct:21}),cell2(p2(""),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설용량",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("㎥/d"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설개소수",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("개소"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("2",true),{rs:3,wPct:9}),cell2(p2("처리공법",true),{wPct:21}),cell2(p2(""),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설용량",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("㎥/d"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("시설개소수",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("개소"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("방류기준",true),{rs:2,wPct:9}),cell2(p2("BOD",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("T-P",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2("비점오염\n저감계획",true),{rs:3,wPct:12}),cell2(p2("종류",true),{rs:2,wPct:15}),cell2(p2("생태면적",true),{wPct:15}),cell2(p2("적용면적",true),{wPct:15}),cell2(p2("삭감량(kg/일)",true),{cs:2,wPct:43})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2(""),{wPct:15}),cell2(p2(""),{wPct:15}),cell2(p2("BOD",true),{wPct:25}),cell2(p2("T-P",true),{wPct:18})]}),
      new TableRow2({height:{value:ROW},children:[cell2(p2(""),{wPct:15}),cell2(p2("-",true),{wPct:15}),cell2(p2("-",true),{wPct:15}),cell2(p2("-",true),{wPct:25}),cell2(p2("-",true),{wPct:18})]})
    ]
  });

  return H.chapterBox("제1장  총  괄").concat([
    H.heading1("1. 사업의 개요"),mainTable,
    H.blank(),
    H.heading1("2. 할당부하량"),allotTable,H.blank(),
    H.pageBreak(),
    H.heading1("3. 저감계획"),jeogamTable,H.blank()
  ]);
}


// ── 제2장: 사업계획서 ────────────────────────────────────────────
function buildChapter2(docx,data){
  var H=makeH(docx);
  var Table=docx.Table,TableRow=docx.TableRow,TableCell=docx.TableCell;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;
  var els=[];

  els=els.concat(H.chapterBox("제2장  사업계획서"));
  els.push(H.heading1("1. 계획의 배경 및 목적"));
  els.push(H.p("◦ 사업의 배경",{bold:true,size:H.SZ_SM}));
  els.push(H.inputBox("[ 사업의 배경을 입력하세요 ]\n예시) 본 사업지구는 ○○시 ○○면 ○○리 일원으로서..."));
  els.push(H.blank());
  els.push(H.p("◦ 사업의 목적",{bold:true,size:H.SZ_SM}));
  els.push(H.inputBox("[ 사업의 목적을 입력하세요 ]\n예시) 본 수질오염총량검토서는 개발행위허가 신청에 따라..."));
  els.push(H.blank());

  // ★ 페이지 넘김 1: 배경목적 / 실시근거~
  els.push(H.pageBreak());

  els.push(H.heading1("2. 수질오염총량검토 실시근거"));
  // ★ 사업의 종류 텍스트 그대로 실시근거에 삽입
  var bizTypeText=data.bizType||"[사업의 종류 선택]";
  var legalBasis=data.legalBasis||"◦ 한강수계 상수원수질개선 및 주민지원 등에 관한 법률 제8조의2\n◦ 수질오염총량관리기술지침(국립환경과학원)\n◦ 환경영향평가법 제59조 및 제61조제2항 관련 [별표4]";
  els.push(H.p("◦ 실시근거 : "+bizTypeText,{size:H.SZ_SM}));
  els.push(H.blank());
  // legalBasis를 줄바꿈별로 별도 단락으로 분리 (한 단락 w:br 방식 시 페이지 경계에서 ◦ 잘림 방지)
  var legalLines=(legalBasis||"").split("\n");
  legalLines.forEach(function(line){if(line.trim())els.push(H.p(line,{size:H.SZ_SM}));});
  els.push(H.blank());

  var nb=H.BN;
  function cb2(ov){ov=ov||{};return{top:ov.top||nb,bottom:ov.bottom||nb,left:ov.left||nb,right:ov.right||nb};}
  function cell2(ch,o){
    o=o||{};
    return new TableCell({
      children:Array.isArray(ch)?ch:[ch],
      borders:o.borders||cb2(),columnSpan:o.cs||1,rowSpan:o.rs||1,
      width:o.wPct?{size:o.wPct,type:WidthType.PERCENTAGE}:(o.w?{size:o.w,type:WidthType.DXA}:undefined),
      verticalAlign:o.vAlign||VerticalAlign.CENTER
    });
  }
  function pp2(t,o){o=o||{};return H.p(t,{center:o.center!==undefined?o.center:false,bold:o.bold||false,size:o.size||H.SZ_TBL});}

  els.push(H.heading1("3. 계획의 추진경위 및 계획"));
  els.push(H.inputBox("[ 추진경위를 입력하세요 ]\n예시)\n◦ 20XX.XX.XX : 개발행위허가 신청\n◦ 20XX.XX.XX : 소규모환경영향평가 접수"));
  els.push(H.blank());

  // ★ 페이지 넘김 2: 추진경위 / 계획내용~
  els.push(H.pageBreak());

  els.push(H.heading1("4. 계획의 내용"));
  els.push(H.heading2("(1) 사업명"));
  els.push(H.p("◦ "+(data.projectName||"[사업명]"),{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.heading2("(2) 시간적 범위"));
  var bizPeriod=(data.startYear&&data.completeYear)?(data.startYear+"년 ~ "+data.completeYear+"년"):"[착공년도 ~ 준공년도]";
  els.push(H.p("◦ "+bizPeriod,{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.heading2("(3) 공간적 범위"));
  var unitBasin=data.unitBasin||"[단위유역]";
  els.push(H.p("◦ "+(data.projectLocation||"[사업지 주소]")+" ("+unitBasin+" 위치함)",{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.heading2("(4) 사업 시행자"));
  els.push(H.p("◦ "+(data.ownerName||"[사업시행자명]"),{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.heading2("(5) 토지이용계획도"));
  els.push(H.imagePlaceholder("[ 토지이용계획도를 삽입하세요 ]",6000));
  els.push(H.blank());
  els.push(H.heading2("(6) 토지조서"));
  els.push(H.note("※ 단위: ㎡"));
  els.push(H.simpleTable(
    ["지번","지목","지적면적\n(㎡)","실사용면적\n(㎡)","도로편입\n(㎡)","신청면적\n(㎡)","비고"],
    [["","","","","","",""],["","","","","","",""],["합  계","","-","","","",""]],
    [20,8,12,12,12,12,24]
  ));
  els.push(H.blank());

  els.push(H.heading2("(7) 토지이용계획"));
  els.push(H.note("※ 단위: ㎡, (%) / 아래는 예시 항목입니다. 실제 계획에 맞게 수정하세요."));
  var totalSiteArea=data.areaTotalSite||"-";
  els.push(H.simpleTable(
    ["구분","면적(㎡)","비율(%)"],
    [
      ["건축부지","",""],
      ["녹  지","",""],
      ["도  로","",""],
      ["합  계",totalSiteArea,"100.0"]
    ],
    [40,30,30]
  ));
  els.push(H.blank());

  // ★ (8) 건축개요 - UI 사업후 데이터 반영, 1열 제거, 소계/합계 구조
  els.push(H.heading2("(8) 건축개요"));
  var afterState=window.lifeAfter&&window.lifeAfter.state;
  var buildings=afterState&&afterState.buildings?afterState.buildings:[];
  var multiBuilding=buildings.length>1;

  // 건축개요 표 생성
  var bldgHeaderCols=multiBuilding?["동","층","용도","면적(㎡)"]:["층","용도","면적(㎡)"];
  var bldgColRatios=multiBuilding?[20,15,40,25]:[20,55,25];
  var bldgRows=[];
  var grandTotal=0;

  if(buildings.length>0){
    buildings.forEach(function(bldg){
      var bldgTotal=0;
      if(bldg.floors){
        bldg.floors.forEach(function(floor){
          if(floor.uses){
            floor.uses.forEach(function(use){
              var area=parseFloat(String(use.inputValue||"").replace(/,/g,""))||0;
              if(area>0){
                var row=multiBuilding?[bldg.buildingNo+"동",floor.floorNo+"층",useLabel(use),area.toFixed(2)]:
                                      [floor.floorNo+"층",useLabel(use),area.toFixed(2)];
                bldgRows.push(row);
                bldgTotal+=area;
                grandTotal+=area;
              }
            });
          }
        });
      }
      // 다동인 경우 동별 소계 행
      if(multiBuilding&&bldgTotal>0){
        bldgRows.push([bldg.buildingNo+"동 소계","","",bldgTotal.toFixed(2)]);
      }
    });
    // 합계 행
    if(multiBuilding){
      bldgRows.push(["합  계","","",grandTotal.toFixed(2)]);
    } else {
      bldgRows.push(["합  계","",grandTotal.toFixed(2)]);
    }
  } else {
    // 데이터 없으면 빈 양식
    if(multiBuilding){
      bldgRows=[["①동","1층","",""],["①동 소계","","",""],["합  계","","",""]];
    } else {
      bldgRows=[["1층","",""],["합  계","",""]];
    }
  }

  // 소계/합계 행은 첫 셀들을 병합(simpleTable로는 병합 어려우니 일반 표로)
  // simpleTable 사용 (소계/합계 표시는 텍스트로)
  els.push(H.simpleTable(bldgHeaderCols,bldgRows,bldgColRatios));
  els.push(H.blank());

  els.push(H.heading2("(9) 단위유역 현황도 및 사업지 위치"));
  els.push(H.p("◦ 단위유역 : "+unitBasin,{size:H.SZ_SM}));
  els.push(H.imagePlaceholder("[ 단위유역 현황도를 삽입하고, 사업지 위치를 표시하세요 ]",6000));
  els.push(H.blank());
  return els;
}

// ── 제3장: 부하량 산정 ───────────────────────────────────────────

// ★ 수정9: 기술지침 원단위 참조표 (표 VI-1)
// ── 층 병합 테이블 헬퍼 ─────────────────────────────────────────
// rows 마지막 행이 "합  계" 행. col 0 = 층, 연속 동일값 병합
function buildMergedFloorTable(H,headers,rows,colRatios){
  var Table=H.Table,TableRow=H.TableRow,TableCell=H.TableCell;
  var WidthType=H.WidthType,VerticalAlign=H.VerticalAlign,PAGE_W=H.PAGE_W;
  var total=colRatios.reduce(function(a,b){return a+b;},0);
  var colWidths=colRatios.map(function(r){return total<=100?Math.round(PAGE_W*r/100):Math.round(r*PAGE_W/total);});
  var sumW=colWidths.reduce(function(a,b){return a+b;},0);
  if(sumW!==PAGE_W)colWidths[colWidths.length-1]+=PAGE_W-sumW;
  function mc(text,w,opts){
    opts=opts||{};
    return new TableCell({
      children:[H.p(String(text!=null?text:""),{center:true,bold:!!opts.bold,size:opts.bold?H.SZ_HDR:H.SZ_TBL})],
      columnSpan:opts.cs||1,rowSpan:opts.rs||1,
      width:{size:w,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER
    });
  }
  var tblRows=[new TableRow({tableHeader:true,children:headers.map(function(h,i){return mc(h,colWidths[i],{bold:true});})})];
  var dataRows=rows.slice(0,rows.length-1);
  var sumRow=rows[rows.length-1];
  var i=0;
  while(i<dataRows.length){
    var floorVal=dataRows[i][0];
    var j=i+1;
    while(j<dataRows.length&&dataRows[j][0]===floorVal)j++;
    var span=j-i;
    // 첫 행: 층 셀 rowSpan
    var r0=dataRows[i];
    var cells=[mc(floorVal,colWidths[0],{rs:span})];
    for(var k=1;k<r0.length;k++)cells.push(mc(r0[k],colWidths[k]));
    tblRows.push(new TableRow({children:cells}));
    // 이후 행: 층 셀 생략
    for(var m=i+1;m<j;m++){
      var rm=dataRows[m];
      var sc=[];
      for(var k=1;k<rm.length;k++)sc.push(mc(rm[k],colWidths[k]));
      tblRows.push(new TableRow({children:sc}));
    }
    i=j;
  }
  // 합계 행
  if(sumRow)tblRows.push(new TableRow({children:sumRow.map(function(v,i){return mc(v,colWidths[i]);})}));
  return new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:H.TBLB,rows:tblRows});
}

// ── 동/층 이중 병합 테이블 헬퍼 ─────────────────────────────────
// rows: [dong, floor, use, ...data]. 가정인구·합계 행은 col0=span3로 처리
function buildDongFloorTable(H,headers,rows,colRatios){
  var Table=H.Table,TableRow=H.TableRow,TableCell=H.TableCell;
  var WidthType=H.WidthType,VerticalAlign=H.VerticalAlign,PAGE_W=H.PAGE_W;
  var total=colRatios.reduce(function(a,b){return a+b;},0);
  var colWidths=colRatios.map(function(r){return total<=100?Math.round(PAGE_W*r/100):Math.round(r*PAGE_W/total);});
  var sumW=colWidths.reduce(function(a,b){return a+b;},0);
  if(sumW!==PAGE_W)colWidths[colWidths.length-1]+=PAGE_W-sumW;
  var w012=colWidths[0]+colWidths[1]+colWidths[2];
  function mc(text,w,opts){
    opts=opts||{};
    return new TableCell({
      children:[H.p(String(text!=null?text:""),{center:true,bold:!!opts.bold,size:opts.bold?H.SZ_HDR:H.SZ_TBL})],
      columnSpan:opts.cs||1,rowSpan:opts.rs||1,
      width:{size:w,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER
    });
  }
  var tblRows=[new TableRow({tableHeader:true,children:headers.map(function(h,i){return mc(h,colWidths[i],{bold:true});})})];
  var SPECIAL={"가정인구":true,"합  계":true};
  var i=0;
  while(i<rows.length){
    var row=rows[i];
    var dongVal=row[0];
    if(SPECIAL[dongVal]){
      var cells=[mc(dongVal,w012,{cs:3})];
      for(var k=3;k<row.length;k++)cells.push(mc(row[k],colWidths[k]));
      tblRows.push(new TableRow({children:cells}));
      i++;continue;
    }
    // 동 그룹 끝 탐색
    var dongEnd=i+1;
    while(dongEnd<rows.length&&rows[dongEnd][0]===dongVal&&!SPECIAL[rows[dongEnd][0]])dongEnd++;
    var dongSpan=dongEnd-i;
    var jj=i;
    while(jj<dongEnd){
      var floorVal=rows[jj][1];
      var floorEnd=jj+1;
      while(floorEnd<dongEnd&&rows[floorEnd][1]===floorVal)floorEnd++;
      var floorSpan=floorEnd-jj;
      // 첫 행
      var frow=rows[jj];
      var cells=[];
      if(jj===i)cells.push(mc(dongVal,colWidths[0],{rs:dongSpan}));
      cells.push(mc(floorVal,colWidths[1],{rs:floorSpan}));
      for(var k=2;k<frow.length;k++)cells.push(mc(frow[k],colWidths[k]));
      tblRows.push(new TableRow({children:cells}));
      // 이후 행
      for(var mm=jj+1;mm<floorEnd;mm++){
        var mrow=rows[mm];
        var sc=[];
        for(var k=2;k<mrow.length;k++)sc.push(mc(mrow[k],colWidths[k]));
        tblRows.push(new TableRow({children:sc}));
      }
      jj=floorEnd;
    }
    i=dongEnd;
  }
  return new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:H.TBLB,rows:tblRows});
}

// ── 기술지침 원단위 참조표 (사용안함) ───────────────────────────
function buildLifeStdTable(H,urbanType){
  return []; // 불필요하여 제거
}

// ── 가정인구 오수발생량 표 ───────────────────────────────────────
function buildHHSewageTable(H,hh,households,popUnit,urbanType,phase){
  var ut=urbanType||"비시가화";
  var CC=window.CALC_CONSTS||{};
  // 읍면 여부에 따라 170(읍면) / 200(그외) 적용
  var waterSupply=window.isEupMyeon?170:200;
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var hhDesc=phase==="before"
    ?"◦ 현재 사업부지 내 건축물대장으로 확인한 주거세대 수는 "+(households||"-")+"세대이며, 세대당 인구수 "+F.f2(popUnit||2.63)+"인을 적용하여 "+Math.round(hh.population||0)+"인으로 산정되었다."
    :"◦ 사업계획에 따른 계획 세대는 "+(households||"-")+"세대이며, 세대당 인구수 "+F.f2(popUnit||2.63)+"인을 적용하여 "+Math.round(hh.population||0)+"인으로 산정되었다.";
  els.push(H.p(hhDesc,{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.tableTitle(phaseLabel+" 가정인구 오수발생량"));
  els.push(H.simpleTable(
    ["계획 세대수\n(세대)","세대당 인구수\n(인/세대)","계획인구\n(인)","오수발생원단위\n(L/인·일)","오수발생량\n(㎥/일)","물사용량\n(㎥/일)"],
    [[
      households||"-",
      F.f2(popUnit||2.63),
      Math.round(hh.population||0),
      F.f2(waterSupply),
      F.f3(hh.오수발생유량||0),
      F.f3(hh.일평균급수량||0)
    ]],
    [17,17,14,17,18,17]
  ));
  els.push(H.blank());
  return els;
}

// ── 영업인구 오수발생량 표 ───────────────────────────────────────
function buildBizSewageTable(H,biz,phase){
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var hasCommon=biz.rows.some(function(r){return r.공용배분&&r.공용배분>0;});
  var hasNote=biz.rows.some(function(r){return !!useBuildingNote(r);});
  var buildingNos=(function(){
    var seen={};var order=[];
    biz.rows.forEach(function(r){if(!seen[r.buildingNo]){seen[r.buildingNo]=1;order.push(r.buildingNo);}});
    return order;
  })();
  var multiBuilding=buildingNos.length>1;
  var totalSewage=biz.합계?biz.합계.오수발생유량||0:0;

  els.push(H.p(
    "◦ "+phaseLabel+" 오수발생량은 건축물의 용도별 오수발생량 원단위를 적용하여 산정하였으며, 그 결과 "+F.f3(totalSewage)+"㎥/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());

  // 동별 개별 표 생성
  buildingNos.forEach(function(bldgNo){
    var bldgRows=biz.rows.filter(function(r){return r.buildingNo===bldgNo;});
    var headers=["층","용도"];
    var colRatios=[5,18];
    if(hasCommon){headers.push("건축연면적\n(㎡)","공용배분\n면적(㎡)","최종면적\n(㎡)");}
    else{headers.push("면적\n(㎡)");}
    headers.push("오수량원단위\n(L/㎡·일)","오수발생량\n(㎥/일)","분뇨발생량\n(㎥/일)","물사용량\n(㎥/일)","잡배수\n발생유량\n(㎥/일)");
    if(hasNote)headers.push("비고");
    var fixedSum=23;
    var remainN=headers.length-2;
    var eachR=Math.floor((100-fixedSum)/remainN);
    var extraR=(100-fixedSum)-eachR*remainN;
    for(var i=0;i<remainN;i++)colRatios.push(i<extraR?eachR+1:eachR);

    var rows=bldgRows.map(function(r){
      var row=[r.floorNo+"층",useLabel(r)];
      if(hasCommon)row.push(F.area(r.전용면적||r.적용면적),F.area(r.공용배분||0),F.area(r.적용면적));
      else row.push(F.area(r.적용면적));
      row.push(r.오수발생원단위||"-",F.f3(r.오수발생유량||0),F.f3(r.분뇨발생유량||0),F.f3(r.사용유량||r.오수발생유량||0),F.f3(r.잡배수발생유량||0));
      if(hasNote)row.push(useBuildingNote(r));
      return row;
    });
    var sumRow=["합  계",""];
    if(hasCommon){sumRow.push(F.area(bldgRows.reduce(function(s,r){return s+(r.전용면적||r.적용면적||0);},0)),F.area(bldgRows.reduce(function(s,r){return s+(r.공용배분||0);},0)),F.area(bldgRows.reduce(function(s,r){return s+(r.적용면적||0);},0)));}
    else{sumRow.push(F.area(bldgRows.reduce(function(s,r){return s+(r.적용면적||0);},0)));}
    sumRow.push("-",F.f3(bldgRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0)),F.f3(bldgRows.reduce(function(s,r){return s+(r.분뇨발생유량||0);},0)),F.f3(bldgRows.reduce(function(s,r){return s+(r.사용유량||r.오수발생유량||0);},0)),F.f3(bldgRows.reduce(function(s,r){return s+(r.잡배수발생유량||0);},0)));
    if(hasNote)sumRow.push("");
    rows.push(sumRow);

    var titleSuffix=multiBuilding?"("+bldgNo+"동)":"";
    els.push(H.tableTitle(phaseLabel+" 영업인구 오수발생량"+titleSuffix));
    els.push(buildMergedFloorTable(H,headers,rows,colRatios));
    els.push(H.blank());
  });

  return els;
}

// ── 발생부하량 표 ────────────────────────────────────────────────
function buildLoadTable(H,lifeData,phase){
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var hh=lifeData.가정인구;
  var biz=lifeData.영업인구;
  var CC=window.CALC_CONSTS||{};
  var ut=window.LAST_CALC_RESULT&&window.LAST_CALC_RESULT.params?window.LAST_CALC_RESULT.params.urbanType:"비시가화";
  var bodUnit=CC.HH_LOAD_UNIT&&CC.HH_LOAD_UNIT[ut]?CC.HH_LOAD_UNIT[ut].BOD:48.6;
  var tpUnit=CC.HH_LOAD_UNIT&&CC.HH_LOAD_UNIT[ut]?CC.HH_LOAD_UNIT[ut].TP:1.45;
  var totalBOD=lifeData.합계&&lifeData.합계.발생부하량?lifeData.합계.발생부하량.BOD:0;
  var totalTP=lifeData.합계&&lifeData.합계.발생부하량?lifeData.합계.발생부하량.TP:0;
  els.push(H.p(
    "◦ "+phaseLabel+" 발생부하량은 수질오염총량관리기술지침의 원단위를 적용하여 산정하였으며, 산정결과 BOD "+F.f3(totalBOD)+"kg/일, T-P "+F.f3(totalTP)+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  // 가정인구 발생부하량 표
  if(hh){
    els.push(H.tableTitle(phaseLabel+" 가정인구 발생부하량"));
    var R=CC.FECES_LOAD_RATIO||{BOD:0.45,TP:0.8};
    els.push(H.simpleTable(
      ["구분","오수발생량\n(㎥/일)","적용원단위\nBOD\n(g/인·일)","적용원단위\nT-P\n(g/인·일)","발생부하량\nBOD\n(kg/일)","발생부하량\nT-P\n(kg/일)"],
      [["가정인구",F.f3(hh.오수발생유량||0),bodUnit,tpUnit,F.f3(hh.발생부하량?hh.발생부하량.BOD:0),F.f3(hh.발생부하량?hh.발생부하량.TP:0)]],
      [18,16,14,14,19,19]
    ));
    els.push(H.blank());
  }
  // 영업인구 발생부하량 표 (동별 분리)
  if(biz&&biz.rows&&biz.rows.length){
    var bizBldgNos2=(function(){
      var seen={};var order=[];
      biz.rows.forEach(function(r){if(!seen[r.buildingNo]){seen[r.buildingNo]=1;order.push(r.buildingNo);}});
      return order;
    })();
    var multiBldgL=bizBldgNos2.length>1;
    var hasNoteL=biz.rows.some(function(r){return !!useBuildingNote(r);});
    bizBldgNos2.forEach(function(bldgNo){
      var bldgRows=biz.rows.filter(function(r){return r.buildingNo===bldgNo;});
      var hdrs=["층","용도","오수발생량\n(㎥/일)","적용원단위\nBOD","적용원단위\nT-P","발생부하량\nBOD(kg/일)","발생부하량\nT-P(kg/일)"];
      if(hasNoteL)hdrs.push("비고");
      var cols=[5,18];
      var remN3=hdrs.length-2;
      var eR3=Math.floor(77/remN3);
      var exR3=77-eR3*remN3;
      for(var i=0;i<remN3;i++)cols.push(i<exR3?eR3+1:eR3);
      var dataRows=bldgRows.map(function(r){
        var row=[r.floorNo+"층",useLabel(r),F.f3(r.오수발생유량||0),r.BOD농도||"-",r.TP농도||"-",F.f3(r.발생부하량?r.발생부하량.BOD:0),F.f3(r.발생부하량?r.발생부하량.TP:0)];
        if(hasNoteL)row.push(useBuildingNote(r));
        return row;
      });
      var sumR=["합  계","",F.f3(bldgRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0)),"","-",F.f3(bldgRows.reduce(function(s,r){return s+(r.발생부하량?r.발생부하량.BOD:0);},0)),F.f3(bldgRows.reduce(function(s,r){return s+(r.발생부하량?r.발생부하량.TP:0);},0))];
      if(hasNoteL)sumR.push("");
      dataRows.push(sumR);
      var titleSuffix=multiBldgL?"("+bldgNo+"동)":"";
      els.push(H.tableTitle(phaseLabel+" 영업인구 발생부하량"+titleSuffix));
      els.push(buildMergedFloorTable(H,hdrs,dataRows,cols));
      els.push(H.blank());
    });
  }
  return els;
}

// ── 배출부하량 (직접이송 + 개별) ─────────────────────────────────
function buildDischargeSection(docx,H,lifeData,phase,isWaterBuffer){
  void isWaterBuffer;
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  void phaseLabel;
  var hh=lifeData.가정인구;
  var biz=lifeData.영업인구;
  var CC=window.CALC_CONSTS||{};

  var hasDirectHH=hh&&hh.직접이송결과&&hh.직접이송결과.직접이송유량>0;
  var directBizRows=biz&&biz.rows?biz.rows.filter(function(r){return r.직접이송결과&&r.직접이송결과.직접이송유량>0;}):[];
  var hasDirectBiz=directBizRows.length>0;

  // ── ① 분뇨의 직접이송에 따른 방류부하량
  if(hasDirectHH||hasDirectBiz){
    els.push(H.heading4("① 분뇨의 직접이송에 따른 방류부하량"));

    // 처리장 이름
    var dt0=hasDirectHH?hh.직접이송결과:directBizRows[0].직접이송결과;
    var plantName0=dt0.처리장||"-";

    // 연계하수처리시설 여부 확인
    var fecesLinked=null;
    if(typeof FECES_PLANT_DB!=="undefined"){
      var fecesP=FECES_PLANT_DB.find(function(p){return p.name===plantName0;});
      if(fecesP&&fecesP.linkedPlant)fecesLinked=fecesP.linkedPlant;
    }
    var descText="◦ 직접이송유량은 대상물질별 직접이송유량비를 곱하여 산정하였으며, 현황 조사 결과 "+plantName0+"으로 이송되어 처리 후 방류하는 것으로 확인되었다.";
    if(fecesLinked)descText="◦ 직접이송유량은 대상물질별 직접이송유량비를 곱하여 산정하였으며, 현황 조사 결과 "+plantName0+"으로 이송되어 연계된 "+fecesLinked+"에서 처리, 방류하는 것으로 확인되었다.";
    els.push(H.p(descText,{size:H.SZ_SM}));
    els.push(H.blank());

    // 산정 기준 표 (factor table)
    var m1Key=hasDirectHH?(hh.개인처리기준?"개인하수처리시설":"정화조"):(directBizRows[0].sewageMethod1||"개인하수처리시설");
    var coef=CC.DIRECT_TRANSFER_COEF&&CC.DIRECT_TRANSFER_COEF[m1Key]?CC.DIRECT_TRANSFER_COEF[m1Key]:{flow:1.0,BOD:0.079,TN:0.080,TP:0.081};
    var linkedPlantInfo=null;
    if(typeof SEWAGE_PLANT_DB!=="undefined")linkedPlantInfo=SEWAGE_PLANT_DB.find(function(p){return p.name===(fecesLinked||plantName0);})||null;
    var efflBOD=linkedPlantInfo?linkedPlantInfo.efflBOD:"-";
    var efflTP=linkedPlantInfo?linkedPlantInfo.efflTP:"-";
    var totalFeces=0,totalDtBOD=0,totalDtTP=0;
    if(hasDirectHH){totalFeces+=(hh.분뇨발생유량||0);totalDtBOD+=(hh.직접이송결과.방류부하량.BOD||0);totalDtTP+=(hh.직접이송결과.방류부하량.TP||0);}
    directBizRows.forEach(function(r){totalFeces+=(r.분뇨발생유량||0);totalDtBOD+=(r.직접이송결과.방류부하량.BOD||0);totalDtTP+=(r.직접이송결과.방류부하량.TP||0);});

    els.push(H.tableTitle("분뇨 직접이송 기준"));
    (function(){
      var _T=H.Table,_R=H.TableRow,_C=H.TableCell,_W=H.WidthType,_V=H.VerticalAlign,PW=H.PAGE_W;
      var cw=[18,14,9,9,12,12,13,13].map(function(r){return Math.round(PW*r/100);});
      var sw=cw.reduce(function(a,b){return a+b;},0);cw[cw.length-1]+=PW-sw;
      function mh(t,w,o){o=o||{};return new _C({children:[H.p(t,{center:true,bold:true,size:H.SZ_HDR})],columnSpan:o.cs||1,rowSpan:o.rs||1,width:{size:w,type:_W.DXA},borders:H.CELLB,verticalAlign:_V.CENTER});}
      function md(t,w){return new _C({children:[H.p(String(t!=null?t:""),{center:true,size:H.SZ_TBL})],width:{size:w,type:_W.DXA},borders:H.CELLB,verticalAlign:_V.CENTER});}
      els.push(new _T({width:{size:100,type:_W.PERCENTAGE},borders:H.TBLB,rows:[
        new _R({tableHeader:true,children:[mh("구분",cw[0],{rs:2}),mh("분뇨발생유량\n(㎥/일)",cw[1],{rs:2}),mh("직접이송유량비",cw[2]+cw[3],{cs:2}),mh("처리시설 방류농도\n(mg/L)",cw[4]+cw[5],{cs:2}),mh("직접이송 방류부하량\n(kg/일)",cw[6]+cw[7],{cs:2})]}),
        new _R({tableHeader:true,children:[mh("BOD",cw[2]),mh("T-P",cw[3]),mh("BOD",cw[4]),mh("T-P",cw[5]),mh("BOD",cw[6]),mh("T-P",cw[7])]}),
        new _R({children:[md(plantName0,cw[0]),md(F.f3(totalFeces),cw[1]),md(F.f3(coef.BOD),cw[2]),md(F.f3(coef.TP||coef.BOD),cw[3]),md(String(efflBOD),cw[4]),md(String(efflTP),cw[5]),md(F.f3(totalDtBOD),cw[6]),md(F.f3(totalDtTP),cw[7])]})
      ]}));
    })();
    els.push(H.blank());

    // 동/층/용도별 상세 표
    var detailRows=[];
    if(hasDirectHH){
      detailRows.push({구분:"가정인구",오수:hh.오수발생유량||0,분뇨:hh.분뇨발생유량||0,직이:hh.직접이송결과.직접이송유량||0,dtBOD:hh.직접이송결과.방류부하량.BOD||0,dtTP:hh.직접이송결과.방류부하량.TP||0});
    }
    directBizRows.forEach(function(r){
      detailRows.push({구분:r.buildingNo+"동 "+r.floorNo+"층 "+useLabel(r),오수:r.오수발생유량||0,분뇨:r.분뇨발생유량||0,직이:r.직접이송결과.직접이송유량||0,dtBOD:r.직접이송결과.방류부하량.BOD||0,dtTP:r.직접이송결과.방류부하량.TP||0});
    });
    var detDataRows=detailRows.map(function(d){return[d.구분,F.f3(d.오수),F.f3(d.분뇨),F.f3(d.직이),F.f3(d.dtBOD),F.f3(d.dtTP)];});
    detDataRows.push(["합  계",F.f3(detailRows.reduce(function(s,d){return s+d.오수;},0)),F.f3(detailRows.reduce(function(s,d){return s+d.분뇨;},0)),F.f3(detailRows.reduce(function(s,d){return s+d.직이;},0)),F.f3(totalDtBOD),F.f3(totalDtTP)]);
    els.push(H.tableTitle("분뇨 직접이송 동·층·용도별"));
    els.push(H.simpleTable(
      ["구분","오수발생량\n(㎥/일)","분뇨발생유량\n(㎥/일)","직접이송유량\n(㎥/일)","방류부하량\nBOD(kg/일)","방류부하량\nT-P(kg/일)"],
      detDataRows,[20,16,16,16,16,16]
    ));
    els.push(H.blank());
  }

  // ── ② 개별 배출부하량
  els.push(H.heading4("② 개별 배출부하량"));

  var hhM1=hh?(hh.처리장정보?"공공하수처리시설":(hh.개인처리기준?"개인하수처리시설":"정화조")):null;
  var pubBizRows=biz&&biz.rows?biz.rows.filter(function(r){return r.sewageMethod1==="공공하수처리시설";}):[];
  var indBizRows=biz&&biz.rows?biz.rows.filter(function(r){return r.sewageMethod1==="개인하수처리시설";}):[];
  var sepBizRows=biz&&biz.rows?biz.rows.filter(function(r){return r.sewageMethod1==="정화조";}):[];
  var isPubHH=hhM1==="공공하수처리시설";
  var isIndHH=hhM1==="개인하수처리시설";
  var isSepHH=hhM1==="정화조";
  var hasPub=(isPubHH&&hh)||pubBizRows.length>0;
  var hasInd=(isIndHH&&hh)||indBizRows.length>0;
  var hasSep=(isSepHH&&hh)||sepBizRows.length>0;
  var totalDischBOD=lifeData.합계&&lifeData.합계.배출부하량?lifeData.합계.배출부하량.BOD:0;
  var totalDischTP=lifeData.합계&&lifeData.합계.배출부하량?lifeData.합계.배출부하량.TP:0;

  // 개별배출부하량 표 생성 (동/층/용도 행 방식)
  function buildIndiTable(bizRows,isHH,hhData,method,title){
    var indHdrs=["동","층","용도","오수발생량\n(㎥/일)","개별배출유량\n(㎥/일)","처리농도\nBOD(mg/L)","처리농도\nT-P(mg/L)","방류부하량\nBOD(kg/일)","방류부하량\nT-P(kg/일)"];
    var indCols=[10,8,14,12,12,11,11,11,11];
    function getBcong(r){
      if(method==="공공하수처리시설")return r.처리장정보?String(r.처리장정보.efflBOD):"-";
      if(method==="개인하수처리시설")return r.개인처리기준&&r.개인처리기준.std?String(r.개인처리기준.std.BOD):"-";
      return "BOD 25%삭감";
    }
    function getTcong(r){
      if(method==="공공하수처리시설")return r.처리장정보?String(r.처리장정보.efflTP):"-";
      if(method==="개인하수처리시설")return r.개인처리기준&&r.개인처리기준.std?String(r.개인처리기준.std.TP):"-";
      return "원부하량";
    }
    function getFlow(r){return method==="공공하수처리시설"?(r.관거이송량||r.오수발생유량||0):(r.잡배수발생유량||0);}
    var indData=[];
    if(isHH&&hhData){
      indData.push(["가정인구","","",F.f3(hhData.오수발생유량||0),F.f3(getFlow(hhData)),getBcong(hhData),getTcong(hhData),F.f3(hhData.배출부하량?hhData.배출부하량.BOD:0),F.f3(hhData.배출부하량?hhData.배출부하량.TP:0)]);
    }
    bizRows.forEach(function(r){
      indData.push([r.buildingNo+"동",r.floorNo+"층",useLabel(r),F.f3(r.오수발생유량||0),F.f3(getFlow(r)),getBcong(r),getTcong(r),F.f3(r.배출부하량?r.배출부하량.BOD:0),F.f3(r.배출부하량?r.배출부하량.TP:0)]);
    });
    var sumSewage=(isHH&&hhData?hhData.오수발생유량||0:0)+bizRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
    var sumFlow=(isHH&&hhData?getFlow(hhData):0)+bizRows.reduce(function(s,r){return s+getFlow(r);},0);
    var sumBOD=(isHH&&hhData?(hhData.배출부하량?hhData.배출부하량.BOD:0):0)+bizRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.BOD:0);},0);
    var sumTP=(isHH&&hhData?(hhData.배출부하량?hhData.배출부하량.TP:0):0)+bizRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.TP:0);},0);
    indData.push(["합  계","","",F.f3(sumSewage),F.f3(sumFlow),"-","-",F.f3(sumBOD),F.f3(sumTP)]);
    var els2=[];
    els2.push(H.tableTitle(title));
    els2.push(buildDongFloorTable(H,indHdrs,indData,indCols));
    els2.push(H.blank());
    return els2;
  }

  if(hasPub){
    els.push(H.p("◦ 사업부지 내 건물에서 발생하는 오수는 공공하수처리시설로 유입·처리되는 것으로 조사되었으며, 개별배출부하량은 BOD "+F.f3(totalDischBOD)+"kg/일, T-P "+F.f3(totalDischTP)+"kg/일로 산정되었다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els=els.concat(buildIndiTable(pubBizRows,isPubHH,isPubHH?hh:null,"공공하수처리시설","공공하수처리시설 연결 개별배출부하량"));
  }
  if(hasInd){
    els.push(H.p("◦ 사업부지 내 건물에서 발생하는 오수는 개별오수처리시설에서 잡배수만 처리 후 방류되는 것으로 조사되었으며, 개별배출부하량은 BOD "+F.f3(totalDischBOD)+"kg/일, T-P "+F.f3(totalDischTP)+"kg/일로 산정되었다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els=els.concat(buildIndiTable(indBizRows,isIndHH,isIndHH?hh:null,"개인하수처리시설","개인오수처리시설 개별배출부하량"));
  }
  if(hasSep){
    els.push(H.p("◦ 사업부지 내 건물에서 발생하는 오수는 정화조에서 잡배수만 처리 후 방류되는 것으로 조사되었으며, 개별배출부하량은 BOD "+F.f3(totalDischBOD)+"kg/일, T-P "+F.f3(totalDischTP)+"kg/일로 산정되었다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els=els.concat(buildIndiTable(sepBizRows,isSepHH,isSepHH?hh:null,"정화조","정화조 처리 개별배출부하량"));
  }

  return els;
}

// ── 사업전/후 배출부하량 총괄 ────────────────────────────────────
function buildDischargeSummary(H,lifeData,phase){
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var hh=lifeData.가정인구;
  var biz=lifeData.영업인구;
  // 직접이송 합계
  var dtBOD=0,dtTP=0;
  if(hh&&hh.직접이송결과){dtBOD+=hh.직접이송결과.방류부하량.BOD||0;dtTP+=hh.직접이송결과.방류부하량.TP||0;}
  if(biz&&biz.rows)biz.rows.forEach(function(r){if(r.직접이송결과){dtBOD+=r.직접이송결과.방류부하량.BOD||0;dtTP+=r.직접이송결과.방류부하량.TP||0;}});
  // 개별배출 합계
  var indBOD=lifeData.합계&&lifeData.합계.배출부하량?lifeData.합계.배출부하량.BOD:0;
  var indTP=lifeData.합계&&lifeData.합계.배출부하량?lifeData.합계.배출부하량.TP:0;
  var totBOD=_r2(dtBOD+indBOD),totTP=_r2(dtTP+indTP);
  function _r2(v){return Math.round(v*1e6)/1e6;}
  els.push(H.p(
    "◦ "+phaseLabel+" 점오염원(생활계) 배출부하량 산정결과, BOD "+F.f3(totBOD)+"kg/일, T-P "+F.f3(totTP)+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle(phaseLabel+" 배출부하량 총괄"));
  els.push(H.simpleTable(
    ["구분","직접이송에 따른\n방류부하량(kg/일)","개별배출\n부하량(kg/일)","배출부하량\n합(kg/일)"],
    [["BOD",F.f3(dtBOD),F.f3(indBOD),F.f3(totBOD)],["T-P",F.f3(dtTP),F.f3(indTP),F.f3(totTP)]],
    [15,30,28,27]
  ));
  els.push(H.blank());
  return els;
}

// ── 생활계 전체 섹션 ─────────────────────────────────────────────
function buildLifePhaseSection(docx,H,lifeData,phase,isWaterBuffer,urbanType,households,popUnit){
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var hh=lifeData?lifeData.가정인구:null;
  var biz=lifeData?lifeData.영업인구:null;
  var hasHH=!!(hh&&hh.population>0);
  var hasBiz=!!(biz&&biz.rows&&biz.rows.length>0);

  if(!hasHH&&!hasBiz){
    var emptyMsg=phase==="before"
      ?"◦ 본 사업부지는 사업시행 전 점오염원(생활계)에 의한 배출부하량은 없는 것으로 조사되었다."
      :"◦ 사업시행 후 생활계 배출부하량은 없는 것으로 산정되었다.";
    els.push(H.p(emptyMsg));
    return els;
  }

  // 오수발생량
  els.push(H.heading3("(1) 오수발생량"));
  if(hasHH)els=els.concat(buildHHSewageTable(H,hh,households,popUnit,urbanType,phase));
  if(hasBiz)els=els.concat(buildBizSewageTable(H,biz,phase));

  // 발생부하량
  els.push(H.heading3("(2) 발생부하량"));
  els=els.concat(buildLoadTable(H,lifeData,phase));

  // 배출부하량
  els.push(H.heading3("(3) 배출부하량"));
  els=els.concat(buildDischargeSection(docx,H,lifeData,phase,isWaterBuffer));

  // 배출부하량 총괄
  els.push(H.heading3("(4) "+phaseLabel+" 배출부하량 총괄"));
  els=els.concat(buildDischargeSummary(H,lifeData,phase));

  return els;
}

// ── 토지계 표 (한 표로 통합, 3행 헤더, 지목별 개별 행) ────────────
function buildLandTables(H,landBefore,landAfter,docx){
  var els=[];
  var CC=window.CALC_CONSTS||{};
  var LAND_UNIT=CC.LAND_UNIT||{};

  var LAND_ITEMS=[
    "전","답","과수원","목장용지","공원","묘지","사적지",
    "임야",
    "광천지","염전","제방","하천","구거","유지","양어장","잡종지",
    "대지","공장용지","학교","창고","종교",
    "주차장","도로","철도","수도","주유소","체육용지","유원지"
  ];

  var beforeMap={};
  (landBefore&&landBefore.rows||[]).forEach(function(r){beforeMap[r.jmok]=r.area||0;});
  var afterMap={};
  (landAfter&&landAfter.rows||[]).forEach(function(r){afterMap[r.jmok]=r.area||0;});

  var activeItems=LAND_ITEMS.filter(function(j){return (beforeMap[j]||0)>0||(afterMap[j]||0)>0;});
  if(!activeItems.length){els.push(H.p("◦ 토지계 입력 데이터가 없습니다."));return els;}

  var Table=docx.Table,TableRow=docx.TableRow,TableCell=docx.TableCell;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;
  var W=9638;
  var cw=[Math.round(W*0.12),Math.round(W*0.11),Math.round(W*0.11),Math.round(W*0.10),Math.round(W*0.10),Math.round(W*0.11),Math.round(W*0.11),Math.round(W*0.12),0];
  cw[8]=W-cw[0]-cw[1]-cw[2]-cw[3]-cw[4]-cw[5]-cw[6]-cw[7];
  var TBLB=H.TBLB,CELLB=H.CELLB;
  function c(ch,w,cs,rs){return new TableCell({children:Array.isArray(ch)?ch:[ch],columnSpan:cs||1,rowSpan:rs||1,width:{size:w,type:WidthType.DXA},borders:CELLB,verticalAlign:VerticalAlign.CENTER});}
  function ph(t){return H.p(t||"",{center:true,bold:true,size:H.SZ_HDR});}
  function pd(t){return H.p(String(t!=null?t:""),{center:true,size:H.SZ_TBL});}

  var hdr1=new TableRow({tableHeader:true,children:[
    c(ph("구분"),cw[0],1,3),
    c(ph("면 적(㎡)"),cw[1]+cw[2],2),
    c(ph("원단위(kg/㎢·일)"),cw[3]+cw[4],2),
    c(ph("발생부하량(kg/일)"),cw[5]+cw[6]+cw[7]+cw[8],4)
  ]});
  var hdr2=new TableRow({tableHeader:true,children:[
    c(ph("사업시행\n전"),cw[1]),c(ph("사업시행\n후"),cw[2]),
    c(ph("BOD"),cw[3]),c(ph("T-P"),cw[4]),
    c(ph("사업시행 전"),cw[5]+cw[6],2),c(ph("사업시행 후"),cw[7]+cw[8],2)
  ]});
  var hdr3=new TableRow({tableHeader:true,children:[
    c(ph(""),cw[1]),c(ph(""),cw[2]),c(ph(""),cw[3]),c(ph(""),cw[4]),
    c(ph("BOD"),cw[5]),c(ph("T-P"),cw[6]),c(ph("BOD"),cw[7]),c(ph("T-P"),cw[8])
  ]});

  var dataRows=[];
  var tBOD=0,tTP=0,taBOD=0,taTP=0,tAB=0,tAA=0;
  activeItems.forEach(function(jmok){
    var unit=LAND_UNIT[jmok]||{BOD:0,TP:0};
    var ba=beforeMap[jmok]||0,aa=afterMap[jmok]||0;
    var bBOD=Math.round(unit.BOD*ba/1e6*1e7)/1e7;
    var bTP=Math.round(unit.TP*ba/1e6*1e7)/1e7;
    var aBOD=Math.round(unit.BOD*aa/1e6*1e7)/1e7;
    var aTP=Math.round(unit.TP*aa/1e6*1e7)/1e7;
    tBOD+=bBOD;tTP+=bTP;taBOD+=aBOD;taTP+=aTP;tAB+=ba;tAA+=aa;
    dataRows.push(new TableRow({children:[
      c(pd(jmok),cw[0]),
      c(pd(ba>0?ba.toLocaleString():"-"),cw[1]),c(pd(aa>0?aa.toLocaleString():"-"),cw[2]),
      c(pd(unit.BOD),cw[3]),c(pd(unit.TP),cw[4]),
      c(pd(ba>0?bBOD.toFixed(5):"-"),cw[5]),c(pd(ba>0?bTP.toFixed(5):"-"),cw[6]),
      c(pd(aa>0?aBOD.toFixed(5):"-"),cw[7]),c(pd(aa>0?aTP.toFixed(5):"-"),cw[8])
    ]}));
  });
  dataRows.push(new TableRow({children:[
    c(pd("합  계"),cw[0]),
    c(pd(tAB>0?tAB.toLocaleString():"-"),cw[1]),c(pd(tAA>0?tAA.toLocaleString():"-"),cw[2]),
    c(pd("-"),cw[3]),c(pd("-"),cw[4]),
    c(pd(tBOD.toFixed(5)),cw[5]),c(pd(tTP.toFixed(5)),cw[6]),
    c(pd(taBOD.toFixed(5)),cw[7]),c(pd(taTP.toFixed(5)),cw[8])
  ]}));

  var landTable=new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:TBLB,rows:[hdr1,hdr2,hdr3].concat(dataRows)});
  els.push(H.tableTitle("사업시행 전·후 토지계 발생부하량"));
  els.push(landTable);
  els.push(H.blank());
  return els;
}

// ── 제3장: 부하량 산정 ───────────────────────────────────────────
function buildChapter3(docx,calcResult,envRiver,urbanType,unitBasin){
  var H=makeH(docx);
  // F에 f5 추가
  if(!F.f5)F.f5=function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(5):"-";};
  var els=[];
  els=els.concat(H.chapterBox("제3장  부하량 산정"));

  var before=calcResult&&calcResult.생활계?calcResult.생활계.사업전:null;
  var after=calcResult&&calcResult.생활계?calcResult.생활계.사업후:null;

  // 기술지침 원단위 표
  els=els.concat(buildLifeStdTable(H,urbanType));

  // ── 1. 생활계 ──────────────────────────────────────────────
  els.push(H.heading1("1. 생활계"));

  // 세대수·인구단위 파악
  var beforeHouseholds=window.lifeBefore&&window.lifeBefore.state?parseFloat(window.lifeBefore.state.householdCount)||0:0;
  var afterHouseholds=window.lifeAfter&&window.lifeAfter.state?parseFloat(window.lifeAfter.state.householdCount)||0:0;
  var popUnit=2.63;
  if(typeof _getPopUnit==="function"){
    var sido=document.getElementById("sidoSelect")?document.getElementById("sidoSelect").value:"";
    var sigun=document.getElementById("sigunSelect")?document.getElementById("sigunSelect").value:"";
    popUnit=_getPopUnit(sido,sigun);
  }

  // 사업시행 전
  els.push(H.heading2("가. 사업시행 전"));
  els=els.concat(buildLifePhaseSection(docx,H,before,"before",envRiver,urbanType,beforeHouseholds,popUnit));

  // ★ 페이지 넘김: 생활계 사업전 / 사업후
  els.push(H.pageBreak());

  // 사업시행 후
  els.push(H.heading2("나. 사업시행 후"));
  els=els.concat(buildLifePhaseSection(docx,H,after,"after",envRiver,urbanType,afterHouseholds,popUnit));

  // ★ 페이지 넘김: 생활계 사업후 / 토지계+최종
  els.push(H.pageBreak());

  // 생활계 최종 배출부하량
  els.push(H.heading2("다. 생활계 최종 배출부하량"));
  var bD=(before&&before.합계&&before.합계.배출부하량)||{BOD:0,TP:0};
  var aD=(after&&after.합계&&after.합계.배출부하량)||{BOD:0,TP:0};
  var finalBOD=Math.round((aD.BOD-bD.BOD)*1e6)/1e6;
  var finalTP=Math.round((aD.TP-bD.TP)*1e6)/1e6;
  els.push(H.p(
    "◦ 금회 사업으로 인한 점오염원(생활계) 최종 배출부하량은 BOD "+F.f3(Math.max(0,finalBOD))+"kg/일, T-P "+F.f3(Math.max(0,finalTP))+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle("생활계 최종 배출부하량"));
  els.push(H.simpleTable(
    ["구분","사업시행 후\n배출부하량(kg/일)","사업시행 전\n배출부하량(kg/일)","최종배출부하량\n(kg/일)"],
    [["BOD",F.f3(aD.BOD),F.f3(bD.BOD),F.bodDelta(finalBOD)],["T-P",F.f3(aD.TP),F.f3(bD.TP),F.tpDelta(finalTP)]],
    [15,28,28,29]
  ));
  els.push(H.note("주) 최종 배출부하량이 음수인 경우 ≒0.00으로 처리"));
  els.push(H.blank());

  // ★ 페이지 넘김: 생활계최종 / 토지계
  // (이미 위에서 처리됨)

  // ── 2. 토지계 ──────────────────────────────────────────────
  els.push(H.heading1("2. 토지계"));
  var lB=calcResult&&calcResult.토지계?calcResult.토지계.사업전:null;
  var lA=calcResult&&calcResult.토지계?calcResult.토지계.사업후:null;
  var tbB=(lB&&lB.합계&&lB.합계.배출부하량)?lB.합계.배출부하량.BOD:0;
  var tbT=(lB&&lB.합계&&lB.합계.배출부하량)?lB.합계.배출부하량.TP:0;
  var taB=(lA&&lA.합계&&lA.합계.배출부하량)?lA.합계.배출부하량.BOD:0;
  var taT=(lA&&lA.합계&&lA.합계.배출부하량)?lA.합계.배출부하량.TP:0;
  els.push(H.p(
    "◦ 사업시행 전 토지계 부하량은 현재 사업부지의 현황지목을 적용하였고, 사업시행 후 토지계 부하량은 사업계획에 따른 토지이용계획 면적에 대응되는 지목을 적용하여 산정하였으며, 그 결과 비점오염원 발생부하량은 BOD "+F.f3(Math.max(0,taB-tbB))+"kg/일, T-P "+F.f3(Math.max(0,taT-tbT))+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els=els.concat(buildLandTables(H,lB,lA,docx));

  // ── 3. 최종배출부하량 ──────────────────────────────────────
  els.push(H.heading1("3. 최종배출부하량"));
  var pt=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.점오염)||{BOD:0,TP:0};
  var bis=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.비점오염)||{BOD:0,TP:0};
  els.push(H.p(
    "◦ 금회 사업으로 인한 점오염원(생활계) 최종 배출부하량은 BOD "+F.finalBod(pt.BOD)+"kg/일, T-P "+F.finalTp(pt.TP)+"kg/일이며, 비점오염원(토지계) 최종 배출부하량은 BOD "+F.finalBod(bis.BOD)+"kg/일, T-P "+F.finalTp(bis.TP)+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle("최종 배출부하량 (단위: kg/일)"));
  els.push(H.simpleTable(
    ["구분","배출원","BOD\n(kg/일)","T-P\n(kg/일)"],
    [[unitBasin||"-","점오염(생활계)",F.finalBod(pt.BOD),F.finalTp(pt.TP)],
     [unitBasin||"-","비점오염(토지계)",F.finalBod(bis.BOD),F.finalTp(bis.TP)],
     ["합  계","",F.finalBod(pt.BOD+bis.BOD),F.finalTp(pt.TP+bis.TP)]],
    [25,30,22,23]
  ));
  els.push(H.blank());
  return els;
}

function buildChapter4(docx){
  var H=makeH(docx);
  return H.chapterBox("제4장  부  록").concat([
    H.heading1("1. 건축물대장"),H.p("[건축물대장 첨부]",{size:H.SZ_SM}),H.blank(),
    H.heading1("2. 토지대장"),H.p("[토지대장 첨부]",{size:H.SZ_SM}),H.blank(),
    H.heading1("3. 건축도면"),H.p("[건축도면 첨부]",{size:H.SZ_SM}),H.blank(),
    H.heading1("4. 기술검증서"),H.p("[기술검증서 첨부]",{size:H.SZ_SM}),H.blank(),
    H.heading1("5. 인허가 증빙서류 등 기타"),H.p("[인허가 증빙서류 등 기타 첨부]",{size:H.SZ_SM}),H.blank()
  ]);
}

// ── generateDoc ──────────────────────────────────────────────────
function generateDoc(calcResult){
  if(!calcResult){
    calcResult=window.LAST_CALC_RESULT;
    if(!calcResult&&typeof runCalc==="function")calcResult=runCalc();
  }
  try{
    var _docx=(typeof docx!=="undefined")?docx:window.docx;
    if(!_docx)throw new Error("docx 라이브러리 로드 실패");
    var Document=_docx.Document,Packer=_docx.Packer;
    var pn=getVal("projectName"),sido=getVal("sidoSelect"),sigun=getVal("sigunSelect");
    var dong=getVal("dongSelect"),ri=getVal("riSelect");
    var loc=getVal("projectLocationDetail");
    var projectLocation=[sido,sigun,dong,ri,loc].filter(function(x){return!!x;}).join(" ");
    var year=getVal("yearSelect"),month=getVal("monthSelect");
    var 작성일자=(year&&month)?(year+". "+month+"."):"";;
    var sy=getVal("startYearSelect"),cy=getVal("completeYearSelect");
    var bizPeriodText=(sy&&cy)?(sy+"년 ~ "+cy+"년"):"";
    var ownerName=getVal("ownerName"),zoneMain=getVal("zoneMainSelect"),zoneSub=getVal("zoneSubSelect");
    var zoneText=zoneSub?(zoneMain+" / "+zoneSub):zoneMain;
    var bizType=getVal("bizTypeSelect");
    var areaTotalSite=formatNumberWithComma(getVal("areaTotalSite"));
    var areaBuildSite=formatNumberWithComma(getVal("areaBuildSite"));
    var areaRoadSite=formatNumberWithComma(getVal("areaRoadSite"));
    var areaGrossFloor=formatNumberWithComma(getVal("areaGrossFloor"));
    var roadLength=formatNumberWithComma(getVal("roadLength"));
    var roadWidth=formatNumberWithComma(getVal("roadWidth"));
    var envRiverEl=document.querySelector('input[name="env_river"]:checked');
    var envRiver=envRiverEl&&envRiverEl.value==="해당";
    var envWaterEl=document.querySelector('input[name="env_water"]:checked');
    var envWaterSource=envWaterEl&&envWaterEl.value==="해당";
    var envSpecialEl=document.querySelector('input[name="env_special"]:checked');
    var envSpecial=envSpecialEl?envSpecialEl.value:"none";
    var bizHistory=getVal("bizHistory"),writerName=getVal("writerName"),writerContact=getVal("writerContact");
    var unitBasin=getVal("unitBasinSelect");
    var urbanType=calcResult&&calcResult.params?calcResult.params.urbanType:"비시가화";
    var legalBasis=getVal("legalBasis");
    var legalDetail=getVal("legalDetail");

    var afterState=window.lifeAfter&&window.lifeAfter.state;
    var afterBldg=afterState&&afterState.buildings&&afterState.buildings[0];
    var afterMethod1=(afterBldg&&afterBldg.method1)||(afterState&&afterState.householdMethod1)||"개인하수처리시설";
    var afterMethod2=(afterBldg&&afterBldg.method2)||(afterState&&afterState.householdMethod2)||"";
    var afterPlantInfo=(typeof SEWAGE_PLANT_DB!=="undefined"&&afterMethod2)?SEWAGE_PLANT_DB.filter(function(p){return p.name===afterMethod2;})[0]:null;

    var data={
      projectName:pn,projectLocation:projectLocation,작성일자:작성일자,bizPeriodText:bizPeriodText,
      ownerName:ownerName,zoneText:zoneText,bizType:bizType,completeYear:cy,startYear:sy,
      areaTotalSite:areaTotalSite,areaBuildSite:areaBuildSite,areaRoadSite:areaRoadSite,areaGrossFloor:areaGrossFloor,
      roadLength:roadLength,roadWidth:roadWidth,
      envRiver:envRiver,envWaterSource:envWaterSource,envSpecial:envSpecial,
      bizHistory:bizHistory,writerName:writerName,writerContact:writerContact,unitBasin:unitBasin,
      legalBasis:legalBasis,legalDetail:legalDetail,
      afterMethod1:afterMethod1,
      afterPlantName:afterPlantInfo?afterPlantInfo.name:(afterMethod2||""),
      afterEfflBOD:afterPlantInfo?afterPlantInfo.efflBOD:null,
      afterEfflTP:afterPlantInfo?afterPlantInfo.efflTP:null,
      afterCapacity:afterPlantInfo?afterPlantInfo.capacity:"",
      afterProcessMethod:"FRP 호기성생물학적방법",techCertNo:"[기술검증번호]",calcResult:calcResult
    };

    var coverSection=buildCoverSection(_docx,data);
    var H=makeH(_docx);

    var bodyChildren=[].concat(
      buildTocBlock(_docx),
      [H.pageBreak()],
      buildChapter1(_docx,data),
      [H.pageBreak()],
      buildChapter2(_docx,data),
      [H.pageBreak()],
      buildChapter3(_docx,calcResult,envRiver,urbanType,unitBasin),
      [H.pageBreak()],
      buildChapter4(_docx)
    );

    var _PageNumber=_docx.PageNumber;
    var _pageFooter=new _docx.Footer({children:[
      new _docx.Paragraph({
        alignment:_docx.AlignmentType.CENTER,
        children:[new _docx.TextRun({children:[_PageNumber.CURRENT],font:"맑은 고딕",size:20})]
      })
    ]});
    var bodySection={
      properties:{page:{margin:{top:MARGIN_TOP,bottom:MARGIN_BOTTOM,left:MARGIN_LEFT,right:MARGIN_RIGHT}}},
      footers:{default:_pageFooter},
      children:bodyChildren
    };
    var doc=new Document({
      sections:[coverSection,bodySection],
      settings:{updateFields:true}
    });
    Packer.toBlob(doc).then(function(blob){
      saveAs(blob,(typeof CONFIG!=="undefined"?CONFIG.DOCX_FILENAME:"수질오염총량검토서.docx"));
    });
  }catch(err){
    console.error("[word-gen.js]",err);
    alert("Word 생성 중 오류가 발생했습니다.\n\n"+(err&&err.message?err.message:String(err)));
  }
}

window.generateDoc=generateDoc;
