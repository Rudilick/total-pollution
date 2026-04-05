// ================================================================
// word-gen.js  v6  (괄호 수정판)
// ================================================================

const A4_HEIGHT_TWIP=16833,MARGIN_TOP=1100,MARGIN_BOTTOM=1100,MARGIN_LEFT=1000,MARGIN_RIGHT=1000;
const USABLE_HEIGHT_TWIP=A4_HEIGHT_TWIP-MARGIN_TOP-MARGIN_BOTTOM;

const F={
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
  fb=fb||"";
  var el=document.getElementById(id);
  return el?(el.value!=null?el.value:fb):fb;
}

// 용도 마지막 분류만 표기
function useLabel(r){
  if(r.minor)return r.minor;
  if(r.mid)return r.mid;
  return r.major||"";
}

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

// ── 공통 헬퍼 팩토리 ─────────────────────────────────────────────
function makeH(docx){
  var Paragraph=docx.Paragraph,TextRun=docx.TextRun,Table=docx.Table;
  var TableRow=docx.TableRow,TableCell=docx.TableCell;
  var AlignmentType=docx.AlignmentType,BorderStyle=docx.BorderStyle;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;

  var FONT="맑은 고딕";
  var SZ=21,SZ_TBL=20,SZ_HDR=16,SZ_SM=18,SZ_H1=26,SZ_H2=24,SZ_H3=22;
  var SP_H1={before:280,after:120,line:276,lineRule:"auto"};
  var SP_H2={before:200,after:100,line:276,lineRule:"auto"};
  var SP_H3={before:160,after:80,line:276,lineRule:"auto"};
  var SP_TBL={before:0,after:0,line:276,lineRule:"auto"};
  var SP_AFT={before:0,after:160};
  var BT={style:BorderStyle.SINGLE,size:12,color:"000000"};
  var BN={style:BorderStyle.SINGLE,size:4,color:"000000"};
  var BO={style:BorderStyle.NONE,size:0,color:"FFFFFF"};
  var TBLB={top:BT,bottom:BT,left:BT,right:BT,insideHorizontal:BN,insideVertical:BN};
  var CELLB={top:BN,bottom:BN,left:BN,right:BN};

  function p(text,opts){
    text=text||""; opts=opts||{};
    var center=opts.center||false,right=opts.right||false,bold=opts.bold||false;
    var size=opts.size!=null?opts.size:SZ_TBL;
    var spacing=opts.spacing||SP_TBL;
    var color=opts.color;
    var parts=String(text).split("\n");
    var runs=[];
    for(var i=0;i<parts.length;i++){
      if(i>0)runs.push(new TextRun({text:"",break:1,font:FONT,bold:bold,size:size,color:color}));
      runs.push(new TextRun({text:parts[i],font:FONT,bold:bold,size:size,color:color}));
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
      columnSpan:opts.cs||1,
      rowSpan:opts.rs||1,
      width:opts.wPct?{size:opts.wPct,type:WidthType.PERCENTAGE}:(opts.w?{size:opts.w,type:WidthType.DXA}:undefined),
      borders:opts.borders||CELLB,
      verticalAlign:opts.vAlign||VerticalAlign.CENTER
    });
  }

  function simpleTable(headers,rows,colWidths){
    var totalW=colWidths.reduce(function(a,b){return a+b;},0);
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
    var allRows=[hdrRow].concat(dataRows);
    return new Table({width:{size:totalW,type:WidthType.DXA},borders:TBLB,rows:allRows});
  }

  function heading1(t){return new Paragraph({spacing:SP_H1,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H1})]});}
  function heading2(t){return new Paragraph({spacing:SP_H2,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H2})]});}
  function heading3(t){return new Paragraph({spacing:SP_H3,children:[new TextRun({text:t,font:FONT,bold:true,size:SZ_H3})]});}
  function note(t){return new Paragraph({spacing:{before:40,after:40},children:[new TextRun({text:String(t),font:FONT,size:SZ_SM})]});}
  function blank(){return new Paragraph({spacing:SP_AFT,children:[]});}

  return {
    p:p,pageBreak:pageBreak,tc:tc,simpleTable:simpleTable,
    heading1:heading1,heading2:heading2,heading3:heading3,note:note,blank:blank,
    FONT:FONT,SZ:SZ,SZ_TBL:SZ_TBL,SZ_HDR:SZ_HDR,SZ_SM:SZ_SM,
    SZ_H1:SZ_H1,SZ_H2:SZ_H2,SZ_H3:SZ_H3,
    BT:BT,BN:BN,BO:BO,TBLB:TBLB,CELLB:CELLB,SP_TBL:SP_TBL,
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
    top:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    bottom:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    left:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    right:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    insideHorizontal:{style:BorderStyle.NONE,size:0,color:"FFFFFF"},
    insideVertical:{style:BorderStyle.NONE,size:0,color:"FFFFFF"}
  };

  function bc(ch){return new TableCell({borders:NOB,children:ch});}

  var w=smartWrap(data.projectName);
  var nameRuns=[new TextRun({text:w.line1,font:"맑은 고딕",bold:true,size:w.fontPt*2})];
  if(w.line2)nameRuns.push(new TextRun({text:w.line2,break:1,font:"맑은 고딕",bold:true,size:w.fontPt*2}));

  var row7H=Math.max(800,USABLE_HEIGHT_TWIP-(600+1843+3984+3701+1266)-300);

  var coverTable=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    borders:NOB,
    rows:[
      new TableRow({height:{value:600},children:[bc([new Paragraph("")])]}),
      new TableRow({height:{value:1843},children:[new TableCell({
        borders:NOB,verticalAlign:VerticalAlign.BOTTOM,
        children:[new Paragraph({alignment:AlignmentType.CENTER,children:nameRuns})]
      })]}),
      new TableRow({children:[bc([new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({
          text:"수질오염총량검토서",font:"맑은 고딕",bold:true,size:96,
          underline:{type:UnderlineType.DOUBLE}
        })]
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

  return {
    properties:{
      type:SectionType.NEXT_PAGE,
      page:{margin:{top:MARGIN_TOP,bottom:MARGIN_BOTTOM,left:MARGIN_LEFT,right:MARGIN_RIGHT}}
    },
    children:[coverTable]
  };
}

// ── 총괄+할당부하량 ───────────────────────────────────────────────
function buildChongGwalBlock(docx,data){
  var H=makeH(docx);
  var Table=docx.Table,TableRow=docx.TableRow,TableCell=docx.TableCell;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;
  var AlignmentType=docx.AlignmentType,Paragraph=docx.Paragraph;
  var TextRun=docx.TextRun,BorderStyle=docx.BorderStyle;

  var nb=H.BN,tb=H.BT,non=H.BO;
  function cb(ov){
    ov=ov||{};
    return {top:ov.top||nb,bottom:ov.bottom||nb,left:ov.left||nb,right:ov.right||nb};
  }
  function cell(ch,o){
    o=o||{};
    return new TableCell({
      children:Array.isArray(ch)?ch:[ch],
      borders:o.borders||cb(),
      columnSpan:o.cs||1,rowSpan:o.rs||1,
      width:o.wPct?{size:o.wPct,type:WidthType.PERCENTAGE}:undefined,
      verticalAlign:o.vAlign||VerticalAlign.CENTER,
      shading:o.shading||undefined
    });
  }
  function pp(t,o){o=o||{};return H.p(t,{center:o.center||false,right:o.right||false,bold:o.bold||false,size:o.size||H.SZ_TBL});}

  var W1=12,W2=22,RIGHT=66,U=11,THIRD=2*U,HALF=3*U,ROW_H=680;
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
  var bodPt=F.bod(fBOD),tpPt=F.tp(fTP),bodBis=F.bod(bBOD),tpBis=F.tp(bTP);

  // 총괄 박스
  var cgBox=new Table({
    width:{size:18,type:WidthType.PERCENTAGE},
    borders:{top:nb,bottom:nb,left:nb,right:nb,insideHorizontal:nb,insideVertical:nb},
    rows:[new TableRow({children:[new TableCell({
      borders:cb(),
      shading:{type:"clear",color:"auto",fill:"EDEDED"},
      children:[new Paragraph({alignment:AlignmentType.CENTER,
        children:[new TextRun({text:"총  괄",font:"맑은 고딕",bold:true,size:28})]})]
    })]})]
  });

  var divLine=new Paragraph({
    border:{bottom:{style:BorderStyle.SINGLE,size:6,color:"000000"}},
    spacing:{before:80,after:160},children:[]
  });

  var mainTable=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    borders:H.TBLB,
    rows:[
      new TableRow({height:{value:ROW_H},children:[cell(pp("사 업 명",{center:true}),{cs:2,wPct:W1+W2}),cell(pp(data.projectName||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("소 재 지",{center:true}),{cs:2,wPct:W1+W2}),cell(pp(data.projectLocation||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("사업기간(준공예정년도)",{center:true}),{cs:2,wPct:W1+W2}),cell(pp(data.bizPeriodText||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("사 업 시 행 자",{center:true}),{cs:2,wPct:W1+W2}),cell(pp(data.ownerName||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("용 도 지 역",{center:true}),{cs:2,wPct:W1+W2}),cell(pp(data.zoneText||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[cell(pp("사 업 의 종 류",{center:true}),{cs:2,wPct:W1+W2}),cell(pp(data.bizType||""),{cs:6,wPct:RIGHT})]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("면 적",{center:true}),{rs:6,wPct:W1}),
        cell(pp("부지면적",{center:true}),{rs:3,wPct:W2}),
        cell(pp("전체부지",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaTotalSite||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("건축부지",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaBuildSite||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("도로부지",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaRoadSite||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("건축연면적",{center:true}),{wPct:W2}),
        cell(pp("",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.areaGrossFloor||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("㎡"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("도 로",{center:true}),{rs:2,wPct:W2}),
        cell(pp("노선길이",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.roadLength||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("m"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("폭",{center:true}),{cs:2,wPct:THIRD,borders:cb({right:non})}),
        cell(pp(data.roadWidth||"",{right:true}),{cs:2,wPct:THIRD,borders:cb({left:non,right:non})}),
        cell(pp("m"),{cs:2,wPct:THIRD,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("환경현황",{center:true}),{rs:3,wPct:W1}),
        cell(pp("수변구역",{center:true}),{wPct:W2}),
        cell(pp(riverL,{center:true}),{cs:3,wPct:HALF,borders:cb({right:non})}),
        cell(pp(riverR,{center:true}),{cs:3,wPct:HALF,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("상수원보호구역",{center:true}),{wPct:W2}),
        cell(pp(waterL,{center:true}),{cs:3,wPct:HALF,borders:cb({right:non})}),
        cell(pp(waterR,{center:true}),{cs:3,wPct:HALF,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("특별대책지역",{center:true}),{wPct:W2}),
        cell(pp(spL,{center:true}),{cs:3,wPct:HALF,borders:cb({right:non})}),
        cell(pp(spR,{center:true}),{cs:3,wPct:HALF,borders:cb({left:non})})
      ]}),
      new TableRow({height:{value:ROW_H},children:[
        cell(pp("평가대행자\n(총량검토서 작성자)",{center:true}),{cs:2,wPct:W1+W2}),
        cell(pp((data.writerName||"")+"  (☎ "+(data.writerContact||"")+")"),{cs:6,wPct:RIGHT})
      ]}),
      new TableRow({height:{value:ROW_H*3},children:[
        cell(pp("사 업 의\n추 진 경 위",{center:true}),{cs:2,wPct:W1+W2}),
        cell(pp(data.bizHistory||"[여기에 직접 입력하세요]"),{cs:6,wPct:RIGHT,vAlign:VerticalAlign.TOP})
      ]})
    ]
  });

  // 할당부하량 표
  var CW=[1000,1100,900,1000,1000,1000,1000];
  var TW=CW.reduce(function(a,b){return a+b;},0);
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
    width:{size:TW,type:WidthType.DXA},
    borders:H.TBLB,
    rows:[
      new TableRow({tableHeader:true,children:[
        tc2(ap("구 분",true),{rs:2,w:CW[0]}),
        tc2(ap("단위유역",true),{rs:2,w:CW[1]}),
        tc2(ap("준공년도",true),{rs:2,w:CW[2]}),
        tc2(ap("BOD",true),{cs:2,w:CW[3]+CW[4]}),
        tc2(ap("T-P",true),{cs:2,w:CW[5]+CW[6]})
      ]}),
      new TableRow({tableHeader:true,children:[
        tc2(ap("점",true),{w:CW[3]}),tc2(ap("비점",true),{w:CW[4]}),
        tc2(ap("점",true),{w:CW[5]}),tc2(ap("비점",true),{w:CW[6]})
      ]}),
      new TableRow({children:[tc2(ap("최초개발"),{w:CW[0]}),tc2(ap("-"),{w:CW[1]}),tc2(ap("-"),{w:CW[2]}),tc2(ap("-"),{w:CW[3]}),tc2(ap("-"),{w:CW[4]}),tc2(ap("-"),{w:CW[5]}),tc2(ap("-"),{w:CW[6]})]}),
      new TableRow({children:[tc2(ap("기 승 인"),{w:CW[0]}),tc2(ap(ub),{w:CW[1]}),tc2(ap(data.completeYear||"-"),{w:CW[2]}),tc2(ap("-"),{w:CW[3]}),tc2(ap("-"),{w:CW[4]}),tc2(ap("-"),{w:CW[5]}),tc2(ap("-"),{w:CW[6]})]}),
      new TableRow({children:[tc2(ap("추  가"),{w:CW[0]}),tc2(ap(ub),{w:CW[1]}),tc2(ap(data.completeYear||"-"),{w:CW[2]}),tc2(ap(bodPt),{w:CW[3]}),tc2(ap(bodBis),{w:CW[4]}),tc2(ap(tpPt),{w:CW[5]}),tc2(ap(tpBis),{w:CW[6]})]}),
      new TableRow({children:[tc2(ap("합  계"),{w:CW[0]}),tc2(ap(ub),{w:CW[1]}),tc2(ap(data.completeYear||"-"),{w:CW[2]}),tc2(ap(bodPt),{w:CW[3]}),tc2(ap(bodBis),{w:CW[4]}),tc2(ap(tpPt),{w:CW[5]}),tc2(ap(tpBis),{w:CW[6]})]})
    ]
  });

  return [cgBox,divLine,H.heading1("1. 사업의 개요"),mainTable,H.blank(),H.heading2("2. 할당부하량"),allotTable,H.blank()];
}

// ── 저감계획 ─────────────────────────────────────────────────────
function buildJeogamBlock(docx,data){
  var H=makeH(docx);
  var Table=docx.Table,TableRow=docx.TableRow,TableCell=docx.TableCell;
  var WidthType=docx.WidthType,VerticalAlign=docx.VerticalAlign;

  var nb=H.BN,non=H.BO;
  function cb(ov){ov=ov||{};return{top:ov.top||nb,bottom:ov.bottom||nb,left:ov.left||nb,right:ov.right||nb};}
  function cell(ch,o){
    o=o||{};
    return new TableCell({
      children:Array.isArray(ch)?ch:[ch],
      borders:o.borders||cb(),
      columnSpan:o.cs||1,rowSpan:o.rs||1,
      width:o.wPct?{size:o.wPct,type:WidthType.PERCENTAGE}:undefined,
      verticalAlign:o.vAlign||VerticalAlign.CENTER
    });
  }
  function p(t,ctr,bold){return H.p(t||"",{center:!!ctr,bold:!!bold,size:H.SZ_TBL});}

  var iP=data.afterMethod1==="공공하수처리시설";
  var mPub=iP?"■":"□",mPrv=iP?"□":"■";
  var pn=data.afterPlantName||"";
  var eBOD=data.afterEfflBOD!=null?String(data.afterEfflBOD):"20";
  var eTP=data.afterEfflTP!=null?String(data.afterEfflTP):"4";
  var cap=data.afterCapacity||"";
  var ROW=400;

  var table=new Table({
    width:{size:100,type:WidthType.PERCENTAGE},
    borders:H.TBLB,
    rows:[
      // 오수처리
      new TableRow({height:{value:ROW},children:[cell(p("오수처리계획",true),{rs:15,wPct:12}),cell(p(mPub+" 공공",true),{rs:4,wPct:15}),cell(p("처리시설명",true),{cs:2,wPct:30}),cell(p(iP?pn:"",true),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설용량",true),{cs:2,wPct:30}),cell(p((iP?((cap?cap:"")):""),true),{wPct:25,borders:cb({right:non})}),cell(p("㎥/d"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("방류기준",true),{rs:2,wPct:15}),cell(p("BOD",true),{wPct:15}),cell(p(iP?String(eBOD):"",true),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("T-P",true),{wPct:15}),cell(p(iP?"-":"",true),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p(mPrv+" 개별",true),{rs:11,wPct:15}),cell(p("1",true),{rs:3,wPct:8}),cell(p("처리공법",true),{wPct:22}),cell(p(iP?"":(data.afterProcessMethod||"MBR공법"),true),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설용량",true),{wPct:22}),cell(p((iP?"":(cap?cap:"-")),true),{wPct:25,borders:cb({right:non})}),cell(p("㎥/d"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설개소수",true),{wPct:22}),cell(p(iP?"":"1",true),{wPct:25,borders:cb({right:non})}),cell(p("개소"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("2",true),{rs:3,wPct:8}),cell(p("처리공법",true),{wPct:22}),cell(p(""),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설용량",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("㎥/d"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설개소수",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("개소"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("방류기준",true),{rs:2,wPct:8}),cell(p("BOD",true),{wPct:22}),cell(p(iP?"":String(eBOD),true),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("T-P",true),{wPct:22}),cell(p(iP?"":String(eTP),true),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("강화기준",true),{rs:2,wPct:8}),cell(p("BOD",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("T-P",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("관련근거",true),{cs:2,wPct:30}),cell(p(data.techCertNo||"[기술검증번호]",true),{cs:2,wPct:43})]}),
      // 폐수처리
      new TableRow({height:{value:ROW},children:[cell(p("폐수처리계획\n(계획없음)",true),{rs:12,wPct:12}),cell(p("□ 공공",true),{rs:4,wPct:15}),cell(p("처리시설명",true),{cs:2,wPct:30}),cell(p(""),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설용량",true),{cs:2,wPct:30}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("㎥/d"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("방류기준",true),{rs:2,wPct:15}),cell(p("BOD",true),{wPct:15}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("T-P",true),{wPct:15}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("□ 개별",true),{rs:8,wPct:15}),cell(p("1",true),{rs:3,wPct:8}),cell(p("처리공법",true),{wPct:22}),cell(p(""),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설용량",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("㎥/d"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설개소수",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("개소"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("2",true),{rs:3,wPct:8}),cell(p("처리공법",true),{wPct:22}),cell(p(""),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설용량",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("㎥/d"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("시설개소수",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("개소"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("방류기준",true),{rs:2,wPct:8}),cell(p("BOD",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      new TableRow({height:{value:ROW},children:[cell(p("T-P",true),{wPct:22}),cell(p(""),{wPct:25,borders:cb({right:non})}),cell(p("mg/L"),{wPct:18,borders:cb({left:non})})]}),
      // 비점오염 (6열)
      new TableRow({height:{value:ROW},children:[cell(p("비점오염\n저감계획",true),{rs:3,wPct:12}),cell(p("종류",true),{rs:2,wPct:15}),cell(p("생태면적",true),{wPct:15}),cell(p("적용면적",true),{wPct:15}),cell(p("삭감량(kg/일)",true),{cs:2,wPct:43})]}),
      new TableRow({height:{value:ROW},children:[cell(p(""),{wPct:15}),cell(p(""),{wPct:15}),cell(p("BOD",true),{wPct:25}),cell(p("T-P",true),{wPct:18})]}),
      new TableRow({height:{value:ROW},children:[cell(p(""),{wPct:15}),cell(p("-",true),{wPct:15}),cell(p("-",true),{wPct:15}),cell(p("-",true),{wPct:25}),cell(p("-",true),{wPct:18})]})
    ]
  });
  return [H.heading2("3. 저감계획"),table,H.blank()];
}

// ── 생활계 ───────────────────────────────────────────────────────
function buildLifeSection(docx,calcResult,isWaterBuffer){
  var H=makeH(docx);
  var els=[H.pageBreak(),H.heading1("제2장 부하량 산정결과"),H.heading2("2.1 생활계")];
  var before=calcResult&&calcResult.생활계?calcResult.생활계.사업전:null;
  var after=calcResult&&calcResult.생활계?calcResult.생활계.사업후:null;
  els=els.concat(buildLifeBefore(docx,H,before,isWaterBuffer));
  els=els.concat(buildLifeAfter(docx,H,after,isWaterBuffer));
  els=els.concat(buildLifeSummary(docx,H,before,after));
  return els;
}

function buildLifeBefore(docx,H,before,isWaterBuffer){
  var els=[H.heading2("2.1.1 사업시행 전")];
  if(!before||(!before.가정인구&&!(before.영업인구&&before.영업인구.rows&&before.영업인구.rows.length))){
    els.push(H.p("◦ 본 사업부지는 사업시행 전 점오염원(생활계)에 의한 배출부하량은 없는 것으로 조사되었습니다."));
    return els;
  }
  var hh=before.가정인구,biz=before.영업인구;
  if(hh){
    els.push(H.heading3("가. 가정인구"));
    els.push(H.p("◦ 계획인구 : "+Math.round(hh.population)+"인",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.simpleTable(
      ["구분","계획인구\n(인)","급수원단위\n(L/인/일)","일평균급수량\n(㎥/일)","오수발생량\n(㎥/일)"],
      [["가정인구",Math.round(hh.population),F.f2(hh.급수원단위),F.f4(hh.일평균급수량),F.f4(hh.오수발생유량)]],
      [1200,1400,1800,1800,1800]
    ));
    els.push(H.blank());
    var bodUnit=window.CALC_CONSTS&&window.CALC_CONSTS.HH_LOAD_UNIT&&window.CALC_CONSTS.HH_LOAD_UNIT["비시가화"]?window.CALC_CONSTS.HH_LOAD_UNIT["비시가화"].BOD:48.6;
    var tpUnit=window.CALC_CONSTS&&window.CALC_CONSTS.HH_LOAD_UNIT&&window.CALC_CONSTS.HH_LOAD_UNIT["비시가화"]?window.CALC_CONSTS.HH_LOAD_UNIT["비시가화"].TP:1.45;
    els.push(H.simpleTable(
      ["구분","인구수\n(인)","BOD원단위\n(g/인/일)","BOD발생량\n(kg/일)","T-P원단위\n(g/인/일)","T-P발생량\n(kg/일)"],
      [["가정인구",Math.round(hh.population),bodUnit,F.f4(hh.발생부하량?hh.발생부하량.BOD:0),tpUnit,F.f4(hh.발생부하량?hh.발생부하량.TP:0)]],
      [1200,1200,1600,1500,1600,1500]
    ));
  }
  if(biz&&biz.rows&&biz.rows.length){
    els.push(H.heading3("나. 영업인구"));
    var bizRows=biz.rows.map(function(r){
      return [r.buildingNo+"동 "+r.floorNo+"층",useLabel(r),F.area(r.적용면적)+(r.unitType==="area"?"㎡":"인"),r.오수발생원단위,F.f4(r.오수발생유량),F.f4(r.발생부하량?r.발생부하량.BOD:0),F.f4(r.발생부하량?r.발생부하량.TP:0)];
    });
    bizRows.push(["합  계","","","",F.f4(biz.합계?biz.합계.오수발생유량:0),F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.BOD:0),F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.TP:0)]);
    els.push(H.blank());
    els.push(H.simpleTable(
      ["위치","용도","면적/인원","오수원단위\n(L/㎡)","오수발생량\n(㎥/일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"],
      bizRows,[1100,1400,1200,1100,1300,1300,1300]
    ));
  }
  els.push(H.heading3("다. 배출부하량"));
  els=els.concat(buildDischargeCalc(docx,H,before,"before",isWaterBuffer));
  return els;
}

function buildLifeAfter(docx,H,after,isWaterBuffer){
  var els=[H.heading2("2.1.2 사업시행 후")];
  if(!after||(!after.가정인구&&!(after.영업인구&&after.영업인구.rows&&after.영업인구.rows.length))){
    els.push(H.p("◦ 사업시행 후 생활계 배출부하량은 없는 것으로 산정됩니다."));
    return els;
  }
  var hh=after.가정인구,biz=after.영업인구;
  if(hh){
    els.push(H.heading3("가. 가정인구"));
    els.push(H.simpleTable(
      ["구분","계획인구\n(인)","급수원단위\n(L/인/일)","일평균급수량\n(㎥/일)","오수발생량\n(㎥/일)"],
      [["가정인구",Math.round(hh.population),F.f2(hh.급수원단위),F.f4(hh.일평균급수량),F.f4(hh.오수발생유량)]],
      [1200,1400,1800,1800,1800]
    ));
  }
  if(biz&&biz.rows&&biz.rows.length){
    els.push(H.heading3("나. 영업인구"));
    var bizRows=biz.rows.map(function(r){
      return [r.buildingNo+"동 "+r.floorNo+"층",useLabel(r),F.area(r.적용면적)+(r.unitType==="area"?"㎡":"인"),r.오수발생원단위,F.f4(r.오수발생유량),F.f4(r.발생부하량?r.발생부하량.BOD:0),F.f4(r.발생부하량?r.발생부하량.TP:0)];
    });
    bizRows.push(["합  계","","","",F.f4(biz.합계?biz.합계.오수발생유량:0),F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.BOD:0),F.f4(biz.합계&&biz.합계.발생부하량?biz.합계.발생부하량.TP:0)]);
    els.push(H.blank());
    els.push(H.simpleTable(
      ["위치","용도","면적/인원","오수원단위\n(L/㎡)","오수발생량\n(㎥/일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"],
      bizRows,[1100,1400,1200,1100,1300,1300,1300]
    ));
  }
  els.push(H.heading3("다. 배출부하량"));
  els=els.concat(buildDischargeCalc(docx,H,after,"after",isWaterBuffer));
  return els;
}

function buildDischargeCalc(docx,H,life,phase,isWaterBuffer){
  var els=[];
  if(!life)return els;
  var rows=(life.영업인구&&life.영업인구.rows)||[];
  var hh=life.가정인구;
  var pubRows=rows.filter(function(r){return(r.처리장정보&&r.처리장정보.name)||r.sewageMethod1==="공공하수처리시설";});
  var indRows=rows.filter(function(r){return r.sewageMethod1==="개인하수처리시설";});
  var sepRows=rows.filter(function(r){return r.sewageMethod1==="정화조";});

  if((hh&&hh.처리장정보&&hh.처리장정보.name)||pubRows.length>0){
    var pn=(hh&&hh.처리장정보&&hh.처리장정보.name)||(pubRows[0]&&pubRows[0].처리장정보&&pubRows[0].처리장정보.name)||"-";
    var eB=(hh&&hh.처리장정보&&hh.처리장정보.efflBOD!=null)?hh.처리장정보.efflBOD:(pubRows[0]&&pubRows[0].처리장정보&&pubRows[0].처리장정보.efflBOD!=null?pubRows[0].처리장정보.efflBOD:"-");
    var eT=(hh&&hh.처리장정보&&hh.처리장정보.efflTP!=null)?hh.처리장정보.efflTP:(pubRows[0]&&pubRows[0].처리장정보&&pubRows[0].처리장정보.efflTP!=null?pubRows[0].처리장정보.efflTP:"-");
    var pB=(hh&&hh.방류부하량?hh.방류부하량.BOD:0)+pubRows.reduce(function(s,r){return s+(r.방류부하량?r.방류부하량.BOD:0);},0);
    var pT=(hh&&hh.방류부하량?hh.방류부하량.TP:0)+pubRows.reduce(function(s,r){return s+(r.방류부하량?r.방류부하량.TP:0);},0);
    var pF=(hh?hh.관거이송량||0:0)+pubRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
    els.push(H.p("◦ 발생오수는 "+pn+"으로 유입·처리됩니다.",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.simpleTable(
      ["구분","관거이송유량\n(㎥/일)","방류농도BOD\n(mg/L)","방류농도T-P\n(mg/L)","방류부하량BOD\n(kg/일)","방류부하량T-P\n(kg/일)"],
      [[pn,F.f4(pF),String(eB),String(eT),F.f4(pB),F.f4(pT)]],
      [1400,1600,1400,1400,1600,1600]
    ));
  }
  if((hh&&hh.개인처리기준)||indRows.length>0){
    var std=(hh&&hh.개인처리기준&&hh.개인처리기준.std)||(indRows[0]&&indRows[0].개인처리기준&&indRows[0].개인처리기준.std)||{BOD:20,TP:4};
    var iB=(hh&&hh.배출부하량?hh.배출부하량.BOD:0)+indRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.BOD:0);},0);
    var iT=(hh&&hh.배출부하량?hh.배출부하량.TP:0)+indRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.TP:0);},0);
    var iF=(hh?hh.오수발생유량||0:0)+indRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
    els.push(H.p("◦ 개인오수처리시설 방류수질기준 : BOD "+std.BOD+"mg/L, T-P "+std.TP+"mg/L",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.simpleTable(
      ["구분","오수발생량\n(㎥/일)","방류농도BOD\n(mg/L)","방류농도T-P\n(mg/L)","배출부하량BOD\n(kg/일)","배출부하량T-P\n(kg/일)"],
      [["개인오수처리시설",F.f4(iF),String(std.BOD),String(std.TP),F.f4(iB),F.f4(iT)]],
      [1600,1600,1400,1400,1600,1600]
    ));
  }
  if(sepRows.length>0){
    var sB=sepRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.BOD:0);},0);
    var sT=sepRows.reduce(function(s,r){return s+(r.배출부하량?r.배출부하량.TP:0);},0);
    var sF=sepRows.reduce(function(s,r){return s+(r.오수발생유량||0);},0);
    var gB=sepRows.reduce(function(s,r){return s+(r.발생부하량?r.발생부하량.BOD:0);},0);
    els.push(H.p("◦ 정화조 처리 배출부하량 (BOD 25% 개별삭감 적용)",{size:H.SZ_SM}));
    els.push(H.blank());
    els.push(H.simpleTable(
      ["구분","오수발생량\n(㎥/일)","발생BOD\n(kg/일)","개별삭감BOD\n(kg/일)","배출BOD\n(kg/일)","배출T-P\n(kg/일)"],
      [["정화조",F.f4(sF),F.f4(gB),F.f4(gB*0.25),F.f4(sB),F.f4(sT)]],
      [1200,1600,1400,1400,1400,1400]
    ));
  }
  var td=life.합계?life.합계.배출부하량:null;
  if(td){
    els.push(H.blank());
    els.push(H.simpleTable(
      ["구분","점오염 BOD\n(kg/일)","점오염 T-P\n(kg/일)","비점오염 BOD\n(kg/일)","비점오염 T-P\n(kg/일)"],
      [["생활계 배출부하량",F.f4(td.BOD),F.f4(td.TP),"-","-"]],
      [1800,1700,1700,1700,1700]
    ));
  }
  return els;
}

function buildLifeSummary(docx,H,before,after){
  var els=[H.heading2("2.1.3 생활계 배출부하량 총괄")];
  var bD=(before&&before.합계&&before.합계.배출부하량)||{BOD:0,TP:0};
  var aD=(after&&after.합계&&after.합계.배출부하량)||{BOD:0,TP:0};
  var dB=aD.BOD-bD.BOD,dT=aD.TP-bD.TP;
  els.push(H.p("◦ 생활계 총 배출부하량은 사업시행 후 BOD "+F.f4(aD.BOD)+"kg/일, T-P "+F.f4(aD.TP)+"kg/일, 사업시행 전 BOD "+F.f4(bD.BOD)+"kg/일, T-P "+F.f4(bD.TP)+"kg/일로 산정됩니다.",{size:H.SZ_SM}));
  els.push(H.blank());
  els.push(H.simpleTable(
    ["구분","사업시행 후 ①\n(kg/일)","사업시행 전 ②\n(kg/일)","최종 배출(①-②)\n(kg/일)"],
    [["BOD(점오염)",F.f4(aD.BOD),F.f4(bD.BOD),F.bodDelta(dB)],["T-P(점오염)",F.f4(aD.TP),F.f4(bD.TP),F.tpDelta(dT)]],
    [2000,2000,2000,2000]
  ));
  els.push(H.note("주) 최종 배출부하량이 음수인 경우 ≒0.00으로 처리"));
  els.push(H.blank());
  return els;
}

// ── 토지계 ───────────────────────────────────────────────────────
function buildLandSection(docx,calcResult,unitBasin){
  var H=makeH(docx);
  var els=[H.heading2("2.2 토지계")];
  var lB=calcResult&&calcResult.토지계?calcResult.토지계.사업전:null;
  var lA=calcResult&&calcResult.토지계?calcResult.토지계.사업후:null;

  els.push(H.heading2("2.2.1 사업시행 전"));
  els.push(H.p("◦ 비점오염원 발생부하량 = 지목별 면적 × 지목별 연평균발생부하원단위",{size:H.SZ_SM}));
  if(lB&&lB.rows&&lB.rows.length){
    var bR=lB.rows.map(function(r){return[r.jmok,F.area(r.area),F.f2(r.원단위.BOD),F.f2(r.원단위.TP),F.f4(r.발생부하량.BOD),F.f4(r.발생부하량.TP)];});
    bR.push(["합  계",F.area(lB.rows.reduce(function(s,r){return s+r.area;},0)),"","",F.f4(lB.합계.발생부하량.BOD),F.f4(lB.합계.발생부하량.TP)]);
    els.push(H.blank());
    els.push(H.simpleTable(["지목","편입면적\n(㎡)","BOD원단위\n(kg/㎢·일)","T-P원단위\n(kg/㎢·일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"],bR,[1200,1400,1600,1600,1600,1600]));
  }else{
    els.push(H.p("◦ 사업시행 전 토지계 발생부하량은 없는 것으로 조사되었습니다."));
  }

  els.push(H.heading2("2.2.2 사업시행 후"));
  if(lA&&lA.rows&&lA.rows.length){
    var aR=lA.rows.map(function(r){return[r.jmok,F.area(r.area),F.f2(r.원단위.BOD),F.f2(r.원단위.TP),F.f4(r.발생부하량.BOD),F.f4(r.발생부하량.TP)];});
    aR.push(["합  계",F.area(lA.rows.reduce(function(s,r){return s+r.area;},0)),"","",F.f4(lA.합계.발생부하량.BOD),F.f4(lA.합계.발생부하량.TP)]);
    els.push(H.blank());
    els.push(H.simpleTable(["지목","편입면적\n(㎡)","BOD원단위\n(kg/㎢·일)","T-P원단위\n(kg/㎢·일)","발생BOD\n(kg/일)","발생T-P\n(kg/일)"],aR,[1200,1400,1600,1600,1600,1600]));
    els.push(H.blank());
    els.push(H.simpleTable(
      ["구분","발생BOD\n(kg/일)","삭감량BOD","배출BOD\n(kg/일)","발생T-P\n(kg/일)","배출T-P\n(kg/일)"],
      [["비점오염",F.f4(lA.합계.발생부하량.BOD),"-",F.f4(lA.합계.배출부하량.BOD),F.f4(lA.합계.발생부하량.TP),F.f4(lA.합계.배출부하량.TP)]],
      [1200,1600,1200,1600,1600,1600]
    ));
  }else{
    els.push(H.p("◦ 사업시행 후 발생하는 토지계 부하량은 없는 것으로 산정됩니다."));
  }

  els.push(H.heading2("2.2.3 토지계 배출부하량 총괄"));
  var tbB=lB&&lB.합계&&lB.합계.배출부하량?lB.합계.배출부하량.BOD:0;
  var tbT=lB&&lB.합계&&lB.합계.배출부하량?lB.합계.배출부하량.TP:0;
  var taB=lA&&lA.합계&&lA.합계.배출부하량?lA.합계.배출부하량.BOD:0;
  var taT=lA&&lA.합계&&lA.합계.배출부하량?lA.합계.배출부하량.TP:0;
  els.push(H.blank());
  els.push(H.simpleTable(
    ["구분","사업전 ①\n(kg/일)","사업후 ②\n(kg/일)","삭감량 ③\n(kg/일)","최종배출(②-①-③)\n(kg/일)"],
    [["BOD("+(unitBasin||"단위유역")+", 비점)",F.f4(tbB),F.f4(taB),"-",F.bodDelta(taB-tbB)],["T-P("+(unitBasin||"단위유역")+", 비점)",F.f4(tbT),F.f4(taT),"-",F.tpDelta(taT-tbT)]],
    [1800,1600,1600,1400,1800]
  ));
  els.push(H.note("주) 증감이 음수인 경우 ≒0.00으로 처리"));
  els.push(H.blank());
  return els;
}

// ── 최종배출부하량 ────────────────────────────────────────────────
function buildFinalSection(docx,calcResult,unitBasin){
  var H=makeH(docx);
  var els=[H.heading2("2.3 총 배출부하량")];
  var pt=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.점오염)||{BOD:0,TP:0};
  var bis=(calcResult&&calcResult.최종배출부하량&&calcResult.최종배출부하량.비점오염)||{BOD:0,TP:0};
  els.push(H.p("◦ 금회 사업으로 인한 점오염원(생활계) 최종 배출부하량은 BOD "+F.bod(pt.BOD)+"kg/일, T-P "+F.tp(pt.TP)+"kg/일이며, 비점오염원(토지계) 최종 배출부하량은 BOD "+F.bod(bis.BOD)+"kg/일, T-P "+F.tp(bis.TP)+"kg/일로 산정되었습니다.",{size:H.SZ_SM}));
  els.push(H.blank());
  var byBasin=(calcResult&&calcResult.단위유역별배출)||{};
  var bR=[];
  for(var basin in byBasin){
    var d=byBasin[basin];
    if(d.점오염)bR.push([basin,"점오염",F.bod(d.점오염.BOD||0),F.tp(d.점오염.TP||0)]);
    if(d.비점오염)bR.push([basin,"비점오염",F.bod(d.비점오염.BOD||0),F.tp(d.비점오염.TP||0)]);
  }
  if(!bR.length)bR=[[unitBasin||"-","점오염",F.bod(pt.BOD),F.tp(pt.TP)],[unitBasin||"-","비점오염",F.bod(bis.BOD),F.tp(bis.TP)]];
  els.push(H.simpleTable(["단위유역","배출구분","BOD\n(kg/일)","T-P\n(kg/일)"],bR,[2200,1800,1800,1800]));
  els.push(H.blank());
  return els;
}

// ── 저감방안 ─────────────────────────────────────────────────────
function buildMitigationSection(docx,data){
  var H=makeH(docx);
  var iP=data.afterMethod1==="공공하수처리시설",pn=data.afterPlantName||"[처리장명]";
  return [H.pageBreak(),H.heading1("제3장 저감방안"),H.heading2("3.1 오수처리계획"),
    H.p(iP?"◦ 본 사업지구는 하수처리구역 내 지역으로 사업지구 내 발생오수는 전량 "+pn+"으로 유입하여 처리할 계획입니다.":"◦ 본 사업지구는 하수처리구역 외 지역으로 개인오수처리시설을 설치하여 처리할 계획입니다.",{size:H.SZ_SM}),
    H.blank(),H.heading2("3.2 비점오염원 처리계획"),
    H.p("◦ 비점오염물질 발생억제 방안",{bold:true,size:H.SZ_SM}),H.p("  [여기에 직접 입력하세요]",{size:H.SZ_SM}),
    H.p("◦ 지표면 오염물질 제거 방안",{bold:true,size:H.SZ_SM}),H.p("  [여기에 직접 입력하세요]",{size:H.SZ_SM}),
    H.p("◦ 부지 내 강우 유출수 및 오염물질 저감 방안",{bold:true,size:H.SZ_SM}),H.p("  [여기에 직접 입력하세요]",{size:H.SZ_SM}),
    H.blank(),H.heading2("3.3 폐수처리계획"),H.p("◦ 해당사항 없음.",{size:H.SZ_SM}),H.blank()
  ];
}

// ── 부록 ─────────────────────────────────────────────────────────
function buildAppendixSection(docx){
  var H=makeH(docx);
  return [H.pageBreak(),H.heading1("제4장 부록"),H.p("[토지·임야대장 첨부]",{size:H.SZ_SM}),H.blank(),H.p("[건축물대장 첨부]",{size:H.SZ_SM}),H.blank(),H.p("[건축평면도 첨부]",{size:H.SZ_SM}),H.blank()];
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

    var pn=getVal("projectName"),sido=getVal("sidoSelect"),sigun=getVal("sigunSelect"),loc=getVal("projectLocationDetail");
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
    var envRiver=document.querySelector('input[name="env_river"]:checked')&&document.querySelector('input[name="env_river"]:checked').value==="해당";
    var envWaterSource=document.querySelector('input[name="env_water"]:checked')&&document.querySelector('input[name="env_water"]:checked').value==="해당";
    var envSpecialEl=document.querySelector('input[name="env_special"]:checked');
    var envSpecial=envSpecialEl?envSpecialEl.value:"none";
    var bizHistory=getVal("bizHistory"),writerName=getVal("writerName"),writerContact=getVal("writerContact");
    var unitBasin=getVal("unitBasinSelect");

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
      afterMethod1:afterMethod1,
      afterPlantName:afterPlantInfo?afterPlantInfo.name:(afterMethod2||""),
      afterEfflBOD:afterPlantInfo?afterPlantInfo.efflBOD:null,
      afterEfflTP:afterPlantInfo?afterPlantInfo.efflTP:null,
      afterCapacity:afterPlantInfo?afterPlantInfo.capacity:"",
      afterProcessMethod:"MBR공법",
      techCertNo:"[기술검증번호]",
      calcResult:calcResult
    };

    var coverSection=buildCoverSection(_docx,data);
    var bodyChildren=[].concat(
      buildChongGwalBlock(_docx,data),
      buildJeogamBlock(_docx,data),
      buildLifeSection(_docx,calcResult,envRiver),
      buildLandSection(_docx,calcResult,unitBasin),
      buildFinalSection(_docx,calcResult,unitBasin),
      buildMitigationSection(_docx,data),
      buildAppendixSection(_docx)
    );
    var bodySection={
      properties:{page:{margin:{top:MARGIN_TOP,bottom:MARGIN_BOTTOM,left:MARGIN_LEFT,right:MARGIN_RIGHT}}},
      children:bodyChildren
    };
    var doc=new Document({sections:[coverSection,bodySection]});
    Packer.toBlob(doc).then(function(blob){
      saveAs(blob,(typeof CONFIG!=="undefined"?CONFIG.DOCX_FILENAME:"수질오염총량검토서.docx"));
    });
  }catch(err){
    console.error("[word-gen.js]",err);
    alert("Word 생성 중 오류가 발생했습니다.\n\n"+(err&&err.message?err.message:String(err)));
  }
}

window.generateDoc=generateDoc;
