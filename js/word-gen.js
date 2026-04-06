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
  bodDelta:function(v){if(typeof v!=="number"||!isFinite(v))return"0.00";return v<=0.005?(v.toFixed(2)+"(≒0.00)"):v.toFixed(2);},
  tpDelta:function(v){if(typeof v!=="number"||!isFinite(v))return"0.000";return v<=0.0005?(v.toFixed(3)+"(≒0.000)"):v.toFixed(3);},
  area:function(v){return(typeof v==="number"&&isFinite(v))?v.toFixed(2):"-";}
};

function getVal(id,fb){
  if(fb===undefined)fb="";
  var el=document.getElementById(id);
  return el?(el.value!=null?el.value:fb):fb;
}

function useLabel(r){
  if(r.minor)return r.minor;
  if(r.mid)return r.mid;
  return r.major||"";
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
  var SZ=21,SZ_TBL=20,SZ_HDR=16,SZ_SM=18,SZ_H1=26,SZ_H2=24,SZ_H3=22,SZ_H4=21;
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
    return new Paragraph({pageBreakBefore:true,children:[new TextRun({text:"",font:FONT,size:SZ})]});
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
    var hdrCells=headers.map(function(h,i){
      return tc(p(String(h),{center:true,bold:true,size:SZ_HDR}),{w:colWidths[i]});
    });
    var hdrRow=new TableRow({tableHeader:true,children:hdrCells});
    var dataRows=rows.map(function(row){
      var cells=row.map(function(cell,i){
        return tc(p(String(cell!=null?cell:""),{center:i>0,size:SZ_TBL}),{w:colWidths[i]});
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

  function heading1(t){return new Paragraph({style:"Heading1",spacing:SP_H1,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H1})]});}
  function heading2(t){return new Paragraph({style:"Heading2",spacing:SP_H2,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H2})]});}
  function heading3(t){return new Paragraph({style:"Heading3",spacing:SP_H3,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H3})]});}
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
    return [box,line];
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
    heading1:heading1,heading2:heading2,heading3:heading3,heading4:heading4,
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
      els.push(new docx.TableOfContents("목  차",{headingStyleRange:"1-4",hyperlink:true}));
      return els;
    }catch(e){}
  }
  if(typeof docx.SimpleField==="function"){
    try{
      els.push(new Paragraph({spacing:{before:0,after:0},children:[new docx.SimpleField(' TOC \\o "1-4" \\h \\z \\u ')]}));
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
        tc2(ap(F.bod(fBOD)),{w:cwDxa[3]}),tc2(ap(F.bod(bBOD)),{w:cwDxa[4]}),
        tc2(ap(F.tp(fTP)),{w:cwDxa[5]}),tc2(ap(F.tp(bTP)),{w:cwDxa[6]})
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
      new TableRow2({height:{value:ROW},children:[
        cell2(p2("비점오염\n저감계획",true),{rs:3,w:1157}),
        cell2(p2("종류",true),{w:1446}),
        cell2(p2("적용면적",true),{w:1446}),
        cell2(p2("처리용량",true),{w:1446}),
        cell2(p2("삭감량(kg/일)",true),{cs:2,w:2698})
      ]}),
      new TableRow2({height:{value:ROW},children:[
        cell2(p2(""),{w:1157}),
        cell2(p2(""),{w:1446}),
        cell2(p2(""),{w:1446}),
        new TableCell2({children:[p2("BOD",true)],width:{size:1349,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("T-P",true)],width:{size:1349,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER})
      ]}),
      new TableRow2({height:{value:ROW},children:[
        cell2(p2(""),{w:1157}),
        cell2(p2("-",true),{w:1446}),
        cell2(p2("-",true),{w:1446}),
        new TableCell2({children:[p2("-",true)],width:{size:1349,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("-",true)],width:{size:1349,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER})
      ]})
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

  els.push(H.heading1("2. 수질오염총량검토 실시근거"));
  var legalBasis=data.legalBasis||"◦ 한강수계 상수원수질개선 및 주민지원 등에 관한 법률 제8조의2\n◦ 수질오염총량관리기술지침(국립환경과학원)\n◦ 환경영향평가법 제59조 및 제61조제2항 관련 [별표4]";
  els.push(H.p(legalBasis,{size:H.SZ_SM}));
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
  function pp2(t,o){o=o||{};return H.p(t,{center:o.center||false,bold:o.bold||false,size:o.size||H.SZ_TBL});}
  var basisTable=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},borders:H.TBLB,
    rows:[
      new TableRow({children:[cell2(pp2("구  분",{center:true,bold:true}),{wPct:20}),cell2(pp2("소규모환경영향평가 대상사업의 종류·규모",{center:true,bold:true}),{wPct:60}),cell2(pp2("협의요청시기",{center:true,bold:true}),{wPct:20})]}),
      new TableRow({children:[cell2(pp2(data.bizType||"소규모환경영향평가",{center:true}),{wPct:20}),cell2(pp2(data.legalDetail||"[해당 법령 및 규모 기재]")),cell2(pp2("사업의 승인등 전",{center:true}),{wPct:20})]}),
      new TableRow({children:[cell2(pp2("사업면적",{center:true}),{wPct:20}),cell2(pp2(data.areaTotalSite?"전체부지 "+data.areaTotalSite+"㎡":"전체부지 - ㎡"),{cs:1})]})
    ]
  });
  els.push(basisTable);
  els.push(H.blank());

  els.push(H.heading1("3. 계획의 추진경위 및 계획"));
  els.push(H.inputBox("[ 추진경위를 입력하세요 ]\n예시)\n◦ 20XX.XX.XX : 개발행위허가 신청\n◦ 20XX.XX.XX : 소규모환경영향평가 접수"));
  els.push(H.blank());

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
  els.push(H.note("※ 단위: ㎡, (%)"));
  els.push(H.simpleTable(
    ["구분","면적(㎡)","비율(%)","비고"],
    [["건  물","","",""],["조경녹지","","",""],["사면녹지","","","씨드스프레이, 코아네트"],
     ["원형보전녹지","","","절·성토 행위 없음"],["단지내도로","","","아스콘포장 T=15cm"],
     ["주차장","","",""],["불투수포장","","","아스콘포장 T=15cm"],["기  타","","",""],
     ["합  계","","100.0",""]],
    [25,25,20,30]
  ));
  els.push(H.blank());
  els.push(H.heading2("(8) 건축개요"));
  els.push(H.simpleTable(
    ["구분","동","층","용도","면적(㎡)","단위","비고"],
    [["","①","지상1층","","","㎡",""],["","②","지상1층","","","㎡",""],["소  계","","","","","㎡",""],["합  계","","","","","㎡",""]],
    [12,8,10,20,15,10,25]
  ));
  els.push(H.blank());
  els.push(H.heading2("(9) 단위유역 현황도 및 사업지 위치"));
  els.push(H.p("◦ 단위유역 : "+unitBasin,{size:H.SZ_SM}));
  els.push(H.imagePlaceholder("[ 단위유역 현황도를 삽입하고, 사업지 위치를 표시하세요 ]",6000));
  els.push(H.blank());
  return els;
}

