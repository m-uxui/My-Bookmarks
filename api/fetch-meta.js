// Vercel serverless function. Returns a page's <title> so a new bookmark
// gets a real name instead of just its domain. Signed-in users only, so
// this can't be used as an open proxy. Uses the same SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY env vars as api/admin-stats.js.
//
// Private/loopback targets are refused, including on redirect hops, so the
// function can't be pointed at the Vercel/Supabase internal network.

import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('blocked address');
    return;
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (addrs.some(a => isPrivateIp(a.address))) throw new Error('blocked address');
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function extractTitle(html) {
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]*)<\/title>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1].trim()) return decodeEntities(m[1].trim()).replace(/\s+/g, ' ').slice(0, 200);
  }
  return '';
}

async function fetchPageHtml(startUrl, signal) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
    await assertPublicHost(u.hostname);

    const r = await fetch(u, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyBookmarksBot/1.0)', Accept: 'text/html' },
    });

    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      current = new URL(r.headers.get('location'), u).toString();
      continue;
    }
    if (!r.ok || !r.body) return '';

    const reader = r.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel();
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map(c => Buffer.from(c))).subarray(0, MAX_BYTES));
  }
  throw new Error('too many redirects');
}

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const html = await fetchPageHtml(target, controller.signal);
      res.status(200).json({ title: extractTitle(html) });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    res.status(200).json({ title: '' });
  }
}
