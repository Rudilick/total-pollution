# 수질오염총량검토서 작성 시스템

## 파일 구조

```
project/
├── index.html              # 메인 진입점 (UI HTML)
├── css/
│   └── style.css           # 전체 스타일
├── js/
│   ├── config.js           # ★ 설정값 (GitHub URL 등 여기만 수정)
│   ├── utils.js            # 숫자 포맷, 공통 유틸
│   ├── db-loader.js        # GitHub에서 엑셀 로드 & 파싱
│   ├── ui-basic.js         # 탭, select 초기화, DOMContentLoaded
│   ├── life-module.js      # 생활계 UI 모듈 (동/층/용도 입력)
│   ├── land-module.js      # 토지계 UI 모듈 (지목별 면적 입력)
│   └── word-gen.js         # Word(.docx) 문서 생성
└── README.md
```

## 원단위 DB 업데이트 방법

1. `data.xlsx` 파일을 GitHub 레포에 덮어쓰기 업로드
2. 페이지를 새로고침하면 자동으로 최신 원단위가 적용됨
3. URL 변경이 필요하면 `js/config.js`의 `DB_EXCEL_URL`만 수정

## JS 로드 순서 (중요)

`index.html` 하단에서 아래 순서로 로드됩니다:

```
config.js → utils.js → db-loader.js → ui-basic.js → life-module.js → land-module.js → word-gen.js
```

순서가 바뀌면 참조 오류가 발생합니다.

## 주요 전역 변수 (파일 간 공유)

| 변수 | 선언 위치 | 설명 |
|------|-----------|------|
| `CONFIG` | config.js | GitHub URL 등 설정값 |
| `DB_EXCEL_URL` | db-loader.js | CONFIG에서 읽은 URL |
| `LIFE_USE_DB` | db-loader.js | 용도별 원단위 계층 구조 DB |
| `LIFE_FACTOR_MAP` | db-loader.js | 원단위 수치 조회 맵 |
| `SEWAGE_PLANT_DB` | db-loader.js | 하수처리장 DB |
| `POPULATION_UNIT_DB` | db-loader.js | 인구수 원단위 DB |
| `lifeBefore` / `lifeAfter` | life-module.js | 생활계 사업전/후 모듈 인스턴스 |
| `landState` | land-module.js | 토지계 입력 상태 |
