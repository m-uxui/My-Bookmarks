// Fill these in from Supabase → Project Settings → API, then commit.
// The anon key is meant to be public (it's exposed to every visitor's
// browser either way) — real protection is the Row Level Security
// policies in schema.sql, not keeping this secret.
window.SUPABASE_URL = 'https://pqebiduhcoaofqptsxic.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_s4ukQO-5NHZPOU5695eMrA_nlNVkM4v';

// Kakao Developers → 앱 설정 → 요약 정보 → REST API 키.
// This is a public client id (same role as an OAuth client_id) — safe to
// commit. The Client Secret is NOT here; it lives only in Vercel's
// KAKAO_CLIENT_SECRET environment variable, read by api/kakao-exchange.js.
window.KAKAO_REST_API_KEY = 'ee8bc1a6ee4105fdc3463be0928cea9a';

// Just shows/hides the "통계" link in the topbar for a nicer UX — not a
// security boundary (api/admin-stats.js re-checks the caller's email
// server-side against its own ADMIN_EMAILS env var either way), so it's
// fine for this list to be public. Keep it in sync with Vercel's
// ADMIN_EMAILS if you change who can see the stats page.
window.ADMIN_EMAILS = ['myungnara@gmail.com'];

// Google Analytics 4 — analytics.google.com → 관리 → 데이터 스트림 → 웹 스트림
// → "측정 ID" (G-로 시작). 비밀값 아님, 공개돼도 안전. 그대로 두면(G-XXXX로
// 시작) GA 스크립트 자체를 안 불러와요.
window.GA_MEASUREMENT_ID = 'G-DRZ0HWJPGX';
