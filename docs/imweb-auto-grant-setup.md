# 아임웹 결제 → 앱 이용권 자동 부여 (timeisprice 사례)

다른 앱·다른 상품에도 같은 방식으로 연결할 때 참고하는 **설정·구현·시행착오** 정리입니다.

---

## 1. 무엇을 만들었나

**목표:** doodledoodle(아임웹)에서 **66번(최초 1년)** · **67번(갱신 1년)** 결제 → timeisprice 이용권 자동 부여·연장

**고객 흐름 (의도):**

1. 아임웹에서 결제 (이메일 입력)
2. timeisprice 가입 (같은 이메일)
3. 별도 관리자 작업 없이 **active + 1년**

**결제가 가입보다 먼저여도 OK:** 서버에 `pending`으로 적어 두었다가, 가입 시 같은 이메일이면 자동 `applied`.

**검증 완료 (2026-07-01):**

- 이메일 `j65ryydca528@icloud.com`
- 주문 66번 → `imweb_order_grants` **applied**
- 가입 후 `user_subscriptions` **active**, 만료 **약 1년 뒤**

---

## 2. 전체 구조 (한눈에)

```
[고객] doodledoodle 결제
    ↓ 웹훅 (ORDER_*)
[Supabase Edge Function] imweb-order-webhook
    ↓ DB 함수
[Supabase] imweb_order_grants (주문 기록)
    ↓ 이미 가입된 이메일이면 즉시 / 아니면 pending
[Supabase] user_subscriptions (1년 이용권)

---

[관리자 1회] 아임웹 개발자센터 OAuth 연동
    ↓ siteCode + OAuth
[Supabase] imweb-connect → imweb-oauth-callback
    ↓ 연동완료 API + 토큰 저장
[Supabase] imweb_site_connections
    ↓ 상태: 테스트연동 → 연동완료
[실주문 웹훅 수신 가능]
```

| 구분 | 역할 |
|------|------|
| **웹훅** | 결제·주문 알림 → 이용권 부여 |
| **OAuth 연동** | 「연동완료」 처리 → **실제 구매** 웹훅 받기 |
| **DB** | 주문 중복 방지, pending, 1년 연장 |

---

## 3. 코드·DB 위치 (이 저장소)

### DB 마이그레이션 (SQL Editor에서 Run 순서)

| 파일 | 내용 |
|------|------|
| `supabase/migrations/20260630200000_imweb_order_grants.sql` | 주문 기록 테이블, 부여 RPC |
| `supabase/migrations/20260701120000_imweb_webhook_log_and_pay_fix.sql` | 웹훅 수신 로그, payload 정규화, pending 가입 연동 |
| `supabase/migrations/20260701140000_imweb_grant_on_order_create.sql` | **결제 확인 없이** 66번 주문만 1년 부여 |
| `supabase/migrations/20260701170000_imweb_renewal_prod_67.sql` | **67번** 갱신권 → active 회원 +1년 연장 |
| `supabase/migrations/20260701150000_imweb_site_connections.sql` | OAuth 연동 후 사이트별 토큰 저장 |

### Edge Functions (Supabase CLI 배포)

| 함수 | 역할 |
|------|------|
| `imweb-order-webhook` | 주문 웹훅 수신 → DB 부여 |
| `imweb-connect` | OAuth 시작 (`?siteCode=`) |
| `imweb-oauth-callback` | code → 토큰 → **연동완료 API** → DB 저장 |

공통: `supabase/functions/_shared/imwebOAuth.ts`, `imwebPayload.ts`

### 프론트 (선택)

| 파일 | 역할 |
|------|------|
| `src/utils/imwebConnectBootstrap.js` | `timeisprice.com?siteCode=` → OAuth 시작 |
| `src/main.js` | 위 부트스트랩 + 연동 결과 토스트 |

---

## 4. 아임웹 개발자센터 설정

### 4.1 앱 정보

| 항목 | timeisprice 값 |
|------|----------------|
| **서비스 URL** | `https://timeisprice.com` |
| **리다이렉트 URI** | `https://<project>.supabase.co/functions/v1/imweb-oauth-callback` |
| **클라이언트 ID / Secret** | 앱 정보에서 복사 → Supabase Secrets |

**리다이렉트 URI 주의:** 아임웹에 등록한 문자열과 Supabase `IMWEB_REDIRECT_URI` Secret이 **한 글자까지 같아야** 합니다.  
(`?apikey=...` 는 **넣지 않음** — Supabase 함수는 `verify_jwt = false` 로 apikey 없이도 콜백 가능)