// ── 제3장: 부하량 산정 ───────────────────────────────────────────

// ★ 수정9: 기술지침 원단위 참조표 (표 VI-1)
function buildLifeStdTable(H,urbanType){
  var ut=urbanType||"비시가화";
  var CC=window.CALC_CONSTS||{};
  var fecesUnit=(CC.FECES_FLOW_UNIT&&CC.FECES_FLOW_UNIT[ut])||0.00134;
  var bizFecesRatio=CC.BIZ_FECES_RATIO||0.006;
  var grayConvRate=CC.GRAY_CONV_RATE||0.88;
  var els=[];
  els.push(H.tableTitle("<표 VI-1> 생활계 분뇨발생유량원단위, 분뇨발생유량비 및 잡배수오수전환율"));
  els.push(H.simpleTable(
    ["구분","가정인구 분뇨발생유량원단위\n(㎥/인/일)","영업인구 분뇨발생유량비\n(-)","잡배수오수전환율\n(-)"],
    [
      ["시가화",CC.FECES_FLOW_UNIT?CC.FECES_FLOW_UNIT["시가화"]:0.00115,CC.BIZ_FECES_RATIO||0.006,CC.GRAY_CONV_RATE||0.88],
      ["비시가화",CC.FECES_FLOW_UNIT?CC.FECES_FLOW_UNIT["비시가화"]:0.00134,CC.BIZ_FECES_RATIO||0.006,CC.GRAY_CONV_RATE||0.88],
      ["적용("+ut+")",fecesUnit,bizFecesRatio,grayConvRate]
    ],
    [25,25,25,25]
  ));
  els.push(H.note("자료) 수질오염총량관리기술지침, 2019.3, 국립환경과학원"));
  els.push(H.blank());
  return els;
}

