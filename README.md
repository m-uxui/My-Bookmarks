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

1. In **Supabase → Authentication → Sign In / Providers**, click **Kakao** and toggle it on — copy its **Callback URL**.
2. In [Kakao Developers](https://developers.kakao.com/) → **내 애플리케이션 → 애플리케이션 추가**.
3. **제품 설정 → 카카오 로그인**: turn it on, and under **Redirect URI** paste the Supabase callback URL from step 1.
4. **앱 설정 → 요약 정보**: copy the **REST API 키** — in Kakao Developers this key doubles as the value Supabase calls the "Client ID". Under **제품 설정 → 카카오 로그인 → 보안**, generate a **Client Secret** and turn "Client Secret 사용" on.
5. Paste the REST API key and Client Secret into the Supabase Kakao provider screen → **Save**.

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

## Notes

- Every table row carries a `user_id`; RLS policies only let `auth.uid() = user_id` read or write it — so even with the anon key exposed in client code (normal for Supabase), nobody can see or touch another signed-in user's bookmarks.
- The first time someone logs in, they're seeded with the original starter set (10 design categories, ~30 curated tools) so the app isn't empty on day one.
- Favicons load directly from Google's favicon service (`s2/favicons`) — no special setup needed, unlike the Claude-artifact version this was ported from.
- Data updates live across every open tab for that same signed-in user (Supabase Realtime).
