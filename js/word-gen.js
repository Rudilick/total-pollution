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
      new TableRow2({height:{value:ROW},children:[cell2(p2("T-P",true),{wPct:21}),cell2(p2(""),{wPct:23,borders:cb2({right:non2})}),cell2(p2("mg/L"),{wPct:15,borders:cb2({left:non2})})]})
    ]
  });

  // 비점오염저감계획 - 별도 독립 표 (tblGrid 독립 적용으로 BOD/T-P 동일 너비 보장)
  var W_NONPOINT = 9638;
  var W1n = Math.round(W_NONPOINT * 0.12); // 비점오염: 12%
  var W2n = Math.round(W_NONPOINT * 0.15); // 종류/적용면적/처리용량: 15%씩
  var W3n = Math.round((W_NONPOINT - W1n - W2n*3) / 2); // 삭감량 BOD: 나머지 절반
  var W4n = W_NONPOINT - W1n - W2n*3 - W3n;             // 삭감량 T-P: 나머지
  var jeogamNonpointTable = new Table2({
    width:{size:100,type:WidthType.PERCENTAGE},
    columnWidths:[W1n, W2n, W2n, W2n, W3n, W4n],
    borders:H.TBLB,
    rows:[
      new TableRow2({height:{value:ROW},children:[
        new TableCell2({children:[p2("비점오염\n저감계획",true)],rowSpan:3,width:{size:W1n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("종류",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("적용면적",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("처리용량",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("삭감량(kg/일)",true)],columnSpan:2,width:{size:W3n+W4n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER})
      ]}),
      new TableRow2({height:{value:ROW},children:[
        new TableCell2({children:[p2("",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("BOD",true)],width:{size:W3n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("T-P",true)],width:{size:W4n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER})
      ]}),
      new TableRow2({height:{value:ROW},children:[
        new TableCell2({children:[p2("",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("-",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("-",true)],width:{size:W2n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("-",true)],width:{size:W3n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER}),
        new TableCell2({children:[p2("-",true)],width:{size:W4n,type:WidthType.DXA},borders:H.CELLB,verticalAlign:VerticalAlign.CENTER})
      ]})
    ]
  });

  return H.chapterBox("제1장  총  괄").concat([
    H.heading1("1. 사업의 개요"),mainTable,
    H.blank(),
    H.heading1("2. 할당부하량"),allotTable,H.blank(),
    H.pageBreak(),
    H.heading1("3. 저감계획"),jeogamTable,jeogamNonpointTable,H.blank()
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
                var row=multiBuilding?[bldg.buildingNo+"동",floor.floorNo+"층",use.mid||use.major||"",area.toFixed(2)]:
                                      [floor.floorNo+"층",use.mid||use.major||"",area.toFixed(2)];
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
// ── 기술지침 원단위 참조표 (사용안함) ───────────────────────────
function buildLifeStdTable(H,urbanType){
  return []; // 불필요하여 제거
}

// ── 가정인구 오수발생량 표 ───────────────────────────────────────
function buildHHSewageTable(H,hh,households,popUnit,urbanType,phase){
  var ut=urbanType||"비시가화";
  var CC=window.CALC_CONSTS||{};
  var waterSupply=(CC.WATER_SUPPLY&&CC.WATER_SUPPLY[ut])||170;
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var phaseDesc=phase==="before"
    ?"현재 사업부지 내 건축물대장으로 확인한 주거세대 수는 "
    :"사업추진에 따른 계획 세대는 ";
  var phaseDesc2=phase==="before"
    ?"이며 세대당 인구수 "
    :"이며 세대당 인구수 ";
  var phaseDesc3=phase==="before"
    ?" 인을 적용하여 "
    :" 인을 적용하여 ";
  els.push(H.p(
    "◦ "+phaseDesc+(households||"-")+"세대"+phaseDesc2+(F.f2(popUnit||2.63))+phaseDesc3+Math.round(hh.population||0)+"인으로 산정하였다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle("<표> "+phaseLabel+" 가정인구 오수발생량 산정"));
  els.push(H.simpleTable(
    ["계획 세대수\n(세대)","세대당 인구수\n(인/세대)","계획인구\n(인)","오수발생원단위\n(L/인·일)","오수발생량\n(㎥/일)","물사용량\n(㎥/일)"],
    [[
      households||"-",
      F.f2(popUnit||2.63),
      Math.round(hh.population||0),
      F.f2(waterSupply),
      F.f4(hh.오수발생유량||0),
      F.f4(hh.일평균급수량||0)
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
  var CC=window.CALC_CONSTS||{};
  var bizFecesRatio=CC.BIZ_FECES_RATIO||0.006;
  var hasCommon=biz.rows.some(function(r){return r.공용배분&&r.공용배분>0;});
  var multiBuilding=biz.rows.length>0&&(function(){
    var nos={};
    biz.rows.forEach(function(r){nos[r.buildingNo]=1;});
    return Object.keys(nos).length>1;
  })();
  var totalSewage=biz.합계?biz.합계.오수발생유량||0:0;
  els.push(H.p(
    "◦ "+phaseLabel+" 오수발생량 산정은 건축물의 용도별 오수발생량 원단위를 적용하여 산정하였다. 그 결과 오수발생량은 "+F.f4(totalSewage)+"㎥/일로 예측되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  // 열 구성 (동: 다동인 경우만, 공용배분: 있는 경우만)
  var headers=[];
  var colRatios=[];
  if(multiBuilding){headers.push("동");colRatios.push(7);}
  headers.push("층","용도","건축연면적\n(㎡)");
  colRatios.push(6,10,10);
  if(hasCommon){headers.push("공용배분\n면적(㎡)");colRatios.push(9);}
  headers.push("최종면적\n(㎡)","오수량원단위\n(L/㎡·일)","오수발생량\n(㎥/일)","분뇨발생량\n(㎥/일)","물사용량\n(㎥/일)","잡배수\n발생유량\n(㎥/일)");
  colRatios.push(10,10,10,10,9,9);
  // 비율 합 100 맞추기
  var total=colRatios.reduce(function(a,b){return a+b;},0);
  if(total<100){var diff=100-total;colRatios[colRatios.length-1]+=diff;}
  var rows=biz.rows.map(function(r){
    var row=[];
    if(multiBuilding)row.push(r.buildingNo+"동");
    row.push(r.floorNo+"층",useLabel(r),F.area(r.전용면적||r.적용면적));
    if(hasCommon)row.push(F.area(r.공용배분||0));
    row.push(
      F.area(r.적용면적),
      r.오수발생원단위||"-",
      F.f4(r.오수발생유량||0),
      F.f7(r.분뇨발생유량||0),
      F.f4(r.사용유량||r.오수발생유량||0),
      F.f4(r.잡배수발생유량||0)
    );
    return row;
  });
  // 합계행
  var sumRow=[];
  if(multiBuilding)sumRow.push("합  계");
  else sumRow.push("합  계");
  sumRow.push("","");
  // 건축연면적 합
  var sumArea=biz.rows.reduce(function(s,r){return s+(r.전용면적||r.적용면적||0);},0);
  sumRow.push(F.area(sumArea));
  if(hasCommon){var sumCommon=biz.rows.reduce(function(s,r){return s+(r.공용배분||0);},0);sumRow.push(F.area(sumCommon));}
  var sumFinal=biz.rows.reduce(function(s,r){return s+(r.적용면적||0);},0);
  sumRow.push(F.area(sumFinal),"-",F.f4(totalSewage),
    F.f7(biz.rows.reduce(function(s,r){return s+(r.분뇨발생유량||0);},0)),
    F.f4(biz.rows.reduce(function(s,r){return s+(r.사용유량||r.오수발생유량||0);},0)),
    F.f4(biz.rows.reduce(function(s,r){return s+(r.잡배수발생유량||0);},0))
  );
  rows.push(sumRow);
  els.push(H.tableTitle("<표> "+phaseLabel+" 영업인구 오수발생량 산정"));
  els.push(H.simpleTable(headers,rows,colRatios));
  els.push(H.blank());
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
    "◦ "+phaseLabel+" 발생부하량은 오염총량관리기술지침의 원단위를 적용하여 산정하였으며 산정결과 BOD "+F.f4(totalBOD)+"kg/일, T-P "+F.f4(totalTP)+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  // 가정인구 발생부하량 표
  if(hh){
    els.push(H.tableTitle("<표> "+phaseLabel+" 가정인구 발생부하량 산정"));
    var R=CC.FECES_LOAD_RATIO||{BOD:0.45,TP:0.8};
    els.push(H.simpleTable(
      ["구분","오수발생량\n(㎥/일)","적용원단위\nBOD\n(g/인·일)","적용원단위\nT-P\n(g/인·일)","발생부하량\nBOD\n(kg/일)","발생부하량\nT-P\n(kg/일)"],
      [["가정인구",F.f4(hh.오수발생유량||0),bodUnit,tpUnit,F.f4(hh.발생부하량?hh.발생부하량.BOD:0),F.f4(hh.발생부하량?hh.발생부하량.TP:0)]],
      [18,16,14,14,19,19]
    ));
    els.push(H.blank());
  }
  // 영업인구 발생부하량 표
  if(biz&&biz.rows&&biz.rows.length){
    var multiBuilding=biz.rows.length>0&&(function(){
      var nos={};biz.rows.forEach(function(r){nos[r.buildingNo]=1;});
      return Object.keys(nos).length>1;
    })();
    els.push(H.tableTitle("<표> "+phaseLabel+" 영업인구 발생부하량 산정"));
    var hdrs=[];var cols=[];
    if(multiBuilding){hdrs.push("동");cols.push(7);}
    hdrs.push("층","용도","오수발생량\n(㎥/일)","적용원단위\nBOD","적용원단위\nT-P","발생부하량\nBOD(kg/일)","발생부하량\nT-P(kg/일)");
    cols.push(7,12,14,12,12,14,14);
    if(multiBuilding)cols[0]=7;
    var dataRows=biz.rows.map(function(r){
      var row=[];
      if(multiBuilding)row.push(r.buildingNo+"동");
      row.push(r.floorNo+"층",useLabel(r),F.f4(r.오수발생유량||0),r.BOD농도||"-",r.TP농도||"-",F.f4(r.발생부하량?r.발생부하량.BOD:0),F.f4(r.발생부하량?r.발생부하량.TP:0));
      return row;
    });
    var sumR=[];
    if(multiBuilding)sumR.push("합  계");
    else sumR.push("합  계");
    sumR.push("","",F.f4(biz.합계?biz.합계.오수발생유량:0),"","-",F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.BOD:0),F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.TP:0));
    dataRows.push(sumR);
    // 비율 합 조정
    var tot=cols.reduce(function(a,b){return a+b;},0);
    if(tot<100)cols[cols.length-1]+=(100-tot);
    els.push(H.simpleTable(hdrs,dataRows,cols));
    els.push(H.blank());
  }
  return els;
}

// ── 배출부하량 (직접이송 + 개별) ─────────────────────────────────
function buildDischargeSection(docx,H,lifeData,phase,isWaterBuffer){
  var els=[];
  var phaseLabel=phase==="before"?"사업시행 전":"사업시행 후";
  var hh=lifeData.가정인구;
  var biz=lifeData.영업인구;

  // 처리방식 판별 (가정인구 우선, 없으면 영업인구 첫행)
  var m1=hh?(lifeData.가정인구.직접이송결과?"개인하수처리시설":"공공하수처리시설")
         :(biz&&biz.rows&&biz.rows[0]?biz.rows[0].sewageMethod1:"공공하수처리시설");

  // 직접이송 있는지 확인
  var hasDirectHH=hh&&hh.직접이송결과&&hh.직접이송결과.직접이송유량>0;
  var directBizRows=biz&&biz.rows?biz.rows.filter(function(r){return r.직접이송결과&&r.직접이송결과.직접이송유량>0;}):[];
  var hasDirectBiz=directBizRows.length>0;

  // ── 분뇨 직접이송에 따른 방류부하량
  if(hasDirectHH||hasDirectBiz){
    els.push(H.heading4("① 분뇨의 직접이송에 따른 방류부하량"));
    var CC=window.CALC_CONSTS||{};

    // 가정인구 직접이송
    if(hasDirectHH){
      var dt=hh.직접이송결과;
      var coefKey=hh.처리장정보?"공공하수처리시설":"개인하수처리시설";
      // method1 판별
      var hhM1=hh.개인처리기준?"개인하수처리시설":(hh.처리장정보?"공공하수처리시설":"정화조");
      var coef=CC.DIRECT_TRANSFER_COEF&&CC.DIRECT_TRANSFER_COEF[hhM1]?CC.DIRECT_TRANSFER_COEF[hhM1]:{flow:1.0,BOD:0.079,TP:0.081};
      var ratio=CC.DIRECT_TRANSFER_RATIO||1.0;
      els.push(H.p(
        "◦ 사업부지에 해당하는 직접이송유량비("+F.f3(coef.flow)+")와 "+dt.처리장+"의 처리농도를 적용하여 분뇨의 직접이송에 따른 방류부하량은 BOD "+F.f4(dt.방류부하량.BOD)+"kg/일, T-P "+F.f4(dt.방류부하량.TP)+"kg/일로 산정되었다.",
        {size:H.SZ_SM}
      ));
      els.push(H.blank());
      // 표: 구분/분뇨발생유량/직접이송비(유량비/처리농도)/방류부하량
      var Table=docx.Table,TableRow=docx.TableRow,TableCell=docx.TableCell;
      var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;
      var BN=H.BN,CELLB=H.CELLB,TBLB=H.TBLB;
      function tc(ch,o){o=o||{};return new TableCell({children:Array.isArray(ch)?ch:[ch],columnSpan:o.cs||1,rowSpan:o.rs||1,width:o.w?{size:o.w,type:WidthType.DXA}:undefined,borders:o.borders||CELLB,verticalAlign:o.vAlign||VerticalAlign.CENTER});}
      var W=9638;
      var w=[Math.round(W*0.12),Math.round(W*0.18),Math.round(W*0.14),Math.round(W*0.14),Math.round(W*0.14),Math.round(W*0.14),Math.round(W*0.14)];
      var linkedPlantInfo=null;
      if(typeof SEWAGE_PLANT_DB!=="undefined")linkedPlantInfo=SEWAGE_PLANT_DB.find(function(p){return p.name===dt.처리장;})||null;
      var efflBOD=linkedPlantInfo?linkedPlantInfo.efflBOD:"-";
      var efflTP=linkedPlantInfo?linkedPlantInfo.efflTP:"-";
      var dtTable=new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:TBLB,rows:[
        new TableRow({children:[
          tc(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w[0]}),
          tc(H.p("분뇨발생\n유량(㎥/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w[1]}),
          tc(H.p("직접이송",{center:true,bold:true,size:H.SZ_HDR}),{cs:2,w:w[2]+w[3]}),
          tc(H.p("방류부하량\n(kg/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w[4]})
        ]}),
        new TableRow({children:[
          tc(H.p("직접이송\n유량비",{center:true,bold:true,size:H.SZ_HDR}),{w:w[2]}),
          tc(H.p("처리농도\n(mg/L)",{center:true,bold:true,size:H.SZ_HDR}),{w:w[3]})
        ]}),
        new TableRow({children:[
          tc(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w[0]}),
          tc(H.p(F.f7(hh.분뇨발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w[1]}),
          tc(H.p(F.f3(coef.BOD),{center:true,size:H.SZ_TBL}),{w:w[2]}),
          tc(H.p(String(efflBOD),{center:true,size:H.SZ_TBL}),{w:w[3]}),
          tc(H.p(F.f4(dt.방류부하량.BOD),{center:true,size:H.SZ_TBL}),{w:w[4]})
        ]}),
        new TableRow({children:[
          tc(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w[0]}),
          tc(H.p(F.f3(coef.TP),{center:true,size:H.SZ_TBL}),{w:w[2]}),
          tc(H.p(String(efflTP),{center:true,size:H.SZ_TBL}),{w:w[3]}),
          tc(H.p(F.f4(dt.방류부하량.TP),{center:true,size:H.SZ_TBL}),{w:w[4]})
        ]})
      ]});
      els.push(H.tableTitle("<표> 분뇨의 직접이송에 따른 방류부하량 산정 (가정인구)"));
      els.push(dtTable);
      els.push(H.blank());
    }

    // 영업인구 직접이송 (처리방식별 그룹)
    if(hasDirectBiz){
      var Table2=docx.Table,TableRow2=docx.TableRow,TableCell2=docx.TableCell;
      var WidthType2=docx.WidthType,VerticalAlign2=docx.VerticalAlign;
      var CC2=window.CALC_CONSTS||{};
      directBizRows.forEach(function(r){
        var dt2=r.직접이송결과;
        var coef2=CC2.DIRECT_TRANSFER_COEF&&CC2.DIRECT_TRANSFER_COEF[r.sewageMethod1]?CC2.DIRECT_TRANSFER_COEF[r.sewageMethod1]:{flow:1.0,BOD:0.079,TP:0.081};
        var linkedPlant2=null;
        if(typeof SEWAGE_PLANT_DB!=="undefined")linkedPlant2=SEWAGE_PLANT_DB.find(function(p){return p.name===dt2.처리장;})||null;
        var eB2=linkedPlant2?linkedPlant2.efflBOD:"-";
        var eT2=linkedPlant2?linkedPlant2.efflTP:"-";
        var W2=9638;
        var w2=[Math.round(W2*0.12),Math.round(W2*0.18),Math.round(W2*0.14),Math.round(W2*0.14),Math.round(W2*0.14)];
        function tc2(ch,o){o=o||{};return new TableCell2({children:Array.isArray(ch)?ch:[ch],columnSpan:o.cs||1,rowSpan:o.rs||1,width:o.w?{size:o.w,type:WidthType2.DXA}:undefined,borders:H.CELLB,verticalAlign:o.vAlign||VerticalAlign2.CENTER});}
        var dt2Table=new Table2({width:{size:100,type:WidthType2.PERCENTAGE},borders:H.TBLB,rows:[
          new TableRow2({children:[tc2(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w2[0]}),tc2(H.p("분뇨발생\n유량(㎥/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w2[1]}),tc2(H.p("직접이송",{center:true,bold:true,size:H.SZ_HDR}),{cs:2,w:w2[2]+w2[3]}),tc2(H.p("방류부하량\n(kg/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w2[4]})]}),
          new TableRow2({children:[tc2(H.p("직접이송\n유량비",{center:true,bold:true,size:H.SZ_HDR}),{w:w2[2]}),tc2(H.p("처리농도\n(mg/L)",{center:true,bold:true,size:H.SZ_HDR}),{w:w2[3]})]}),
          new TableRow2({children:[tc2(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w2[0]}),tc2(H.p(F.f7(r.분뇨발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w2[1]}),tc2(H.p(F.f3(coef2.BOD),{center:true,size:H.SZ_TBL}),{w:w2[2]}),tc2(H.p(String(eB2),{center:true,size:H.SZ_TBL}),{w:w2[3]}),tc2(H.p(F.f4(dt2.방류부하량.BOD),{center:true,size:H.SZ_TBL}),{w:w2[4]})]}),
          new TableRow2({children:[tc2(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w2[0]}),tc2(H.p(F.f3(coef2.TP),{center:true,size:H.SZ_TBL}),{w:w2[2]}),tc2(H.p(String(eT2),{center:true,size:H.SZ_TBL}),{w:w2[3]}),tc2(H.p(F.f4(dt2.방류부하량.TP),{center:true,size:H.SZ_TBL}),{w:w2[4]})]})
        ]});
        els.push(H.tableTitle("<표> 분뇨의 직접이송에 따른 방류부하량 산정 ("+r.buildingNo+"동 "+r.floorNo+"층 "+useLabel(r)+")"));
        els.push(dt2Table);
        els.push(H.blank());
      });
    }
  }

  // ── 개별 배출부하량
  els.push(H.heading4("② 개별 배출부하량"));

  // 공공하수처리시설
  function buildPubTable(rows,isHH,hhData){
    var Table3=docx.Table,TableRow3=docx.TableRow,TableCell3=docx.TableCell;
    var WidthType3=docx.WidthType,VerticalAlign3=docx.VerticalAlign;
    var W3=9638;
    var w3=[Math.round(W3*0.12),Math.round(W3*0.2),Math.round(W3*0.18),Math.round(W3*0.18),Math.round(W3*0.16),Math.round(W3*0.16)];
    function tc3(ch,o){o=o||{};return new TableCell3({children:Array.isArray(ch)?ch:[ch],columnSpan:o.cs||1,rowSpan:o.rs||1,width:o.w?{size:o.w,type:WidthType3.DXA}:undefined,borders:H.CELLB,verticalAlign:o.vAlign||VerticalAlign3.CENTER});}
    var dataRows3=[];
    if(isHH&&hhData){
      var pn=hhData.처리장정보?hhData.처리장정보.name:"-";
      var eB=hhData.처리장정보?hhData.처리장정보.efflBOD:"-";
      var eT=hhData.처리장정보?hhData.처리장정보.efflTP:"-";
      dataRows3.push(
        new TableRow3({children:[tc3(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w3[0]}),tc3(H.p(pn,{center:true,size:H.SZ_TBL}),{rs:2,w:w3[1]}),tc3(H.p(F.f4(hhData.오수발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w3[2]}),tc3(H.p(String(eB),{center:true,size:H.SZ_TBL}),{w:w3[3]}),tc3(H.p(F.f4(hhData.배출부하량?hhData.배출부하량.BOD:0),{center:true,size:H.SZ_TBL}),{w:w3[4]})]}),
        new TableRow3({children:[tc3(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w3[0]}),tc3(H.p(String(eT),{center:true,size:H.SZ_TBL}),{w:w3[3]}),tc3(H.p(F.f4(hhData.배출부하량?hhData.배출부하량.TP:0),{center:true,size:H.SZ_TBL}),{w:w3[4]})]})
      );
    }
    rows.forEach(function(r){
      var pn2=r.처리장정보?r.처리장정보.name:(r.plantName||"-");
      var eB2=r.처리장정보?r.처리장정보.efflBOD:"-";
      var eT2=r.처리장정보?r.처리장정보.efflTP:"-";
      var label=r.buildingNo+"동 "+r.floorNo+"층";
      dataRows3.push(
        new TableRow3({children:[tc3(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w3[0]}),tc3(H.p(label,{center:true,size:H.SZ_TBL}),{rs:2,w:w3[1]}),tc3(H.p(F.f4(r.오수발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w3[2]}),tc3(H.p(String(eB2),{center:true,size:H.SZ_TBL}),{w:w3[3]}),tc3(H.p(F.f4(r.배출부하량?r.배출부하량.BOD:0),{center:true,size:H.SZ_TBL}),{w:w3[4]})]}),
        new TableRow3({children:[tc3(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w3[0]}),tc3(H.p(String(eT2),{center:true,size:H.SZ_TBL}),{w:w3[3]}),tc3(H.p(F.f4(r.배출부하량?r.배출부하량.TP:0),{center:true,size:H.SZ_TBL}),{w:w3[4]})]})
      );
    });
    return new Table3({width:{size:100,type:WidthType3.PERCENTAGE},borders:H.TBLB,rows:[
      new TableRow3({children:[tc3(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w3[0]}),tc3(H.p("처리시설명",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w3[1]}),tc3(H.p("오수발생량\n(㎥/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w3[2]}),tc3(H.p("처리농도\n(mg/L)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w3[3]}),tc3(H.p("개별배출\n부하량(kg/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w3[4]})]}),
      new TableRow3({children:[]}),
    ].concat(dataRows3)});
  }

  // 개인하수처리시설 배출부하량 표
  function buildIndTable(rows,isHH,hhData){
    var Table4=docx.Table,TableRow4=docx.TableRow,TableCell4=docx.TableCell;
    var WidthType4=docx.WidthType,VerticalAlign4=docx.VerticalAlign;
    var W4=9638;
    var w4=[Math.round(W4*0.12),Math.round(W4*0.2),Math.round(W4*0.18),Math.round(W4*0.18),Math.round(W4*0.16),Math.round(W4*0.16)];
    function tc4(ch,o){o=o||{};return new TableCell4({children:Array.isArray(ch)?ch:[ch],columnSpan:o.cs||1,rowSpan:o.rs||1,width:o.w?{size:o.w,type:WidthType4.DXA}:undefined,borders:H.CELLB,verticalAlign:o.vAlign||VerticalAlign4.CENTER});}
    var dataRows4=[];
    if(isHH&&hhData){
      var std=hhData.개인처리기준&&hhData.개인처리기준.std||{BOD:20,TP:4};
      dataRows4.push(
        new TableRow4({children:[tc4(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w4[0]}),tc4(H.p("가정인구",{center:true,size:H.SZ_TBL}),{rs:2,w:w4[1]}),tc4(H.p(F.f4(hhData.오수발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w4[2]}),tc4(H.p(String(std.BOD),{center:true,size:H.SZ_TBL}),{w:w4[3]}),tc4(H.p(F.f4(hhData.배출부하량?hhData.배출부하량.BOD:0),{center:true,size:H.SZ_TBL}),{w:w4[4]})]}),
        new TableRow4({children:[tc4(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w4[0]}),tc4(H.p(String(std.TP),{center:true,size:H.SZ_TBL}),{w:w4[3]}),tc4(H.p(F.f4(hhData.배출부하량?hhData.배출부하량.TP:0),{center:true,size:H.SZ_TBL}),{w:w4[4]})]})
      );
    }
    rows.forEach(function(r){
      var std2=r.개인처리기준&&r.개인처리기준.std||{BOD:20,TP:4};
      var label=r.buildingNo+"동 "+r.floorNo+"층";
      dataRows4.push(
        new TableRow4({children:[tc4(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w4[0]}),tc4(H.p(label,{center:true,size:H.SZ_TBL}),{rs:2,w:w4[1]}),tc4(H.p(F.f4(r.오수발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w4[2]}),tc4(H.p(String(std2.BOD),{center:true,size:H.SZ_TBL}),{w:w4[3]}),tc4(H.p(F.f4(r.배출부하량?r.배출부하량.BOD:0),{center:true,size:H.SZ_TBL}),{w:w4[4]})]}),
        new TableRow4({children:[tc4(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w4[0]}),tc4(H.p(String(std2.TP),{center:true,size:H.SZ_TBL}),{w:w4[3]}),tc4(H.p(F.f4(r.배출부하량?r.배출부하량.TP:0),{center:true,size:H.SZ_TBL}),{w:w4[4]})]})
      );
    });
    return new Table4({width:{size:100,type:WidthType4.PERCENTAGE},borders:H.TBLB,rows:[
      new TableRow4({children:[tc4(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w4[0]}),tc4(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w4[1]}),tc4(H.p("오수발생량\n(㎥/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w4[2]}),tc4(H.p("처리농도\n(mg/L)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w4[3]}),tc4(H.p("개별배출\n부하량(kg/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w4[4]})]}),
      new TableRow4({children:[]}),
    ].concat(dataRows4)});
  }

  // 정화조 배출부하량 표
  function buildSepTable(rows,isHH,hhData){
    var Table5=docx.Table,TableRow5=docx.TableRow,TableCell5=docx.TableCell;
    var WidthType5=docx.WidthType,VerticalAlign5=docx.VerticalAlign;
    var W5=9638;
    var w5=[Math.round(W5*0.12),Math.round(W5*0.2),Math.round(W5*0.18),Math.round(W5*0.18),Math.round(W5*0.16),Math.round(W5*0.16)];
    function tc5(ch,o){o=o||{};return new TableCell5({children:Array.isArray(ch)?ch:[ch],columnSpan:o.cs||1,rowSpan:o.rs||1,width:o.w?{size:o.w,type:WidthType5.DXA}:undefined,borders:H.CELLB,verticalAlign:o.vAlign||VerticalAlign5.CENTER});}
    var dataRows5=[];
    if(isHH&&hhData){
      dataRows5.push(
        new TableRow5({children:[tc5(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w5[0]}),tc5(H.p("가정인구",{center:true,size:H.SZ_TBL}),{rs:2,w:w5[1]}),tc5(H.p(F.f4(hhData.오수발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w5[2]}),tc5(H.p("BOD 25% 삭감",{center:true,size:H.SZ_TBL}),{w:w5[3]}),tc5(H.p(F.f4(hhData.배출부하량?hhData.배출부하량.BOD:0),{center:true,size:H.SZ_TBL}),{w:w5[4]})]}),
        new TableRow5({children:[tc5(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w5[0]}),tc5(H.p("원부하량 적용",{center:true,size:H.SZ_TBL}),{w:w5[3]}),tc5(H.p(F.f4(hhData.배출부하량?hhData.배출부하량.TP:0),{center:true,size:H.SZ_TBL}),{w:w5[4]})]})
      );
    }
    rows.forEach(function(r){
      var label=r.buildingNo+"동 "+r.floorNo+"층";
      dataRows5.push(
        new TableRow5({children:[tc5(H.p("BOD",{center:true,size:H.SZ_TBL}),{w:w5[0]}),tc5(H.p(label,{center:true,size:H.SZ_TBL}),{rs:2,w:w5[1]}),tc5(H.p(F.f4(r.오수발생유량||0),{center:true,size:H.SZ_TBL}),{rs:2,w:w5[2]}),tc5(H.p("BOD 25% 삭감",{center:true,size:H.SZ_TBL}),{w:w5[3]}),tc5(H.p(F.f4(r.배출부하량?r.배출부하량.BOD:0),{center:true,size:H.SZ_TBL}),{w:w5[4]})]}),
        new TableRow5({children:[tc5(H.p("T-P",{center:true,size:H.SZ_TBL}),{w:w5[0]}),tc5(H.p("원부하량 적용",{center:true,size:H.SZ_TBL}),{w:w5[3]}),tc5(H.p(F.f4(r.배출부하량?r.배출부하량.TP:0),{center:true,size:H.SZ_TBL}),{w:w5[4]})]})
      );
    });
    return new Table5({width:{size:100,type:WidthType5.PERCENTAGE},borders:H.TBLB,rows:[
      new TableRow5({children:[tc5(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w5[0]}),tc5(H.p("구분",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w5[1]}),tc5(H.p("오수발생량\n(㎥/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w5[2]}),tc5(H.p("처리방법",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w5[3]}),tc5(H.p("개별배출\n부하량(kg/일)",{center:true,bold:true,size:H.SZ_HDR}),{rs:2,w:w5[4]})]}),
      new TableRow5({children:[]}),
    ].concat(dataRows5)});
  }

  // 처리방식별 분류
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

  if(hasPub){
    var pubDesc=isPubHH?"공공하수처리시설로 연결":"공공하수처리시설로 연결";
    els.push(H.p("◦ 사업부지 내 건물에서 발생하는 오수는 "+pubDesc+"하는 것으로 조사되었으며, 개별배출부하량은 BOD "+F.f4(totalDischBOD)+"kg/일, T-P "+F.f4(totalDischTP)+"kg/일로 산정되었다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.tableTitle("<표> 공공하수처리시설 연결 개별배출부하량 산정"));
    els.push(buildPubTable(pubBizRows,isPubHH,isPubHH?hh:null));
    els.push(H.blank());
  }
  if(hasInd){
    els.push(H.p("◦ 사업부지 내 건물에서 발생하는 오수는 개별오수처리시설에서 처리 후 방류하는 것으로 조사되었으며, 개별배출부하량은 BOD "+F.f4(totalDischBOD)+"kg/일, T-P "+F.f4(totalDischTP)+"kg/일로 산정되었다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.tableTitle("<표> 개인오수처리시설 개별배출부하량 산정"));
    els.push(buildIndTable(indBizRows,isIndHH,isIndHH?hh:null));
    els.push(H.blank());
  }
  if(hasSep){
    els.push(H.p("◦ 사업부지 내 건물에서 발생하는 오수는 정화조에서 처리 후 방류하는 것으로 조사되었으며, 개별배출부하량은 BOD "+F.f4(totalDischBOD)+"kg/일, T-P "+F.f4(totalDischTP)+"kg/일로 산정되었다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.tableTitle("<표> 정화조 처리 개별배출부하량 산정"));
    els.push(buildSepTable(sepBizRows,isSepHH,isSepHH?hh:null));
    els.push(H.blank());
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
    "◦ "+phaseLabel+" 점오염원(생활계) 배출부하량을 산정한 결과 BOD "+F.f4(totBOD)+"kg/일, T-P "+F.f4(totTP)+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle("<표> "+phaseLabel+" 배출부하량 총괄"));
  els.push(H.simpleTable(
    ["구분","직접이송에 따른\n방류부하량(kg/일)","개별배출\n부하량(kg/일)","배출부하량\n합(kg/일)"],
    [["BOD",F.f4(dtBOD),F.f4(indBOD),F.f4(totBOD)],["T-P",F.f4(dtTP),F.f4(indTP),F.f4(totTP)]],
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
      ?"◦ 본 사업부지는 사업시행 전 점오염원(생활계)에 의한 배출부하량은 없는 것으로 조사되었습니다."
      :"◦ 사업시행 후 생활계 배출부하량은 없는 것으로 산정됩니다.";
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
  els.push(H.tableTitle("<표> 사업시행 전·후 토지계 발생부하량 산정"));
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
    "◦ 사업시행으로 인해 사업부지에서 발생하는 점오염원(생활계) 배출부하량은 BOD "+F.f4(Math.max(0,finalBOD))+"kg/일, T-P "+F.f4(Math.max(0,finalTP))+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle("<표> 생활계 최종 배출부하량"));
  els.push(H.simpleTable(
    ["구분","사업시행 후\n배출부하량(kg/일)","사업시행 전\n배출부하량(kg/일)","최종배출부하량\n(kg/일)"],
    [["BOD",F.f4(aD.BOD),F.f4(bD.BOD),F.bodDelta(finalBOD)],["T-P",F.f4(aD.TP),F.f4(bD.TP),F.tpDelta(finalTP)]],
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
    "◦ 사업시행 전 토지계 부하량은 현재 사업부지의 현황지목을 적용하였고 사업시행 후 토지계 부하량은 사업계획에 따른 토지이용계획 면적에 대응되는 지목을 적용하여 산정하였으며 그 결과 비점오염원은 BOD "+F.f4(Math.max(0,taB-tbB))+"kg/일, T-P "+F.f4(Math.max(0,taT-tbT))+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els=els.concat(buildLandTables(H,lB,lA,docx));

  // ── 3. 최종배출부하량 ──────────────────────────────────────
  els.push(H.heading1("3. 최종배출부하량"));
  var pt=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.점오염)||{BOD:0,TP:0};
  var bis=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.비점오염)||{BOD:0,TP:0};
  els.push(H.p(
    "◦ 금회 사업으로 인한 점오염원(생활계) 최종 배출부하량은 BOD "+F.bod(pt.BOD)+"kg/일, T-P "+F.tp(pt.TP)+"kg/일이며, 비점오염원(토지계) 최종 배출부하량은 BOD "+F.bod(bis.BOD)+"kg/일, T-P "+F.tp(bis.TP)+"kg/일로 산정되었다.",
    {size:H.SZ_SM}
  ));
  els.push(H.blank());
  els.push(H.tableTitle("<표> 최종 배출부하량 (단위: kg/일)"));
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