function buildLifeCalcDetail(docx,H,lifeData,isWaterBuffer,urbanType,phase){
  var els=[];
  var ut=urbanType||"비시가화";
  var CC=window.CALC_CONSTS||{};
  var fecesUnit=(CC.FECES_FLOW_UNIT&&CC.FECES_FLOW_UNIT[ut])||0.00134;
  var bizFecesRatio=CC.BIZ_FECES_RATIO||0.006;
  var grayConvRate=CC.GRAY_CONV_RATE||0.88;
  var waterSupply=(CC.WATER_SUPPLY&&CC.WATER_SUPPLY[ut])||170;
  var hh=lifeData.가정인구;
  var biz=lifeData.영업인구;

  if(hh){
    els.push(H.heading4("가. 가정인구"));
    els.push(H.p("◦ 계획인구 : "+Math.round(hh.population)+"인",{size:H.SZ_SM}));
    els.push(H.blank());
    // ★ 수정9: 가정인구 오수발생유량 산정표
    els.push(H.tableTitle("[표] 가정인구 오수발생유량 산정 (기술지침 표 Ⅵ-1 적용)"));
    els.push(H.simpleTable(
      ["구분","계획인구\n(인)","급수원단위\n(L/인/일)","일평균급수량\n(㎥/일)","분뇨발생유량원단위\n(㎥/인/일)","분뇨발생유량\n(㎥/일)","잡배수오수전환율\n(-)","오수발생유량\n(㎥/일)"],
      [["가정인구",Math.round(hh.population),F.f2(waterSupply),F.f4(hh.일평균급수량||0),fecesUnit,F.f7(hh.분뇨발생유량||0),grayConvRate,F.f4(hh.오수발생유량||0)]],
      [10,10,11,12,15,12,13,13]
    ));
    els.push(H.blank());
    var bodUnit=CC.HH_LOAD_UNIT&&CC.HH_LOAD_UNIT[ut]?CC.HH_LOAD_UNIT[ut].BOD:48.6;
    var tpUnit=CC.HH_LOAD_UNIT&&CC.HH_LOAD_UNIT[ut]?CC.HH_LOAD_UNIT[ut].TP:1.45;
    var R=CC.FECES_LOAD_RATIO||{BOD:0.45,TN:0.8,TP:0.8};
    // ★ 수정9: 가정인구 발생부하량 산정표 (분뇨비, 잡배수비 포함)
    els.push(H.tableTitle("[표] 가정인구 발생부하량 산정 (단위: kg/일)"));
    els.push(H.simpleTable(
      ["구분","인구수\n(인)","BOD원단위\n(g/인/일)","발생BOD\n(kg/일)","분뇨발생비\n(BOD:"+R.BOD+")","분뇨BOD\n(kg/일)","잡배수BOD\n(kg/일)","T-P원단위\n(g/인/일)","발생T-P\n(kg/일)"],
      [["가정인구",Math.round(hh.population),bodUnit,F.f4(hh.발생부하량?hh.발생부하량.BOD:0),R.BOD,F.f4(hh.분뇨발생부하량?hh.분뇨발생부하량.BOD:0),F.f4(hh.잡배수발생부하량?hh.잡배수발생부하량.BOD:0),tpUnit,F.f4(hh.발생부하량?hh.발생부하량.TP:0)]],
      [9,9,9,9,9,9,9,9,9]
    ));
    els.push(H.blank());
    els=els.concat(buildDischargeCalc(docx,H,lifeData,phase,isWaterBuffer,"가정"));
  }

  if(biz&&biz.rows&&biz.rows.length){
    els.push(H.heading4("나. 영업인구"));
    els.push(H.p("◦ 영업인구 오수발생량 산정 : 건축물 용도별 오수발생량 원단위 적용",{size:H.SZ_SM}));
    // ★ 수정9: 영업인구 분뇨발생비/잡배수비 참조표
    els.push(H.p("◦ 영업인구 분뇨발생유량비 = "+bizFecesRatio+", 잡배수오수전환율 = "+grayConvRate,{size:H.SZ_SM}));
    els.push(H.blank());

    // ★ 수정8: 공용면적 있는 경우 연면적/배분면적 열 분리 여부 판단
    var hasCommon=biz.rows.some(function(r){return r.공용배분&&r.공용배분>0;});

    var headers,bizRows;
    if(hasCommon){
      headers=["위치","용도","연면적\n(㎡)","배분면적\n(㎡)","적용면적\n(㎡)","오수원단위\n(L/㎡·일)","오수발생량\n(㎥/일)","분뇨발생량\n(㎥/일)","분뇨발생량비\n(-)","잡배수발생량\n(㎥/일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"];
      bizRows=biz.rows.map(function(r){
        return[r.buildingNo+"동 "+r.floorNo+"층",useLabel(r),
          F.area(r.전용면적||r.적용면적),F.area(r.공용배분||0),F.area(r.적용면적),
          r.오수발생원단위||"-",F.f4(r.오수발생유량||0),F.f7(r.분뇨발생유량||0),
          bizFecesRatio,F.f4(r.잡배수발생유량||0),
          F.f4(r.발생부하량?r.발생부하량.BOD:0),F.f4(r.발생부하량?r.발생부하량.TP:0)];
      });
      bizRows.push(["합  계","","","","",""
        ,F.f4(biz.합계?biz.합계.오수발생유량:0),"-","-","-",
        F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.BOD:0),
        F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.TP:0)]);
      els.push(H.tableTitle("[표] 영업인구 오수발생량 산정 (연면적/배분면적 포함)"));
      els.push(H.simpleTable(headers,bizRows,[8,8,8,8,8,8,8,8,8,8,9,9]));
    } else {
      headers=["위치","용도","면적/인원","오수원단위\n(L/㎡·일)","오수발생량\n(㎥/일)","분뇨발생량\n(㎥/일)","분뇨발생량비\n(-)","잡배수발생량\n(㎥/일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"];
      bizRows=biz.rows.map(function(r){
        return[r.buildingNo+"동 "+r.floorNo+"층",useLabel(r),
          F.area(r.적용면적)+(r.unitType==="area"?"㎡":"인"),
          r.오수발생원단위||"-",F.f4(r.오수발생유량||0),F.f7(r.분뇨발생유량||0),
          bizFecesRatio,F.f4(r.잡배수발생유량||0),
          F.f4(r.발생부하량?r.발생부하량.BOD:0),F.f4(r.발생부하량?r.발생부하량.TP:0)];
      });
      bizRows.push(["합  계","","","",F.f4(biz.합계?biz.합계.오수발생유량:0),"-","-","-",
        F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.BOD:0),
        F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.TP:0)]);
      els.push(H.tableTitle("[표] 영업인구 오수발생량 산정"));
      els.push(H.simpleTable(headers,bizRows,[9,9,10,10,9,9,9,9,9,9]));
    }
    els.push(H.blank());
    els=els.concat(buildDischargeCalc(docx,H,lifeData,phase,isWaterBuffer,"영업"));
  }

  var totSewage=(hh?hh.오수발생유량||0:0)+(biz&&biz.합계?biz.합계.오수발생유량||0:0);
  var totFeces=(hh?hh.분뇨발생유량||0:0)+(biz&&biz.rows?biz.rows.reduce(function(s,r){return s+(r.분뇨발생유량||0);},0):0);
  var totGray=(hh?hh.잡배수발생유량||0:0)+(biz&&biz.rows?biz.rows.reduce(function(s,r){return s+(r.잡배수발생유량||0);},0):0);
  if(hh&&biz&&biz.rows&&biz.rows.length){
    els.push(H.heading4("다. 생활계 합계"));
    els.push(H.simpleTable(
      ["구분","분뇨발생유량\n(㎥/일)","잡배수발생유량\n(㎥/일)","오수발생유량\n(㎥/일)"],
      [["가정인구",F.f7(hh.분뇨발생유량||0),F.f4(hh.잡배수발생유량||0),F.f4(hh.오수발생유량||0)],
       ["영업인구",F.f7(biz.합계?biz.합계.오수발생유량*bizFecesRatio:0),F.f4(biz.합계?biz.합계.오수발생유량*(1-bizFecesRatio)*grayConvRate:0),F.f4(biz.합계?biz.합계.오수발생유량:0)],
       ["합  계",F.f7(totFeces),F.f4(totGray),F.f4(totSewage)]],
      [25,25,25,25]
    ));
    els.push(H.blank());
  }
  return els;
}