### 4.2 API 설정

- **Order(주문)** 읽기 — 승인·ON
- **site-info** — 연동완료 API용 **`site-info:write`** 권한 필요 (scope에 포함)

### 4.3 웹훅

- URL 예:  
  `https://<project>.supabase.co/functions/v1/imweb-order-webhook?apikey=<anon_key>`
- 이벤트: 주문 생성·입금 완료 등 (디지털 상품이면 배송 이벤트 불필요)
- **인증 정보(보기)** → `IMWEB_WEBHOOK_SECRET` 으로 Secrets 등록

### 4.4 연동 (OAuth)

UI는 버전마다 다름. 2026년 기준:

- 왼쪽 **「연동 사이트 관리」** — 테스트 사이트 목록·상태
- **「동의」 버튼이 없을 때:** 이미 **테스트연동** 된 상태일 수 있음
- **연동완료** 로 바꾸려면 OAuth URL을 직접 열거나, 서비스 URL로 `?siteCode=` 리다이렉트

**수동 연동 URL (doodledoodle siteCode 예):**

```
https://<project>.supabase.co/functions/v1/imweb-connect?siteCode=S20210817acdbd0f4b74c2
```

성공 시 `timeisprice.com/?imweb=connected` 로 돌아옴.

---

## 5. Supabase Secrets (Edge Functions)

```bash
cd "/path/to/project" && supabase secrets set \
  IMWEB_CLIENT_ID='...' \
  IMWEB_CLIENT_SECRET='...' \
  IMWEB_REDIRECT_URI='https://<project>.supabase.co/functions/v1/imweb-oauth-callback' \
  IMWEB_OAUTH_SCOPE='order:read site-info:read site-info:write' \
  IMWEB_CONNECT_SUCCESS_URL='https://timeisprice.com/' \
  IMWEB_WEBHOOK_SECRET='...' \
  --project-ref <project-ref>
```

선택:

- `IMWEB_TARGET_PROD_NO` — 대상 상품 번호 (기본 `66`)
- `IMWEB_SITE_CODE` — 특정 siteCode만 받을 때

배포:

```bash
supabase functions deploy imweb-order-webhook imweb-connect imweb-oauth-callback --project-ref <project-ref>
```

`supabase/config.toml` 에 OAuth·웹훅 함수는 `verify_jwt = false`.

---

## 6. 시행착오 정리 (다른 앱에서 피할 것)

### 6.1 「테스트연동」 vs 「연동완료」

| 상태 | 실제 구매 웹훅 |
|------|----------------|
| **테스트연동** | ❌ 안 옴 (개발자센터 「테스트 보내기」만 됨) |
| **연동완료** | ✅ 옴 |

**증상:** 테스트 웹훅은 200인데, 실결제 후 `imweb_order_grants`에 줄이 안 생김. Logs에 shutdown만 보임.  
**해결:** OAuth → **연동완료 API** 호출까지 끝내기.

### 6.2 `Invalid redirect uri` (오류 30098)

**원인:** OAuth 요청의 `redirectUri` ≠ 개발자센터에 **저장된** 리다이렉트 URI.

**헷갈린 점:**

- 화면에 Supabase URL을 적어 두었는데 **저장 안 누름**
- Secret에는 `?apikey=...` 붙였는데 아임웹에는 없음 (또는 반대)

**해결:** 아임웹·Secret 둘 다 **동일한** callback URL (apikey 없이).

### 6.3 scope — `site-info:write` 필수

**증상:** authorize 단계에서 scope 관련 오류, 또는 연동완료 실패.  
**해결:** `IMWEB_OAUTH_SCOPE`에 `site-info:write` 포함 + API 설정에서 해당 권한 승인.

### 6.4 토큰 교환 — `no_access_token`

**증상:** `timeisprice.com/?imweb=error&reason=no_access_token`  
(동시에 **이용기간 종료** 팝업이 뜨면 → **로그인된 만료 계정** 때문. 연동 오류와 별개)

**원인:** 아임웹 `/oauth2/token` 응답 파싱·요청 방식.

**해결 (코드):**

- POST 시 파라미터를 **쿼리스트링**으로 보내기 (아임웹 문서)
- form body **폴백**도 시도
- 응답 필드 `accessToken` / `access_token` 둘 다 처리

### 6.5 연동완료 API — `integration_complete_failed`

**원인:** `PATCH /site-info/integration-complete` 에 `{ status: "complete" }` body가 맞지 않음.

**해결:** **빈 body** PATCH 가 통과함 (코드에서 여러 시도 후 빈 body 성공).

