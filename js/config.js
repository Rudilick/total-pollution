// ================================================================
// config.js  ─  전역 설정값
// 환경에 따라 바꿔야 하는 값은 여기에만 두세요.
// ================================================================

const CONFIG = {
  // ★ GitHub Raw URL - 원단위 엑셀 파일 경로
  // 파일 업데이트 시 GitHub에 덮어쓰기하면 자동 반영됩니다.
  DB_EXCEL_URL: "https://raw.githubusercontent.com/Rudilick/total-pollution/main/data.xlsx",
  DB_EXCEL_URL: "/data.xlsx",
  
  // Word 출력 파일명
  DOCX_FILENAME: "수질오염총량검토서.docx",

  // 엑셀 시트명 (변경 시 여기서만 수정)
  SHEET_UNIT:    "건축물용도별 오수발생량 및 부하량 원단위",
  SHEET_PLANT:   "하수처리장",
  SHEET_POPUNIT: "인구수 원단위",
};