function buildDischargeCalc(docx,H,life,phase,isWaterBuffer,category){
  var els=[];
  if(!life)return els;
  var rows=(life.영업인구&&life.영업인구.rows)||[];
  var hh=life.가정인구;
  var pubRows=rows.filter(function(r){return(r.처리장정보&&r.처리장정보.name)||r.sewageMethod1==="공공하수처리시설";});
  var indRows=rows.filter(function(r){return r.sewageMethod1==="개인하수처리시설";});
  var sepRows=rows.filter(function(r){return r.sewageMethod1==="정화조";});
  var isHH=(category==="가정");

  if(isHH){
    if(hh&&hh.처리장정보&&hh.처리장정보.name){
      var pn=hh.처리장정보.name,eB=hh.처리장정보.efflBOD,eT=hh.처리장정보.efflTP;
      var pF=hh.관거이송량||0;
      // ★ 수정7: 표 제목에 하수처리시설명 포함
      els.push(H.tableTitle("[표] "+pn+" 관거배출부하량 산정"));
      els.push(H.p("◦ 발생오수는 "+pn+"으로 유입·처리됩니다.",{size:H.SZ_SM}));
      els.push(H.blank());
      // 관거비 표 (첫열 제거)
      var leakB=hh.처리장정보.leakRatioBOD||0,leakT=hh.처리장정보.leakRatioTP||0;
      var ovB=hh.처리장정보.overflowRatioBOD||0,ovT=hh.처리장정보.overflowRatioTP||0;
      var unB=hh.처리장정보.untreatRatioBOD||0,unT=hh.처리장정보.untreatRatioTP||0;
      els.push(H.simpleTable(
        ["관거이송유량\n(㎥/일)","누수비BOD","월류비BOD","미처리배제비BOD","방류농도BOD\n(mg/L)","방류농도T-P\n(mg/L)","방류부하량BOD\n(kg/일)","방류부하량T-P\n(kg/일)"],
        [[F.f4(pF),F.f4(leakB),F.f4(ovB),F.f4(unB),String(eB),String(eT),F.f4(hh.방류부하량?hh.방류부하량.BOD:0),F.f4(hh.방류부하량?hh.방류부하량.TP:0)]],
        [14,10,10,12,10,10,12,12]
      ));
    } else if(hh&&hh.개인처리기준){
      var std=hh.개인처리기준.std||{BOD:20,TP:4};
      els.push(H.tableTitle("[표] 개인오수처리시설 배출부하량 산정"));
      els.push(H.p("◦ 개인오수처리시설 방류수질기준 : BOD "+std.BOD+"mg/L, T-P "+std.TP+"mg/L",{size:H.SZ_SM}));
      els.push(H.blank());
      els.push(H.simpleTable(
        ["오수발생량\n(㎥/일)","방류농도BOD\n(mg/L)","방류농도T-P\n(mg/L)","배출부하량BOD\n(kg/일)","배출부하량T-P\n(kg/일)"],
        [[F.f4(hh.오수발생유량||0),String(std.BOD),String(std.TP),F.f4(hh.배출부하량?hh.배출부하량.BOD:0),F.f4(hh.배출부하량?hh.배출부하량.TP:0)]],
        [20,20,20,20,20]
      ));
    }
  } else {
    if(pubRows.length>0){
      var ppn=(pubRows[0].처리장정보&&pubRows[0].처리장정보.name)||"-";
      var peB=pubRows[0].처리장정보?pubRows[0].처리장정보.efflBOD:"-";
      var peT=pubRows[0].처리장정보?pubRows[0].처리장정보.efflTP:"-";
      var pBOD=pubRows.reduce(function(s,r){return s+(r.방류부하량?r.방류부하량.BOD:0);},0);
      var pTP=pubRows.reduce(function(s,r){return s+(r.방류부하량?r.방류부하량.TP:0);},0);
      var pFL=pubRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
      // ★ 수정7: 표 제목에 처리시설명
      els.push(H.tableTitle("[표] "+ppn+" 관거배출부하량 산정"));
      els.push(H.p("◦ 발생오수는 "+ppn+"으로 유입·처리됩니다.",{size:H.SZ_SM}));
      els.push(H.blank());
      els.push(H.simpleTable(
        ["관거이송유량\n(㎥/일)","방류농도BOD\n(mg/L)","방류농도T-P\n(mg/L)","방류부하량BOD\n(kg/일)","방류부하량T-P\n(kg/일)"],
        [[F.f4(pFL),String(peB),String(peT),F.f4(pBOD),F.f4(pTP)]],
        [20,20,20,20,20]
      ));
    }
    if(indRows.length>0){
      var std2=indRows[0].개인처리기준&&indRows[0].개인처리기준.std||{BOD:20,TP:4};
      var iB=indRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.BOD:0);},0);
      var iT=indRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.TP:0);},0);
      var iFL=indRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
      els.push(H.tableTitle("[표] 개인오수처리시설 배출부하량 산정"));
      els.push(H.p("◦ 개인오수처리시설 방류수질기준 : BOD "+std2.BOD+"mg/L, T-P "+std2.TP+"mg/L",{size:H.SZ_SM}));
      els.push(H.blank());
      els.push(H.simpleTable(
        ["오수발생량\n(㎥/일)","방류농도BOD\n(mg/L)","방류농도T-P\n(mg/L)","배출부하량BOD\n(kg/일)","배출부하량T-P\n(kg/일)"],
        [[F.f4(iFL),String(std2.BOD),String(std2.TP),F.f4(iB),F.f4(iT)]],
        [20,20,20,20,20]
      ));
    }
    if(sepRows.length>0){
      var sB=sepRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.BOD:0);},0);
      var sT=sepRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.TP:0);},0);
      var sFL=sepRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
      var gBOD=sepRows.reduce(function(s,r){return s+(r.발생부하량?r.발생부하량.BOD:0);},0);
      els.push(H.tableTitle("[표] 정화조 배출부하량 산정"));
      els.push(H.p("◦ 정화조 처리 배출부하량 (BOD 25% 개별삭감 적용)",{size:H.SZ_SM}));
      els.push(H.blank());
      els.push(H.simpleTable(
        ["오수발생량\n(㎥/일)","발생BOD\n(kg/일)","개별삭감BOD\n(25%)","배출BOD\n(kg/일)","배출T-P\n(kg/일)"],
        [[F.f4(sFL),F.f4(gBOD),F.f4(gBOD*0.25),F.f4(sB),F.f4(sT)]],
        [20,20,20,20,20]
      ));
    }
  }
  var td=life.합계?life.합계.배출부하량:null;
  if(td&&isHH){
    els.push(H.blank());
    els.push(H.tableTitle("[표] 생활계 배출부하량 (가정인구)"));
    els.push(H.simpleTable(
      ["구분","점오염 BOD\n(kg/일)","점오염 T-P\n(kg/일)","비점오염 BOD\n(kg/일)","비점오염 T-P\n(kg/일)"],
      [["가정인구 배출부하량",F.f4(td.BOD),F.f4(td.TP),"-","-"]],
      [25,19,19,19,18]
    ));
  }
  return els;
}

