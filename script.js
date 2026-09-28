(() => {
  let categories = [];
  let bookmarks = [];
  let activeCategoryId = 'all';
  let draggedId = null;

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

  function requireDb() {
    if (!supabase) {
      alertDialog('Supabase 연결 정보가 설정되지 않았어요. config.js에 URL과 anon key를 넣어주세요.');
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
    const grid = $('#grid');

    grid.innerHTML = items.map(b => {
      const cat = categoryById(b.categoryId);
      const domain = domainOf(b.url);
      const title = b.title || siteNameFromDomain(domain);
      const letter = (b.title || domain || '?').trim().charAt(0).toUpperCase();
      const iconSrc = b.image || faviconUrl(b.url);

      return `
      <a class="card" data-id="${b.id}" draggable="true" href="${escapeHtml(normalizeUrl(b.url))}" target="_blank" rel="noopener noreferrer">
        <button class="icon-btn edit-btn" title="수정" data-id="${b.id}">${pencilIcon()}</button>
        <div class="card-icon">
          <img src="${escapeHtml(iconSrc)}" alt="" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'letter',textContent:'${letter}'}))">
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
        openBookmarkModal(btn.dataset.id);
      });
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
    if (!requireDb()) return;
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

  $('#addBookmarkBtn').addEventListener('click', () => openBookmarkModal(null));
  $('#emptyAddBtn').addEventListener('click', () => openBookmarkModal(null));

  $('#bookmarkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireDb()) return;
    const url = $('#bookmarkUrl').value.trim();
    if (!url) return;
    const id = $('#bookmarkId').value;
    const data = {
      url,
      title: $('#bookmarkTitle').value.trim(),
      category_id: $('#bookmarkCategory').value,
      image: $('#bookmarkImage').value.trim(),
      note: $('#bookmarkNote').value.trim(),
    };
    closeBookmarkModal();
    let error;
    if (id) {
      ({ error } = await supabase.from('bookmarks').update(data).eq('id', id));
    } else {
      const minOrder = bookmarks.length ? Math.min(...bookmarks.map(b => b.order ?? 0)) : 0;
      ({ error } = await supabase.from('bookmarks').insert({ ...data, sort_order: minOrder - 1000 }));
    }
    if (error) {
      console.error(error);
      alertDialog('저장에 실패했어요. 다시 시도해주세요.');
    }
  });

  $('#deleteBookmarkBtn').addEventListener('click', async () => {
    if (!requireDb()) return;
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

  $('#addCategoryBtn').addEventListener('click', () => openCategoryModal(null));
  $('#categoryTitleEditBtn').addEventListener('click', () => {
    if (activeCategoryId !== 'all') openCategoryModal(activeCategoryId);
  });

  $('#categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireDb()) return;
    const name = $('#categoryName').value.trim();
    if (!name) return;
    const id = $('#categoryId').value;
    $('#categoryModal').hidden = true;
    const { error } = id
      ? await supabase.from('categories').update({ name }).eq('id', id)
      : await supabase.from('categories').insert({ name });
    if (error) {
      console.error(error);
      alertDialog('저장에 실패했어요. 다시 시도해주세요.');
    }
  });

  $('#deleteCategoryBtn').addEventListener('click', async () => {
    if (!requireDb()) return;
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
    if (!requireDb()) { e.target.value = ''; return; }
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
          const { data: inserted, error } = await supabase.from('categories').insert({ name: c.name }).select().single();
          if (error) { console.error(error); continue; }
          idMap[c.id] = inserted.id;
          existingNames.add(c.name);
        }

        const baseOrder = overwrite || !bookmarks.length ? 0 : Math.min(...bookmarks.map(b => b.order ?? 0)) - 1000;
        let i = 0;
        for (const b of data.bookmarks) {
          const category_id = idMap[b.categoryId] || b.categoryId;
          await supabase.from('bookmarks').insert({
            url: b.url,
            title: b.title || '',
            category_id,
            image: b.image || '',
            note: b.note || '',
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

  // ---------- Init ----------

  function showDbUnavailable() {
    document.querySelector('.body').innerHTML = `
      <div style="padding:80px 24px;text-align:center;color:var(--text-muted);max-width:420px;margin:0 auto;">
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
      order: b.sort_order,
    }));
    renderCategories();
    renderGrid();
  }

  async function boot() {
    if (!supabase) {
      showDbUnavailable();
      return;
    }
    await refreshCategories();
    await refreshBookmarks();

    supabase.channel('categories-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, refreshCategories)
      .subscribe();

    supabase.channel('bookmarks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks' }, refreshBookmarks)
      .subscribe();
  }

  boot();
})();
