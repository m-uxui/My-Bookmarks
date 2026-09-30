(() => {
  const $ = (sel) => document.querySelector(sel);
  const supabase = (window.SUPABASE_URL && window.supabase)
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  function showGate(message, withLogin) {
    $('#content').hidden = true;
    const gate = $('#gate');
    gate.hidden = false;
    gate.innerHTML = `<p>${message}</p>` + (withLogin ? `<button id="gateLoginBtn" class="btn btn-primary" style="margin-top:12px;">Google로 로그인</button>` : '');
    if (withLogin) {
      $('#gateLoginBtn').addEventListener('click', () => {
        supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
      });
    }
  }

  function renderStats(data) {
    $('#gate').hidden = true;
    $('#content').hidden = false;
    $('#signupTotal').textContent = data.signups.total;
    $('#signupToday').textContent = data.signups.today;
    $('#signup7').textContent = data.signups.last7Days;
    $('#signup30').textContent = data.signups.last30Days;
    $('#viewTotal').textContent = data.views.total;
    $('#viewUnique').textContent = data.views.uniqueVisitors;
    $('#viewToday').textContent = data.views.today;
    $('#view7').textContent = data.views.last7Days;

    // 서버(api/admin-stats.js)가 KST(UTC+9) 달력 날짜로 집계하므로, 여기서
    // 만드는 날짜 목록도 같은 기준이어야 표 숫자가 위 카드와 어긋나지 않는다.
    const KST_OFFSET_MS = 9 * 3600 * 1000;
    const days = [];
    for (let i = 13; i >= 0; i -= 1) {
      days.push(new Date(Date.now() - i * 24 * 3600 * 1000 + KST_OFFSET_MS).toISOString().slice(0, 10));
    }
    $('#trendBody').innerHTML = days.map(d => `
      <tr><td>${d}</td><td>${data.signups.byDay[d] || 0}</td><td>${data.views.byDay[d] || 0}</td></tr>
    `).join('');
  }

  async function loadStats(session) {
    showGate('불러오는 중...', false);
    try {
      const resp = await fetch('/api/admin-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.status === 403) { showGate('이 계정은 관리자가 아니에요.', false); return; }
      const data = await resp.json();
      if (!resp.ok) { showGate('통계를 불러오지 못했어요.', false); return; }
      renderStats(data);
    } catch (e) {
      showGate('통계를 불러오지 못했어요.', false);
    }
  }

  async function boot() {
    if (!supabase) { showGate('Supabase 연결 정보가 없어요.', false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) loadStats(session);
    else showGate('로그인이 필요해요.', true);

    supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession?.user) loadStats(newSession);
      else showGate('로그인이 필요해요.', true);
    });
  }

  boot();
})();