### 6.6 「연동하기」「동의」 버튼을 못 찾음

- timeisprice에는 **연동 버튼 없음**
- 공식 문서 「앱 테스트」→ 실제 UI는 **「연동 사이트 관리」**
- 이미 **테스트연동**이면 동의 버튼 없음 → **OAuth URL**로 연동완료 진행

### 6.7 웹훅 payload 구조

아임웹 payload는 중첩·필드명이 제각각.  
→ `_shared/imwebPayload.ts` 로 `orderNo`, `ordererEmail`, `sections` 등 **정규화** 후 처리.

### 6.8 상품 번호·대상

테스트 보내기 샘플은 prodNo 1001 등 → `grant_status: ignored` 가 **정상**.  
실제 66번만 `applied` / `pending`.

---

## 7. 다른 앱에 적용할 때 체크리스트

### A. 아임웹 쪽 (앱마다 1세트)

- [ ] 개발자센터 앱 생성
- [ ] 서비스 URL = **그 앱** 도메인
- [ ] 리다이렉트 URI = **그 프로젝트** `imweb-oauth-callback`
- [ ] Order API + site-info write 승인
- [ ] 웹훅 URL + Secret
- [ ] 테스트 사이트 연동 → **연동완료**까지

### B. Supabase (앱/상품마다 조정)

- [ ] 마이그레이션 Run (또는 fork 후 `TARGET_PROD_NO` 등 변경)
- [ ] Secrets: CLIENT_ID, SECRET, REDIRECT_URI, WEBHOOK_SECRET, SCOPE
- [ ] Edge Functions 배포
- [ ] `IMWEB_TARGET_PROD_NO` = **그 쇼핑몰 상품 번호**
- [ ] 부여 기간·로직은 RPC (`record_imweb_order_grant` 등)에서 수정

### C. 검증 순서

1. 개발자센터 **테스트 보내기** → `imweb_order_grants` 1줄 (ignored여도 OK)
2. **연동완료** 확인 (연동 사이트 관리)
3. **실제 테스트 결제** (대상 상품 번호)
4. **가입 전 결제** → pending → **같은 이메일 가입** → applied
5. **가입 후 결제** → 즉시 applied
6. `user_subscriptions`: `active`, `access_until` 약 1년

### D. Supabase에서 확인하는 법

**주문 기록:**

```sql
select order_no, orderer_email, prod_no, grant_status, grant_applied_at, created_at
from imweb_order_grants
where lower(orderer_email) = lower('고객@email.com')
order by created_at desc;
```

**이용권:**

```sql
select email, subscription_status, access_until, signup_at
from user_subscriptions
where lower(email) = lower('고객@email.com');
```

---

## 8. 운영 시 참고

- **고객에게:** 결제 이메일 = 앱 가입 이메일 (다르면 자동 매칭 안 됨)
- **연장 구매:** 같은 이메일로 또 66번 주문 → 만료일 +1년 (중복 order_no만 방지)
- **출시 전:** 앱스토어 미노출이어도 **연동완료 + 본인 사이트**면 실주문 웹훅 테스트 가능
- **민감 정보:** Client Secret·Webhook Secret은 **Supabase Secrets만**, git·채팅에 넣지 않기

---

## 9. 관련 링크

- [앱 연동하기](https://developers-docs.imweb.me/guide/%EC%95%B1-%EC%97%B0%EB%8F%99%ED%95%98%EA%B8%B0)
- [OAuth 2.0](https://developers-docs.imweb.me/guide/%EA%B0%9C%EB%B0%9C-%EA%B0%80%EC%9D%B4%EB%93%9C-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0/oauth-2.0)
- [웹훅 연동 가이드](https://developers-docs.imweb.me/guide/%EA%B0%9C%EB%B0%9C-%EA%B0%80%EC%9D%B4%EB%93%9C-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0/%EC%9B%B9%ED%9B%85-%EC%97%B0%EB%8F%99-%EA%B0%80%EC%9D%B4%EB%93%9C)
- [프로세스 확인하기](https://developers-docs.imweb.me/guide/%ED%94%84%EB%A1%9C%EC%84%B8%EC%8A%A4-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0)

---

## 10. 요약 한 줄

**웹훅으로 “누가 샀는지” 받고, DB가 “1년 줬는지” 기록하고, OAuth 연동완료로 “실제 주문 알림”을 켠다.**

이 세 가지만 맞으면 다른 아임웹 쇼핑몰·다른 상품 번호에도 같은 패턴으로 복제할 수 있습니다.
