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

function extractDescription(html) {
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1].trim()) return decodeEntities(m[1].trim()).replace(/\s+/g, ' ').slice(0, 300);
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
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
  }
  throw new Error('too many redirects');
}

export async function fetchDescription(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const html = await fetchPageHtml(url, controller.signal);
    return extractDescription(html);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}
