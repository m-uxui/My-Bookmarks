// Vercel serverless function. Returns a page's <title> for a URL.
// Signed-in users only, so it can't be used as an open proxy. Uses the same
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars as api/admin-stats.js.

import { fetchPageTitle } from '../lib/page-meta.js';

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

  const target = typeof req.query.url === 'string' ? req.query.url : '';
  if (!target) { res.status(400).json({ error: 'missing url' }); return; }

  try {
    const meResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!meResp.ok) { res.status(401).json({ error: 'invalid session' }); return; }

    res.status(200).json({ description: await fetchPageTitle(target) });
  } catch (err) {
    res.status(200).json({ description: '' });
  }
}
