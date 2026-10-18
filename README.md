# 켜켜이

지나온 장소와 시간을 한 겹씩 쌓아 두는 개인 기록장이에요. 추억을 시군구 지도와 연도별 타임라인에 쌓아요. 기록은 이 브라우저 안(IndexedDB)에만 저장되고 어디로도 보내지 않아요.

https://kingjnu-sakayume.github.io/kyeokyeoi/

## 화면

- **지도**: 추억이 있는 시군구일수록 짙게 칠해요. 두 손가락이나 +/− 버튼으로 확대하고, 지역을 누르면 그곳의 추억이 나와요.
- **타임라인**: 한 해가 한 층이에요. 날짜를 몰라도 ‘중학교 2학년 때’, ‘몇 살 때’로 적으면 태어난 해로 연도를 계산해 그 층에 넣어요. 때를 모르는 추억은 맨 아래 ‘언젠가’ 층에 모여요.
- **설정**: 태어난 해, 색 테마 4가지, 백업 내보내기·불러오기.

주소가 화면마다 달라서(`#/map`, `#/timeline`, `#/memory/<id>`) 브라우저·안드로이드 뒤로 가기가 그대로 동작해요.

## 실행

Node 22가 필요해요.

```sh
npm ci
npm run dev      # http://localhost:5173/kyeokyeoi/
npm run lint
npm run build    # docs/에 빌드 (GitHub Pages가 main의 /docs를 보여줘요)
```

PR마다 `check.yml`이 린트와 빌드를 확인하고, main에 합쳐지면 `deploy.yml`이 다시 빌드해 `docs/`를 커밋해요. 그래서 PR에는 `docs/`를 넣지 않아도 돼요.

## 데이터

IndexedDB `kkyeokyeoi-db` (철자는 첫 버전 그대로 둬요. 바꾸면 기존 기록을 못 찾아요.)

| 저장소 | 내용 |
| --- | --- |
| `memories` | 추억. 사진은 `photoIds`(순서대로 id)만 가져요 |
| `photos` | `{ id, memoryId, blob }`. 사진은 긴 변 1600px 이하 WebP로 줄여서 넣어요 (WebP를 못 만드는 브라우저는 JPEG) |
| `settings` | `birth_year`, `app_theme`, `onboarding_done`, `last_backup_at` |

버전 1(사진을 base64로 추억 안에 넣던 형식)에서 열면 자동으로 버전 2로 옮겨요. 추억 하나에 사진은 5장까지예요.

### 백업

설정에서 내려받는 JSON 파일이에요.

```json
{ "app": "kyeokyeoi", "version": 2, "exportedAt": "…", "settings": { "birth_year": 1999 },
  "memories": [ … ], "photos": { "<photoId>": "data:image/webp;base64,…" } }
```

불러오기는 합치기만 해요. 같은 id의 추억이 이미 있으면 그대로 두고, 없는 추억만 더해요. 형식이 틀린 추억과 이미지가 아닌 사진은 건너뛰어요.

## 지도 데이터

`public/regions.json`은 [southkorea-maps](https://github.com/southkorea/southkorea-maps)의 2013년 시군구 경계(kostat, simple)를 미리 SVG 경로로 바꿔 둔 파일이에요. 앱과 함께 배포돼서 오프라인에서도 열려요.

```sh
npm run regions -- <skorea_municipalities_geo_simple.json 경로>
```

저장된 추억이 지역 코드를 참조하므로 코드는 바꾸지 않고 이름·소속만 보정해요 (`scripts/build-regions.mjs`).

- 군위군은 2023년 대구 편입을 반영해 ‘대구 군위군’으로 보여요.
- 세종은 ‘세종특별자치시’ 하나로 보여요.
- 2013년 이후의 다른 개편(청주·청원 통합, 부천 일반구 재설치 등)은 아직 반영하지 않았어요.

## 파일

| 경로 | 내용 |
| --- | --- |
| `src/App.tsx` | 시작, 주소 기반 화면 이동, 추억 시트·알림 |
| `src/db/index.ts` | IndexedDB, 버전 1→2 이전, 백업 |
| `src/map/` | 지도 데이터 읽기, 지도(확대·이동·탭) |
| `src/views/` | 지도·타임라인·설정·상세·처음 시작 화면 |
| `src/components/` | 추억 시트, 장소 고르기, 시트·대화상자 등 |
| `src/index.css` | 색 테마와 모든 스타일 |
