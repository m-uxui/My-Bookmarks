// Vercel serverless function. Returns signup + page-view stats — owner only.
// Requires three Vercel Environment Variables (server-side only, never in config.js):
//   SUPABASE_URL               — same value as config.js's window.SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase → Project Settings → API → service_role key
//                                 (bypasses RLS entirely — must never reach the browser)
//   ADMIN_EMAILS                — comma-separated emails allowed to see this page

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'missing bearer token' }); return; }

  try {
    // Who is calling? Validate their session token against Supabase Auth.
    const meResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const me = await meResp.json();
    if (!meResp.ok || !me?.email) { res.status(401).json({ error: 'invalid session' }); return; }
    if (!ADMIN_EMAILS.includes(me.email.toLowerCase())) {
      res.status(403).json({ error: 'not an admin' });
      return;
    }

    const adminHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

    // Signups: Admin Auth API, paginated (capped at 20k users — plenty for this app's scale).
    let users = [];
    for (let page = 1; page <= 20; page += 1) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: adminHeaders });
      const d = await r.json();
      const batch = Array.isArray(d.users) ? d.users : (Array.isArray(d) ? d : []);
      if (batch.length === 0) break;
      users = users.concat(batch);
      if (batch.length < 1000) break;
    }

    // Page views: exact all-time total via a HEAD count, plus the last 60
    // days of rows for the daily trend and a unique-visitor estimate.
    const totalViewsResp = await fetch(`${SUPABASE_URL}/rest/v1/page_views?select=id`, {
      method: 'HEAD',
      headers: { ...adminHeaders, Prefer: 'count=exact' },
    });
    const totalViews = parseInt((totalViewsResp.headers.get('content-range') || '').split('/')[1] || '0', 10);

    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const viewsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/page_views?select=created_at,visitor_id&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=50000`,
      { headers: adminHeaders }
    );
    const recentViews = await viewsResp.json();
    const views = Array.isArray(recentViews) ? recentViews : [];

    // "오늘"/날짜별 집계는 전부 KST(UTC+9) 달력 날짜 기준 — 그래야 아래 표의
    // 날짜별 숫자와 위 카드의 "오늘/최근 N일" 숫자가 서로 어긋나지 않는다.
    const KST_OFFSET_MS = 9 * 3600 * 1000;
    const kstDayKey = (iso) => new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
    const bucketByDay = (rows) => {
      const map = {};
      for (const r of rows) { const k = kstDayKey(r.created_at); map[k] = (map[k] || 0) + 1; }
      return map;
    };
    // n일 전 KST 자정에 해당하는 실제 UTC 타임스탬프(ms).
    const kstNow = new Date(Date.now() + KST_OFFSET_MS);
    const kstMidnightUtcMs = (daysAgo) => Date.UTC(
      kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - daysAgo
    ) - KST_OFFSET_MS;
    const countSince = (rows, ms) => rows.filter(r => new Date(r.created_at).getTime() >= ms).length;

    res.status(200).json({
      signups: {
        total: users.length,
        today: countSince(users, kstMidnightUtcMs(0)),
        last7Days: countSince(users, kstMidnightUtcMs(6)),
        last30Days: countSince(users, kstMidnightUtcMs(29)),
        byDay: bucketByDay(users),
      },
      views: {
        total: totalViews,
        uniqueVisitors: new Set(views.map(v => v.visitor_id)).size,
        today: countSince(views, kstMidnightUtcMs(0)),
        last7Days: countSince(views, kstMidnightUtcMs(6)),
        last30Days: countSince(views, kstMidnightUtcMs(29)),
        byDay: bucketByDay(views),
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
