# dxf-archive-server

도면 아카이브 API 서버. 일련번호(예: `HG20261345`)별로 단계별 표준화 DXF 도면과
사업 메타정보를 저장/조회한다. (`dxf/` 정적 사이트의 "도면 아카이브" 기능에서 사용)

## 로컬 실행

```bash
cd dxf-archive-server
npm install
cp .env.example .env   # DATABASE_URL, ADMIN_TOKEN 등 입력
npm run dev
```

`GET http://localhost:3000/api/health` → `{ "ok": true }` 확인.
서버 부팅 시 `src/migrations/*.sql`이 자동 실행되어 테이블이 생성된다.

## 환경변수

- `DATABASE_URL` - Postgres 연결 문자열 (Railway Postgres 플러그인이 자동 제공)
- `ADMIN_TOKEN` - 등록/수정/삭제 API에 필요한 관리자 토큰 (임의 문자열)
- `PORT` - 서버 포트 (Railway가 자동 주입)
- `CORS_ORIGIN` - (선택) 콤마로 구분된 허용 origin 목록. 비워두면 모두 허용.

## API 요약

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/health` | - | 헬스체크 |
| GET | `/api/projects?q=` | - | 일련번호/사업명 검색 |
| GET | `/api/projects/:serial_no` | - | 프로젝트 + 단계별 도면 조회 |
| POST | `/api/projects` | 관리자 | 신규 프로젝트 + 단계별 도면 등록 |
| POST | `/api/projects/:serial_no/stages` | 관리자 | 다음 차수 도면 추가 |
| DELETE | `/api/projects/:serial_no/stages/:stage_index` | 관리자 | 단계 삭제(오류 정정) |
| PATCH | `/api/projects/:serial_no` | 관리자 | 메타정보 수정 |

관리자 API는 `Authorization: Bearer <ADMIN_TOKEN>` 헤더가 필요하다.

## Railway 배포

1. 새 Railway 프로젝트 생성 후 Postgres 플러그인 추가 → `DATABASE_URL` 자동 제공.
2. 이 폴더(`dxf-archive-server`)를 Root Directory로 지정한 서비스 생성 (모노레포이므로
   서비스 설정 > Root Directory에 `dxf-archive-server` 입력).
3. 환경변수에 `ADMIN_TOKEN` 추가 (임의 문자열). 필요 시 `CORS_ORIGIN` 설정.
4. 배포 완료 후 발급되는 `*.up.railway.app` URL을 `dxf/js/archive-config.js`의
   `ARCHIVE_API_BASE`에 반영.
