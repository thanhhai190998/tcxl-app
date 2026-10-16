// Màn hình: trang chủ (menu), danh sách, chi tiết, form thêm/sửa
(function () {
  const S = () => window.SCHEMA, TT = () => window.SCHEMA.tables;
  const esc = U.esc, enc = encodeURIComponent;
  const V = (window.Views = { state: {} });

  const quyen = () => App.user.quyen || {};
  const canItem = it => App.user.admin || Perm.rank(quyen()[it.perm]) > 0;
  const tableLv = t => permTableLevel(App.user, t);
  const rowLv = (t, r) => permRowLevel(App.user, t, r, (pt, k) => DB.get(pt, k));
  // File tải lên qua app lưu dạng "pwa:<mã Drive>" (không kèm tên) → trả '' để nơi gọi hiện nhãn dễ đọc thay cho dãy mã
  const fileName = p => /^pwa:/.test(String(p || '')) ? '' : String(p || '').split('/').pop().replace(/^[0-9a-f]{8}\./, '');

  V.items = () => S().groupsWithAlbums(DB);
  V.findItem = key => {
    for (const g of V.items()) for (const it of g.items) if (it.key === key) return it;
    if (TT()[key]) return { key, type: 'table', table: key, label: TT()[key].label, perm: key, ic: 'folder' };
    return null;
  };

  V.badgeHtml = b => b && b.text ? `<span class="badge ${esc(b.cls || '')}">${esc(b.text)}</span>` : '';
  V.imgTag = (t, r, field, cls) => `<img class="${cls || 'th'}" data-img="${esc(t)}|${esc(DB.keyOf(t, r))}|${esc(field)}" alt="">`;

  // Tải ảnh thật (qua API có kiểm tra quyền) cho mọi <img data-img> — chỉ tải khi ảnh sắp hiện trên màn hình
  const loadImg = img => {
    const [t, key, field] = img.dataset.img.split('|');
    const fail = mark => img.replaceWith(Object.assign(document.createElement('span'), { className: 'noimg ' + img.className, textContent: mark }));
    Files.url(t, key, field, 'thumb').then(u => { if (u) img.src = u; else fail('🖼️'); }).catch(() => fail('⚠️'));
  };
  const imgIO = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { imgIO.unobserve(e.target); loadImg(e.target); } }), { rootMargin: '400px 0px' })
    : null;
  V.hydrate = root => {
    root.querySelectorAll('img[data-img]:not([data-loading])').forEach(img => {
      img.dataset.loading = '1';
      img.decoding = 'async';
      const [t, key, field] = img.dataset.img.split('|');
      if (img.classList.contains('big')) img.onclick = () => V.lightbox(t, key, field);
      if (imgIO) imgIO.observe(img); else loadImg(img);
    });
  };
  // Xem ảnh lớn: ảnh luôn vừa màn hình; chụm 2 ngón / chạm đúp / lăn chuột để phóng to ngay trong khung
  // (chặn trình duyệt phóng to cả trang — trước đây thoát ra thì giao diện app bị phóng theo).
  // Hiện ngay ảnh nhỏ đã có (mờ), tải bản ~1600px rồi thay vào.
  V.lightbox = async (t, key, field) => {
    const bg = document.createElement('div');
    bg.className = 'lightbox';
    bg.innerHTML = `<div class="lb-stage"><span class="spin"></span></div>
      <button type="button" class="lb-x" aria-label="Đóng">${Icon('x')}</button>
      <div class="lb-hint">Chụm 2 ngón hoặc chạm đúp để phóng to · chạm ra ngoài ảnh để đóng</div>`;
    document.body.appendChild(bg);
    const stage = bg.querySelector('.lb-stage');
    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    bg.querySelector('.lb-x').onclick = close;
    const show = (u, low) => { stage.innerHTML = `<img class="${low ? 'lb-low' : ''}" src="${u}" alt="" draggable="false">${low ? '<span class="spin"></span>' : ''}`; };
    const lowP = Files.ready(t, key, field, 'thumb');
    if (lowP) lowP.then(u => { if (u && stage.querySelector('.spin')) show(u, true); }).catch(() => {});
    try {
      const u = await Files.url(t, key, field, 'preview');
      if (!bg.isConnected) return;
      if (!u) { stage.textContent = 'Không tải được ảnh'; return; }
      show(u, false);
      zoomable(stage, stage.querySelector('img'), close);
    } catch (e) { stage.textContent = e.message; }
  };

  // Phóng to / kéo ảnh trong khung xem (ngón tay, chuột, bánh xe)
  function zoomable(stage, img, close) {
    let s = 1, tx = 0, ty = 0, g = null, lastTap = 0;
    const pts = new Map();
    const apply = () => {
      const r = stage.getBoundingClientRect(), w = img.offsetWidth * s, h = img.offsetHeight * s;
      const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
      tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty));
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      stage.classList.toggle('zoomed', s > 1.01);
    };
    const rel = (x, y) => { const r = stage.getBoundingClientRect(); return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 }; };
    // Phóng quanh điểm p (toạ độ tính từ tâm khung): giữ nguyên điểm ảnh đang nằm dưới p
    const zoomAt = (p, ns) => { ns = Math.min(5, Math.max(1, ns)); tx = p.x - (p.x - tx) * ns / s; ty = p.y - (p.y - ty) * ns / s; s = ns; if (s === 1) tx = ty = 0; apply(); };
    const pair = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: rel((a.x + b.x) / 2, (a.y + b.y) / 2) }; };

    stage.addEventListener('pointerdown', e => {
      try { stage.setPointerCapture(e.pointerId); } catch (er) { /* bỏ qua */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const p = pair(); g = { pinch: true, d0: p.d, m0: p.m, s0: s, tx0: tx, ty0: ty, moved: true }; }
      else if (pts.size === 1) g = { pinch: false, x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, t0: Date.now(), moved: false, onImg: e.target === img };
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.pinch && pts.size === 2) {
        const p = pair(), ns = Math.min(5, Math.max(1, g.s0 * p.d / g.d0));
        tx = p.m.x - (g.m0.x - g.tx0) * ns / g.s0; ty = p.m.y - (g.m0.y - g.ty0) * ns / g.s0; s = ns;
        apply();
      } else if (!g.pinch) {
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (Math.hypot(dx, dy) > 8) g.moved = true;
        if (s > 1) { tx = g.tx0 + dx; ty = g.ty0 + dy; apply(); }
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!g) return;
      if (g.pinch) { if (pts.size === 0) { g = null; if (s < 1.05) zoomAt({ x: 0, y: 0 }, 1); } return; }
      const tap = !g.moved && Date.now() - g.t0 < 350;
      if (tap) {
        const now = Date.now();
        if (now - lastTap < 300) { lastTap = 0; zoomAt(rel(e.clientX, e.clientY), s > 1.01 ? 1 : 2.5); }   // chạm đúp
        else {
          lastTap = now;
          if (!g.onImg && s <= 1.01) setTimeout(() => { if (lastTap === now) close(); }, 300);   // chạm ra ngoài ảnh → đóng
        }
      }
      g = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(rel(e.clientX, e.clientY), s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
  }

  // ---------------- TRANG CHỦ ----------------
  // ---------------- MENU: các nhóm/mục người dùng được xem (dùng cho trang chủ + menu trượt) ----------------
  V.navGroups = () => {
    const groups = V.items().map(g => ({ ...g, items: g.items.filter(canItem) })).filter(g => g.items.length);
    if (App.user.admin) groups.push({ key: 'adm', label: 'Quản trị', ic: 'shield', color: 'var(--g7)', items: [
      { key: '_admin', label: 'Phân quyền', ic: 'shield', desc: 'Người dùng & quyền', href: '#/admin', color: 'var(--g7)' },
      { key: '_settings', label: 'Cài đặt', ic: 'gear', desc: 'Giao diện, khoá app, cài app', href: '#/settings', color: 'var(--g7)' }
    ] });
    return groups;
  };
  V.hrefOf = it => it.href || '#/i/' + enc(it.key);

  // ---------------- "HAY DÙNG": đếm số lần mở từng mục (lưu trên máy này) ----------------
  const VISIT_KEY = 'tcxl-visits', TAB_KEY = 'tcxl-home-tab';
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } } };
  V.visit = key => { const v = store.get(VISIT_KEY, {}); v[key] = (v[key] || 0) + 1; store.set(VISIT_KEY, v); };
  const DEFAULT_FAV = ['DASH_VATTU', 'KIEN', 'MGMER', 'KIEM_TRA', 'GIR', 'OSD', 'GOI_THAU', 'NHAN_SU'];
  function frequent(all, n = 8) {
    const v = store.get(VISIT_KEY, {}), byKey = new Map(all.map(it => [it.key, it]));
    const top = Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k]) => byKey.get(k)).filter(Boolean);
    const out = [];
    for (const it of [...top, ...DEFAULT_FAV.map(k => byKey.get(k)).filter(Boolean), ...all]) if (!out.includes(it) && out.length < n) out.push(it);
    return out;
  }

  function greeting() {
    const h = new Date().getHours();
    const hello = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const name = (window.Auth && Auth.given) || App.user.name || (App.user.email || '').split('@')[0];
    const day = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    return { hello, name, day: day.charAt(0).toUpperCase() + day.slice(1) };
  }

  // Ô gọn kiểu màn hình điện thoại: biểu tượng + tên
  const mini = it => `<a class="mt" href="${V.hrefOf(it)}" style="--gc:${it.color || 'var(--g7)'}" title="${esc(it.desc || it.label)}">
    <span class="mt-ic">${Icon(it.ic)}</span><span class="mt-l">${esc(it.label)}</span></a>`;

  V.home = async () => {
    App.head(window.APP_CONFIG.appName, { home: true });
    App.loading();
    const groups = V.navGroups(), all = groups.flatMap(g => g.items);

    const can = t => permTableLevel(App.user, t);
    const PH = SCHEMA.PHASES, kl = '#/i/KIEN?Phase=';
    const kpis = [
      { id: 'tot', ts: ['KIEN'], label: 'Tổng số kiện', ic: 'box', href: '#/i/KIEN' },
      { id: 've', ts: ['KIEN'], label: 'Đã về, chưa mở kiện', ic: 'inspect', href: kl + encodeURIComponent(PH[1]) },
      { id: 'mo', ts: ['KIEN'], label: 'Đã mở kiện', ic: 'open', href: kl + encodeURIComponent(PH[2]) },
      { id: 'osd', ts: ['OSD'], label: 'Biên bản OSD', ic: 'alert', href: '#/i/OSD' }
    ].filter(k => k.ts.some(t => can(t) > 0));
    const quick = [
      { t: 'KIEN', label: 'Kiện mới' }, { t: 'MGMER', label: 'Biên bản kiểm đếm' },
      { t: 'KIEM_TRA', label: 'Kiểm tra vị trí' }, { t: 'GIR', label: 'Mở kiện' }
    ].filter(q => can(q.t) === 2);

    const g = greeting();
    App.hero(`<div class="hero-in ${kpis.length ? 'with-kpi' : ''}">
      <div class="hday">${esc(g.day)}</div>
      <h1 class="hhello">${esc(g.hello)}, ${esc(g.name)}</h1>
      <label class="hsearch">${Icon('search')}<input type="search" id="hq" placeholder="Tìm nhanh một mục…" autocomplete="off"></label>
    </div>`);

    let tab = store.get(TAB_KEY, 'g0');
    if (!groups.some(x => x.key === tab)) tab = groups[0] && groups[0].key;
    let html = '';
    if (kpis.length) html += `<div class="kpi-row">${kpis.map(k => `<a class="kcard" href="${k.href}" data-k="${k.id}">
      <span class="kic">${Icon(k.ic)}</span><span class="kn"><span class="skel"></span></span><span class="kl">${esc(k.label)}</span></a>`).join('')}</div>`;
    if (quick.length) html += `<div class="quick"><span class="qt">Thêm nhanh</span>${quick.map(q =>
      `<a class="qbtn" href="#/f/${q.t}/new">${Icon('plus')}${esc(q.label)}</a>`).join('')}</div>`;
    if (!groups.length) html += '<div class="empty">Tài khoản của bạn chưa được cấp quyền mục nào. Hãy liên hệ quản trị viên.</div>';
    else {
      html += `<section class="hsec" id="hfav"><div class="hsec-h"><h2>${Icon('star', 'sm')} Hay dùng</h2><span class="muted small">tự cập nhật theo số lần bạn mở</span></div>
        <div class="mgrid">${frequent(all).map(mini).join('')}</div></section>`;
      html += `<section class="hsec" id="hall"><div class="hsec-h"><h2>Tất cả mục</h2></div>
        <div class="gtabs">${groups.map(x => `<button type="button" class="gtab ${x.key === tab ? 'on' : ''}" data-t="${x.key}" style="--gc:${x.color}">
          <span class="gt-ic">${Icon(x.ic)}</span>${esc(x.label)}<b>${x.items.length}</b></button>`).join('')}</div>
        <div class="mgrid" id="gitems"></div></section>`;
      html += `<section class="hsec" id="hres" hidden><div class="hsec-h"><h2>Kết quả tìm</h2></div><div class="mgrid" id="ritems"></div></section>`;
    }
    App.main.innerHTML = html;

    // Tab nhóm
    const drawTab = () => {
      const gr = groups.find(x => x.key === tab); const box = document.getElementById('gitems');
      if (box && gr) box.innerHTML = gr.items.map(mini).join('');
    };
    App.main.querySelectorAll('.gtab').forEach(b => b.onclick = () => {
      tab = b.dataset.t; store.set(TAB_KEY, tab);
      App.main.querySelectorAll('.gtab').forEach(x => x.classList.toggle('on', x === b));
      drawTab();
      centerTab(b, true);
    });
    // Đưa tab đang chọn vào giữa dải tab (chỉ cuộn ngang, không kéo trang)
    const centerTab = (b, smooth) => { const bar = b && b.parentElement; if (!bar) return;
      bar.scrollTo({ left: b.offsetLeft - bar.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' }); };
    centerTab(App.main.querySelector('.gtab.on'));
    drawTab();

    // Tìm nhanh: hiện kết quả từ mọi nhóm
    const hq = document.getElementById('hq');
    hq.oninput = () => {
      const q = U.norm(hq.value.trim());
      const res = q ? all.filter(it => U.match(it.label + ' ' + (it.desc || ''), hq.value)) : [];
      ['hfav', 'hall'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !!q; });
      App.main.querySelectorAll('.kpi-row, .quick').forEach(el => { el.hidden = !!q; });
      const rs = document.getElementById('hres');
      if (rs) { rs.hidden = !q; document.getElementById('ritems').innerHTML = res.length ? res.map(mini).join('') : '<div class="muted small mg-empty">Không có mục nào khớp</div>'; }
      document.querySelector('.hero-in').classList.toggle('with-kpi', kpis.length > 0 && !q);
    };

    // Số liệu trong ngày (tải sau, không chặn trang)
    if (kpis.length) {
      const need = [...new Set(kpis.flatMap(k => k.ts).filter(t => can(t) > 0))];
      await Promise.all(need.map(t => DB.loadDeps(t).catch(() => {})));
      const set = (id, n, warn) => {
        const card = App.main.querySelector(`[data-k="${id}"]`); if (!card) return;
        card.querySelector('.kn').textContent = n;
        card.classList.toggle('warn', !!warn && n > 0);
        card.classList.toggle('good', !!warn && n === 0);
      };
      const kien = DB.rows('KIEN'), fmt = n => U.int(n);
      set('tot', fmt(kien.length));
      set('ve', fmt(kien.filter(r => r.MGMER && !r.GIR).length));
      set('mo', fmt(kien.filter(r => r.GIR).length));
      set('osd', fmt(DB.rows('OSD').length));
    }
  };

  // ---------------- DANH SÁCH ----------------
  V.list = async key => {
    const it = V.findItem(key);
    if (!it || !canItem(it)) return App.notFound();
    V.visit(key);
    if (it.type === 'dash') return Dash.render(it);
    if (it.type === 'excel') return Excel.render(it);
    const t = it.table, def = TT()[t], L = def.list || {};
    App.head(it.label, { back: true });
    App.loading();
    await DB.loadDeps(t);
    const sorts = V.sortOptions(t);
    const st = (V.state[key] = V.state[key] || { q: '', fs: {}, s: sorts[0].id });
    st.fs = st.fs || {}; st.xf = st.xf || {};
    const canAdd = App.user.admin || tableLv(t) === 2;
    const addHref = `#/f/${t}/new`;
    // Nút lọc nhanh: 1 hoặc nhiều cột (vd Gói thầu + Giai đoạn) — mỗi cột một hàng nút
    const chipFields = L.type === 'gallery' || L.type === 'calendar' ? [] : [].concat(L.filter || L.group || []).filter(Boolean);
    const dateF = L.range && L.sort && DB.field(t, L.sort);
    const size = L.page ? (window.APP_CONFIG.listPage || 100) : 0;
    st.rg = st.rg || { p: 'all', from: '', to: '' };
    // Mở từ dashboard kèm bộ lọc (#/i/KIEN?Goi_thau=T12&Phase=…) → áp bộ lọc rồi bỏ khỏi địa chỉ (vẽ lại ngầm không ghi đè lựa chọn mới)
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    if ([...qs.keys()].length) {
      st.fs = {}; st.xf = {};
      qs.forEach((v, k) => { if (chipFields.includes(k)) st.fs[k] = v; else if (DB.field(t, k)) st.xf[k] = v; });   // cột khác (vd Hệ thống) = bộ lọc thêm
      st.q = qs.get('q') || '';
      history.replaceState(null, '', '#/i/' + enc(key));
    }
    st.lim = st.lim || size;

    App.main.innerHTML = `<div class="lbar">
        <label class="lsearch">${Icon('search')}<input type="search" placeholder="${esc(L.hint || 'Tìm trong ' + it.label.toLowerCase() + '…')}" value="${esc(st.q)}"></label>
        ${sorts.length > 1 ? `<select class="lsort" title="Sắp xếp">${sorts.map(s => `<option value="${s.id}" ${s.id === st.s ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select>` : ''}
        ${L.excel && canItem(V.findItem('EXCEL') || {}) ? `<a class="btn ghost ladd" href="#/i/EXCEL?m=${L.excel}" title="Nhập / xuất Excel">${Icon('upload')}Excel</a>` : ''}
        ${canAdd ? `<a class="btn ladd" href="${addHref}">${Icon('plus')}Thêm</a>` : ''}
      </div>
      ${dateF ? `<div class="lfil">
        <label class="tsel" title="Lọc theo ${esc(dateF.l.toLowerCase())}">${Icon('calendar')}<select id="tsel" aria-label="Khoảng thời gian">
          ${RANGES.map(([v, l]) => `<option value="${v}" ${v === st.rg.p ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <span class="trng" id="trng" ${st.rg.p === 'custom' ? '' : 'hidden'}>
          ${V.dateInput('id="tfrom"', st.rg.from, { label: 'Từ ngày' })}<span>→</span>${V.dateInput('id="tto"', st.rg.to, { label: 'Đến ngày' })}</span>
      </div>` : ''}
      <div id="chips"></div><div class="lsum" id="lsum" hidden></div><div id="lst"></div>
      ${canAdd ? `<a class="fab" href="${addHref}" title="Thêm mới" style="--gc:${it.color || 'var(--pri)'}">${Icon('plus')}</a>` : ''}`;
    App.main.classList.toggle('has-fab', canAdd);

    // Lọc thời gian: dòng không có ngày bị loại khi đang chọn 1 khoảng
    const inRange = r => {
      if (!dateF) return true;
      const [a, b] = V.rangeOf(st.rg); if (!a && !b) return true;
      const v = U.isoOf(DB.val(t, r, L.sort)); if (!v) return false;
      return (!a || v >= a) && (!b || v <= b);
    };
    // Lọc theo các nút đang chọn (trừ cột `skip` — để đếm số trên chính hàng nút đó)
    // Cột chọn nhiều (vd Loại OSD "Thiếu, Hư hỏng"): 1 dòng thuộc mọi giá trị nó có
    const valsOf = (r, f) => { const fl = DB.field(t, f); if (!fl || !fl.multi) return [groupValue(t, r, f)]; const a = U.splitList(DB.val(t, r, f)); return a.length ? a : ['']; };
    const byChips = (rows, skip) => chipFields.reduce((rs, f) => f === skip || st.fs[f] == null ? rs : rs.filter(r => valsOf(r, f).includes(st.fs[f])), rows);
    // Bộ lọc thêm theo cột không có nút (mở từ dashboard, vd Hệ thống = Boiler) — hiện ở dòng tổng, có nút bỏ lọc
    const byExtra = rows => Object.keys(st.xf).reduce((rs, f) => rs.filter(r => valsOf(r, f).includes(st.xf[f])), rows);
    const base = () => byExtra(V.filterRows(it, '').filter(inRange));
    const drawChips = () => {
      const box = document.getElementById('chips'), all = base();
      box.innerHTML = chipFields.map(f => {
        const rows = byChips(all, f), groups = new Map(), cur = st.fs[f];
        rows.forEach(r => valsOf(r, f).forEach(g => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }));
        if (groups.size < 2 && cur == null) return '';
        const n = rs => esc(L.sum ? V.fmtSum(t, V.sumOf(t, rs), true) : U.int(rs.length));   // có cột cộng → nút lọc hiện tổng (vd tổng kiện)
        const keys = V.orderGroups(t, f, [...groups.keys()]);
        if (cur != null && !groups.has(cur)) keys.push(cur);
        const fl = DB.field(t, f), many = chipFields.length > 1 && fl;
        return `<div class="chips-row" data-cf="${esc(f)}" ${many ? `aria-label="${esc(fl.l)}"` : ''}>
          <button class="chip2 ${cur == null ? 'on' : ''}" data-f="">${many ? esc(fl.l.replace(/\s*\(.*\)$/, '')) + ': tất cả' : 'Tất cả'} <b>${n(rows)}</b></button>
          ${keys.map(k => `<button class="chip2 ${cur === k ? 'on' : ''}" data-f="${esc(k)}">${esc(k || '(trống)')} <b>${n(groups.get(k) || [])}</b></button>`).join('')}</div>`;
      }).join('');
      box.querySelectorAll('.chips-row').forEach(row => row.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        const f = row.dataset.cf;
        if (b.dataset.f === '') delete st.fs[f]; else st.fs[f] = b.dataset.f;
        drawChips(); draw(true);
      }));
    };
    // Dòng tổng: số dòng + tổng cột cộng + khoảng thời gian / bộ lọc đang chọn
    const drawSum = rows => {
      const box = document.getElementById('lsum'), [a, b] = V.rangeOf(st.rg), on = a || b;
      const xf = Object.keys(st.xf);
      box.hidden = !(L.sum || on || size || xf.length);
      if (box.hidden) return;
      const span = on ? (a && b ? `${U.fmtDate(a)} → ${U.fmtDate(b)}` : a ? 'từ ' + U.fmtDate(a) : 'đến ' + U.fmtDate(b)) : (dateF ? 'mọi thời gian' : '');
      const tot = L.sum ? ` · tổng <b>${esc(V.fmtSum(t, V.sumOf(t, rows)))}</b>` : '';
      const fil = chipFields.filter(f => st.fs[f] != null).map(f => st.fs[f] || '(trống)');
      const notes = [span, ...fil, st.q ? 'khớp "' + st.q + '"' : ''].filter(Boolean);
      box.innerHTML = `${Icon('chart', 'sm')}<span><b>${U.int(rows.length)}</b> ${esc(L.countUnit || 'mục')}${tot}
        ${notes.length ? `<span class="muted">· ${notes.map(esc).join(' · ')}</span>` : ''}
        ${xf.map(f => `<button type="button" class="xchip" data-xf="${esc(f)}" title="Bỏ lọc">${esc(DB.field(t, f).l.replace(/\s*\(.*\)$/, ''))}: <b>${esc(st.xf[f] || '(trống)')}</b> ${Icon('x', 'sm')}</button>`).join('')}</span>`;
      box.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => { delete st.xf[b.dataset.xf]; drawChips(); draw(true); });
    };
    // reset = đổi bộ lọc / từ khoá → quay về trang đầu của danh sách dài
    const draw = reset => {
      if (reset && size) st.lim = size;
      const rows = byChips(byExtra(V.filterRows(it, st.q).filter(inRange)));
      drawSum(rows);
      const flat = chipFields.includes(L.group) && st.fs[L.group] != null;
      const box = document.getElementById('lst');
      box.innerHTML = rows.length
        ? V.renderRows(t, rows, { flat, sortBy: st.s, item: it, limit: size ? st.lim : 0 })
        : `<div class="lempty"><span class="tic" style="--gc:${it.color || 'var(--g7)'}">${Icon(it.ic || 'folder')}</span>
            <div>${st.q || Object.keys(st.fs).length || Object.keys(st.xf).length ? 'Không có mục nào khớp' : 'Chưa có dữ liệu'}</div>
            ${canAdd && !st.q ? `<a class="btn" href="${addHref}">${Icon('plus')}Thêm mới</a>` : ''}</div>`;
      const more = box.querySelector('[data-more]');
      if (more) more.onclick = () => { st.lim += size; draw(); };
      V.hydrate(App.main);
    };
    // Danh sách dài: chờ ngừng gõ một chút mới lọc (không giật khi gõ)
    let qt = null;
    App.main.querySelector('.lsearch input').oninput = e => {
      st.q = e.target.value; clearTimeout(qt);
      qt = setTimeout(() => draw(true), DB.rows(t).length > 2000 ? 220 : 0);
    };
    const ss = App.main.querySelector('.lsort');
    if (ss) ss.onchange = () => { st.s = ss.value; draw(true); };
    if (dateF) {
      V.dates(App.main);
      const sel = document.getElementById('tsel'), rng = document.getElementById('trng'), fr = document.getElementById('tfrom'), to = document.getElementById('tto');
      sel.onchange = () => {
        st.rg.p = sel.value;
        if (sel.value === 'custom' && !st.rg.from && !st.rg.to) {   // gợi ý sẵn: đầu tháng này → hôm nay
          const d = new Date(); st.rg.from = fr.value = U.iso(new Date(d.getFullYear(), d.getMonth(), 1)); st.rg.to = to.value = U.today();
          fr._sync(); to._sync();
        }
        rng.hidden = sel.value !== 'custom';
        drawChips(); draw(true);
      };
      fr.onchange = to.onchange = () => { st.rg.from = fr.value; st.rg.to = to.value; drawChips(); draw(true); };
    }
    drawChips(); draw();
  };

  // Tổng cột số (list.sum) của các dòng; tiền → "1.200.000 ₫", số → "308 kiện"
  V.sumOf = (t, rows) => { const n = (TT()[t].list || {}).sum; return n ? rows.reduce((a, r) => a + U.num(DB.val(t, r, n)), 0) : rows.length; };
  V.fmtSum = (t, v, short) => {
    const L = TT()[t].list || {}, f = L.sum && DB.field(t, L.sum);
    if (f && f.t === 'price') return U.money(v);
    return U.int(v) + (L.unit && !short ? ' ' + L.unit : '');
  };

  // Bộ lọc thời gian (list.range) theo cột ngày dùng để sắp xếp
  const RANGES = [['all', 'Mọi thời gian'], ['m0', 'Tháng này'], ['m1', 'Tháng trước'], ['q0', 'Quý này'], ['m3', '3 tháng gần đây'],
    ['y0', 'Năm nay'], ['y1', 'Năm trước'], ['custom', 'Chọn từ ngày… đến ngày…']];
  V.rangeOf = rg => {   // → [từ, đến] dạng yyyy-mm-dd ('' = không giới hạn)
    const d = new Date(), y = d.getFullYear(), m = d.getMonth(), iso = U.iso;
    switch (rg && rg.p) {
      case 'm0': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
      case 'm1': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
      case 'q0': { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
      case 'm3': return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))];
      case 'y0': return [y + '-01-01', y + '-12-31'];
      case 'y1': return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
      case 'custom': return [rg.from || '', rg.to || ''];
      default: return ['', ''];
    }
  };

  // Các kiểu sắp xếp cho 1 bảng: theo ngày (mới/cũ) nếu có, và theo tên
  V.sortOptions = t => {
    const L = TT()[t].list || {}, f = L.sort && DB.field(t, L.sort);
    const isDate = f && /^(date|datetime|expiry)$/.test(f.t);
    const o = [];
    if (isDate) {
      const a = { id: 'd-desc', l: 'Mới nhất' }, b = { id: 'd-asc', l: 'Cũ nhất' };
      if (L.desc) o.push(a, b); else o.push(b, a);
    } else if (f && (f.t === 'number' || f.t === 'price')) o.push({ id: 'def', l: 'Mặc định' });   // vd thứ tự album
    o.push({ id: 'az', l: 'Tên A → Z' });
    return o;
  };

  V.orderGroups = (t, field, keys) => {
    const L = TT()[t].list || {}, f = DB.field(t, field);
    const order = (field === L.group && L.groupOrder) || (f && f.opts) || null;
    return keys.sort((a, b) => {
      if (order) { const ia = order.indexOf(a), ib = order.indexOf(b); if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); }
      return a.localeCompare(b, 'vi', { numeric: true });
    });
  };

  V.filterRows = (it, query) => {
    const t = it.table, def = TT()[t];
    let rows = DB.rows(t);
    if (it.album) rows = rows.filter(r => r.Album === it.album);
    if (query) {
      const fs = def.fields.filter(f => !f.enc && f.t !== 'image' && f.t !== 'file');
      rows = rows.filter(r => {
        const text = [DB.title(t, r), DB.sub(t, r)], dates = [];
        fs.forEach(f => {
          const v = f.t === 'ref' ? DB.title(f.ref, DB.get(f.ref, r[f.n])) : DB.val(t, r, f.n);
          if (/^(date|datetime|expiry)$/.test(f.t) || U.isDateLike(v)) dates.push(f.t === 'datetime' ? U.fmtDateTime(v) : U.fmtDate(v));   // ngày → dd/mm/yyyy, tách riêng
          else text.push(v);
        });
        return U.match(text.join(' '), query, dates.join(' '));
      });
    }
    return rows;
  };

  function cmp(a, b, type) {
    if (type === 'date' || type === 'datetime' || type === 'expiry') {
      const x = U.parseDate(a), y = U.parseDate(b);
      return (x ? x.getTime() : -Infinity) - (y ? y.getTime() : -Infinity) || 0;
    }
    if (type === 'number' || type === 'price') return U.num(a) - U.num(b);
    return String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true });
  }

  // Khoá so trùng số biên bản: bỏ dấu / hoa thường / dấu cách, bỏ tiền tố tên bảng ("MGMER 1010" = "1010"), số thuần bỏ số 0 đầu ("045" = "45")
  function soKey(t, s) {
    const k = U.norm(s).replace(/\s+/g, '').replace(new RegExp('^' + t.toLowerCase() + '[-_.:#]*(no\\.?)?(?=.)'), '');
    return /^\d+$/.test(k) ? String(+k) : k;
  }

  function groupValue(t, r, g) {
    const f = DB.field(t, g), v = DB.val(t, r, g);
    if (f && f.t === 'ref') { const rr = DB.get(f.ref, v); return rr ? DB.title(f.ref, rr) : (v || ''); }
    return v == null ? '' : String(v);
  }

  // Biểu tượng + màu của mục chứa bảng t (dùng cho dòng không có ảnh)
  const metaOf = t => {
    for (const g of V.items()) for (const it of g.items) if (it.table === t) return { ic: it.ic, color: it.color };
    return { ic: 'folder', color: 'var(--g7)' };
  };
  // Chữ cái đầu của họ + tên: "Trần Văn An" → "TA"
  const initials = s => {
    const w = String(s || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0].charAt(0) + w[w.length - 1].charAt(0) : (w[0] || '?').charAt(0)).toUpperCase();
  };
  // Màu cố định theo giá trị (vd mỗi gói thầu một màu)
  const TONES = ['var(--g0)', 'var(--g3)', 'var(--g4)', 'var(--g1)', 'var(--g5)', 'var(--g2)', 'var(--g7)'];
  const toneOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };

  // Ô đầu dòng: ảnh → giá trị ngắn (vd mã gói) → chữ cái đầu → biểu tượng mục
  function leadHtml(t, r, meta, cls = '', noImg = false) {
    const def = TT()[t], L = def.list || {};
    const lv0 = L.lead ? DB.val(t, r, L.lead) : '';   // DB.val: cột ảo cũng được (vd gói thầu của lần kiểm tra lấy theo kiện)
    const leadVal = lv0 ? String(lv0).slice(0, 5) : '';
    if (!noImg && def.img && r[def.img]) return V.imgTag(t, r, def.img);
    if (leadVal) return `<span class="lead tx ${cls}" style="--gc:${toneOf(leadVal)}">${esc(leadVal)}</span>`;
    if (L.avatar === 'initials') return `<span class="lead av ${cls}" style="--gc:${meta.color}">${esc(initials(DB.title(t, r)))}</span>`;
    return `<span class="lead ${cls}" style="--gc:${meta.color}">${Icon(meta.ic)}</span>`;
  }

  function rowHtml(t, r, meta) {
    const def = TT()[t], L = def.list || {};
    const cols = (meta.compact ? [] : L.cols || []).map(c => {
      const f = DB.field(t, c); if (!f || c === meta.skip) return '';
      const v = f.enc ? (r[c] ? '••••••' : '') : DB.show(t, r, c, true);
      return v ? `<span><i>${esc(f.s || f.l)}</i> ${v}</span>` : '';   // f.s = nhãn ngắn cho dòng danh sách
    }).filter(Boolean).join('');
    const sub = DB.sub(t, r), title = DB.title(t, r), b = DB.badge(t, r);
    return `<a class="row" href="#/r/${t}/${enc(DB.keyOf(t, r))}" ${b && b.cls ? `data-tone="${esc(b.cls)}"` : ''}>${leadHtml(t, r, meta)}
      <div class="row-main"><div class="row-title">${esc(title)}</div>
      ${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}${cols ? `<div class="row-meta">${cols}</div>` : ''}</div>
      ${V.badgeHtml(b)}</a>`;
  }

  V.renderRows = (t, rows, opts = {}) => {
    const def = TT()[t], L = def.list || {};
    if (!rows.length) return '<div class="empty">Chưa có dữ liệu</div>';
    const meta = Object.assign({}, opts.item ? { ic: opts.item.ic || 'folder', color: opts.item.color || 'var(--g7)' } : metaOf(t), { skip: opts.skip, compact: opts.compact });
    const row = r => rowHtml(t, r, meta);
    rows = rows.slice();
    const sb = opts.sortBy || (L.sort ? (L.desc ? 'd-desc' : 'def') : null);
    if (sb === 'az') rows.sort((a, b) => DB.title(t, a).localeCompare(DB.title(t, b), 'vi', { numeric: true }));
    else if (sb !== 'none' && L.sort) {
      const f = DB.field(t, L.sort), dir = sb === 'd-desc' || (sb !== 'd-asc' && L.desc) ? -1 : 1;
      rows.sort((a, b) => cmp(DB.val(t, a, L.sort), DB.val(t, b, L.sort), f && f.t) * dir);
    }

    if (L.type === 'gallery' && !opts.flat) {
      return `<div class="gallery">${rows.map(r => `<a class="ph" href="#/r/${t}/${enc(DB.keyOf(t, r))}">
        ${r.Hinh_anh ? V.imgTag(t, r, 'Hinh_anh') : `<span class="noimg th">${Icon('image')}</span>`}
        ${r.Mo_ta ? `<span class="cap">${esc(r.Mo_ta)}</span>` : ''}</a>`).join('')}</div>`;
    }
    if (L.type === 'calendar' && !opts.flat) {
      const now = U.parseDate(U.today());
      const up = rows.filter(r => (U.parseDate(r.NgayKetThuc || r.NgayBatDau) || 0) >= now);
      const past = rows.filter(r => !up.includes(r)).reverse();
      const sec = (title, rs) => rs.length ? `<details class="lgrp" open><summary>${title} <span class="cnt">${rs.length}</span></summary>${rs.map(row).join('')}</details>` : '';
      return sec('Sắp tới', up) + sec('Đã qua', past);
    }
    if (L.group && !opts.flat) {
      const groups = new Map();
      rows.forEach(r => { const g = groupValue(t, r, L.group); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
      const keys = V.orderGroups(t, L.group, [...groups.keys()]);
      // Có cột cộng (vd số kiện): tiêu đề nhóm hiện tổng, kèm số dòng
      const head = rs => L.sum ? `<span class="cnt">${esc(V.fmtSum(t, V.sumOf(t, rs)))}</span><span class="gsub">${rs.length} ${esc(L.countUnit || 'mục')}</span>`
        : `<span class="cnt">${rs.length}</span>`;
      return keys.map(g => `<details class="lgrp" open><summary>${esc(g || '(trống)')} ${head(groups.get(g))}</summary>
        ${groups.get(g).map(row).join('')}</details>`).join('');
    }
    // Danh sách dài (list.page): chỉ vẽ `limit` dòng đầu, nút "Hiện thêm" ở cuối
    const lim = opts.limit && rows.length > opts.limit ? opts.limit : 0;
    return `<div class="rows">${(lim ? rows.slice(0, lim) : rows).map(row).join('')}</div>`
      + (lim ? `<button type="button" class="btn ghost lmore" data-more>${Icon('chevron', 'sm')} Hiện thêm · còn ${U.int(rows.length - lim)} ${esc(L.countUnit || 'mục')}</button>` : '');
  };

  // ---------------- CHI TIẾT ----------------
  V.detail = async (t, key) => {
    const def = TT()[t];
    if (!def) return App.notFound();
    App.head(def.label, { back: true });
    App.loading();
    await DB.loadDeps(t, true);
    const r = DB.get(t, key);
    if (!r) { App.main.innerHTML = '<div class="empty">Không tìm thấy bản ghi (có thể đã bị xoá hoặc bạn không có quyền xem).</div>'; return; }
    const lv = rowLv(t, r), D = def.detail || {}, meta = metaOf(t);
    const title = DB.title(t, r), sub = DB.sub(t, r), badge = DB.badge(t, r);
    const imgs = def.fields.filter(f => f.t === 'image' && r[f.n]);
    const stats = (D.stats || []).map(n => DB.field(t, n)).filter(f => f && !f.enc && DB.show(t, r, f.n) !== '');
    const skip = new Set([...(D.hide || []), ...stats.map(f => f.n)]);

    // Phần đầu: biểu tượng, tiêu đề, nhãn tình trạng, nút sửa/xoá, ảnh, các mốc quan trọng
    let html = `<div class="card dhero" style="--gc:${meta.color}">
      <div class="dh-top">${leadHtml(t, r, meta, 'big', true)}
        <div class="dh-main"><h2 class="dtitle">${esc(title)}</h2>${sub ? `<div class="dsub">${esc(sub)}</div>` : ''}${V.badgeHtml(badge)}</div>
        ${lv >= 2 ? `<div class="dh-act"><a class="ibtn2" href="#/f/${t}/${enc(key)}" title="Sửa">${Icon('edit')}</a>
          <button class="ibtn2 danger" data-del title="Xoá">${Icon('trash')}</button></div>` : ''}
      </div>
      ${imgs.length ? `<div class="dimgs">${imgs.map(f => `<figure>${V.imgTag(t, r, f.n, 'big')}<figcaption>${esc(f.l)}</figcaption></figure>`).join('')}</div>` : ''}
      ${stats.length ? `<div class="dstats">${stats.map(f => `<div class="dstat"><span class="sl">${esc(f.l)}</span><span class="sv">${DB.show(t, r, f.n, true)}</span></div>`).join('')}</div>` : ''}
    </div>`;

    // Các thông tin còn lại: nhãn bên trái, giá trị bên phải (giá trị dài thì xuống dòng)
    const rowsHtml = def.fields.filter(f => f.t !== 'image' && !skip.has(f.n)).map(f => {
      const raw = r[f.n];
      let v, stack = false;
      if (f.enc) {
        if (!raw) return '';
        v = `<span class="secret" data-enc="${esc(f.n)}">••••••••</span>
          <button class="ibtn3" data-reveal="${esc(f.n)}" title="Hiện">${Icon('eye')}</button>
          ${Vault.isEnc(raw) ? '' : '<span class="badge warn" title="Giá trị này đang lưu dạng chữ thường">chưa mã hoá</span>'}`;
      } else if (f.t === 'file') {
        if (!raw) return '';
        v = `<button class="fchip" data-file="${esc(f.n)}">${Icon('file')}<span>${esc(fileName(raw) || 'Xem file')}</span>${Icon('open', 'sm')}</button>`;
      } else {
        v = DB.show(t, r, f.n);
        if (v === '' || v == null) return '';
        if (String(DB.val(t, r, f.n)).trim() === title.trim()) return '';   // trùng tiêu đề → bỏ
        if (f.t === 'phone') v += ` <a class="ibtn3" href="tel:${esc(String(raw).replace(/\s/g, ''))}" title="Gọi">${Icon('phone')}</a>`;
        if (f.t === 'email') v += ` <a class="ibtn3" href="mailto:${esc(raw)}" title="Gửi email">${Icon('mail')}</a>`;
        stack = f.t === 'longtext' || String(DB.val(t, r, f.n)).length > 38;
        if (f.t === 'ref') v += refFiles(f, raw);
      }
      return `<div class="frow ${stack ? 'stack' : ''}"><span class="fk">${esc(f.l)}</span><span class="fv">${v}</span></div>`;
    }).join('');
    if (rowsHtml) html += `<div class="card dfields">${rowsHtml}</div>`;

    // Thêm dòng con: mang theo gói thầu của dòng cha (vd mở kiện từ biên bản kiểm đếm T12 → gói T12 điền sẵn)
    const inherit = ct => r.Goi_thau && ct !== t && DB.field(ct, 'Goi_thau') ? '&Goi_thau=' + enc(r.Goi_thau) : '';
    // Bảng con (vd các kiện trong 1 biên bản — có khi vài trăm kiện): hiện 50 dòng đầu, bấm để hiện thêm
    const REL_PAGE = 50, relRows = [];
    for (const rel of def.related || []) {
      if (tableLv(rel.t) < 1) continue;
      const rows = DB.rows(rel.t).filter(x => String(x[rel.fk]) === String(key));
      const rm = metaOf(rel.t);
      relRows.push({ rel, rows, lim: REL_PAGE });
      html += `<section class="card rel" data-rel="${relRows.length - 1}"><div class="rel-h"><span class="gic" style="--gc:${rm.color}">${Icon(rm.ic)}</span>
        <h3>${esc(rel.l)}</h3><span class="cnt">${U.int(rows.length)}</span>
        ${rel.pick ? (lv >= 2 && tableLv(rel.t) === 2 ? `<a class="btn sm" href="#/pick/${t}/${enc(key)}">${Icon('check', 'sm')} Chọn kiện</a>` : '')
          : tableLv(rel.t) === 2 ? `<a class="btn sm" href="#/f/${rel.t}/new?${enc(rel.fk)}=${enc(key)}${inherit(rel.t)}">${Icon('plus', 'sm')} Thêm</a>` : ''}</div>
        <div class="rel-body">${rows.length ? V.renderRows(rel.t, rows, { flat: true, skip: rel.fk, limit: REL_PAGE }) : '<div class="muted small rel-empty">Chưa có</div>'}</div></section>`;
    }
    App.main.innerHTML = html;
    V.hydrate(App.main);
    const bindMore = sec => {
      const b = sec.querySelector('[data-more]'); if (!b) return;
      b.onclick = () => {
        const x = relRows[+sec.dataset.rel]; x.lim += REL_PAGE * 4;
        sec.querySelector('.rel-body').innerHTML = V.renderRows(x.rel.t, x.rows, { flat: true, skip: x.rel.fk, limit: x.lim });
        V.hydrate(sec); bindMore(sec);
      };
    };
    App.main.querySelectorAll('section.rel').forEach(bindMore);

    // Nút file: bấm mở; trỏ chuột / chạm vào là bắt đầu tải luôn (sớm hơn vài trăm ms); mạng rẻ (máy tính, Wi-Fi) thì
    // tải trước 2 file đầu ngay khi mở trang → bấm là mở liền. File đã tải được giữ trên máy (Files, tcxl-files-v1).
    const fileBtns = [...App.main.querySelectorAll('[data-file], [data-xfile]')].map(b => ({ b,
      args: b.dataset.file ? [t, key, b.dataset.file] : [b.dataset.xt, b.dataset.xk, b.dataset.xfile] }));
    fileBtns.forEach(({ b, args }) => {
      b.onclick = () => Files.open(...args, b);
      const early = () => Files.prefetch(...args, true);
      b.addEventListener('pointerenter', early, { once: true });
      b.addEventListener('pointerdown', early, { once: true });
    });
    if (fileBtns.length && Files.cheapNet()) setTimeout(() => { if (fileBtns[0].b.isConnected) fileBtns.slice(0, 2).forEach(({ args }) => Files.prefetch(...args)); }, 700);
    App.main.querySelectorAll('[data-reveal]').forEach(btn => btn.onclick = async () => {
      const n = btn.dataset.reveal, span = App.main.querySelector(`[data-enc="${CSS.escape(n)}"]`);
      if (btn.dataset.shown) { span.textContent = '••••••••'; btn.innerHTML = Icon('eye'); delete btn.dataset.shown; return; }
      let val = r[n];
      if (Vault.isEnc(val)) { if (!(await Vault.ensureOpen())) return; val = await Vault.dec(val); }
      span.textContent = val; btn.innerHTML = Icon('x'); btn.title = 'Ẩn'; btn.dataset.shown = '1';
      if (navigator.clipboard && !btn.nextElementSibling?.dataset?.copy) {
        const c = Object.assign(document.createElement('button'), { className: 'ibtn3', title: 'Sao chép', innerHTML: Icon('copy') });
        c.dataset.copy = '1';
        c.onclick = () => navigator.clipboard.writeText(span.textContent).then(() => U.toast('Đã sao chép'));
        btn.after(c);
      }
      setTimeout(() => { if (btn.isConnected && btn.dataset.shown) btn.click(); }, 30000);
    });
    const del = App.main.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!(await U.confirm('Xoá "' + title + '"? Thao tác này không hoàn tác được.'))) return;
      try { await DB.remove(t, key); U.toast('Đã xoá', 'ok'); history.back(); } catch (e) { U.toast(e.message, 'err'); }
    };
  };

  // ---------------- FORM THÊM / SỬA ----------------
  const SEG_MAX = 6;   // danh sách chọn có ≤ 6 lựa chọn → hiện thành nút bấm thay vì danh sách thả xuống

  // Ô ngày luôn hiện dd/mm/yyyy (ô ngày gốc của trình duyệt hiện theo ngôn ngữ máy, vd mm/dd/yyyy trên máy tiếng Anh).
  // Ô gốc (ẩn, nằm dưới biểu tượng lịch) vẫn giữ giá trị yyyy-mm-dd để lưu và để mở bảng chọn ngày.
  V.dateInput = (attrs, iso, o = {}) => {
    const dt = !!o.time;
    return `<span class="dinp ${dt ? 'dt' : ''}"><input type="text" class="dtxt" inputmode="numeric" autocomplete="off" maxlength="${dt ? 16 : 10}"
        placeholder="${dt ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'}" value="${esc(iso ? (dt ? U.fmtDateTime(iso) : U.fmtDate(iso)) : '')}" ${o.disabled ? 'disabled' : ''} ${o.label ? `aria-label="${esc(o.label)}"` : ''}>
      <span class="dbtn" aria-hidden="true">${Icon('calendar')}</span>
      <input type="${dt ? 'datetime-local' : 'date'}" class="dnat" ${attrs} value="${esc(iso || '')}" tabindex="-1" title="Chọn trên lịch" ${o.disabled ? 'disabled' : ''}></span>`;
  };
  V.dates = root => root.querySelectorAll('.dinp').forEach(box => {
    if (box._bound) return; box._bound = true;
    const txt = box.querySelector('.dtxt'), nat = box.querySelector('.dnat'), dt = box.classList.contains('dt');
    const show = () => { txt.value = nat.value ? (dt ? U.fmtDateTime(nat.value) : U.fmtDate(nat.value)) : ''; txt.disabled = nat.disabled; box.classList.remove('bad'); };
    nat._sync = show;   // gọi sau khi code khác đổi nat.value / nat.disabled (nút "Hôm nay", "Không thời hạn"…)
    nat.addEventListener('change', show);
    nat.addEventListener('click', () => { try { nat.showPicker(); } catch (e) { /* trình duyệt tự mở */ } });
    // Đọc chữ dd/mm/yyyy [hh:mm]; final = rời ô / Enter → báo lỗi nếu sai, chuẩn hoá 1/2/2026 → 01/02/2026
    const parse = final => {
      const v = txt.value.trim();
      if (!v) { box.classList.remove('bad'); if (nat.value) { nat.value = ''; if (final) nat.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
      const d = m && new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
      if (!(d && d.getDate() === +m[1] && d.getMonth() === m[2] - 1 && (m[4] == null || (+m[4] < 24 && +m[5] < 60)))) {
        if (final) box.classList.add('bad');
        return;
      }
      box.classList.remove('bad');
      const iso = dt ? U.toLocalInput(d) : U.iso(d);
      if (nat.value !== iso) nat.value = iso;
      if (final) nat.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Gõ liền chữ số (11102026) → tự chèn "/", " ", ":"; tự gõ dấu "/" kiểu 5/3/2026 thì để nguyên, rời ô mới chuẩn hoá
    const auto = /^\d+$|^\d{2}\/\d{0,3}$|^\d{2}\/\d{2}\/\d{0,5}$|^\d{2}\/\d{2}\/\d{4} \d{0,3}$|^\d{2}\/\d{2}\/\d{4} \d{2}:\d{0,3}$/;
    txt.addEventListener('input', e => {
      const v = txt.value;
      if (!(e.inputType || '').startsWith('delete') && auto.test(v)) {
        const d = v.replace(/\D/g, '').slice(0, dt ? 12 : 8);
        let s = d.slice(0, 2);
        if (d.length > 2) s += '/' + d.slice(2, 4);
        if (d.length > 4) s += '/' + d.slice(4, 8);
        if (dt && d.length > 8) s += ' ' + d.slice(8, 10);
        if (dt && d.length > 10) s += ':' + d.slice(10, 12);
        if (v.endsWith('/') && (d.length === 2 || d.length === 4)) s += '/';   // giữ dấu "/" vừa gõ
        txt.value = s;
      }
      parse(false);
    });
    txt.addEventListener('blur', () => parse(true));
    txt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); parse(true); } });
  });

  // Lựa chọn của ô "chọn hoặc gõ thêm" (giống AppSheet "cho phép giá trị khác"): các giá trị khai báo trong schema
  // + mọi giá trị đã từng nhập trong dữ liệu (hay dùng xếp trước); trùng chữ hoa/thường hoặc dấu chỉ giữ 1
  V.enumOpts = (t, f) => {
    const cnt = new Map();
    DB.rows(t).forEach(r => { const v = String(r[f.n] ?? '').trim(); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); });
    const seen = new Set(), out = [];
    const add = v => { const k = U.norm(v).trim(); if (v && !seen.has(k)) { seen.add(k); out.push(v); } };
    f.opts.forEach(add);
    [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a) || a.localeCompare(b, 'vi')).forEach(add);
    return out;
  };

  // Ô chọn trong danh sách có sẵn, gõ để tìm (thay <select>: ô chọn gốc chỉ nhảy theo chữ cái đầu — gõ "22" không ra "T22").
  // Chỉ nhận giá trị có trong danh sách; opts = [{ v: giá trị lưu, l: chữ hiện, s: dòng phụ }]
  V.pickInput = (nm, v, opts) => {
    const cur = opts.find(o => String(o.v) === String(v));
    return `<div class="cbx pick" data-opts="${esc(JSON.stringify(opts))}">
      <input type="text" class="ptxt" value="${esc(cur ? cur.l : '')}" placeholder="Bấm để chọn hoặc gõ để tìm" autocomplete="off" role="combobox" aria-expanded="false">
      <input type="hidden" ${nm} value="${esc(cur ? cur.v : '')}">
      <button type="button" class="cbx-tg" tabindex="-1" aria-label="Mở danh sách">${Icon('chevron')}</button><div class="cbx-pop" role="listbox" hidden></div></div>`;
  };
  V.pickers = root => root.querySelectorAll('.cbx.pick').forEach(box => {
    const txt = box.querySelector('.ptxt'), hid = box.querySelector('input[type=hidden]'), pop = box.querySelector('.cbx-pop');
    const opts = JSON.parse(box.dataset.opts || '[]');
    let act = -1, items = [], all = true;
    const label = () => { const o = opts.find(x => String(x.v) === hid.value); return o ? o.l : ''; };
    // Danh sách rất dài (vd chọn 1 kiện trong 12.000 kiện): chỉ vẽ MAX dòng đầu, gõ để thu hẹp
    const MAX = 200;
    const draw = () => {
      const found = all || !txt.value.trim() ? opts : opts.filter(o => U.match(o.l + ' ' + (o.s || '') + ' ' + o.v, txt.value));
      items = found.slice(0, MAX);
      pop.innerHTML = items.length ? items.map((o, i) => `<button type="button" class="cbx-o ${i === act ? 'on' : ''} ${String(o.v) === hid.value ? 'sel' : ''}" data-i="${i}" role="option">
          <span>${esc(o.l)}${o.s ? `<small>${esc(o.s)}</small>` : ''}</span>${String(o.v) === hid.value ? Icon('check', 'sm') : ''}</button>`).join('')
          + (found.length > MAX ? `<div class="cbx-empty">Còn ${U.int(found.length - MAX)} lựa chọn nữa — gõ thêm để tìm</div>` : '')
        : '<div class="cbx-empty">Không có lựa chọn nào khớp</div>';
    };
    const open = showAll => {
      all = showAll; act = -1; draw();
      if (pop.hidden) { pop.hidden = false; box.classList.add('open'); txt.setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => pop.scrollIntoView({ block: 'nearest' })); }
    };
    const close = () => { pop.hidden = true; box.classList.remove('open'); txt.setAttribute('aria-expanded', 'false'); };
    const set = o => {
      const v = o ? String(o.v) : '';
      txt.value = o ? o.l : '';
      if (hid.value !== v) { hid.value = v; hid.dispatchEvent(new Event('input', { bubbles: true })); hid.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    const pick = i => { if (items[i]) set(items[i]); close(); };
    txt.addEventListener('focus', () => { open(true); txt.select(); });
    txt.addEventListener('click', () => { if (pop.hidden) open(true); });
    txt.addEventListener('input', () => open(false));
    txt.addEventListener('keydown', e => {
      if (pop.hidden) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); draw();
        const on = pop.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(act >= 0 ? act : 0); }
      else if (e.key === 'Escape') { e.preventDefault(); txt.value = label(); close(); }
      else if (e.key === 'Tab') close();
    });
    // Rời ô: xoá trống = bỏ chọn; gõ dở mà chỉ khớp đúng 1 lựa chọn thì chọn luôn; còn lại trả về lựa chọn cũ
    txt.addEventListener('blur', () => setTimeout(() => {
      close();
      const q = txt.value.trim();
      if (!q) return set(null);
      if (q === label()) return;
      const m = opts.filter(o => U.match(o.l + ' ' + (o.s || '') + ' ' + o.v, q));
      if (m.length === 1) set(m[0]); else txt.value = label();
    }, 150));
    box.querySelector('.cbx-tg').addEventListener('click', () => { if (pop.hidden) { txt.focus(); open(true); } else close(); });
    pop.addEventListener('mousedown', e => e.preventDefault());
    pop.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
  });

  // Ô chọn có thể gõ giá trị mới (thay <datalist> — trình duyệt hiện lẫn thành "Saved data", thiếu ô tìm)
  V.combo = root => root.querySelectorAll('.cbx:not(.pick)').forEach(box => {
    const inp = box.querySelector('input'), pop = box.querySelector('.cbx-pop'), opts = JSON.parse(box.dataset.opts || '[]');
    let act = -1, items = [], all = true;
    const draw = () => {
      const q = U.norm(inp.value.trim()), exact = q && opts.some(o => U.norm(o) === q);
      items = (q && !all ? opts.filter(o => U.match(o, inp.value)) : opts).map(v => ({ v }));
      if (q && !exact) items.push({ v: inp.value.trim(), add: true });   // "Thêm mới" ở cuối — tránh lỡ chọn khi đã có giá trị gần đúng
      pop.innerHTML = items.length ? items.map((o, i) => `<button type="button" class="cbx-o ${o.add ? 'add' : ''} ${i === act ? 'on' : ''} ${!o.add && U.norm(o.v) === q ? 'sel' : ''}" data-i="${i}" role="option">
          ${o.add ? `${Icon('plus', 'sm')}<span>Thêm mới: <b>${esc(o.v)}</b></span>` : `<span>${esc(o.v)}</span>${U.norm(o.v) === q ? Icon('check', 'sm') : ''}`}</button>`).join('')
        : '<div class="cbx-empty">Chưa có lựa chọn nào — gõ để thêm mới</div>';
    };
    const open = showAll => {
      all = showAll; act = -1; draw();
      if (pop.hidden) { pop.hidden = false; box.classList.add('open'); inp.setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => pop.scrollIntoView({ block: 'nearest' })); }
    };
    const close = () => { pop.hidden = true; box.classList.remove('open'); inp.setAttribute('aria-expanded', 'false'); };
    let picking = false;
    const pick = i => {
      const o = items[i]; if (!o) return;
      inp.value = o.v; picking = true; inp.dispatchEvent(new Event('input', { bubbles: true })); picking = false;   // báo form "đã sửa"
      close();
    };
    inp.addEventListener('focus', () => open(true));
    inp.addEventListener('click', () => { if (pop.hidden) open(true); });
    inp.addEventListener('input', () => { if (!picking) open(false); });
    inp.addEventListener('keydown', e => {
      if (pop.hidden) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); draw();
        const on = pop.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); if (act >= 0) pick(act); else close(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close();
    });
    box.querySelector('.cbx-tg').addEventListener('click', () => { if (pop.hidden) { inp.focus(); open(true); } else close(); });
    pop.addEventListener('mousedown', e => e.preventDefault());   // bấm vào danh sách không làm mất con trỏ ở ô nhập
    pop.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
    inp.addEventListener('blur', () => setTimeout(close, 150));
  });
  const moneyFmt = d => d ? new Intl.NumberFormat('vi-VN').format(Number(d)) : '';

  function fieldInput(t, f, r, isNew, def) {
    const v = r[f.n] ?? '';
    const nm = `name="${esc(f.n)}"`;
    const ro = def.keyEditable && f.n === def.key && !isNew ? 'readonly' : '';
    // multi = chọn nhiều nút cùng lúc (field multi), giá trị lưu "A, B"
    const seg = (opts, cur, multi) => `<div class="seg" data-seg="${esc(f.n)}" ${f.req ? 'data-req="1"' : ''} ${multi ? 'data-multi="1"' : ''}><input type="hidden" ${nm} value="${esc(cur)}">
      ${opts.map(o => { const on = multi ? U.splitList(cur).includes(String(o.v)) : String(o.v) === String(cur);
        return `<button type="button" class="segb ${on ? 'on' : ''}" aria-pressed="${on}" ${on && !f.req ? 'title="Đang chọn — bấm lần nữa để bỏ chọn"' : ''} data-v="${esc(o.v)}">${esc(o.l)}</button>`; }).join('')}</div>`;
    let input;
    switch (f.t) {
      case 'longtext': input = `<textarea ${nm} rows="3"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}>${esc(v)}</textarea>`; break;
      case 'price':
        input = `<div class="inl money"><input ${nm} type="text" inputmode="numeric" autocomplete="off" data-money value="${esc(moneyFmt(v === '' ? '' : Math.round(U.num(v))))}"><span class="unit">₫</span></div>`;
        break;
      case 'number': input = `<input ${nm} type="number" step="any" inputmode="decimal" value="${v === '' ? '' : esc(U.num(v))}">`; break;
      case 'date':
        input = `<div class="inl">${V.dateInput(nm, U.isoOf(v))}<button type="button" class="qd" data-today="${esc(f.n)}">Hôm nay</button></div>`;
        break;
      case 'datetime':
        input = `<div class="inl">${V.dateInput(nm, U.toLocalInput(v), { time: true })}<button type="button" class="qd" data-now="${esc(f.n)}">Bây giờ</button></div>`;
        break;
      case 'expiry': {
        const no = v !== '' && !U.parseDate(v);
        input = `<div class="inl wrap">${V.dateInput(nm, U.isoOf(v), { disabled: no })}
          <label class="chk qd"><input type="checkbox" data-noexp="${esc(f.n)}" ${no ? 'checked' : ''}> Không thời hạn</label></div>`;
        break;
      }
      case 'enum':
        if (f.other) input = `<div class="cbx" data-opts="${esc(JSON.stringify(V.enumOpts(t, f)))}">
          <input ${nm} value="${esc(v)}" placeholder="Chọn hoặc gõ để thêm mới" autocomplete="off" role="combobox" aria-expanded="false" ${f.req ? 'required' : ''}>
          <button type="button" class="cbx-tg" tabindex="-1" aria-label="Mở danh sách">${Icon('chevron')}</button><div class="cbx-pop" role="listbox" hidden></div></div>`;
        else if (f.multi) { const cur = U.splitList(v); input = seg([...f.opts, ...cur.filter(x => !f.opts.includes(x))].map(o => ({ v: o, l: o })), v, true); }
        else if (f.opts.length <= SEG_MAX) input = seg([...f.opts, ...(v && !f.opts.includes(v) ? [v] : [])].map(o => ({ v: o, l: o })), v);
        else input = V.pickInput(nm, v, [...f.opts, ...(v && !f.opts.includes(v) ? [v] : [])].map(o => ({ v: o, l: o })));
        break;
      case 'ref': {
        const rows = DB.rows(f.ref).slice().sort((a, b) => DB.title(f.ref, a).localeCompare(DB.title(f.ref, b), 'vi', { numeric: true }));
        if (rows.length && rows.length <= SEG_MAX && (!v || DB.get(f.ref, v))) {
          input = seg(rows.map(x => ({ v: String(DB.keyOf(f.ref, x)), l: DB.title(f.ref, x) })), v);
        } else {
          const opts = rows.map(x => ({ v: String(DB.keyOf(f.ref, x)), l: DB.title(f.ref, x), s: DB.sub(f.ref, x) }));
          if (v && !DB.get(f.ref, v)) opts.push({ v: String(v), l: String(v) });
          input = V.pickInput(nm, v, opts);
        }
        break;
      }
      case 'image':
        input = `<div class="up">${v && !isNew ? `<span class="upcur">${V.imgTag(t, r, f.n, 'th')}<label class="chk"><input type="checkbox" data-clear="${esc(f.n)}"> Xoá ảnh</label></span>` : ''}
          <span class="uppre" data-pre="${esc(f.n)}" hidden></span>
          <label class="upbox">${Icon('image')}<span data-upl="${esc(f.n)}">${v ? 'Đổi ảnh' : 'Chụp hoặc chọn ảnh'}</span><input type="file" accept="image/*" data-up="${esc(f.n)}" hidden></label></div>`;
        break;
      case 'file':
        input = `<div class="up">${v ? `<span class="upcur"><span class="fchip">${Icon('file')}<span>${esc(fileName(v) || 'File đã tải lên')}</span></span><label class="chk"><input type="checkbox" data-clear="${esc(f.n)}"> Xoá file</label></span>` : ''}
          <label class="upbox">${Icon('file')}<span data-upl="${esc(f.n)}">${v ? 'Đổi file' : 'Chọn file'}</span><input type="file" data-up="${esc(f.n)}" hidden></label></div>`;
        break;
      default: {
        if (f.enc) {
          const isE = Vault.isEnc(v);
          input = `<div class="inl"><input ${nm} type="password" autocomplete="new-password" data-enc="1" value="${isE ? '' : esc(v)}"
            placeholder="${isE ? '•••••••• đã mã hoá — để trống nếu giữ nguyên' : ''}">
            <button type="button" class="ibtn3" data-eye="${esc(f.n)}" ${isE ? 'data-dec="1"' : ''} title="Hiện">${Icon('eye')}</button></div>`;
        } else {
          const type = { email: 'email', url: 'url', phone: 'tel' }[f.t] || 'text';
          const im = f.t === 'phone' ? 'inputmode="tel"' : '';
          input = `<input ${nm} type="${type}" ${im} value="${esc(v)}" ${ro}>`;
        }
      }
    }
    return `<div class="fld" data-f="${esc(f.n)}"><span class="lbl">${esc(f.l)}${f.req ? ' <b class="req">*</b>' : ''}${f.multi ? ' <small class="lhint">· chọn được nhiều</small>' : ''}</span>${input}</div>`;
  }

  // Dòng tham chiếu tới bản ghi có đính kèm (vd kiện → biên bản MGMER / GIR / OSD): nút mở file PDF và link thư mục
  // của bản ghi đó ngay tại đây, khỏi phải mở biên bản. Chỉ hiện khi máy đã có bản ghi (= người dùng được xem bảng đó).
  function refFiles(f, raw) {
    const pr = raw && DB.get(f.ref, raw), pd = TT()[f.ref];
    if (!pr || !pd) return '';
    const name = DB.title(f.ref, pr);
    return pd.fields.filter(x => !x.v && pr[x.n] && (x.t === 'file' || (x.t === 'url' && /^https?:\/\//i.test(String(pr[x.n]).trim()))))
      .map(x => x.t === 'file'
        ? `<button class="fchip sm" data-xt="${esc(f.ref)}" data-xk="${esc(String(raw))}" data-xfile="${esc(x.n)}" title="${esc(x.l + ' · ' + name)}">${Icon('file')}<span>${esc(x.s || x.l)}</span>${Icon('open', 'sm')}</button>`
        : `<a class="fchip sm" href="${esc(String(pr[x.n]).trim())}" target="_blank" rel="noopener" title="${esc(x.l + ' · ' + name)}">${Icon('link')}<span>${esc(x.s || x.l)}</span>${Icon('open', 'sm')}</a>`).join('');
  }

  V.form = async (t, key, params) => {
    const def = TT()[t];
    if (!def) return App.notFound();
    const isNew = key === 'new';
    App.head((isNew ? 'Thêm ' : 'Sửa ') + def.label.toLowerCase(), { back: true });
    App.loading();
    await DB.loadDeps(t);
    const old = isNew ? null : DB.get(t, key);
    if (!isNew && !old) { App.main.innerHTML = '<div class="empty">Không tìm thấy bản ghi.</div>'; return; }
    const r = old ? { ...old } : {};
    const fields = def.fields.filter(f => !f.v && !(isNew && f.auto));   // f.auto: số do máy chủ cấp khi thêm mới (vd STT kiện)
    if (isNew) fields.forEach(f => {
      if (params.has(f.n)) r[f.n] = params.get(f.n);
      else if (f.init === 'today') r[f.n] = U.today();
      else if (f.init != null) r[f.n] = f.init;
    });
    const main = fields.filter(f => f.t !== 'image' && f.t !== 'file');
    const att = fields.filter(f => f.t === 'image' || f.t === 'file');
    const meta = metaOf(t);

    App.main.innerHTML = `<form class="fwrap" novalidate>
      <div class="card form">${main.map(f => fieldInput(t, f, r, isNew, def)).join('')}</div>
      ${att.length ? `<div class="card form"><div class="fsec"><span class="gic" style="--gc:${meta.color}">${Icon('file')}</span>Đính kèm</div>
        ${att.map(f => fieldInput(t, f, r, isNew, def)).join('')}</div>` : ''}
      <div class="fbar"><button type="button" class="btn ghost" data-cancel>Huỷ</button><button class="btn" type="submit">${Icon('check')} Lưu</button></div></form>`;
    const form = App.main.querySelector('form');
    V.hydrate(form);
    V.combo(form);
    V.pickers(form);
    V.dates(form);
    const q = sel => form.querySelector(sel);
    const byName = n => q(`[name="${CSS.escape(n)}"]`);
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });

    form.querySelector('[data-cancel]').onclick = async () => {
      if (dirty && !(await U.confirm('Bỏ những thay đổi vừa nhập?'))) return;
      history.back();
    };
    // Nút chọn nhanh (thay danh sách thả xuống khi ít lựa chọn)
    form.querySelectorAll('.seg').forEach(s => s.addEventListener('click', e => {
      const b = e.target.closest('.segb'); if (!b) return;
      const hid = s.querySelector('input[type=hidden]'), on = b.classList.contains('on');
      if (s.dataset.multi) {   // chọn nhiều: bật / tắt riêng nút này
        b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on));
        hid.value = [...s.querySelectorAll('.segb.on')].map(x => x.dataset.v).join(', ');
        dirty = true; s.closest('.fld').classList.remove('err'); return;
      }
      if (on && s.dataset.req) return;
      s.querySelectorAll('.segb').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); x.removeAttribute('title'); });
      if (!on) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); if (!s.dataset.req) b.title = 'Đang chọn — bấm lần nữa để bỏ chọn'; }
      hid.value = on ? '' : b.dataset.v;
      dirty = true; s.closest('.fld').classList.remove('err');
    }));
    // Số tiền: tự thêm dấu chấm phân cách hàng nghìn
    form.querySelectorAll('[data-money]').forEach(inp => {
      inp.addEventListener('input', () => { const d = inp.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); inp.value = moneyFmt(d); });
    });
    form.querySelectorAll('[data-today]').forEach(b => b.onclick = () => { const d = byName(b.dataset.today); d.value = U.today(); d._sync && d._sync(); dirty = true; });
    form.querySelectorAll('[data-now]').forEach(b => b.onclick = () => { const d = byName(b.dataset.now); d.value = U.toLocalInput(new Date()); d._sync && d._sync(); dirty = true; });
    form.querySelectorAll('[data-noexp]').forEach(c => {
      c.onchange = () => { const d = byName(c.dataset.noexp); d.disabled = c.checked; if (c.checked) d.value = ''; d._sync && d._sync(); };
    });
    form.querySelectorAll('[data-eye]').forEach(b => b.onclick = async () => {
      const inp = byName(b.dataset.eye);
      if (b.dataset.dec && !inp.value) {
        if (!(await Vault.ensureOpen())) return;
        inp.value = await Vault.dec(old[b.dataset.eye]); delete b.dataset.dec;
      }
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    // Xem trước ảnh / tên file vừa chọn
    form.querySelectorAll('[data-up]').forEach(inp => inp.onchange = () => {
      const n = inp.dataset.up, file = inp.files[0], lbl = q(`[data-upl="${CSS.escape(n)}"]`), pre = q(`[data-pre="${CSS.escape(n)}"]`);
      if (!file) return;
      lbl.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
      if (pre && file.type.startsWith('image/')) { pre.innerHTML = `<img class="th" src="${URL.createObjectURL(file)}" alt="">`; pre.hidden = false; }
      dirty = true; inp.closest('.fld').classList.remove('err');
    });

    const markErr = (f, msg) => {
      const box = q(`.fld[data-f="${CSS.escape(f.n)}"]`); if (!box) return;
      box.classList.add('err');
      const fe = box.querySelector('.ferr');
      if (fe) fe.textContent = msg; else box.insertAdjacentHTML('beforeend', `<small class="ferr">${esc(msg)}</small>`);
    };
    form.addEventListener('input', e => { const b = e.target.closest('.fld'); if (b) b.classList.remove('err'); });

    // Số biên bản không được trùng (def.unique = { f: cột số, scope: cột phạm vi }): trùng trong cùng gói → không cho lưu,
    // trùng với gói khác → chỉ cảnh báo (mỗi nhà thầu tự đánh số, vd MGMER "1" có ở cả EPC lẫn T12).
    // Sửa biên bản cũ mà không đổi số thì không kiểm (dữ liệu file Total có vài số trùng khác ngày).
    const UQ = def.unique;
    const dupsOf = o => {
      const k = soKey(t, o[UQ.f]);
      if (!k || (!isNew && soKey(t, old[UQ.f]) === k)) return null;
      const all = DB.rows(t).filter(x => String(DB.keyOf(t, x)) !== String(key) && soKey(t, x[UQ.f]) === k);
      const sc = String(o[UQ.scope] || '');
      return all.length ? { sc, same: all.filter(x => String(x[UQ.scope] || '') === sc), other: all.filter(x => String(x[UQ.scope] || '') !== sc) } : null;
    };
    const dupTxt = xs => xs.slice(0, 3).map(x => [DB.title(t, x), x[UQ.scope] ? 'gói ' + x[UQ.scope] : 'chưa có gói', x.Ngay && 'ngày ' + U.fmtDate(x.Ngay)].filter(Boolean).join(' · ')).join('; ') + (xs.length > 3 ? '…' : '');
    // Giá trị đang nhập (đã qua beforeSave để biết gói sẽ được tự điền)
    const snap = () => {
      const o = { ...r };
      fields.forEach(f => { const el = byName(f.n); if (el && f.t !== 'image' && f.t !== 'file') o[f.n] = String(el.value ?? '').trim(); });
      if (def.beforeSave) def.beforeSave(o, { db: DB, user: App.user, isNew, old: r });
      return o;
    };
    const showDup = d => {
      const box = q(`.fld[data-f="${CSS.escape(UQ.f)}"]`); if (!box) return;
      let el = box.querySelector('.fdup');
      if (!el) { el = document.createElement('small'); el.className = 'fdup'; box.appendChild(el); }
      el.hidden = !d; if (!d) return;
      el.classList.toggle('bad', d.same.length > 0);
      el.textContent = d.same.length ? `Số này đã có: ${dupTxt(d.same)} — không lưu được, hãy dùng số khác.`
        : d.sc ? `Số này đã có ở gói khác: ${dupTxt(d.other)} — vẫn lưu được nếu đúng là biên bản khác.`
        : `Số này đã có: ${dupTxt(d.other)} — nếu biên bản mới cùng gói đó thì là trùng số.`;
    };
    if (UQ) { let tm; const live = () => { clearTimeout(tm); tm = setTimeout(() => showDup(dupsOf(snap())), 200); };
      ['input', 'change', 'click'].forEach(ev => form.addEventListener(ev, live)); live(); }

    form.onsubmit = async e => {
      e.preventDefault();
      form.querySelectorAll('.fld.err').forEach(b => b.classList.remove('err'));
      const out = {}, missing = [], uploads = [], badDate = [];
      for (const f of fields) {
        const el = byName(f.n);
        let val;
        if (el && el.closest('.dinp.bad')) { badDate.push(f); continue; }   // chữ ngày gõ chưa đúng dd/mm/yyyy
        if (f.t === 'image' || f.t === 'file') {
          const up = q(`[data-up="${CSS.escape(f.n)}"]`), clr = q(`[data-clear="${CSS.escape(f.n)}"]`);
          if (up.files[0]) { uploads.push([f, up.files[0]]); val = r[f.n] || 'x'; }
          else if (clr && clr.checked) val = '';
          else { if (f.req && !r[f.n]) missing.push(f); continue; }
        } else if (f.t === 'expiry') {
          val = q(`[data-noexp="${CSS.escape(f.n)}"]`).checked ? 'Không thời hạn' : el.value;
        } else if (f.enc) {
          if (el.value === '' && Vault.isEnc(r[f.n])) continue;   // giữ nguyên giá trị đã mã hoá
          val = el.value;
        } else if (f.t === 'price') { const d = el.value.replace(/\D/g, ''); val = d === '' ? '' : Number(d); }
        else if (f.t === 'number') val = el.value === '' ? '' : Number(el.value);
        else if (f.t === 'datetime') val = el.value ? el.value.replace('T', ' ') : '';
        else val = el.value.trim();
        if (f.req && (val === '' || val == null)) missing.push(f);
        out[f.n] = val;
      }
      const bs = def.beforeSave && def.beforeSave(out, { db: DB, user: App.user, isNew, old: r });
      if (bs) { markErr({ n: bs.f }, bs.msg); q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return U.toast(bs.msg, 'err'); }
      if (badDate.length) {
        badDate.forEach(f => markErr(f, 'Ngày chưa đúng — nhập theo dd/mm/yyyy' + (f.t === 'datetime' ? ' hh:mm' : '')));
        q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return U.toast('Có ngày nhập chưa đúng dạng dd/mm/yyyy', 'err');
      }
      if (missing.length) {
        missing.forEach(f => markErr(f, 'Bắt buộc nhập'));
        q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return U.toast('Còn ' + missing.length + ' mục bắt buộc chưa nhập', 'err');
      }
      const dd = UQ && dupsOf(out);
      if (dd && dd.same.length) {
        showDup(dd); q(`.fld[data-f="${CSS.escape(UQ.f)}"]`)?.classList.add('err');
        q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return U.toast('Số "' + out[UQ.f] + '" đã có — hãy dùng số khác', 'err');
      }
      if (dd && dd.other.length && !(await U.confirm(`Số "${out[UQ.f]}" đã có: ${dupTxt(dd.other)}. Vẫn lưu biên bản mới này?`))) return;
      const k = isNew ? (def.keyEditable ? out[def.key] : U.uid()) : key;
      out[def.key] = k;

      const btn = q('button[type=submit]');
      const label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Đang lưu…';
      try {
        // Mã hoá các cột bảo mật trước khi gửi đi
        for (const f of fields.filter(f => f.enc)) {
          const v = out[f.n];
          if (typeof v !== 'string' || v === '' || Vault.isEnc(v)) continue;
          if (Vault.isSet()) {
            if (!(await Vault.ensureOpen())) throw new Error('Cần mở khoá mật khẩu chủ để lưu dữ liệu bảo mật');
            out[f.n] = await Vault.enc(v);
          } else if (!(await U.confirm('Chưa đặt mật khẩu chủ nên "' + f.l + '" sẽ lưu dạng chữ thường. Vẫn lưu?'))) throw new Error('Đã huỷ');
        }
        for (const [f, file] of uploads) {
          if (file.size > 25 * 1024 * 1024) throw new Error(f.l + ': file lớn hơn 25 MB');
          const isImg = f.t === 'image' && /^image\/(jpeg|png|webp|heic|heif)/.test(file.type);
          const du = isImg ? await U.resizeImage(file, window.APP_CONFIG.mode === 'demo' ? 900 : 1600) : await U.readDataUrl(file);
          // Tên trên Drive theo số biên bản (def.fileName, vd "GIR 1010 - T12.pdf") thay cho tên gốc của file; không có thì giữ tên gốc
          const ext = isImg ? '.jpg' : ((file.name.match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase());
          let base = '';
          try { base = def.fileName ? String(def.fileName(out, DB) || '').trim() : ''; } catch (e2) { base = ''; }
          if (base && fields.filter(x => x.t === 'file' || x.t === 'image').length > 1) base += ' - ' + f.l;   // bảng có nhiều ô file
          base = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 110);
          const name = base ? base + ext : isImg ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
          btn.textContent = 'Đang tải ' + f.l.toLowerCase() + '…';
          out[f.n] = await API.upload(t, f.n, name, du);
        }
        // Lưu nền (outbox.js): dữ liệu trên máy đổi ngay, đi tiếp; gửi máy chủ chạy ngầm, lỗi thì báo kèm "Thử lại" / "Bỏ thay đổi".
        // (File đã tải lên ở trên xong rồi mới tới đây.)
        Outbox.push((isNew ? 'Thêm ' : 'Sửa ') + def.label.replace(/\s*\(.*\)$/, '').toLowerCase() + ' ' + DB.title(t, out), [{ fn: isNew ? 'add' : 'update', t, rows: [out] }]);
        Files.forget(t, k);
        dirty = false;
        if (isNew && def.assign) U.toast('Đã tạo biên bản — chọn các kiện thuộc biên bản', 'ok');
        location.replace((isNew && def.assign ? '#/pick/' : '#/r/') + t + '/' + enc(k));
      } catch (err) {
        if (err.message !== 'Đã huỷ') U.toast(err.message, 'err');
        btn.disabled = false; btn.innerHTML = label;
      }
    };
  };
})();
