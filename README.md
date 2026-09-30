# My Bookmarks

Static site + Supabase backend, with Google / Kakao login — each person who
signs in only ever sees and edits their own bookmarks (enforced by Row Level
Security, not just the UI).

## 1. Supabase (5 min)

1. Sign up at https://supabase.com → **New project**.
2. Open **SQL Editor** → paste the contents of `schema.sql` → **Run**.
3. Open **Project Settings → API** → copy the **Project URL** and the **anon public** (a.k.a. "Publishable") key.
4. Paste them into `config.js`:
   ```js
   window.SUPABASE_URL = 'https://xxxx.supabase.co';
   window.SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```

## 2. Google login

1. In **Supabase → Authentication → Sign In / Providers**, click **Google** and toggle it on — copy the **Callback URL (for OAuth)** shown there, you'll need it in step 3.
2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create Credentials → OAuth client ID** → Application type **Web application**.
3. Under **Authorized redirect URIs**, paste the Supabase callback URL from step 1.
4. Copy the generated **Client ID** and **Client Secret** back into the Supabase Google provider screen → **Save**.

## 3. Kakao login

Kakao is wired up **without** going through Supabase's built-in Kakao OAuth.
Reason: Supabase always asks Kakao for the `account_email` scope, and Kakao
only grants that to apps that have converted to a business ("Biz") account —
a real barrier for an individual developer. Instead, the app runs Kakao's
own OIDC flow (scope: `openid profile_nickname` only, no business
verification needed) and hands the resulting id_token to Supabase via
`signInWithIdToken`. The token exchange happens in `api/kakao-exchange.js`
(a Vercel serverless function) so the Kakao Client Secret never reaches the
browser.

1. In [Kakao Developers](https://developers.kakao.com/) → **내 애플리케이션 → 애플리케이션 추가**.
2. **제품 설정 → 카카오 로그인 → 일반**: turn "사용 설정" ON, and turn **OpenID Connect** ON too (required for the id_token).
3. **제품 설정 → 카카오 로그인 → 동의항목**: for **닉네임** (`profile_nickname`), click 설정 → 필수 동의. (Leave `account_email` alone — it's not requested, so it doesn't matter that it shows "권한 없음".)
4. Register your redirect URIs — Kakao's newer console puts this under **앱 설정 → 앱 → 플랫폼 → Web 플랫폼 등록** (or the "JavaScript 키 수정" screen, if that's what you see): add both the site domain and, separately, the exact same URLs as **카카오 로그인 리다이렉트 URI**:
   ```
   http://localhost:8744/
   https://my-bookmk.vercel.app/
   ```
   (Trailing slash matters — it must match `window.location.origin + window.location.pathname` exactly.)
5. **앱 설정 → 요약 정보** → copy the **REST API 키** → paste into `config.js`:
   ```js
   window.KAKAO_REST_API_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
   ```
6. **제품 설정 → 카카오 로그인 → 보안** → generate a **Client Secret**, turn it ON, copy the code.
7. In **Vercel → Project Settings → Environment Variables**, add two *server-side* variables (do **not** put these in `config.js` — they must stay off GitHub):
   - `KAKAO_REST_API_KEY` — same value as step 5
   - `KAKAO_CLIENT_SECRET` — the code from step 6
   Redeploy after adding them (env var changes need a new deployment to take effect).

Note: this Kakao flow only works once deployed on Vercel (the serverless
function needs a real Node runtime) — it won't work from the plain
`python3 -m http.server` local setup used to test the Google flow.

## 4. Redirect URLs (both providers)

In **Supabase → Authentication → URL Configuration**, add every origin you'll open this app from to **Redirect URLs**, e.g.:
```
http://localhost:8744
https://my-bookmk.vercel.app
```
Without this, login will succeed but bounce back to an error page instead of the app.

## 5. GitHub

```bash
git remote add origin <your-empty-repo-url>
git push -u origin main
```

## 6. Vercel

1. Sign up at https://vercel.com (GitHub login is fine).
2. **Add New → Project** → import this repo.
3. Leave all build settings blank (it's a static site, no framework/build step) → **Deploy**.
4. Add the resulting `*.vercel.app` URL to Supabase's Redirect URLs (step 4 above).

## 7. 통계 페이지 (관리자 전용, 선택)

`/admin.html`에서 가입자 수·방문자 수를 볼 수 있어요. RLS로는 `auth.users`를 읽을 수 없어서, `service_role` 키를 쓰는 별도 서버리스 함수(`api/admin-stats.js`)가 이메일을 확인한 뒤 통계만 돌려주는 구조입니다. `service_role` 키는 RLS를 완전히 우회하므로 절대 `config.js`나 브라우저에 노출하면 안 돼요.

1. **Supabase → Project Settings → API** → **service_role** 키(secret) 복사.
2. **Vercel → Project Settings → Environment Variables**에 서버 전용 변수 3개 추가:
   - `SUPABASE_URL` — `config.js`의 `SUPABASE_URL`과 같은 값
   - `SUPABASE_SERVICE_ROLE_KEY` — 1번에서 복사한 service_role 키
   - `ADMIN_EMAILS` — 통계를 볼 수 있는 이메일(쉼표로 여러 개 가능), 예: `you@gmail.com`
   추가 후 **redeploy**해야 적용됩니다.
3. 로그인 후 `https://<배포주소>/admin.html`로 접속 — `ADMIN_EMAILS`에 없는 계정은 403으로 막힙니다.

방문자 수는 `page_views` 테이블에 익명으로 기록돼요(쿠키·개인정보 없음, 브라우저 localStorage의 임의 id 하나만 사용). `schema.sql`을 다시 실행하면 이 테이블이 생성됩니다.

## Notes

- Every table row carries a `user_id`; RLS policies only let `auth.uid() = user_id` read or write it — so even with the anon key exposed in client code (normal for Supabase), nobody can see or touch another signed-in user's bookmarks.
- The first time someone logs in, they're seeded with one starter category ("01_AI") pre-filled with Claude/ChatGPT/Gemini, so the app isn't empty on day one.
- Favicons load directly from Google's favicon service (`s2/favicons`) — no special setup needed, unlike the Claude-artifact version this was ported from.
- Data updates live across every open tab for that same signed-in user (Supabase Realtime).
