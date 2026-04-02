# 수질오염총량검토서 작성 시스템  v2

## 파일 구조

```
project/
├── index.html              # 메인 진입점
├── data.xlsx               # 원단위 DB (GitHub에 올려두면 자동 로드)
├── css/
│   └── style.css
├── js/
│   ├── config.js           # ★ GitHub URL 등 설정 (여기만 수정)
│   ├── utils.js            # 숫자 파싱/포맷 유틸
│   ├── db-loader.js        # Excel 파싱 (관로비율 전체 파싱)
│   ├── ui-basic.js         # DOMContentLoaded 단일 관리
│   ├── life-module.js      # 생활계 UI (동/층/용도)
│   ├── land-module.js      # 토지계 UI (지목별 면적)
│   ├── calc.js             # 오염부하량 계산 엔진 v2
│   └── word-gen.js         # Word 문서 생성
└── README.md
```

## v2 주요 변경사항

### 1. 배출부하량 계산 방식 전면 교체 (calc.js)

| 항목 | v1 (이전) | v2 (현재) |
|------|----------|----------|
| 접근 방식 | 분뇨/잡배수 직접이송 | 관거이송량 기반 |
| 공식 | 방류유량 × 방류수질 (잡배수만) | ①관거이송량 × 방류수질 + ②발생부하량 × 관거유실율 |
| 중간값 | 직접이송유량 | 관거이송량, 관거배출유량, 관거배출유량비, 관거배출부하량, 방류부하량 |
| 검토서 일치 | ✗ | ✓ (남양주시 참고자료 수치 일치) |

**계산 공식 (기술지침 §Ⅷ + 남양주시 참고자료):**
```
관거이송량     = 오수발생량 × 방류유량비 (= 1 - 관거배출유량비)
방류부하량     = 관거이송량 × 방류수질(mg/L)
관거배출부하량 = 발생부하량 × 관거유실율(BOD비/TN비/TP비 합)
배출부하량     = 방류부하량 + 관거배출부하량
```

### 2. data.xlsx - 하수처리장 시트 열 구조

| 열 | 내용 |
|----|------|
| A | 코드 |
| B | 광역자치단체 |
| C | 기초자치단체 |
| D | 처리장명 |
| E | 시설용량 (㎥/d) |
| F~I | 관로누수비 유량/BOD/TN/TP (소수: 3.0453%→0.030453) |
| J~M | 관로월류비 유량/BOD/TN/TP |
| N~Q | 미처리배제비 유량/BOD/TN/TP |
| R | 방류수질 BOD (mg/L) |
| S | 방류수질 TN (mg/L) |
| T | 방류수질 TP (mg/L) |
| U | 방류유량비 = 1 - (누수비+월류비+배제비)_유량 |

### 3. db-loader.js - 처리장 전체 열 파싱

이제 `SEWAGE_PLANT_DB` 객체에 포함되는 필드:
- `leakRatioFlow/BOD/TN/TP` - 관로누수비
- `overflowRatioFlow/BOD/TN/TP` - 관로월류비  
- `untreatRatioFlow/BOD/TN/TP` - 미처리배제비
- `efflBOD/TN/TP` - 방류수질
- `efflFlowRatio` - 방류유량비

### 4. 중간계산값 전부 row에 보존 (word-gen.js 매핑 가능)

각 row 객체에 포함:
- `관거이송량`, `관거배출유량`, `관거배출유량비_pct`
- `방류부하량`, `관거배출부하량`
- `관거유실율_pct` (BOD/TN/TP)
- `처리장정보` (name, capacity, efflBOD/TN/TP)

### 5. DOMContentLoaded 중복 제거

`life-module.js`에서 DOMContentLoaded 제거 → `ui-basic.js` 단일 관리

## JS 로드 순서 (중요)

```
config.js → utils.js → db-loader.js → ui-basic.js → life-module.js → land-module.js → calc.js → word-gen.js
```

## 원단위 DB 업데이트 방법

1. `data.xlsx` 파일을 GitHub 레포에 덮어쓰기 업로드
2. 페이지 새로고침 시 자동 반영
3. URL 변경 필요 시 `js/config.js`의 `DB_EXCEL_URL`만 수정

## 수치 검증 결과

화도하수처리시설(창현리 도시형생활주택) 검토서 기준:

| 항목 | calc.js v2 | PDF 원문 |
|------|-----------|---------|
| 관거이송량 | 52.0841 ㎥/일 | 52.0841 ✓ |
| 방류부하량 BOD | 0.1563 kg/일 | 0.1563 ✓ |
| 관거배출부하량 BOD | 0.1505 kg/일 | 0.1505 ✓ |
| 배출부하량 BOD | 0.3067 kg/일 | 0.3068 ✓ |
| 배출부하량 TP | 0.0151 kg/일 | 0.0150 ✓ |