function buildChapter3(docx,calcResult,envRiver,urbanType,unitBasin){
  var H=makeH(docx);
  var els=[];
  els=els.concat(H.chapterBox("제3장  부하량 산정"));

  var before=calcResult&&calcResult.생활계?calcResult.생활계.사업전:null;
  var after=calcResult&&calcResult.생활계?calcResult.생활계.사업후:null;

  // ★ 수정9: 기술지침 원단위 표 먼저 제시
  els=els.concat(buildLifeStdTable(H,urbanType));

  els.push(H.heading1("1. 생활계"));
  els.push(H.heading2("가. 사업시행 전"));
  if(!before||(!before.가정인구&&!(before.영업인구&&before.영업인구.rows&&before.영업인구.rows.length))){
    els.push(H.p("◦ 본 사업부지는 사업시행 전 점오염원(생활계)에 의한 배출부하량은 없는 것으로 조사되었습니다."));
  } else {
    els=els.concat(buildLifeCalcDetail(docx,H,before,envRiver,urbanType,"before"));
  }

  els.push(H.heading2("나. 사업시행 후"));
  if(!after||(!after.가정인구&&!(after.영업인구&&after.영업인구.rows&&after.영업인구.rows.length))){
    els.push(H.p("◦ 사업시행 후 생활계 배출부하량은 없는 것으로 산정됩니다."));
  } else {
    els=els.concat(buildLifeCalcDetail(docx,H,after,envRiver,urbanType,"after"));
  }

  var bD=(before&&before.합계&&before.합계.배출부하량)||{BOD:0,TP:0};
  var aD=(after&&after.합계&&after.합계.배출부하량)||{BOD:0,TP:0};
  var dB=aD.BOD-bD.BOD,dT=aD.TP-bD.TP;
  els.push(H.heading2("생활계 배출부하량 총괄"));
  els.push(H.p("◦ 생활계 총 배출부하량은 사업시행 후 BOD "+F.f4(aD.BOD)+"kg/일, T-P "+F.f4(aD.TP)+"kg/일, 사업시행 전 BOD "+F.f4(bD.BOD)+"kg/일, T-P "+F.f4(bD.TP)+"kg/일로 산정됩니다.",{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.tableTitle("[표] 생활계 배출부하량 총괄 (단위: kg/일)"));
  els.push(H.simpleTable(
    ["구분","사업시행 후 ①\n(kg/일)","사업시행 전 ②\n(kg/일)","최종 배출(①-②)\n(kg/일)"],
    [["BOD(점오염)",F.f4(aD.BOD),F.f4(bD.BOD),F.bodDelta(dB)],["T-P(점오염)",F.f4(aD.TP),F.f4(bD.TP),F.tpDelta(dT)]],
    [25,25,25,25]
  ));
  els.push(H.note("주) 최종 배출부하량이 음수인 경우 ≒0.00으로 처리"));
  els.push(H.blank());

  // ── 2. 토지계 ──
  els.push(H.heading1("2. 토지계"));
  var lB=null,lA=null;
  if(calcResult&&calcResult.토지계){lB=calcResult.토지계.사업전||null;lA=calcResult.토지계.사업후||null;}

  els.push(H.heading2("가. 사업시행 전"));
  els.push(H.p("◦ 비점오염원 발생부하량 = 지목별 면적 × 지목별 연평균발생부하원단위",{size:H.SZ_SM}));
  var lBrows=(lB&&lB.rows&&lB.rows.length)?lB.rows:[];
  if(lBrows.length){
    var bR=lBrows.map(function(r){return[r.jmok,F.area(r.area),F.f2(r.원단위.BOD),F.f2(r.원단위.TP),F.f4(r.발생부하량.BOD),F.f4(r.발생부하량.TP)];});
    bR.push(["합  계",F.area(lBrows.reduce(function(s,r){return s+r.area;},0)),"","",F.f4(lB.합계.발생부하량.BOD),F.f4(lB.합계.발생부하량.TP)]);
    els.push(H.blank());
    els.push(H.tableTitle("[표] 사업시행 전 토지계 발생부하량 (단위: kg/일)"));
    els.push(H.simpleTable(["지목","편입면적\n(㎡)","BOD원단위\n(kg/㎢·일)","T-P원단위\n(kg/㎢·일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"],bR,[14,17,17,17,18,17]));
  } else {
    els.push(H.p("◦ 사업시행 전 토지계 발생부하량은 없는 것으로 조사되었습니다."));
  }
  els.push(H.blank());

  els.push(H.heading2("나. 사업시행 후"));
  var lArows=(lA&&lA.rows&&lA.rows.length)?lA.rows:[];
  if(lArows.length){
    var aR=lArows.map(function(r){return[r.jmok,F.area(r.area),F.f2(r.원단위.BOD),F.f2(r.원단위.TP),F.f4(r.발생부하량.BOD),F.f4(r.발생부하량.TP)];});
    aR.push(["합  계",F.area(lArows.reduce(function(s,r){return s+r.area;},0)),"","",F.f4(lA.합계.발생부하량.BOD),F.f4(lA.합계.발생부하량.TP)]);
    els.push(H.blank());
    els.push(H.tableTitle("[표] 사업시행 후 토지계 발생부하량 (단위: kg/일)"));
    els.push(H.simpleTable(["지목","편입면적\n(㎡)","BOD원단위\n(kg/㎢·일)","T-P원단위\n(kg/㎢·일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"],aR,[14,17,17,17,18,17]));
    els.push(H.blank());
    els.push(H.tableTitle("[표] 토지계 배출부하량 산정"));
    els.push(H.simpleTable(
      ["구분","발생BOD\n(kg/일)","삭감량BOD","배출BOD\n(kg/일)","발생T-P\n(kg/일)","배출T-P\n(kg/일)"],
      [["비점오염",F.f4(lA.합계.발생부하량.BOD),"-",F.f4(lA.합계.배출부하량.BOD),F.f4(lA.합계.발생부하량.TP),F.f4(lA.합계.배출부하량.TP)]],
      [16,17,17,17,17,16]
    ));
  } else {
    els.push(H.p("◦ 사업시행 후 발생하는 토지계 부하량은 없는 것으로 산정됩니다."));
  }

  var tbB=(lB&&lB.합계&&lB.합계.배출부하량)?lB.합계.배출부하량.BOD:0;
  var tbT=(lB&&lB.합계&&lB.합계.배출부하량)?lB.합계.배출부하량.TP:0;
  var taB=(lA&&lA.합계&&lA.합계.배출부하량)?lA.합계.배출부하량.BOD:0;
  var taT=(lA&&lA.합계&&lA.합계.배출부하량)?lA.합계.배출부하량.TP:0;
  els.push(H.blank());
  els.push(H.heading2("토지계 배출부하량 총괄"));
  els.push(H.tableTitle("[표] 토지계 배출부하량 총괄 (단위: kg/일)"));
  els.push(H.simpleTable(
    ["구분","사업전 ①\n(kg/일)","사업후 ②\n(kg/일)","삭감량 ③\n(kg/일)","최종배출(②-①-③)\n(kg/일)"],
    [["BOD("+(unitBasin||"단위유역")+", 비점)",F.f4(tbB),F.f4(taB),"-",F.bodDelta(taB-tbB)],
     ["T-P("+(unitBasin||"단위유역")+", 비점)",F.f4(tbT),F.f4(taT),"-",F.tpDelta(taT-tbT)]],
    [22,19,19,16,24]
  ));
  els.push(H.note("주) 증감이 음수인 경우 ≒0.00으로 처리"));
  els.push(H.blank());

  // ── 3. 최종배출부하량 ──
  els.push(H.heading1("3. 최종배출부하량"));
  var pt=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.점오염)||{BOD:0,TP:0};
  var bis=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.비점오염)||{BOD:0,TP:0};
  els.push(H.p("◦ 금회 사업으로 인한 점오염원(생활계) 최종 배출부하량은 BOD "+F.bod(pt.BOD)+"kg/일, T-P "+F.tp(pt.TP)+"kg/일이며, 비점오염원(토지계) 최종 배출부하량은 BOD "+F.bod(bis.BOD)+"kg/일, T-P "+F.tp(bis.TP)+"kg/일로 산정되었습니다.",{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.tableTitle("[표] 최종 배출부하량 (단위: kg/일)"));
  els.push(H.simpleTable(
    ["구분","배출원","BOD\n(kg/일)","T-P\n(kg/일)"],
    [[unitBasin||"-","점오염(생활계)",F.bod(pt.BOD),F.tp(pt.TP)],
     [unitBasin||"-","비점오염(토지계)",F.bod(bis.BOD),F.tp(bis.TP)],
     ["합  계","",F.bod(pt.BOD+bis.BOD),F.tp(pt.TP+bis.TP)]],
    [25,30,22,23]
  ));
  els.push(H.blank());
  return els;
}

// ── 제4장: 부록 ──────────────────────────────────────────────────
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
    var loc=getVal("projectLocationDetail");
    var projectLocation=[sido,sigun,loc].filter(function(x){return!!x;}).join(" ");
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

    var bodySection={
      properties:{page:{margin:{top:MARGIN_TOP,bottom:MARGIN_BOTTOM,left:MARGIN_LEFT,right:MARGIN_RIGHT}}},
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
