// Vercel serverless function. Exchanges a Kakao OAuth authorization code for
// an OIDC id_token, server-side, so the Kakao Client Secret never reaches
// the browser. Requires two Vercel Environment Variables:
//   KAKAO_REST_API_KEY   — Kakao Developers → 앱 설정 → 요약 정보 → REST API 키
//   KAKAO_CLIENT_SECRET  — Kakao Developers → 카카오 로그인 → 보안 → Client Secret

export default async function handler(req, res) {
  const code = req.method === 'GET' ? req.query.code : req.body?.code;
  const redirectUri = req.method === 'GET' ? req.query.redirect_uri : req.body?.redirect_uri;

  if (!code || !redirectUri) {
    res.status(400).json({ error: 'missing code or redirect_uri' });
    return;
  }

  const restApiKey = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!restApiKey || !clientSecret) {
    res.status(500).json({ error: 'server missing KAKAO_REST_API_KEY / KAKAO_CLIENT_SECRET env vars' });
    return;
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: restApiKey,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenResp = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.id_token) {
      res.status(400).json({ error: tokenData.error_description || tokenData.error || 'token exchange failed' });
      return;
    }

    res.status(200).json({ id_token: tokenData.id_token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
