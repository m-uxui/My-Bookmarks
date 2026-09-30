(() => {
  let categories = [];
  let bookmarks = [];
  let activeCategoryId = 'all';
  let draggedId = null;
  let currentUser = null;
  let realtimeChannels = [];

  const $ = (sel) => document.querySelector(sel);

  const supabase = (window.SUPABASE_URL && !window.SUPABASE_URL.startsWith('YOUR_') && window.supabase)
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  function domainOf(url) {
    try {
      const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
      return u.hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  const TWO_PART_TLDS = ['co.kr', 'co.uk', 'co.jp', 'co.in', 'com.au', 'com.br', 'com.cn', 'ne.jp', 'or.kr', 'ac.kr', 'go.kr'];

  function siteNameFromDomain(domain) {
    const twoPart = TWO_PART_TLDS.find(tld => domain.endsWith('.' + tld));
    if (twoPart) return domain.slice(0, -(twoPart.length + 1)) || domain;
    return domain.replace(/\.[^.]+$/, '') || domain;
  }

  function normalizeUrl(url) {
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
  }

  function faviconUrl(url) {
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domainOf(url))}`;
  }

  function categoryById(id) {
    return categories.find(c => c.id === id);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  function requireAuth() {
    if (!supabase) return false;
    if (!currentUser) {
      $('#loginModal').hidden = false;
      return false;
    }
    return true;
  }

  // ---------- Custom dialogs ----------

  function showDialog(message, { okText = '확인', cancelText = null } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-sm">
          <div class="modal-body">
            <p class="dialog-message">${escapeHtml(message)}</p>
            <div class="modal-actions">
              <div class="spacer"></div>
              ${cancelText ? `<button type="button" class="btn btn-ghost" data-role="cancel">${escapeHtml(cancelText)}</button>` : ''}
              <button type="button" class="btn btn-primary" data-role="ok">${escapeHtml(okText)}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };
      overlay.querySelector('[data-role="ok"]').addEventListener('click', () => cleanup(true));
      const cancelBtn = overlay.querySelector('[data-role="cancel"]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && cancelText) cleanup(false);
      });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          if (overlay.isConnected) cleanup(false);
        }
      });
    });
  }

  function confirmDialog(message) {
    return showDialog(message, { okText: '확인', cancelText: '취소' });
  }

  function alertDialog(message) {
    return showDialog(message, { okText: '확인' });
  }

  // ---------- Rendering ----------

  function sortedCategories() {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function sortedBookmarks() {
    return [...bookmarks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function renderCategories() {
    const list = $('#categoryList');
    const counts = {};
    bookmarks.forEach(b => { counts[b.categoryId] = (counts[b.categoryId] || 0) + 1; });

    const allItem = `
      <li class="category-item ${activeCategoryId === 'all' ? 'active' : ''}" data-id="all">
        <span class="category-name">전체</span>
        <span class="category-count">${bookmarks.length}</span>
      </li>`;

    const items = sortedCategories().map(c => `
      <li class="category-item ${activeCategoryId === c.id ? 'active' : ''}" data-id="${c.id}">
        <span class="category-name">${escapeHtml(c.name)}</span>
        <span class="category-count">${counts[c.id] || 0}</span>
      </li>`).join('');

    list.innerHTML = allItem + items;

    list.querySelectorAll('.category-item').forEach(el => {
      el.addEventListener('click', () => {
        activeCategoryId = el.dataset.id;
        renderCategories();
        renderGrid();
      });
    });

    $('#activeCategoryTitle').textContent = activeCategoryId === 'all' ? '전체' : (categoryById(activeCategoryId)?.name || '전체');

    const titleEditBtn = $('#categoryTitleEditBtn');
    titleEditBtn.hidden = activeCategoryId === 'all';
    titleEditBtn.innerHTML = pencilIcon();
  }

  function renderCategorySelect() {
    const sel = $('#bookmarkCategory');
    sel.innerHTML = sortedCategories().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  function renderGrid() {
    const query = $('#searchInput').value.trim().toLowerCase();
    let items = sortedBookmarks().filter(b => activeCategoryId === 'all' || b.categoryId === activeCategoryId);
    if (query) {
      items = items.filter(b =>
        (b.title || '').toLowerCase().includes(query) ||
        (b.url || '').toLowerCase().includes(query) ||
        (b.note || '').toLowerCase().includes(query)
      );
    }

    $('#resultCount').textContent = items.length ? `${items.length}개` : '';
    $('#emptyState').hidden = items.length !== 0;
    $('#emptyState p').textContent = query ? '검색 결과가 없어요.' : '아직 북마크가 없어요.';
    $('#emptyAddBtn').hidden = !!query;
    const grid = $('#grid');

    grid.innerHTML = items.map(b => {
      const cat = categoryById(b.categoryId);
      const domain = domainOf(b.url);
      const title = b.title || siteNameFromDomain(domain);
      const letter = (b.title || domain || '?').trim().charAt(0).toUpperCase();
      const iconSrc = b.favicon || b.image || faviconUrl(b.url);

      return `
      <a class="card" data-id="${b.id}" draggable="true" href="${escapeHtml(normalizeUrl(b.url))}" target="_blank" rel="noopener noreferrer">
        <button class="icon-btn edit-btn" title="수정" data-id="${b.id}">${pencilIcon()}</button>
        <div class="card-icon">
          <img src="${escapeHtml(iconSrc)}" alt="" draggable="false" data-fallback-letter="${escapeHtml(letter)}">
        </div>
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-domain">${escapeHtml(domain)}</div>
        ${(activeCategoryId === 'all' && cat) ? `<span class="card-tag">${escapeHtml(cat.name)}</span>` : ''}
      </a>`;
    }).join('');

    grid.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!requireAuth()) return;
        openBookmarkModal(btn.dataset.id);
      });
    });

    grid.querySelectorAll('.card-icon img').forEach(img => {
      img.addEventListener('error', () => {
        const span = document.createElement('span');
        span.className = 'letter';
        span.textContent = img.dataset.fallbackLetter || '?';
        img.replaceWith(span);
      }, { once: true });
    });

    initDragReorder(grid);
  }

  function pencilIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }

  // ---------- Drag & drop reorder ----------

  function initDragReorder(grid) {
    grid.querySelectorAll('.card').forEach(cardEl => {
      cardEl.addEventListener('dragstart', (e) => {
        draggedId = cardEl.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cardEl.dataset.id);
        requestAnimationFrame(() => cardEl.classList.add('dragging'));
      });

      cardEl.addEventListener('dragend', () => {
        cardEl.classList.remove('dragging');
        grid.querySelectorAll('.card.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedId = null;
      });

      cardEl.addEventListener('dragover', (e) => {
        if (!draggedId || draggedId === cardEl.dataset.id) return;
        e.preventDefault();
        cardEl.classList.add('drag-over');
      });

      cardEl.addEventListener('dragleave', () => {
        cardEl.classList.remove('drag-over');
      });

      cardEl.addEventListener('drop', (e) => {
        e.preventDefault();
        cardEl.classList.remove('drag-over');
        const sourceId = draggedId || e.dataTransfer.getData('text/plain');
        const targetId = cardEl.dataset.id;
        if (!sourceId || sourceId === targetId) return;
        const rect = cardEl.getBoundingClientRect();
        const insertAfter = (e.clientX - rect.left) > rect.width / 2;
        moveBookmark(sourceId, targetId, insertAfter);
      });
    });
  }

  async function moveBookmark(sourceId, targetId, insertAfter) {
    if (!requireAuth()) return;
    const sorted = sortedBookmarks().filter(b => b.id !== sourceId);
    const targetIdx = sorted.findIndex(b => b.id === targetId);
    if (targetIdx === -1) return;
    const neighborIdx = insertAfter ? targetIdx + 1 : targetIdx - 1;
    const targetOrder = sorted[targetIdx].order ?? 0;
    const neighbor = sorted[neighborIdx];
    const neighborOrder = neighbor ? (neighbor.order ?? 0) : (insertAfter ? targetOrder + 2000 : targetOrder - 2000);
    const newOrder = (targetOrder + neighborOrder) / 2;
    const { error } = await supabase.from('bookmarks').update({ sort_order: newOrder }).eq('id', sourceId);
    if (error) console.error(error);
  }

  // ---------- Bookmark modal ----------

  function openBookmarkModal(id) {
    renderCategorySelect();
    const modal = $('#bookmarkModal');
    const deleteBtn = $('#deleteBookmarkBtn');

    if (id) {
      const b = bookmarks.find(x => x.id === id);
      if (!b) return;
      $('#bookmarkModalTitle').textContent = '북마크 수정';
      $('#bookmarkId').value = b.id;
      $('#bookmarkUrl').value = b.url;
      $('#bookmarkTitle').value = b.title || '';
      $('#bookmarkCategory').value = b.categoryId;
      $('#bookmarkImage').value = b.image || '';
      $('#bookmarkNote').value = b.note || '';
      deleteBtn.hidden = false;
    } else {
      $('#bookmarkModalTitle').textContent = '북마크 추가';
      $('#bookmarkForm').reset();
      $('#bookmarkId').value = '';
      $('#bookmarkCategory').value = activeCategoryId !== 'all' ? activeCategoryId : categories[0]?.id;
      deleteBtn.hidden = true;
    }
    modal.hidden = false;
  }

  function closeBookmarkModal() {
    $('#bookmarkModal').hidden = true;
  }

  $('#addBookmarkBtn').addEventListener('click', () => { if (requireAuth()) openBookmarkModal(null); });
  $('#emptyAddBtn').addEventListener('click', () => { if (requireAuth()) openBookmarkModal(null); });

  $('#bookmarkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const url = $('#bookmarkUrl').value.trim();
    if (!url) return;
    const id = $('#bookmarkId').value;
    const data = {
      url,
      title: $('#bookmarkTitle').value.trim(),
      category_id: $('#bookmarkCategory').value || null,
      image: $('#bookmarkImage').value.trim(),
      note: $('#bookmarkNote').value.trim(),
    };
    closeBookmarkModal();
    let error;
    if (id) {
      ({ error } = await supabase.from('bookmarks').update(data).eq('id', id));
    } else {
      const minOrder = bookmarks.length ? Math.min(...bookmarks.map(b => b.order ?? 0)) : 0;
      ({ error } = await supabase.from('bookmarks').insert({ ...data, user_id: currentUser.id, sort_order: minOrder - 1000 }));
    }
    if (error) {
      console.error(error);
      alertDialog('저장에 실패했어요. 다시 시도해주세요.');
    }
  });

  $('#deleteBookmarkBtn').addEventListener('click', async () => {
    if (!requireAuth()) return;
    const id = $('#bookmarkId').value;
    if (!id) return;
    if (!(await confirmDialog('이 북마크를 삭제할까요?'))) return;
    closeBookmarkModal();
    const { error } = await supabase.from('bookmarks').delete().eq('id', id);
    if (error) {
      console.error(error);
      alertDialog('삭제에 실패했어요. 다시 시도해주세요.');
    }
  });

  // ---------- Category modal ----------

  function openCategoryModal(id) {
    $('#categoryForm').reset();
    const deleteBtn = $('#deleteCategoryBtn');
    if (id) {
      const c = categoryById(id);
      if (!c) return;
      $('#categoryModalTitle').textContent = '카테고리 수정';
      $('#categoryId').value = c.id;
      $('#categoryName').value = c.name;
      deleteBtn.hidden = false;
    } else {
      $('#categoryModalTitle').textContent = '카테고리 추가';
      $('#categoryId').value = '';
      deleteBtn.hidden = true;
    }
    $('#categoryModal').hidden = false;
  }

  $('#addCategoryBtn').addEventListener('click', () => { if (requireAuth()) openCategoryModal(null); });
  $('#categoryTitleEditBtn').addEventListener('click', () => {
    if (activeCategoryId !== 'all' && requireAuth()) openCategoryModal(activeCategoryId);
  });

  $('#categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const name = $('#categoryName').value.trim();
    if (!name) return;
    const id = $('#categoryId').value;
    $('#categoryModal').hidden = true;
    const { error } = id
      ? await supabase.from('categories').update({ name }).eq('id', id)
      : await supabase.from('categories').insert({ name, user_id: currentUser.id });
    if (error) {
      console.error(error);
      alertDialog(error.code === '23505' ? '이미 같은 이름의 카테고리가 있어요.' : '저장에 실패했어요. 다시 시도해주세요.');
    }
  });

  $('#deleteCategoryBtn').addEventListener('click', async () => {
    if (!requireAuth()) return;
    const id = $('#categoryId').value;
    if (!id) return;
    const c = categoryById(id);
    if (!c) return;
    const affected = bookmarks.filter(b => b.categoryId === id);
    const msg = affected.length > 0
      ? `"${c.name}" 카테고리를 삭제하면 포함된 북마크 ${affected.length}개도 함께 삭제됩니다. 계속할까요?`
      : `"${c.name}" 카테고리를 삭제할까요?`;
    if (!(await confirmDialog(msg))) return;
    $('#categoryModal').hidden = true;
    // bookmarks.category_id has ON DELETE CASCADE, so this also removes affected bookmarks.
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      console.error(error);
      alertDialog('삭제에 실패했어요. 다시 시도해주세요.');
      return;
    }
    if (activeCategoryId === id) {
      activeCategoryId = 'all';
      renderCategories();
      renderGrid();
    }
  });

  // ---------- Modal close handlers ----------

  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      $('#bookmarkModal').hidden = true;
      $('#categoryModal').hidden = true;
      $('#loginModal').hidden = true;
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#bookmarkModal').hidden = true;
      $('#categoryModal').hidden = true;
      $('#loginModal').hidden = true;
    }
  });

  // ---------- Search ----------

  $('#searchInput').addEventListener('input', () => renderGrid());

  // ---------- Export / Import ----------

  $('#exportBtn').addEventListener('click', () => {
    const payload = JSON.stringify({ categories, bookmarks }, null, 2);
    const filename = `my-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#importBtn').addEventListener('click', () => $('#importFile').click());

  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!requireAuth()) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.categories) || !Array.isArray(data.bookmarks)) throw new Error('invalid format');

        const overwrite = await confirmDialog('현재 북마크를 가져온 파일로 덮어쓸까요? (취소하면 병합됩니다)');

        if (overwrite) {
          // categories cascade-delete their bookmarks
          await supabase.from('categories').delete().in('id', categories.map(c => c.id));
        }

        const idMap = {};
        const existingNames = overwrite ? new Set() : new Set(categories.map(c => c.name));
        for (const c of data.categories) {
          if (existingNames.has(c.name)) {
            idMap[c.id] = categories.find(x => x.name === c.name)?.id;
            continue;
          }
          const { data: inserted, error } = await supabase.from('categories').insert({ name: c.name, user_id: currentUser.id }).select().single();
          if (error) { console.error(error); continue; }
          idMap[c.id] = inserted.id;
          existingNames.add(c.name);
        }

        const baseOrder = overwrite || !bookmarks.length ? 0 : Math.min(...bookmarks.map(b => b.order ?? 0)) - 1000;
        let i = 0;
        for (const b of data.bookmarks) {
          const category_id = idMap[b.categoryId] || null;
          await supabase.from('bookmarks').insert({
            url: b.url,
            title: b.title || '',
            category_id,
            image: b.image || '',
            note: b.note || '',
            user_id: currentUser.id,
            sort_order: baseOrder - i * 10,
          });
          i += 1;
        }
      } catch (err) {
        console.error(err);
        alertDialog('올바른 백업 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ---------- Auth ----------

  async function seedDefaultsForNewUser() {
    // Brand-new accounts start empty except for one starter category,
    // pre-filled with the big three AI assistants.
    const { data: cat, error } = await supabase
      .from('categories')
      .insert({ name: '01_AI', user_id: currentUser.id })
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation on (user_id, name): another concurrent
      // login (e.g. a second tab, or onAuthStateChange firing twice)
      // already seeded this user — nothing left to do.
      if (error.code !== '23505') console.error(error);
      return;
    }

    const starterBookmarks = [
      { url: 'https://claude.ai', title: 'Claude' },
      { url: 'https://chatgpt.com', title: 'ChatGPT' },
      { url: 'https://gemini.google.com', title: 'Gemini' },
    ];
    let i = 0;
    for (const b of starterBookmarks) {
      await supabase.from('bookmarks').insert({
        ...b,
        category_id: cat.id,
        user_id: currentUser.id,
        sort_order: i * 1000,
      });
      i += 1;
    }
  }

  function updateAuthUI() {
    $('#loginBtn').hidden = !!currentUser;
    $('#logoutBtn').hidden = !currentUser;
    $('#deleteAccountBtn').hidden = !currentUser;
    const adminEmails = (window.ADMIN_EMAILS || []).map(e => e.toLowerCase());
    $('#statsLink').hidden = !(currentUser?.email && adminEmails.includes(currentUser.email.toLowerCase()));
  }

  $('#loginBtn').addEventListener('click', () => { $('#loginModal').hidden = false; });

  $('#googleLoginBtn').addEventListener('click', async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  });

  // Supabase's built-in signInWithOAuth('kakao') always requests
  // account_email server-side (the `scopes` option only adds to that list,
  // never replaces it) — Kakao rejects the whole request (KOE205) unless
  // account_email is approved, which requires converting to a Kakao "Biz
  // App" (business registration). To avoid that, we run Kakao's OIDC flow
  // ourselves (scope: openid + profile_nickname only), exchange the code
  // for an id_token via our own serverless function (api/kakao-exchange.js
  // — keeps the Kakao Client Secret server-side), then hand that id_token
  // to Supabase directly.
  $('#kakaoLoginBtn').addEventListener('click', () => {
    if (!window.KAKAO_REST_API_KEY) {
      alertDialog('카카오 로그인 설정이 안 되어 있어요 (config.js의 KAKAO_REST_API_KEY).');
      return;
    }
    const state = crypto.randomUUID();
    sessionStorage.setItem('kakao_oauth_state', state);
    const redirectUri = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      client_id: window.KAKAO_REST_API_KEY,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile_nickname',
      state,
    });
    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  });

  async function handleKakaoRedirect() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return;

    // Clean the URL regardless of outcome so a refresh doesn't replay it.
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    const savedState = sessionStorage.getItem('kakao_oauth_state');
    sessionStorage.removeItem('kakao_oauth_state');
    if (state !== savedState) {
      console.error('kakao oauth state mismatch');
      return;
    }

    try {
      const resp = await fetch(`/api/kakao-exchange?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(cleanUrl)}`);
      const data = await resp.json();
      if (!resp.ok || !data.id_token) throw new Error(data.error || 'exchange failed');

      const { error } = await supabase.auth.signInWithIdToken({ provider: 'kakao', token: data.id_token });
      if (error) throw error;
    } catch (err) {
      console.error('kakao login failed', err);
      alertDialog('카카오 로그인에 실패했어요. 다시 시도해주세요.');
    }
  }

  $('#logoutBtn').addEventListener('click', async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  });

  $('#deleteAccountBtn').addEventListener('click', async () => {
    if (!requireAuth()) return;
    const ok = await confirmDialog('정말 계정을 삭제할까요?\n북마크와 카테고리가 전부 영구히 삭제되고, 되돌릴 수 없어요.');
    if (!ok) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'delete failed');
      await supabase.auth.signOut();
      alertDialog('계정이 삭제됐어요.');
    } catch (err) {
      console.error(err);
      alertDialog('계정 삭제에 실패했어요. 다시 시도해주세요.');
    }
  });

  // ---------- Init ----------

  function showConfigMissing() {
    document.body.innerHTML = `
      <div style="padding:80px 24px;text-align:center;color:#9a9a9d;max-width:420px;margin:0 auto;font-family:-apple-system,sans-serif;">
        <p style="font-size:15px;line-height:1.6;">Supabase 연결 정보가 없어요.<br>config.js에 SUPABASE_URL과 SUPABASE_ANON_KEY를 채워주세요.</p>
      </div>`;
  }

  async function refreshCategories() {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) { console.error(error); return; }
    categories = (data || []).map(c => ({ id: c.id, name: c.name }));
    renderCategories();
    renderCategorySelect();
  }

  async function refreshBookmarks() {
    const { data, error } = await supabase.from('bookmarks').select('*');
    if (error) { console.error(error); return; }
    bookmarks = (data || []).map(b => ({
      id: b.id,
      url: b.url,
      title: b.title,
      categoryId: b.category_id,
      image: b.image,
      note: b.note,
      favicon: b.favicon,
      order: b.sort_order,
    }));
    renderCategories();
    renderGrid();
  }

  function teardownRealtime() {
    realtimeChannels.forEach(ch => supabase.removeChannel(ch));
    realtimeChannels = [];
  }

  async function loadUserData() {
    const { count } = await supabase.from('categories').select('*', { count: 'exact', head: true });
    if (!count) await seedDefaultsForNewUser();

    await refreshCategories();
    await refreshBookmarks();

    realtimeChannels.push(
      supabase.channel('categories-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, refreshCategories)
        .subscribe()
    );
    realtimeChannels.push(
      supabase.channel('bookmarks-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks' }, refreshBookmarks)
        .subscribe()
    );
  }

  // Anonymous visit ping for the owner's admin stats page. No cookies, no
  // PII — just a random id kept in localStorage so repeat visits from the
  // same browser roughly count as one "visitor" instead of N page views.
  function logPageView() {
    try {
      let visitorId = localStorage.getItem('bm_visitor_id');
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem('bm_visitor_id', visitorId);
      }
      supabase.from('page_views').insert({ visitor_id: visitorId, path: location.pathname }).then(() => {});
    } catch (e) { /* localStorage unavailable (private mode etc) — skip silently */ }
  }

  async function boot() {
    if (!supabase) {
      showConfigMissing();
      return;
    }

    logPageView();

    // onAuthStateChange fires once immediately with the current session
    // (or null), then again on every future sign-in/out — this is the
    // single source of truth for auth state, so there's no separate
    // getSession() call here (that would double-fire loadUserData()).
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (currentUser?.id === session.user.id) return;
        currentUser = session.user;
        updateAuthUI();
        $('#loginModal').hidden = true;
        await loadUserData();
      } else {
        currentUser = null;
        teardownRealtime();
        categories = [];
        bookmarks = [];
        activeCategoryId = 'all';
        updateAuthUI();
        renderCategories();
        renderGrid();
      }
    });

    await handleKakaoRedirect();
  }

  boot();
})();
