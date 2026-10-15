// Quản trị: danh sách người dùng, phân quyền theo nhóm/mục, cài đặt (mật khẩu chủ, giao diện, demo)
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const A = (window.Admin = {});
  const initials = s => { const w = String(s || '?').replace(/@.*/, '').replace(/\(.*?\)/g, '').trim().split(/[\s._]+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };
  const isDash = it => it.type === 'dash';   // mục chỉ có mức Xem

  // ---------------- DANH SÁCH NGƯỜI DÙNG ----------------
  A.users = async () => {
    if (!App.user.admin) return App.notFound();
    App.head('Phân quyền', { back: true });
    App.loading();
    const users = (await API.users()).slice().sort((a, b) => (b.Kich_hoat - a.Kich_hoat) || String(a.Ho_ten || a.Email).localeCompare(String(b.Ho_ten || b.Email), 'vi'));
    const n = u => Object.keys(u.Quyen || {}).length;
    const row = u => `<a class="row" href="#/admin/u/${enc(u.Email)}" data-tone="${u.Kich_hoat ? (u.Admin ? 'info' : 'ok') : ''}">
      <span class="lead av" style="--gc:${u.Admin ? 'var(--g7)' : 'var(--g0)'}">${esc(initials(u.Ho_ten || u.Email))}</span>
      <div class="row-main"><div class="row-title">${esc(u.Ho_ten || u.Email)}</div><div class="row-sub">${esc(u.Email)}</div>
      <div class="row-meta"><span>${u.Admin ? 'Toàn quyền' : n(u) + ' mục được cấp'}</span><span>${u.Goi_thau ? 'Gói ' + esc(u.Goi_thau.replace(/,/g, ', ')) : 'Mọi gói'}</span></div></div>
      ${u.Kich_hoat ? (u.Admin ? '<span class="badge info">Quản trị</span>' : '<span class="badge ok">Đang dùng</span>') : '<span class="badge">Đã khoá</span>'}</a>`;
    App.main.innerHTML = `<div class="card uinfo"><span class="gic" style="--gc:var(--g7)">${Icon('shield')}</span>
        <div><b>${users.filter(u => u.Kich_hoat).length} người dùng đang hoạt động</b>
        <div class="muted small">Quản trị viên chính${App.user.owner ? ' (<b>' + esc(App.user.email) + '</b>)' : ''} luôn có toàn quyền và không hiện trong danh sách.</div></div>
        <a class="btn ladd" href="#/admin/u/new">${Icon('plus')}Thêm</a></div>
      ${users.length ? `<div class="rows">${users.map(row).join('')}</div>`
        : `<div class="lempty"><span class="tic" style="--gc:var(--g7)">${Icon('users')}</span><div>Chưa có người dùng nào ngoài quản trị viên chính</div>
           <a class="btn" href="#/admin/u/new">${Icon('plus')}Thêm người dùng</a></div>`}
      <a class="fab" href="#/admin/u/new" title="Thêm người dùng">${Icon('plus')}</a>`;
    App.main.classList.add('has-fab');
  };

  // ---------------- SỬA 1 NGƯỜI DÙNG ----------------
  // Mỗi mục có 3 mức: Không / Xem / Sửa. Bấm mức ở dòng nhóm = áp cho cả nhóm.
  const tri = (attr, cur, noEdit) => `<div class="tri" ${attr}>${[['', 'Không'], ['view', 'Xem'], ['edit', 'Sửa']].map(([v, l]) =>
    `<button type="button" data-l="${v}" class="${v === cur ? 'on' : ''}" ${v === 'edit' && noEdit ? 'disabled title="Mục này chỉ có quyền xem"' : ''}>${l}</button>`).join('')}</div>`;

  A.user = async email => {
    if (!App.user.admin) return App.notFound();
    const isNew = email === 'new';
    App.head(isNew ? 'Thêm người dùng' : 'Sửa quyền', { back: true });
    App.loading();
    const [users] = await Promise.all([API.users(), DB.load('GOI_THAU').catch(() => {})]);
    const u = isNew ? { Email: '', Ho_ten: '', Kich_hoat: true, Admin: false, Goi_thau: '', Quyen: {} } : users.find(x => x.Email === email);
    if (!u) return App.notFound();
    const q = Object.assign({}, u.Quyen || {});
    const goiAll = DB.rows('GOI_THAU').map(r => r.MaGoi).sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
    const goiSel = (u.Goi_thau || '').split(',').map(s => s.trim()).filter(Boolean);
    const groups = Views.items().filter(g => g.items.length);

    App.main.innerHTML = `<form class="fwrap" id="uf" novalidate>
      <div class="card form">
        <div class="fld" data-f="Email"><span class="lbl">Gmail <b class="req">*</b></span><input name="Email" type="email" value="${esc(u.Email)}" ${isNew ? '' : 'readonly'} placeholder="ten@gmail.com" autocomplete="off"></div>
        <div class="fld"><span class="lbl">Họ tên</span><input name="Ho_ten" value="${esc(u.Ho_ten)}" autocomplete="off"></div>
        <label class="sw-row"><span><b>Cho phép đăng nhập</b><small>Tắt để khoá tạm thời mà không cần xoá</small></span><input type="checkbox" class="sw" name="Kich_hoat" ${u.Kich_hoat ? 'checked' : ''}></label>
        <label class="sw-row"><span><b>Quản trị viên</b><small>Toàn quyền mọi mục, kể cả phân quyền cho người khác</small></span><input type="checkbox" class="sw" name="Admin" ${u.Admin ? 'checked' : ''}></label>
      </div>
      <div class="admin-note card" ${u.Admin ? '' : 'hidden'}><span class="gic" style="--gc:var(--g7)">${Icon('shield')}</span><div>Quản trị viên có <b>toàn quyền</b> nên không cần chọn gói thầu hay từng mục.</div></div>
      <div class="card form scoped" ${u.Admin ? 'hidden' : ''}>
        <div class="fsec"><span class="gic" style="--gc:var(--g4)">${Icon('folder')}</span>Gói thầu được xem</div>
        <div class="muted small">Áp dụng cho kiện, biên bản kiểm đếm / mở kiện / OSD, vị trí & tình trạng kiện và gói thầu.</div>
        <div class="seg goi"><button type="button" class="segb ${goiSel.length ? '' : 'on'}" data-goi="*">Tất cả gói</button>
          ${goiAll.map(g => `<button type="button" class="segb ${goiSel.includes(g) ? 'on' : ''}" data-goi="${esc(g)}">${esc(g)}</button>`).join('')}</div>
      </div>
      <div class="card form scoped" ${u.Admin ? 'hidden' : ''}>
        <div class="fsec"><span class="gic" style="--gc:var(--g0)">${Icon('key')}</span>Quyền theo mục</div>
        <div class="muted small">"Xem" chỉ đọc; "Sửa" gồm xem, thêm, sửa, xoá. Bấm mức ở dòng nhóm để áp cho cả nhóm.</div>
        ${groups.map(g => {
          const any = g.items.some(it => Perm.rank(q[it.perm]) > 0);
          return `<div class="pgrp ${any ? '' : 'closed'}" data-g="${g.key}" style="--gc:${g.color}">
            <div class="pg-h"><button type="button" class="pg-tog" aria-label="Mở/thu gọn">${Icon('chevron')}</button>
              <span class="gic">${Icon(g.ic)}</span><span class="pg-n"><b>${esc(g.label)}</b><small class="pg-sum"></small></span>
              ${tri(`data-g="${g.key}"`, null, g.items.every(isDash))}</div>
            <div class="pg-items">${g.items.map(it => `<div class="pi-row"><span class="pic" style="color:${g.color}">${Icon(it.ic, 'sm')}</span>
              <span class="pi-l">${esc(it.label)}</span>${tri(`data-k="${esc(it.perm)}" data-gg="${g.key}"`, q[it.perm] || '', isDash(it))}</div>`).join('')}</div></div>`;
        }).join('')}
        <div class="muted small">Thống kê tổng chỉ lấy số liệu từ những gói thầu và mục người đó được xem.</div>
      </div>
      <div class="fbar">${isNew ? '' : `<button type="button" class="btn danger ghost" data-del title="Xoá người dùng">${Icon('trash')}</button>`}
        <button type="button" class="btn ghost" data-cancel>Huỷ</button><button class="btn" type="submit">${Icon('check')} Lưu</button></div></form>`;

    const f = document.getElementById('uf');
    let dirty = false;
    const level = el => el.querySelector('button.on')?.dataset.l || '';
    const setTri = (el, l) => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === l));
    const items = gk => [...f.querySelectorAll(`.tri[data-gg="${gk}"]`)];
    const sync = () => groups.forEach(g => {
      const its = items(g.key), lv = its.map(level), gt = f.querySelector(`.tri[data-g="${g.key}"]`);
      const same = lv.every(x => x === lv[0]);
      setTri(gt, same ? lv[0] : '__mixed');
      const on = lv.filter(Boolean).length;
      f.querySelector(`.pgrp[data-g="${g.key}"] .pg-sum`).textContent = on ? `${on}/${its.length} mục được cấp` : 'Chưa cấp mục nào';
    });
    f.querySelectorAll('.tri').forEach(t => t.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      dirty = true;
      if (t.dataset.g) items(t.dataset.g).forEach(it => {
        const noEdit = it.querySelector('[data-l="edit"]').disabled;
        setTri(it, b.dataset.l === 'edit' && noEdit ? 'view' : b.dataset.l);
      });
      else setTri(t, b.dataset.l);
      sync();
    }));
    f.querySelectorAll('.pg-tog, .pg-n').forEach(b => b.onclick = () => b.closest('.pgrp').classList.toggle('closed'));
    const goiBtns = [...f.querySelectorAll('[data-goi]')];
    goiBtns.forEach(b => b.onclick = () => {
      dirty = true;
      if (b.dataset.goi === '*') { goiBtns.forEach(x => x.classList.toggle('on', x === b)); return; }
      b.classList.toggle('on'); goiBtns[0].classList.remove('on');
      if (!goiBtns.some(x => x.classList.contains('on'))) goiBtns[0].classList.add('on');
    });
    f.Admin.onchange = () => { f.querySelectorAll('.scoped').forEach(s => { s.hidden = f.Admin.checked; }); f.querySelector('.admin-note').hidden = !f.Admin.checked; };
    f.addEventListener('input', () => { dirty = true; });
    f.querySelector('[data-cancel]').onclick = async () => { if (dirty && !(await U.confirm('Bỏ những thay đổi vừa nhập?'))) return; history.back(); };
    sync();

    f.onsubmit = async e => {
      e.preventDefault();
      const email = String(f.Email.value || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !email.endsWith('@demo')) {
        f.querySelector('[data-f="Email"]').classList.add('err');
        return U.toast('Gmail không hợp lệ', 'err');
      }
      if (isNew && users.some(x => x.Email === email)) return U.toast('Gmail này đã có trong danh sách', 'err');
      const quyen = {};
      f.querySelectorAll('.tri[data-k]').forEach(t => { const l = level(t); if (l) quyen[t.dataset.k] = l; });
      const goi = goiBtns.filter(b => b.classList.contains('on') && b.dataset.goi !== '*').map(b => b.dataset.goi);
      const out = { Email: email, Ho_ten: f.Ho_ten.value.trim(), Kich_hoat: f.Kich_hoat.checked, Admin: f.Admin.checked, Goi_thau: goi.join(','), Quyen: quyen };
      if (!out.Admin && !Object.keys(quyen).length && !(await U.confirm('Người này chưa được cấp mục nào nên đăng nhập sẽ không thấy gì. Vẫn lưu?'))) return;
      try { await API.saveUser(out); dirty = false; U.toast('Đã lưu quyền', 'ok'); location.replace('#/admin'); }
      catch (err) { U.toast(err.message, 'err'); }
    };
    const del = f.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!(await U.confirm('Xoá người dùng ' + u.Email + '? Họ sẽ không đăng nhập được nữa.'))) return;
      try { await API.deleteUser(u.Email); U.toast('Đã xoá', 'ok'); location.replace('#/admin'); } catch (err) { U.toast(err.message, 'err'); }
    };
  };

  // ---------------- CÀI ĐẶT ----------------
  const encFields = () => Object.entries(SCHEMA.tables).flatMap(([t, d]) => d.fields.filter(f => f.enc).map(f => [t, f.n]));
  const srow = (ic, color, title, sub, action) => `<div class="srow"><span class="gic" style="--gc:${color}">${Icon(ic)}</span>
    <div class="st"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${action ? `<div class="sa">${action}</div>` : ''}</div>`;
  const slink = (href, ic, color, title, sub) => `<a class="srow link" href="${href}"><span class="gic" style="--gc:${color}">${Icon(ic)}</span>
    <div class="st"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><span class="schev">${Icon('chevron')}</span></a>`;
  const group = (title, body) => `<div class="sg-h">${esc(title)}</div><div class="card slist">${body}</div>`;

  A.settings = async () => {
    App.head('Cài đặt', { back: true });
    const C = window.APP_CONFIG, demo = C.mode === 'demo';
    const name = (window.Auth && Auth.name) || App.user.name || App.user.email.split('@')[0];
    const pic = !demo && window.Auth && Auth.picture;
    const vSub = !Vault.isSet() ? 'Chưa đặt — mật khẩu tài khoản, CCCD, số tài khoản chưa được mã hoá'
      : Vault.isOpen() ? 'Đang mở khoá · tự khoá sau ' + C.autoLockMinutes + ' phút không thao tác' : 'Đang khoá';
    const vAct = !Vault.isSet() ? (App.user.admin ? '<button class="btn sm" data-act="setvault">Đặt</button>' : '')
      : Vault.isOpen() ? '<button class="btn sm ghost" data-act="lock">Khoá ngay</button>' : '<button class="btn sm" data-act="unlock">Mở khoá</button>';
    const th = App.theme();

    let h = `<section class="card prof">${pic ? `<img class="pav" src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : `<span class="lead av big" style="--gc:var(--pri)">${esc(initials(name))}</span>`}
      <div><b class="pn">${esc(name)}</b><div class="muted small">${esc(App.user.email)}</div>
      <span class="badge ${App.user.admin ? 'info' : 'ok'}">${App.user.owner ? 'Quản trị viên chính' : App.user.admin ? 'Quản trị viên' : 'Người dùng'}</span></div></section>`;

    // Mật khẩu chủ chỉ cần khi có cột mã hoá (app này hiện không có) — ẩn cho gọn
    const hasEnc = encFields().length > 0;
    const sec = (hasEnc ? srow('lock', 'var(--g6)', 'Mật khẩu chủ', esc(vSub) + (Vault.isSet() ? '' : ' · <b>quên là không khôi phục được</b>'), vAct) : '')
      + (hasEnc && Vault.isSet() && App.user.owner ? srow('refresh', 'var(--g6)', 'Đổi mật khẩu chủ', 'Dữ liệu không cần mã hoá lại, đổi xong ngay', '<button class="btn sm ghost" data-act="chgvault">Đổi</button>') : '')
      + (hasEnc && Vault.isSet() && App.user.admin ? srow('key', 'var(--g6)', 'Mã hoá dữ liệu cũ', 'Tìm và mã hoá các giá trị còn để dạng chữ thường', '<button class="btn sm ghost" data-act="migrate">Chạy</button>') : '')
      + (demo ? '' : srow('logout', 'var(--g6)', 'Đăng xuất trên mọi máy',
          (Auth.hasSession() ? '✅ Máy này nhớ đăng nhập đến <b>' + U.fmtDate(new Date(Auth.sexp)) + '</b> (tự gia hạn khi dùng)'
            : '⚠️ Chưa có phiên dài hạn — sẽ phải đăng nhập lại sau khoảng 1 giờ') + ' · bấm để huỷ đăng nhập trên tất cả điện thoại, máy tính (vd khi mất máy)',
          '<button class="btn sm ghost" data-act="logoutall">Đăng xuất</button>'));
    if (sec) h += group('Bảo mật', sec);

    const la = Lock.after();
    h += group('Khoá ứng dụng',
      srow('lock', 'var(--g6)', 'Mã PIN máy này', Lock.hasPin() ? 'Đã đặt · cần nhập khi mở app' : '⚠️ Chưa đặt — ai cầm máy cũng mở được app',
        Lock.hasPin() ? '<button class="btn sm ghost" data-act="chgpin">Đổi</button>' : '<button class="btn sm" data-act="setpin">Đặt</button>')
      + srow('clock', 'var(--g6)', 'Tự khoá khi rời app hoặc không thao tác', 'Áp dụng trên máy này',
        `<div class="seg mini" data-act="lockafter">${[[0, 'Ngay'], [1, '1 phút'], [5, '5 phút'], [15, '15 phút']].map(([v, l]) => `<button type="button" class="segb ${v === la ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`)
      + `<div data-biorow hidden>${srow('key', 'var(--g6)', 'Mở khoá bằng vân tay / khuôn mặt', 'Windows Hello, vân tay, Face ID của máy này — mã PIN vẫn dùng được',
        `<input type="checkbox" class="sw" data-act="bio" ${Lock.bioOn() ? 'checked' : ''} aria-label="Mở khoá bằng vân tay / khuôn mặt">`)}</div>`);
    h += group('Giao diện', srow(th === 'dark' ? 'moon' : 'sun', 'var(--g4)', 'Chế độ màu', 'Áp dụng trên máy này',
      `<div class="seg mini" data-act="theme">${[['', 'Theo máy'], ['light', 'Sáng'], ['dark', 'Tối']].map(([v, l]) => `<button type="button" class="segb ${v === th ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`));

    h += group('Ứng dụng',
      (App.installPrompt ? srow('download', 'var(--g0)', 'Cài app vào máy này', 'Mở như app riêng, có biểu tượng trên màn hình', '<button class="btn sm" data-act="install">Cài</button>')
        : srow('download', 'var(--g0)', 'Cài app vào máy', 'Android/PC: menu ⋮ → <b>Cài đặt ứng dụng</b> · iPhone (Safari): Chia sẻ → <b>Thêm vào MH chính</b>'))
      + srow('refresh', 'var(--g0)', 'Phiên bản ' + esc(C.version), demo ? 'Chế độ DEMO — dữ liệu giả' : 'Dữ liệu trên Google Sheets', '<button class="btn sm ghost" data-act="update">Kiểm tra</button>')
      + srow('saved', 'var(--g0)', 'Dữ liệu lưu tạm trên máy', '<span data-disk>Giúp mở app nhanh và xem được khi mất mạng</span>', '<button class="btn sm ghost" data-act="wipe">Xoá</button>')
      + slink('privacy.html', 'shield', 'var(--g0)', 'Chính sách bảo mật', ''));

    if (App.user.admin) {
      h += group('Quản trị', slink('#/admin', 'users', 'var(--g7)', 'Phân quyền', '<span data-ucount>Người dùng và quyền truy cập</span>'));
    }
    if (demo) {
      const emails = API.demo.emails(), cur = API.demo.current();
      h += group('Chế độ demo', srow('users', 'var(--g4)', 'Đăng nhập giả bằng', 'Đổi người để thử phân quyền',
        `<select data-act="switch">${emails.map(e => `<option ${e === cur ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>`)
        + srow('trash', 'var(--bad)', 'Đặt lại dữ liệu demo', 'Xoá dữ liệu giả và tạo lại từ đầu', '<button class="btn sm danger ghost" data-act="reset">Đặt lại</button>'));
    } else h += `<button class="btn danger ghost wide" data-act="signout">${Icon('logout')} Đăng xuất</button>`;
    App.main.innerHTML = `<div class="settings">${h}</div>`;
    // Số người dùng: điền sau, không bắt trang phải chờ
    const uc = App.main.querySelector('[data-ucount]');
    if (uc) API.users().then(a => { if (uc.isConnected) uc.textContent = a.filter(u => u.Kich_hoat).length + ' người dùng đang hoạt động'; }).catch(() => {});

    const on = (act, fn) => { const el = App.main.querySelector(`[data-act="${act}"]`); if (el) el[el.tagName === 'SELECT' ? 'onchange' : 'onclick'] = fn; };
    on('signout', () => App.signOut());
    on('setpin', () => { Lock.setup(); watchPin(); });
    on('chgpin', () => Lock.changePin());
    // Đặt PIN xong (màn hình đóng) → vẽ lại Cài đặt để cập nhật trạng thái
    const watchPin = () => { const t = setInterval(() => { if (!document.body.classList.contains('locked')) { clearInterval(t); if (location.hash === '#/settings') A.settings(); App.lockIcon(); } }, 400); };
    const lab = App.main.querySelector('[data-act="lockafter"]');
    if (lab) lab.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; Lock.setAfter(+b.dataset.v); lab.querySelectorAll('.segb').forEach(x => x.classList.toggle('on', x === b)); U.toast('Đã lưu', 'ok'); };
    Lock.bioAvailable().then(ok => {
      const row = App.main.querySelector('[data-biorow]'); if (!row || !ok || !Lock.hasPin()) return;
      row.hidden = false;
      const sw = row.querySelector('[data-act="bio"]');
      sw.onchange = async () => {
        if (!sw.checked) { Lock.bioDisable(); return U.toast('Đã tắt mở khoá bằng vân tay / khuôn mặt'); }
        try { await Lock.bioEnable(); U.toast('Đã bật — lần khoá sau bấm biểu tượng 🔑 trên bàn phím PIN', 'ok'); }
        catch (e) { sw.checked = false; U.toast('Chưa bật được: ' + e.message, 'err'); }
      };
    });
    on('logoutall', async () => {
      if (!await U.confirm('Đăng xuất tài khoản này trên TẤT CẢ điện thoại, máy tính đang dùng app (kể cả máy này)?')) return;
      try { const n = await API.logoutAll(); U.toast('Đã huỷ ' + n + ' phiên đăng nhập', 'ok'); } catch (e) { return U.toast(e.message, 'err'); }
      setTimeout(() => App.signOut(), 800);
    });
    on('wipe', async () => {
      if (!await U.confirm('Xoá dữ liệu lưu tạm trên máy này (danh sách, ảnh nhỏ)? Dữ liệu trên Google Sheets không bị ảnh hưởng; lần mở sau sẽ tải lại.')) return;
      await DB.wipe(); U.toast('Đã xoá dữ liệu lưu tạm', 'ok'); location.reload();
    });
    const du = App.main.querySelector('[data-disk]');
    if (du) DB.diskUsage().then(b => { if (du.isConnected && b) du.textContent = 'Đang dùng ' + (b / 1048576).toFixed(1).replace('.', ',') + ' MB trên máy'; });
    on('unlock', async () => { if (await Vault.ensureOpen()) A.settings(); });
    on('lock', () => { Vault.lock(); A.settings(); });
    on('install', async () => { App.installPrompt.prompt(); App.installPrompt = null; });
    on('switch', e => { API.demo.switchUser(e.target.value); DB.clear(); location.hash = '#/'; location.reload(); });
    on('reset', async () => { if (await U.confirm('Xoá toàn bộ dữ liệu demo (kể cả dữ liệu đã nạp thử) và tạo lại dữ liệu mẫu?')) { await API.demo.reset(); await DB.wipe(); localStorage.removeItem('tcxl-demo-user'); location.hash = '#/'; location.reload(); } });
    const tb = App.main.querySelector('[data-act="theme"]');
    tb.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; App.setTheme(b.dataset.v); A.settings(); };
    on('update', async () => {
      try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (!reg) return U.toast('Không kiểm tra được trên trình duyệt này', 'err');
        await reg.update();
        if (reg.waiting || reg.installing) { U.toast('Có bản mới — đang cập nhật…', 'ok'); (reg.waiting || reg.installing).postMessage('skip'); }
        else U.toast('Đang dùng bản mới nhất', 'ok');
      } catch (e) { U.toast('Không kiểm tra được: ' + e.message, 'err'); }
    });
    on('setvault', async () => {
      const r = await U.ask({ title: 'Đặt mật khẩu chủ', message: 'Ít nhất 10 ký tự. Hãy ghi nhớ hoặc cất ở nơi an toàn — <b>quên là mất dữ liệu đã mã hoá</b>.',
        fields: [{ name: 'a', label: 'Mật khẩu chủ', type: 'password' }, { name: 'b', label: 'Nhập lại', type: 'password' }], ok: 'Đặt' });
      if (!r) return;
      if (r.a.length < 10) return U.toast('Mật khẩu chủ cần ít nhất 10 ký tự', 'err');
      if (r.a !== r.b) return U.toast('Hai lần nhập không khớp', 'err');
      try {
        U.toast('Đang tạo khoá…');
        const cfg = await Vault.create(r.a);
        await API.setConfig('vault', JSON.stringify(cfg));
        Vault.cfg = cfg; await Vault.unlock(r.a);
        U.toast('Đã đặt mật khẩu chủ', 'ok'); A.settings();
      } catch (e) { U.toast(e.message, 'err'); }
    });
    on('chgvault', async () => {
      const r = await U.ask({ title: 'Đổi mật khẩu chủ',
        message: 'Dữ liệu đã mã hoá <b>không cần mã hoá lại</b>: chỉ lớp khoá bên ngoài đổi theo mật khẩu mới. Mật khẩu mới ít nhất 10 ký tự — <b>hãy ghi lại ở nơi an toàn</b>.',
        fields: [{ name: 'o', label: 'Mật khẩu chủ hiện tại', type: 'password' }, { name: 'a', label: 'Mật khẩu chủ mới', type: 'password' }, { name: 'b', label: 'Nhập lại mật khẩu mới', type: 'password' }], ok: 'Đổi' });
      if (!r) return;
      if (r.a.length < 10) return U.toast('Mật khẩu chủ mới cần ít nhất 10 ký tự', 'err');
      if (r.a !== r.b) return U.toast('Hai lần nhập mật khẩu mới không khớp', 'err');
      if (r.a === r.o) return U.toast('Mật khẩu mới phải khác mật khẩu hiện tại', 'err');
      const btn = App.main.querySelector('[data-act="chgvault"]');
      btn.disabled = true; btn.textContent = 'Đang đổi…';
      try {
        await Vault.reload();   // dùng cấu hình mới nhất trên Sheet
        // Lấy vài giá trị đã mã hoá thật để kiểm tra khoá mới giải mã được trước khi lưu
        const samples = [];
        for (const [t, n] of encFields()) {
          const rows = await DB.load(t).catch(() => []);
          rows.filter(x => Vault.isEnc(x[n])).slice(0, 2).forEach(x => samples.push(x[n]));
        }
        const { cfg, key } = await Vault.rewrap(r.o, r.a, samples);
        await API.setConfig('vault', JSON.stringify(cfg));
        Vault.adopt(cfg, key);
        U.toast('Đã đổi mật khẩu chủ', 'ok');
        A.settings();
      } catch (e) { U.toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Đổi'; }
    });
    on('migrate', async () => {
      if (!(await Vault.ensureOpen())) return;
      const btn = App.main.querySelector('[data-act="migrate"]');
      btn.disabled = true;
      let done = 0, total = 0;
      try {
        for (const [t, n] of encFields()) {
          const kf = DB.keyField(t);
          const rows = await DB.load(t, true);
          for (const r of rows.filter(r => r[n] !== '' && r[n] != null && !Vault.isEnc(String(r[n])))) {
            total++;
            btn.textContent = `${total}…`;
            await DB.update(t, { [kf]: r[kf], [n]: await Vault.enc(String(r[n])) });
            done++;
          }
        }
        U.toast(total ? `Đã mã hoá ${done} giá trị` : 'Không còn giá trị nào chưa mã hoá', 'ok');
      } catch (e) { U.toast(`Lỗi sau ${done} giá trị: ${e.message}`, 'err'); }
      btn.disabled = false; btn.textContent = 'Chạy';
    });
  };
})();
