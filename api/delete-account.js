// Vercel serverless function. Lets a signed-in user permanently delete
// their own account and all their data. The target is always the caller's
// own verified session — never an id supplied by the client — so there's
// no way to delete someone else's account through this endpoint.
// Requires the same env vars as api/admin-stats.js:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (bypasses RLS — server-side only)
//
// categories/bookmarks both have `user_id ... references auth.users(id)
// on delete cascade` (see schema.sql), so deleting the auth user here
// also removes all of their bookmarks and categories automatically.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'missing bearer token' }); return; }

  try {
    const meResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const me = await meResp.json();
    if (!meResp.ok || !me?.id) { res.status(401).json({ error: 'invalid session' }); return; }

    const delResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${me.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    if (!delResp.ok) {
      const errData = await delResp.json().catch(() => ({}));
      res.status(500).json({ error: errData.error || errData.msg || 'delete failed' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
