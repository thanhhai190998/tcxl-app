// Khởi động app, điều hướng (router), thanh tiêu đề
(function () {
  const C = window.APP_CONFIG;
  window.API = C.mode === 'live' ? window.LiveAPI : window.MockAPI;

  const App = (window.App = {
    user: null, installPrompt: null,
    main: document.getElementById('view'),

    head(title, opt = {}) {
      document.getElementById('title').textContent = title;
      document.getElementById('back').hidden = !opt.back;
      document.getElementById('logo').hidden = !!opt.back;
      document.querySelector('.top').classList.toggle('flat', !!opt.home);
      if (!opt.home) App.hero('');
      document.title = opt.home ? C.appName : title + ' · ' + C.appName;
      App.lockIcon();
      App.navActive();
    },
    // Vùng nền màu phía trên (chỉ trang chủ)
    hero(html) { const h = document.getElementById('hero'); h.innerHTML = html; h.hidden = !html; },
    // Thanh điều hướng dưới cùng (điện thoại) + menu trượt (máy tính: cố định bên trái)
    buildNav() {
      const q = App.user.quyen || {}, can = k => App.user.admin || Perm.rank(q[k]) > 0;
      const items = [
        { href: '#/', ic: 'home', l: 'Trang chủ' },
        can('DASH_VATTU') && { href: '#/i/DASH_VATTU', ic: 'chart', l: 'Thống kê' },
        can('KIEN') && { href: '#/i/KIEN', ic: 'box', l: 'Kiện' },
        { href: '#menu', ic: 'menu', l: 'Menu', menu: true }
      ].filter(Boolean);
      const bn = document.getElementById('bnav');
      bn.innerHTML = items.map(i => `<a href="${i.href}" ${i.menu ? 'data-menu' : ''}>${Icon(i.ic)}<span>${i.l}</span></a>`).join('');
      bn.querySelector('[data-menu]').onclick = e => { e.preventDefault(); App.toggleDrawer(); };
      document.getElementById('menuBtn').innerHTML = Icon('menu');
      document.getElementById('menuBtn').onclick = () => App.toggleDrawer();
      document.getElementById('scrim').onclick = () => App.closeDrawer();
      if (!App._escBound) { App._escBound = true; document.addEventListener('keydown', e => { if (e.key === 'Escape') App.closeDrawer(); }); }
      document.body.classList.add('has-bnav', 'has-drawer');
      App.renderDrawer();
    },
    renderDrawer() {
      const esc = U.esc, dr = document.getElementById('drawer');
      // Nhóm nào đang mở (mặc định gập hết cho gọn; nhóm chứa trang đang xem tự mở)
      const opened = App.drOpened();
      // "Cài đặt" đã có ở chân menu → không lặp lại trong nhóm Quản trị
      const groups = Views.navGroups().map(g => ({ ...g, items: g.items.filter(it => it.href !== '#/settings') }));
      dr.innerHTML = `<div class="dr-h"><img src="icons/icon.svg" width="30" height="30" alt=""><b>${esc(C.appName)}</b>
          <button type="button" class="dr-x" aria-label="Đóng menu">${Icon('x')}</button></div>
        <label class="dr-search">${Icon('search')}<input type="search" placeholder="Tìm mục…" autocomplete="off"></label>
        <nav class="dr-nav"><a class="dr-i" href="#/"><span class="dr-ic">${Icon('home', 'sm')}</span><span>Trang chủ</span></a>
        ${groups.map(g => `<div class="dr-g ${opened.includes(g.key) ? '' : 'closed'}" data-g="${g.key}" style="--gc:${g.color}">
          <button type="button" class="dr-gh"><span class="gic">${Icon(g.ic)}</span><span class="dr-gl">${esc(g.label)}</span>
            <span class="cnt">${g.items.length}</span><span class="dr-ch">${Icon('chevron')}</span></button>
          <div class="dr-items">${g.items.map(it => `<a class="dr-i" href="${Views.hrefOf(it)}" data-s="${esc(U.norm(it.label + ' ' + (it.desc || '')))}">
            <span class="dr-ic">${Icon(it.ic, 'sm')}</span><span>${esc(it.label)}</span></a>`).join('')}</div></div>`).join('')}
        </nav>
        <div class="dr-f"><a class="dr-i" href="#/settings"><span class="dr-ic">${Icon('gear', 'sm')}</span><span>Cài đặt</span></a></div>`;
      dr.querySelector('.dr-x').onclick = () => App.closeDrawer();
      dr.querySelectorAll('.dr-gh').forEach(b => b.onclick = () => {
        const g = b.closest('.dr-g'), open = !g.classList.toggle('closed');
        const now = App.drOpened().filter(k => k !== g.dataset.g).concat(open ? [g.dataset.g] : []);
        try { localStorage.setItem('tcxl-drawer-open', JSON.stringify(now)); } catch (e) { /* bỏ qua */ }
      });
      const inp = dr.querySelector('.dr-search input');
      inp.oninput = () => {
        const s = U.norm(inp.value.trim());
        dr.classList.toggle('searching', !!s);
        dr.querySelectorAll('.dr-g').forEach(g => {
          let n = 0;
          g.querySelectorAll('.dr-i').forEach(a => { const on = !s || U.match(a.dataset.s, s); a.hidden = !on; if (on) n++; });
          g.hidden = !n;
        });
      };
      dr.querySelectorAll('a.dr-i').forEach(a => a.addEventListener('click', () => { inp.value = ''; inp.oninput(); App.closeDrawer(); }));
      App.navActive();
    },
    // Nhóm trong menu người dùng tự mở (mặc định gập hết cho gọn)
    drOpened() { try { return JSON.parse(localStorage.getItem('tcxl-drawer-open') || '[]'); } catch (e) { return []; } },
    toggleDrawer() { document.body.classList.contains('dr-open') ? App.closeDrawer() : App.openDrawer(); },
    openDrawer() { document.body.classList.add('dr-open'); },
    closeDrawer() { document.body.classList.remove('dr-open'); },
    navActive() {
      const nav = document.getElementById('bnav'), h = location.hash || '#/';
      const isHome = h === '#/' || h === '#' || h === '';
      nav.hidden = /^#\/(f|admin\/u|pick)\//.test(h);
      nav.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        a.classList.toggle('on', href === '#menu' ? false : href === '#/' ? isHome : h.startsWith(href));
      });
      document.querySelectorAll('#drawer a.dr-i').forEach(a => {
        const href = a.getAttribute('href');
        a.classList.toggle('on', href === '#/' ? isHome : h === href || h.startsWith(href + '?'));
      });
      // Nhóm chứa trang đang xem tự mở; rời trang thì trả về trạng thái người dùng đã chọn
      const opened = App.drOpened();
      document.querySelectorAll('#drawer .dr-g').forEach(g =>
        g.classList.toggle('closed', !opened.includes(g.dataset.g) && !g.querySelector('a.dr-i.on')));
    },
    loading() { App.main.innerHTML = '<div class="center pad"><span class="spin"></span></div>'; },
    // Chân trang: bản quyền + chính sách bảo mật + phiên bản (cả màn hình đăng nhập)
    footer() {
      const y = new Date().getFullYear(), since = C.copyrightSince || y;
      const owner = U.esc(C.copyright || C.appName), yr = since < y ? `${since}–${y}` : y;
      const by = C.designer ? 'Developed by <b>' + U.esc(C.designer) + '</b>' : '';
      // Dòng 1: đơn vị sở hữu · Dòng 2: Developed by … · chính sách bảo mật · phiên bản (tự xuống dòng gọn trên điện thoại)
      document.getElementById('foot').innerHTML = `<div class="foot-in">
        <div class="foot-org">© ${yr} ${owner}<span class="foot-rr">Bảo lưu mọi quyền</span></div>
        <div class="foot-meta">${by ? `<span>${by}</span>` : ''}<a href="privacy.html">Chính sách bảo mật</a><span>Phiên bản ${U.esc(C.version)}</span></div></div>`;
      document.getElementById('lfoot').innerHTML = `© ${yr} ${owner}<br>${by ? by + ' · ' : ''}<a href="privacy.html">Chính sách bảo mật</a>`;
    },
    // Giao diện: '' = theo máy, 'light', 'dark' (nhớ trên từng máy)
    theme() { try { return localStorage.getItem('tcxl-theme') || ''; } catch (e) { return ''; } },
    setTheme(t) {
      try { if (t) localStorage.setItem('tcxl-theme', t); else localStorage.removeItem('tcxl-theme'); } catch (e) { /* bỏ qua */ }
      if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    },
    notFound() { App.head('Không tìm thấy', { back: true }); App.main.innerHTML = '<div class="empty">Không có trang này hoặc bạn không có quyền truy cập.</div>'; },
    // Nút 🔒: có mã PIN → khoá app ngay (kèm khoá dữ liệu mã hoá); chưa có PIN → bật/tắt khoá dữ liệu mã hoá như trước
    lockIcon() {
      const b = document.getElementById('lock'), pin = window.Lock && Lock.hasPin();
      b.hidden = !pin && !Vault.isSet();
      b.innerHTML = Icon('lock');
      b.classList.toggle('vopen', !pin && Vault.isOpen());
      b.title = pin ? 'Khoá app ngay (cần mã PIN để mở lại)'
        : Vault.isOpen() ? 'Đang mở khoá dữ liệu bảo mật — bấm để khoá' : 'Dữ liệu bảo mật đang khoá — bấm để mở';
    }
  });

  // keep = vẽ lại trang đang xem (dữ liệu vừa cập nhật ngầm), giữ nguyên vị trí cuộn
  async function route(keep) {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const p = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(qs || '');
    const y = window.scrollY;
    DB.track = new Set();
    if (!keep) App.guard = null;   // trang nào cần hỏi trước khi rời (vd đang chọn kiện) tự đặt lại
    if (!keep) window.scrollTo(0, 0);
    try {
      if (!p.length) await Views.home();
      else if (p[0] === 'i') await Views.list(p[1]);
      else if (p[0] === 'r') await Views.detail(p[1], p[2]);
      else if (p[0] === 'f') await Views.form(p[1], p[2], params);
      else if (p[0] === 'pick') await Pick.render(p[1], p[2]);
      else if (p[0] === 'admin' && !p[1]) await Admin.users();
      else if (p[0] === 'admin' && p[1] === 'u') await Admin.user(p[2]);
      else if (p[0] === 'settings') await Admin.settings();
      else App.notFound();
      if (keep) window.scrollTo(0, y);
      try { performance.mark('route:' + location.hash); } catch (e) { /* đo thời gian mở trang (DevTools → Performance) */ }
    } catch (e) {
      console.error(e);
      App.main.innerHTML = `<div class="empty err">⚠️ ${U.esc(e.message)}<br><button class="btn" onclick="location.reload()">Thử lại</button></div>`;
    }
  }
  App.route = route;

  // Dữ liệu cập nhật ngầm có thay đổi → vẽ lại trang đang xem (trừ khi người dùng đang nhập liệu);
  // đang cuộn thì chờ dừng cuộn rồi mới vẽ lại, không làm giật trang
  let lastScroll = 0, waitT = null;
  const waiting = new Set();
  window.addEventListener('scroll', () => { lastScroll = Date.now(); }, { passive: true });
  window.addEventListener('touchmove', () => { lastScroll = Date.now(); }, { passive: true });
  DB.onChange = changed => {
    changed.forEach(t => waiting.add(t));
    clearTimeout(waitT);
    if (Date.now() - lastScroll < 1500) { waitT = setTimeout(() => DB.onChange([]), 1600); return; }
    const ts = [...waiting]; waiting.clear();
    if (!ts.some(t => DB.track.has(t))) return;
    if (/^#\/(f|admin\/u|pick)\//.test(location.hash) || document.querySelector('.modal-bg, .lightbox')) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && App.main.contains(a)) return;
    route(true);
  };

  // Nút ⟳: có bản app mới thì cập nhật app; không thì làm mới dữ liệu (không tải lại trang)
  App.pendingSW = null;
  App.refresh = async () => {
    if (App.pendingSW) { App.pendingSW.postMessage('skip'); return; }
    const b = document.getElementById('update');
    if (b.classList.contains('busy')) return;
    b.classList.add('busy');
    try {
      API.getConfig('vault').then(setVault).catch(() => {});
      const u = await API.me();
      lsSet(ME_KEY, u);
      if (JSON.stringify(u) !== JSON.stringify(App.user)) { App.user = u; App.buildNav(); }
      const n = await DB.refresh();
      U.toast(n ? 'Đã cập nhật dữ liệu mới' : 'Dữ liệu đã là mới nhất', 'ok');
    } catch (e) { U.toast('Không làm mới được: ' + e.message, 'err'); }
    finally { b.classList.remove('busy'); }
  };
  let syncT = null;
  DB.onBusy = on => {
    clearTimeout(syncT);
    const bar = document.getElementById('syncbar');
    if (!on) { bar.hidden = true; return; }
    syncT = setTimeout(() => { bar.hidden = false; }, 500);   // chỉ hiện khi cập nhật lâu hơn nửa giây
  };

  // Lưu tạm thông tin tài khoản + cấu hình mật khẩu chủ trên máy → lần sau mở app hiện ngay, kiểm tra lại ngầm
  const ME_KEY = 'tcxl-me|' + C.mode, VAULT_KEY = 'tcxl-vault|' + C.mode;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } };
  const whoAmI = () => (C.mode === 'live' ? (window.Auth && Auth.hint) || '' : API.demo.current()).toLowerCase();
  function setVault(v) { if (v) { Vault.cfg = typeof v === 'string' ? JSON.parse(v) : v; lsSet(VAULT_KEY, Vault.cfg); App.lockIcon(); } }
  function failStart(e) {
    try { Lock.unlock(); } catch (er) { /* bỏ qua */ }
    App.head(C.appName, { home: true });
    App.main.innerHTML = `<div class="empty err">⚠️ ${U.esc(e.message)}<br><br>
      ${C.mode === 'demo' ? '<button class="btn" onclick="localStorage.removeItem(\'tcxl-demo-user\');location.reload()">Quay lại tài khoản quản trị viên (demo)</button>'
        : '<button class="btn" onclick="App.signOut()">Đăng nhập tài khoản khác</button>'}</div>`;
  }
  // Đăng xuất: xoá cả dữ liệu lưu tạm trên máy (bảng, ảnh, thông tin tài khoản)
  App.signOut = async () => {
    await DB.wipe();
    try { localStorage.removeItem(ME_KEY); localStorage.removeItem(VAULT_KEY); } catch (e) { /* bỏ qua */ }
    await API.signOut(); location.hash = '#/'; location.reload();
  };

  // Font chữ từ Google Fonts (thêm ?font=system vào địa chỉ để xem bằng font mặc định của máy)
  function loadFont() {
    const f = new URLSearchParams(location.search).get('font') ?? C.font;
    if (!f || f === 'system') return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.crossOrigin = 'anonymous';   // để service worker lưu được font (dùng khi mất mạng)
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
    document.documentElement.style.setProperty('--font', `'${f}', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`);
  }

  async function start() {
    loadFont();
    document.documentElement.style.setProperty('--pri', C.primaryColor);
    if (C.primaryColor2) document.documentElement.style.setProperty('--pri2', C.primaryColor2);
    document.getElementById('appname').textContent = C.appName;
    App.footer();
    if (C.mode === 'demo') document.body.classList.add('is-demo');
    // Nút ‹: trang đang có thay đổi chưa lưu (App.guard) thì hỏi trước
    document.getElementById('back').onclick = async () => {
      if (App.guard && !(await App.guard())) return;
      App.guard = null;
      history.length > 1 ? history.back() : (location.hash = '#/');
    };
    document.getElementById('lock').onclick = async () => {
      if (Lock.hasPin()) return Lock.lock();
      if (Vault.isOpen()) Vault.lock(); else await Vault.ensureOpen();
    };
    document.getElementById('menu').onclick = () => { location.hash = '#/settings'; };
    const ub = document.getElementById('update'); ub.innerHTML = Icon('refresh'); ub.onclick = () => App.refresh();
    Vault.onChange = () => App.lockIcon();

    if (C.mode === 'live') Auth.restore();
    // Đã mở app trên máy này (cùng tài khoản) → vào ngay bằng thông tin đã lưu, kiểm tra lại với máy chủ ở phía sau
    const cached = lsGet(ME_KEY), who = whoAmI();
    const fast = !!(cached && cached.email && who && cached.email.toLowerCase() === who);
    if (lsGet(VAULT_KEY)) Vault.cfg = lsGet(VAULT_KEY);
    if (fast) App.user = cached;
    else {
      App.loading();
      try { App.user = await API.me(); lsSet(ME_KEY, App.user); } catch (e) { return failStart(e); }
    }
    Lock.boot();   // khoá bằng mã PIN (hoặc bắt đặt PIN lần đầu) trước khi hiện dữ liệu — trang vẫn tải ngầm phía sau
    API.getConfig('vault').then(setVault).catch(() => {});
    document.getElementById('avatar').textContent = ((window.Auth && Auth.name) || App.user.name || App.user.email || '?').trim().charAt(0).toUpperCase();
    App.buildNav();
    // Rời trang bằng menu / liên kết khi trang đang có thay đổi chưa lưu (App.guard) → hỏi; không đồng ý thì ở lại
    let lastHash = location.hash, asking = false;
    window.addEventListener('hashchange', async () => {
      if (asking) return;
      if (App.guard) {
        asking = true; const ok = await App.guard(); asking = false;
        if (!ok) { history.replaceState(null, '', lastHash); return; }
        App.guard = null;
      }
      lastHash = location.hash;
      App.closeDrawer(); route();
    });
    await route();
    if (fast) {
      API.me().then(u => {
        lsSet(ME_KEY, u);
        if (JSON.stringify(u) === JSON.stringify(App.user)) return;
        App.user = u;   // quyền vừa được đổi → dựng lại menu và trang đang xem
        App.buildNav(); route(true);
      }).catch(async e => {
        if (e.code !== 'NOT_ALLOWED') return;   // mất mạng: vẫn dùng dữ liệu đã lưu trên máy
        await DB.wipe(); try { localStorage.removeItem(ME_KEY); } catch (er) { /* bỏ qua */ }
        failStart(e);
      });
    }
    setTimeout(() => DB.prefetch(), 1200);   // tải ngầm các mục còn lại
    // Quay lại app sau hơn 5 phút (app để chạy nền trên điện thoại) → cập nhật ngầm trang đang xem
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) { DB.fresh.clear(); DB.track.forEach(t => DB.later(t)); }
    });
  }

  // Cài app (Android/PC) + service worker để chạy như app và mở nhanh
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installPrompt = e; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Có bản app mới đang chờ → chấm vàng trên nút ⟳, bấm nút để chuyển sang bản mới
    const pending = sw => {
      if (!navigator.serviceWorker.controller) return;
      const b = document.getElementById('update');
      App.pendingSW = sw; b.classList.add('upd'); b.title = 'Có bản app mới — bấm để cập nhật';
    };
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting) pending(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed') pending(nw); });
      });
    }).catch(e => console.warn('SW', e));
    // Chỉ tải lại khi CẬP NHẬT bản mới (không tải lại ở lần mở đầu tiên — tránh cắt ngang lúc đăng nhập)
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }

  start();
})();
