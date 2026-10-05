// Vercel serverless function. Fills in each of the caller's own bookmarks
// with the page's <title> (the name the browser would show). `force=1`
// re-fetches bookmarks that already have one. The client calls it in a loop, passing
// the last id it got back as the cursor, until `done` is true. Only rows
// belonging to the verified caller are read or updated.

import { fetchPageTitle } from '../lib/page-meta.js';

const BATCH = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'missing bearer token' }); return; }

  const cursor = typeof req.query.cursor === 'string' && UUID.test(req.query.cursor) ? req.query.cursor : '';

  try {
    const meResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const me = await meResp.json();
    if (!meResp.ok || !me?.id) { res.status(401).json({ error: 'invalid session' }); return; }

    const adminHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
    const onlyEmpty = req.query.force === '1' ? '' : '&description=eq.';
    let listUrl = `${SUPABASE_URL}/rest/v1/bookmarks?select=id,url&user_id=eq.${me.id}${onlyEmpty}&order=id.asc&limit=${BATCH}`;
    if (cursor) listUrl += `&id=gt.${cursor}`;

    const listResp = await fetch(listUrl, { headers: adminHeaders });
    const rows = await listResp.json();
    if (!listResp.ok || !Array.isArray(rows)) { res.status(500).json({ error: 'failed to list bookmarks' }); return; }

    await Promise.all(rows.map(async (row) => {
      const description = await fetchPageTitle(row.url);
      if (!description) return;
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/bookmarks?id=eq.${row.id}&user_id=eq.${me.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ description }),
      });
      if (!patch.ok) throw new Error(`update failed: ${await patch.text()}`);
    }));

    res.status(200).json({
      processed: rows.length,
      nextCursor: rows.length ? rows[rows.length - 1].id : cursor,
      done: rows.length < BATCH,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
