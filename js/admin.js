// Quản trị: danh sách người dùng, phân quyền theo nhóm/mục, cài đặt (mật khẩu chủ, giao diện, demo)
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const A = (window.Admin = {});
  const initials = s => { const w = String(s || '?').replace(/@.*/, '').replace(/\(.*?\)/g, '').trim().split(/[\s._]+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };
  const isDash = it => it.type === 'dash' || it.type === 'overview';   // mục chỉ có mức Xem

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
    // Phân quyền theo từng bảng / mục; trang Phase (hub) không có quyền riêng nên không liệt kê
    const groups = Views.items().map(g => ({ ...g, items: g.items.filter(it => it.type !== 'hub') })).filter(g => g.items.length);
    // Bố cục theo menu mới: Tổng quan · Phase 1/2/3 (dòng nhóm con, nút áp cho cả Phase; các mục bảng thụt vào bên dưới) · Excel.
    // Quyền vẫn lưu theo từng bảng (KIEN, MGMER…) như cũ → đổi bố cục không làm đổi / mất quyền đã cấp.
    const rowsOf = g => {
      const all = Views.items().find(x => x.key === g.key).items, inHub = new Set(all.filter(x => x.type === 'hub').flatMap(h => h.tables)), out = [];
      all.forEach(it => {
        if (it.type === 'hub') { out.push({ hub: it }); it.tables.forEach(k => { const c = all.find(x => x.key === k); if (c) out.push({ it: c, child: it.key }); }); }
        else if (!inHub.has(it.key)) out.push({ it });
      });
      return out;
    };

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
            <div class="pg-items">${rowsOf(g).map(r => r.hub
              ? `<div class="pi-row pi-sub"><span class="pic" style="color:${g.color}">${Icon(r.hub.ic, 'sm')}</span>
                  <span class="pi-l"><b>${esc(r.hub.label)}</b><small>Áp cho cả Phase — hoặc chỉnh từng mục bên dưới</small></span>${tri(`data-ph="${esc(r.hub.key)}"`, null, false)}</div>`
              : `<div class="pi-row ${r.child ? 'child' : ''}"><span class="pic" style="color:${g.color}">${Icon(r.it.ic, 'sm')}</span>
                  <span class="pi-l">${esc(r.it.label)}${r.it.pd ? `<small>${esc(r.it.pd)}</small>` : ''}</span>
                  ${tri(`data-k="${esc(r.it.perm)}" data-gg="${g.key}"${r.child ? ` data-phk="${esc(r.child)}"` : ''}`, q[r.it.perm] || '', isDash(r.it))}</div>`).join('')}</div></div>`;
        }).join('')}
        <div class="muted small">Trang Phase hiện khi được xem ít nhất 1 mục trong Phase đó. Tổng quan chỉ lấy số liệu từ những gói thầu và mục người đó được xem.</div>
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
      f.querySelectorAll(`.pgrp[data-g="${g.key}"] .tri[data-ph]`).forEach(pt => {
        const pl = [...f.querySelectorAll(`.tri[data-phk="${pt.dataset.ph}"]`)].map(level);
        setTri(pt, pl.every(x => x === pl[0]) ? pl[0] : '__mixed');
      });
    });
    f.querySelectorAll('.tri').forEach(t => t.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      dirty = true;
      if (t.dataset.g) items(t.dataset.g).forEach(it => {
        const noEdit = it.querySelector('[data-l="edit"]').disabled;
        setTri(it, b.dataset.l === 'edit' && noEdit ? 'view' : b.dataset.l);
      });
      else if (t.dataset.ph) f.querySelectorAll(`.tri[data-phk="${t.dataset.ph}"]`).forEach(it => setTri(it, b.dataset.l));   // cả Phase
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

  // ---------------- LỊCH SỬ CHỈNH SỬA (chỉ quản trị viên chính — máy chủ cũng chỉ trả cho quản trị viên chính) ----------------
  const ACT = { add: ['Thêm', 'ok'], update: ['Sửa', 'info'], remove: ['Xoá', 'bad'], clear: ['Xoá cả bảng', 'bad'] };
  const tblName = t => t === '_NGUOIDUNG' ? 'Người dùng / phân quyền' : t === '_CAUHINH' ? 'Cấu hình' : (SCHEMA.tables[t] ? SCHEMA.tables[t].label : t);
  const fDef = (t, f) => { const d = SCHEMA.tables[t]; return d && d.fields.find(y => y.n === f); };
  const fLabel = (t, f) => { const x = fDef(t, f); return x ? x.l : ({ Ho_ten: 'Họ tên', Kich_hoat: 'Kích hoạt', Admin: 'Quản trị viên', Goi_thau: 'Gói thầu', Quyen: 'Quyền' }[f] || f); };
  const fVal = (t, f, v) => {
    if (v === '' || v == null) return '<i class="muted">(trống)</i>';
    const x = fDef(t, f);
    let s = typeof v === 'boolean' ? (v ? 'Có' : 'Không') : String(v);
    if (x && x.ref) { const r = DB.get(x.ref, v); if (r) s = DB.title(x.ref, r) + ' (' + s + ')'; }
    else if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)) s = U.fmtDate(s.slice(0, 10)) + s.slice(10, 16);
    return esc(s.length > 300 ? s.slice(0, 300) + '…' : s);
  };
  const fmtTime = s => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] : ''}` : String(s); };
  // o.here = đang ở trang chi tiết của chính dòng đó (không lặp tên bảng / mã)
  A.histList = (rows, o = {}) => {
    if (!rows.length) return `<div class="muted small rel-empty">Chưa có lịch sử${o.here ? ' — tính năng ghi lịch sử bắt đầu từ bản 0.11.0; lần nạp file lớn (hơn 200 dòng) chỉ ghi tóm tắt ở trang Lịch sử chỉnh sửa' : ''}.</div>`;
    return `<div class="hlist">${rows.map(h => {
      const [al, tone] = ACT[h.Thao_tac] || [h.Thao_tac, ''];
      let d = null; try { d = h.Chi_tiet ? JSON.parse(h.Chi_tiet) : null; } catch (e) { d = null; }
      const t = h.Bang, n = Number(h.So_dong) || 1;
      let body = '';
      if (d && d.keys) body = `<div class="hk">${U.int(n)} dòng${d.cols ? ' · cột ' + d.cols.map(f => esc(fLabel(t, f))).join(', ') : ''}: <span class="muted">${d.keys.map(esc).join(', ')}</span></div>`;
      else if (d && h.Thao_tac === 'update') body = Object.keys(d).map(f => `<div class="hc"><span class="hf">${esc(fLabel(t, f))}:</span> <s>${fVal(t, f, d[f][0])}</s> → <b>${fVal(t, f, d[f][1])}</b></div>`).join('');
      else if (d) {
        const ks = Object.keys(d);
        body = `<details class="hd"><summary>${h.Thao_tac === 'remove' ? 'Nội dung đã xoá' : 'Nội dung'} (${ks.length} ô)</summary>${ks.map(f => `<div class="hc"><span class="hf">${esc(fLabel(t, f))}:</span> ${fVal(t, f, d[f])}</div>`).join('')}</details>`;
      } else if (h.Thao_tac === 'clear') body = `<div class="hk">Xoá ${U.int(n)} dòng</div>`;
      const rec = o.here || !h.Ma ? '' : SCHEMA.tables[t] && h.Thao_tac !== 'remove' && DB.get(t, h.Ma) ? `<a href="#/r/${esc(t)}/${enc(h.Ma)}">${esc(DB.title(t, DB.get(t, h.Ma)))}</a>` : esc(h.Ma);
      return `<div class="hrow"><div class="hh"><span class="badge ${tone}">${esc(al)}</span>${o.here ? '' : ` <b>${esc(tblName(t))}</b>`} ${rec}</div>
        <div class="hm muted small">${esc(fmtTime(h.Thoi_gian))} · ${h.Ten ? esc(h.Ten) + ' · ' : ''}${esc(h.Email)}${h.Nguon ? ' · ' + esc(h.Nguon) : ''}</div>${body}</div>`;
    }).join('')}</div>`;
  };
  A.log = async () => {
    if (!App.user.owner) return App.notFound();
    App.head('Lịch sử chỉnh sửa', { back: true });
    const st = A.logSt = A.logSt || { table: '', act: '', q: '' };
    const TB = ['KIEN', 'MGMER', 'KIEM_TRA', 'GIR', 'OSD', 'GOI_THAU', 'NHAN_SU', 'LINK', 'NHAP_EXCEL', '_NGUOIDUNG'];
    App.main.innerHTML = `<div class="card hlog"><p class="muted small">Máy chủ tự ghi mỗi lần thêm / sửa / xoá trên app: thời gian, tài khoản Google của người làm,
        giá trị cũ → mới (dòng bị xoá giữ lại nội dung). <b>Chỉ quản trị viên chính</b> xem được. Lần nhập / nạp file lớn (hơn 200 dòng) ghi 1 dòng tóm tắt.</p>
        <div class="hfilter">
          <select data-f="table" aria-label="Mục"><option value="">Mọi mục</option>${TB.map(t => `<option value="${t}" ${st.table === t ? 'selected' : ''}>${esc(tblName(t))}</option>`).join('')}</select>
          <select data-f="act" aria-label="Thao tác"><option value="">Mọi thao tác</option>${Object.entries(ACT).map(([k, [l]]) => `<option value="${k}" ${st.act === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input type="search" data-f="q" placeholder="Người làm (email / tên)" value="${esc(st.q)}" autocomplete="off">
        </div></div>
      <div class="card" id="hbox"></div>`;
    const box = App.main.querySelector('#hbox');
    let next = 0, rows = [], seq = 0;
    const load = async more => {
      const my = ++seq, btn = box.querySelector('[data-more]');
      if (btn) { btn.disabled = true; btn.textContent = 'Đang tải…'; }
      if (!more) { rows = []; box.innerHTML = '<div class="center pad"><span class="spin"></span></div>'; }
      try {
        const r = await API.history({ table: st.table, act: st.act, q: st.q, limit: 100, before: more ? next : 0 });
        if (my !== seq) return;   // đã đổi bộ lọc trong lúc chờ
        rows = rows.concat(r.rows); next = r.next;
        box.innerHTML = A.histList(rows) + (next ? '<div class="center pad"><button type="button" class="btn ghost" data-more>Xem cũ hơn</button></div>' : '');
        const m = box.querySelector('[data-more]'); if (m) m.onclick = () => load(true);
      } catch (e) {
        box.innerHTML = `<div class="xerr">${Icon('alert')}<span>${esc(/không hợp lệ/.test(e.message) ? 'Máy chủ chưa cập nhật Code.gs có lịch sử chỉnh sửa — dán Code.gs mới rồi triển khai phiên bản mới' : e.message)}</span></div>`;
      }
    };
    App.main.querySelectorAll('[data-f]').forEach(el => {
      const go = () => { st[el.dataset.f] = el.value.trim(); load(false); };
      if (el.tagName === 'SELECT') el.onchange = go; else { let tm; el.oninput = () => { clearTimeout(tm); tm = setTimeout(go, 400); }; }
    });
    load(false);
  };

  // ---------------- AI ĐANG ONLINE (chỉ quản trị viên chính) ----------------
  // Máy chủ ghi "vừa thấy" mỗi lần app gọi; app đang mở trên màn hình gửi thêm tín hiệu 2 phút/lần → gọi trong 5 phút gần nhất = đang online.
  // Trang tự cập nhật 30 giây/lần khi đang mở.
  const ago = ms => { const m = Math.floor(ms / 60000); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : m < 1440 ? Math.floor(m / 60) + ' giờ trước' : Math.floor(m / 1440) + ' ngày trước'; };
  const lastSeen = t => {
    const d = new Date(t), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const day = U.iso(d), td = U.today(), yd = U.iso(new Date(Date.now() - 864e5));
    return hm + ' ' + (day === td ? 'hôm nay' : day === yd ? 'hôm qua' : U.fmtDate(day));
  };
  const older = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
  A.online = async () => {
    if (!App.user.owner) return App.notFound();
    App.head('Ai đang online', { back: true });
    App.loading();
    clearInterval(A.onlTimer);
    const draw = async () => {
      let r;
      try { r = await API.online(); } catch (e) {
        if (location.hash !== '#/admin/online') return;
        App.main.innerHTML = `<div class="xerr">${Icon('alert')}<span>${esc(/không hợp lệ/.test(e.message) ? 'Máy chủ chưa cập nhật Code.gs có tính năng "Ai đang online" — dán Code.gs mới rồi triển khai phiên bản mới' : e.message)}</span></div>`;
        return;
      }
      if (location.hash !== '#/admin/online') return;
      const on = x => x.active && x.t && r.now - x.t < r.onlineMs;
      const us = r.users.slice().sort((a, b) => (b.active - a.active) || (b.t - a.t) || String(a.name || a.email).localeCompare(String(b.name || b.email), 'vi'));
      const live = us.filter(on), rest = us.filter(x => !on(x));
      const row = x => {
        const tag = x.owner ? 'div' : 'a', href = x.owner ? '' : ` href="#/admin/u/${enc(x.email)}"`;
        const role = x.owner ? 'Quản trị viên chính' : x.admin ? 'Quản trị viên' : 'Người dùng';
        const ver = x.v ? `<span class="${older(x.v, window.APP_CONFIG.version) ? 'onl-old' : ''}">Bản ${esc(x.v)}${older(x.v, window.APP_CONFIG.version) ? ' · chưa cập nhật' : ''}</span>` : '';
        const badge = !x.active ? '<span class="badge">Đã khoá</span>'
          : on(x) ? `<span class="badge ok">${esc(ago(r.now - x.t))}</span>`
            : x.t ? `<span class="badge onl-last">${esc(lastSeen(x.t))}</span>` : '<span class="badge onl-last">Chưa thấy</span>';
        return `<${tag} class="row"${href} data-tone="${on(x) ? 'ok' : ''}">
          <span class="lead av onl-av" style="--gc:${x.admin ? 'var(--g7)' : 'var(--g0)'}">${esc(initials(x.name || x.email))}<i class="${on(x) ? 'on' : ''}"></i></span>
          <div class="row-main"><div class="row-title">${esc(x.name || x.email)}${x.email === App.user.email ? ' <span class="muted small">(bạn)</span>' : ''}</div><div class="row-sub">${esc(x.email)}</div>
          <div class="row-meta"><span>${role}</span>${x.d ? `<span>${esc(x.d)}</span>` : ''}${ver}</div></div>${badge}</${tag}>`;
      };
      const at = new Date(r.now);
      App.main.innerHTML = `<div class="card uinfo onl-h"><span class="gic" style="--gc:var(--ok)">${Icon('wifi')}</span>
          <div><b>${live.length} người đang online</b>
          <div class="muted small">Đang mở app trong 5 phút gần nhất · tự cập nhật 30 giây/lần · lúc ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}</div></div>
          <button type="button" class="btn sm ghost" data-r title="Cập nhật ngay">${Icon('refresh')}</button></div>
        <h3 class="onl-sec">Đang online <span class="muted">(${live.length})</span></h3>
        ${live.length ? `<div class="rows">${live.map(row).join('')}</div>` : '<div class="card muted small onl-none">Không có ai đang mở app.</div>'}
        <h3 class="onl-sec">Không online <span class="muted">(${rest.length})</span></h3>
        ${rest.length ? `<div class="rows">${rest.map(row).join('')}</div>` : ''}
        <p class="muted small onl-note">Tính là online khi app đang mở trên màn hình (không bị khoá PIN, không thu nhỏ / chạy nền) hoặc vừa thao tác trong 5 phút.
          "Chưa thấy" = chưa mở app từ khi có tính năng này. Máy còn bản cũ chỉ được ghi nhận khi thao tác, cần bấm ⟳ để cập nhật.</p>`;
      App.main.querySelector('[data-r]').onclick = e => { e.currentTarget.disabled = true; draw(); };
    };
    await draw();
    A.onlTimer = setInterval(() => { if (location.hash !== '#/admin/online') return clearInterval(A.onlTimer); if (!document.hidden) draw(); }, 30000);
  };

  // ---------------- GẮN FILE BIÊN BẢN TỪ DRIVE PHÒNG (chỉ quản trị viên chính) ----------------
  // File PDF có sẵn trong "Goods delivered to Site" (Drive phòng — mỗi biên bản kiểm đếm 1 thư mục "MGMER <số>", chứa luôn GIR / OSD):
  // máy chủ đọc danh mục file (chỉ đọc), app ghép file với biên bản còn trống theo thư mục + loại file + số biên bản, người dùng xem lại
  // rồi gắn → ô File ghi "fsg:<mã file>": mở thẳng file gốc, không chép, không tải lên, không đổi tên / xoá file gốc.
  const SF_VIA = 'Gắn file từ Drive phòng';
  // Loại file theo đầu tên (bỏ số / ký hiệu đứng trước: "142 MGMER+GIR…"; nhận cả "MGMER_246", gõ nhầm "MGMEC", "MEMGR");
  // file ghép "MGMER+GIR…" dùng được cho cả GIR (ưu tiên thấp hơn file GIR riêng)
  const sfHead = n => n.replace(/^[\d\s._-]+(?=[a-z])/, '');
  const SF_MG = n => /^(mgme[rc]|memgr)(?![a-z])/.test(sfHead(n)), SF_GIR = n => /^gir(?![a-z])/.test(sfHead(n));
  const SF_KIND = { MGMER: SF_MG, GIR: n => SF_GIR(n) || (SF_MG(n) && /(^|[^a-z])gir(?![a-z])/.test(n)), OSD: n => /(^|[^a-z])(os ?& ?d|osd)/.test(n) };
  // Tên file → chữ thường không dấu, bỏ đuôi, bỏ số thứ tự đầu ("055. OSD-0055…" → "osd-0055…")
  const sfBase = n => U.norm(String(n).replace(/\.[a-z0-9]{1,5}$/i, '')).replace(/^\d+\s*\.\s*/, '').replace(/\s+/g, ' ').trim();
  const sfNums = s => (String(s).match(/\d+/g) || []).map(x => String(+x));
  // Các số trong số biên bản có mặt đúng thứ tự trong tên file: "807-2" khớp "GIR 807-2", không khớp "GIR 807-1"; "1" khớp "MGMER AI.1-0001"
  const sfHas = (name, so) => { const b = sfNums(so); if (!b.length) return false; let i = 0; for (const x of sfNums(name)) if (x === b[i] && ++i === b.length) return true; return false; };
  // Mức khớp số: 3 = đúng hẳn ("GIR 381" ~ "GIR 381.pdf"), 2 = số biên bản là phần đầu ("639-1" ~ "GIR 639-1 (DPL 07…)"), 1 = có đủ số theo thứ tự, 0 = không
  const sfRank = (name, so) => {
    const a = sfNums(name), b = sfNums(so);
    if (!b.length) return 0;
    if (a.length === b.length && a.every((x, i) => x === b[i])) return 3;
    if (b.every((x, i) => a[i] === x)) return 2;
    return sfHas(name, so) ? 1 : 0;
  };
  // Điểm ưu tiên: mức khớp số trước; MGMER ưu tiên bản "at Site" (biên bản ghi Tại cảng thì "at Port") và file riêng hơn file ghép MGMER+GIR;
  // bản gốc hơn bản sao "- Copy"
  const sfScore = (t, r, n) => {
    let s = sfRank(n, r.So) * 10;
    if (t === 'MGMER') {
      const port = /(^|[^a-z])(port|cang)(?![a-z])/.test(n), site = /(^|[^a-z])site(?![a-z])/.test(n), atPort = r.Dia_diem === 'Tại cảng';
      if (port || site) s += (atPort ? port : site) ? 0.3 : -0.3;
      if (!/(^|[^a-z])gir(?![a-z])/.test(n)) s += 0.5;
    }
    if (t === 'GIR' && SF_GIR(n)) s += 0.5;
    if (/(^|[^a-z])copy(?![a-z])/.test(n) || /\.pdf$/.test(n)) s -= 0.2;   // bản sao "… - Copy", tên thừa đuôi ".pdf.pdf"
    return s;
  };
  const sfSize = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : n ? Math.max(1, Math.round(n / 1024)) + ' KB' : '';
  // Kế hoạch ghép: mỗi biên bản → { t, r, folders, c: file ứng viên, pick, st: ok (khớp 1 file) | check (cần xem) | none | has (đã có file) }
  A.srcPlan = (idx, rowsOf) => {
    const root = U.norm(idx.root || 'Goods delivered to Site');
    const inF = new Map();   // thư mục (chữ thường, tính từ thư mục nguồn) → file PDF trong thư mục đó và các thư mục con
    idx.files.forEach(f => {
      if (!/\.pdf$/i.test(f.n)) return;
      const segs = String(f.p || '').split('/');
      for (let i = 1; i <= segs.length; i++) { const k = segs.slice(0, i).join('/').toLowerCase(); if (!inF.has(k)) inF.set(k, []); inF.get(k).push(f); }
    });
    const MG = new Map(rowsOf('MGMER').map(r => [String(r.id), r]));
    // Đường dẫn thư mục lấy từ link cột R của file Total ("Goods delivered to Site/MGMER 100") → phần sau thư mục nguồn
    const rel = d => { const s = String(d || '').replace(/\\/g, '/'), i = U.norm(s).indexOf(root + '/'); return i < 0 ? '' : s.slice(i + root.length + 1).replace(/\/+$/, ''); };
    // Không có link: EPC → "MGMER <số>" ở thư mục nguồn; gói khác → "<gói>/MGMER <số>" (vd T12)
    const fold = (goi, so) => so ? (goi && goi !== 'EPC' ? goi + '/' : '') + 'MGMER ' + String(so).trim() : '';
    const mgFolders = m => [rel(m.Duong_dan), fold(m.Goi_thau, m.So)];
    const viaK = { GIR: new Map(), OSD: new Map() };   // GIR / OSD → các biên bản kiểm đếm của kiện thuộc nó
    rowsOf('KIEN').forEach(k => ['GIR', 'OSD'].forEach(t => {
      if (k[t] && k.MGMER) { const s = viaK[t].get(String(k[t])) || new Set(); s.add(String(k.MGMER)); viaK[t].set(String(k[t]), s); }
    }));
    const foldersOf = (t, r) => {
      const mgs = t === 'MGMER' ? [r] : [...(viaK[t].get(String(r.id)) || [])].concat(t === 'GIR' && r.MGMER ? [String(r.MGMER)] : []).map(id => MG.get(id)).filter(Boolean);
      const out = mgs.flatMap(mgFolders);
      if (t === 'GIR' && !out.filter(Boolean).length) out.push(fold(r.Goi_thau, sfNums(r.So)[0]));   // GIR chưa có kiện: thư mục MGMER cùng số
      return [...new Set(out.filter(Boolean).map(x => x.toLowerCase()))];
    };
    const plan = [], used = new Map();
    for (const t of ['MGMER', 'GIR', 'OSD']) for (const r of rowsOf(t)) {
      const x = { t, r, folders: foldersOf(t, r), c: [], pick: null, st: 'none' };
      plan.push(x);
      if (String(r.File || '').trim()) { x.st = 'has'; continue; }
      const seen = new Set();
      x.folders.forEach(fd => (inF.get(fd) || []).forEach(f => { if (!seen.has(f.id) && SF_KIND[t](sfBase(f.n))) { seen.add(f.id); x.c.push(f); } }));
      // Xếp ứng viên theo điểm; khớp chắc chắn = điểm cao nhất duy nhất và có khớp số biên bản
      const sc = new Map(x.c.map(f => [f, sfScore(t, r, sfBase(f.n))]));
      x.c.sort((a, b) => sc.get(b) - sc.get(a));
      if (x.c.length) {
        x.pick = x.c[0];
        x.st = sc.get(x.c[0]) >= 10 && !(x.c[1] && sc.get(x.c[1]) === sc.get(x.c[0])) ? 'ok' : 'check';
      }
      if (x.pick && sc.get(x.pick) >= 10) used.set(t + '|' + x.pick.id, (used.get(t + '|' + x.pick.id) || 0) + 1);
    }
    // 1 file ghép cho 2 biên bản cùng loại → để người dùng xem (file ghép "MGMER, GIR 348" gắn cho cả MGMER 348 lẫn GIR 348 thì được)
    plan.forEach(x => { if (x.st === 'ok' && used.get(x.t + '|' + x.pick.id) > 1) x.st = 'check'; });
    return plan;
  };
  A.srcFiles = async () => {
    if (!App.user.owner) return App.notFound();
    App.head('Gắn file biên bản từ Drive', { back: true });
    App.loading();
    await Promise.all(['KIEN', 'MGMER', 'GIR', 'OSD'].map(t => DB.loadDeps(t).catch(() => {})));
    App.main.innerHTML = `<div class="card sfi"><p>App đọc danh mục file trong thư mục <b>Goods delivered to Site</b> trên Drive phòng (mỗi biên bản kiểm đếm một thư mục
        <b>MGMER &lt;số&gt;</b>, chứa luôn file GIR, OSD), rồi tự ghép file với các biên bản <b>chưa có file</b> theo thư mục, loại file và số biên bản.</p>
        <p class="muted small">Chỉ đọc: file gốc <b>không bị chép, tải lên, đổi tên hay xoá</b>. Biên bản gắn xong mở thẳng file gốc. Biên bản đã có file thì giữ nguyên.</p>
        <button type="button" class="btn" data-scan>${Icon('search')} Dò file trên Drive phòng</button></div><div id="sfbox"></div>`;
    const box = App.main.querySelector('#sfbox'), btn = App.main.querySelector('[data-scan]');
    let idx = null;
    btn.onclick = async () => {
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang đọc danh mục file trên Drive (khoảng 10–60 giây)…';
      try {
        // Máy chủ đọc từng phần (~25 giây / lần) → gọi lại kèm các thư mục còn dở tới khi hết
        let pending = null, n = 0;
        idx = { root: '', folders: 0, files: [] };
        do {
          const r = await API.srcIndex(pending);
          idx.root = r.root; idx.files = idx.files.concat(r.files || []); idx.folders += r.folders || 0;
          pending = r.pending && r.pending.length ? r.pending : null;
          btn.innerHTML = `<span class="spin"></span> Đang đọc danh mục file trên Drive… ${U.int(idx.files.length)} file, ${U.int(idx.folders)} thư mục${pending ? ' (còn ' + U.int(pending.length) + ' thư mục)' : ''}`;
        } while (pending && ++n < 60);
      }
      catch (e) {
        box.innerHTML = `<div class="xerr">${Icon('alert')}<span>${esc(/không hợp lệ/.test(e.message) ? 'Máy chủ / kho file chưa cập nhật bản có "Gắn file từ Drive" — dán Code.gs và FileService.gs mới rồi triển khai phiên bản mới' : e.message)}</span></div>`;
        btn.disabled = false; btn.innerHTML = `${Icon('search')} Dò file trên Drive phòng`; return;
      }
      btn.disabled = false; btn.innerHTML = `${Icon('refresh')} Dò lại`;
      draw();
    };
    const T3 = [['MGMER', 'Biên bản kiểm đếm (MGMER)'], ['GIR', 'Biên bản mở kiện (GIR)'], ['OSD', 'Biên bản OSD']];
    const draw = () => {
      const plan = A.srcPlan(idx, t => DB.rows(t));
      const on = new Set(plan.map((x, i) => x.st === 'ok' ? i : -1).filter(i => i >= 0));   // mặc định: gắn các biên bản khớp chắc chắn
      const n = (t, st) => plan.filter(x => x.t === t && x.st === st).length;
      const docT = x => `<a href="#/r/${x.t}/${enc(x.r.id)}" target="_blank">${esc(DB.title(x.t, x.r))}</a>${x.r.Goi_thau ? ` <span class="muted">· ${esc(x.r.Goi_thau)}</span>` : ''}`;
      const fileT = f => `${esc(f.n)} <small class="muted">${esc([f.p, sfSize(f.s)].filter(Boolean).join(' · '))}</small>`;
      const row = i => {
        const x = plan[i];
        if (x.st === 'none') return `<div class="sf-r none"><span class="sf-doc">${docT(x)}</span><span class="muted small">${x.folders.length ? 'Không thấy file trong ' + esc(x.folders.join(', ')) : 'Không biết thư mục (biên bản chưa có số / chưa gắn kiện)'}</span></div>`;
        const pickSel = x.c.length > 1 ? `<select data-pk="${i}">${x.c.map(f => `<option value="${esc(f.id)}" ${f === x.pick ? 'selected' : ''}>${esc(f.n)}${f.p ? ' — ' + esc(f.p) : ''}</option>`).join('')}</select>` : `<span class="sf-f">${fileT(x.pick)}</span>`;
        return `<label class="sf-r"><input type="checkbox" data-i="${i}" ${on.has(i) ? 'checked' : ''}><span class="sf-doc">${docT(x)}</span><span class="sf-arr">→</span>${pickSel}</label>`;
      };
      const grp = (st, title, open, note) => {
        const ids = plan.map((x, i) => x.st === st ? i : -1).filter(i => i >= 0);
        if (!ids.length) return '';
        return `<details class="card sf-g" data-st="${st}" ${open ? 'open' : ''}><summary><b>${title}</b> <span class="cnt">${U.int(ids.length)}</span>${note ? `<span class="muted small"> · ${note}</span>` : ''}</summary>
          <div class="sf-list" data-ids="${ids.join(',')}"></div></details>`;
      };
      box.innerHTML = `<div class="card"><p class="muted small">Đã đọc ${U.int(idx.files.length)} file trong ${U.int(idx.folders || 0)} thư mục của "${esc(idx.root)}".</p>
        <table class="sf-sum"><thead><tr><th></th><th>Khớp</th><th>Cần xem</th><th>Không thấy</th><th>Đã có file</th></tr></thead>
        <tbody>${T3.map(([t, l]) => `<tr><td>${l}</td><td class="ok">${U.int(n(t, 'ok'))}</td><td class="warn">${U.int(n(t, 'check'))}</td><td>${U.int(n(t, 'none'))}</td><td class="muted">${U.int(n(t, 'has'))}</td></tr>`).join('')}</tbody></table></div>
        ${grp('check', 'Cần xem lại', true, 'nhiều file hoặc tên file không có số biên bản — chọn đúng file rồi tick')}
        ${grp('ok', 'Khớp chắc chắn', false, 'đúng thư mục, đúng loại, tên file có số biên bản — đã tick sẵn')}
        ${grp('none', 'Không thấy file', false, 'gắn tay ở trang biên bản')}
        <div class="sf-bar"><span id="sfn"></span><button type="button" class="btn" data-go>${Icon('link')} Gắn file</button></div>`;
      // Danh sách dài (hàng nghìn biên bản): chỉ vẽ khi mở nhóm
      const fill = d => { const l = d.querySelector('.sf-list'); if (l.dataset.done) return; l.dataset.done = 1; l.innerHTML = l.dataset.ids.split(',').map(Number).map(row).join(''); };
      box.querySelectorAll('details.sf-g').forEach(d => { if (d.open) fill(d); d.addEventListener('toggle', () => { if (d.open) fill(d); }); });
      const count = () => { box.querySelector('#sfn').innerHTML = `<b>${U.int(on.size)}</b> biên bản sẽ được gắn file`; box.querySelector('[data-go]').disabled = !on.size; };
      count();
      box.addEventListener('change', e => {
        const c = e.target.closest('[data-i]'), s = e.target.closest('[data-pk]');
        if (c) { if (c.checked) on.add(+c.dataset.i); else on.delete(+c.dataset.i); count(); }
        if (s) { const x = plan[+s.dataset.pk]; x.pick = x.c.find(f => f.id === s.value) || x.pick; const cb = s.closest('.sf-r').querySelector('[data-i]'); if (!cb.checked) { cb.checked = true; on.add(+s.dataset.pk); count(); } }
      });
      box.querySelector('[data-go]').onclick = async e => {
        const go = e.currentTarget, list = [...on].map(i => plan[i]).filter(x => x.pick);
        if (!(await U.confirm(`Gắn file cho ${list.length} biên bản? Ô File sẽ trỏ tới file gốc trên Drive phòng (không chép, không đổi file gốc).`))) return;
        go.disabled = true;
        try {
          for (const [t] of T3) {
            const kf = DB.keyField(t), rows = list.filter(x => x.t === t).map(x => ({ [kf]: x.r[kf], File: 'fsg:' + x.pick.id }));
            if (!rows.length) continue;
            go.innerHTML = `<span class="spin"></span> Đang gắn ${U.int(rows.length)} biên bản ${t}…`;
            await DB.updateMany(t, rows, (d, m) => { go.innerHTML = `<span class="spin"></span> ${t}: ${U.int(d)}/${U.int(m)}…`; }, SF_VIA);
          }
          U.toast(`Đã gắn file cho ${list.length} biên bản`, 'ok');
          draw();
        } catch (er) { U.toast('Gắn file lỗi: ' + er.message, 'err'); go.disabled = false; go.innerHTML = `${Icon('link')} Gắn file`; }
      };
    };
  };

  // ---------------- KIỂM TRA DỮ LIỆU (quản trị viên) ----------------
  // Tự tìm dữ liệu bất thường + nút sửa nhanh; mọi lần sửa đi qua máy chủ (kiểm quyền) và ghi Lịch sử chỉnh sửa (nguồn "Kiểm tra dữ liệu")
  const CHK_VIA = 'Kiểm tra dữ liệu';
  // Quy tắc gán gói theo số PKL (đã đối chiếu packing list): thiết bị tuabin hơi + máy phát GE Vernova (PO 4102913692) = gói T07
  const GOI_RULES = [{ id: 'ge', goi: 'T07', ten: 'Gói T07 – Tuabin hơi & máy phát (GE Vernova)', l: 'Hàng GE Vernova (tuabin hơi, máy phát) chưa thuộc gói T07',
    d: 'Số PKL 270T865, 270T866, 280T865, 280T866 — lô China 1st/2nd, US 1st–4th, Korea 1st, Antwerp 1st của GE Vernova, thuộc gói T07.', pkl: /^(270|280)T86[56]$/i }];
  const chkSo = (t, s) => { const k = U.norm(String(s == null ? '' : s)).replace(/\s+/g, '').replace(new RegExp('^' + t.toLowerCase() + '[-_.:#]*(no\\.?)?(?=.)'), ''); return /^\d+$/.test(k) ? String(+k) : k; };
  // Năm gõ nhầm (vd 2108) → thử đảo chữ số của năm để ra năm hợp lý (2018); không ra được thì để trống cho người dùng tự nhập
  const fixYear = iso => {
    const m = String(iso || '').match(/^(\d{4})(-\d{2}-\d{2})/); if (!m) return '';
    const y = new Date().getFullYear(), perms = new Set();
    const go = (a, s) => { if (!a.length) return perms.add(s); a.forEach((c, i) => go(a.filter((_, j) => j !== i), s + c)); };
    go(m[1].split(''), '');
    const ok = [...perms].map(Number).filter(n => n >= 2010 && n <= y).sort((a, b) => b - a);
    return ok.length ? ok[0] + m[2] : '';
  };
  A.check = async () => {
    if (!App.user.owner) return App.notFound();   // chỉ quản trị viên chính
    App.head('Kiểm tra dữ liệu', { back: true });
    App.loading();
    await Promise.all(['KIEN', 'MGMER', 'GIR', 'OSD', 'KIEM_TRA', 'GOI_THAU'].map(t => DB.loadDeps(t).catch(() => {})));
    const K = DB.rows('KIEN'), goiSet = new Set(DB.rows('GOI_THAU').map(g => String(g.MaGoi)));
    const today = U.today(), soon = U.isoOf(new Date(Date.now() + 31 * 864e5));
    const DOCS = [['MGMER', 'Biên bản kiểm đếm'], ['GIR', 'Biên bản mở kiện'], ['OSD', 'Biên bản OSD'], ['KIEM_TRA', 'Lần kiểm tra vị trí']];
    const kLink = r => `<a href="#/r/KIEN/${enc(r.id)}">${esc(DB.title('KIEN', r))}</a>`;
    const dLink = (t, r) => `<a href="#/r/${t}/${enc(r[DB.keyField(t)])}">${esc(DB.title(t, r))}</a>`;
    const cnt = { MGMER: new Map(), GIR: new Map(), OSD: new Map() };
    K.forEach(r => ['MGMER', 'GIR', 'OSD'].forEach(t => { if (r[t]) cnt[t].set(r[t], (cnt[t].get(r[t]) || 0) + 1); }));
    DB.rows('OSD').forEach(o => U.splitList(o.GIR).forEach(g => cnt.GIR.set(g, (cnt.GIR.get(g) || 0) + 0.0001)));   // GIR có OSD đi kèm không coi là trống
    const checks = [];
    // 1) Gán gói theo PKL
    GOI_RULES.forEach(g => {
      const rows = K.filter(r => g.pkl.test(String(r.PKL_No || '').trim()) && r.Goi_thau !== g.goi);
      const by = {}; rows.forEach(r => { by[r.Goi_thau || '(trống)'] = (by[r.Goi_thau || '(trống)'] || 0) + 1; });
      checks.push({ id: g.id, l: g.l, d: g.d, n: rows.length, rows, kind: 'goi', goi: g.goi, goiTen: g.ten,
        sub: Object.entries(by).map(([k, n]) => `${esc(k)}: ${U.int(n)} kiện`).join(' · ') });
    });
    // 2) Kiện chưa xác định gói
    const noGoi = K.filter(r => !r.Goi_thau || r.Goi_thau === 'KXĐ' || !goiSet.has(String(r.Goi_thau)));
    checks.push({ id: 'nogoi', l: 'Kiện chưa xác định gói thầu', d: 'Gói trống, "KXĐ" hoặc mã gói không có trong danh sách Gói thầu. Chọn gói rồi gán cho cả nhóm, hoặc mở từng kiện để sửa.', n: noGoi.length, rows: noGoi, kind: 'pickgoi' });
    // 3) Ngày bất thường
    const badD = DOCS.flatMap(([t, l]) => DB.rows(t).filter(r => r.Ngay && (String(r.Ngay).slice(0, 10) > soon || String(r.Ngay).slice(0, 4) < '2010')).map(r => ({ t, l, r })));
    checks.push({ id: 'dates', l: 'Ngày bất thường (gõ nhầm năm)', d: 'Ngày ở tương lai xa hoặc trước 2010. App gợi ý ngày đúng bằng cách đảo chữ số của năm (vd 2108 → 2018); kiểm tra lại rồi bấm Sửa.', n: badD.length, items: badD, kind: 'dates' });
    // 4) Tình trạng kiện ngoài danh sách chuẩn
    const STD = (DB.field('KIEM_TRA', 'Tinh_trang') || {}).opts || [];
    const odd = new Map(); DB.rows('KIEM_TRA').forEach(r => { const v = String(r.Tinh_trang || '').trim(); if (v && !STD.includes(v)) odd.set(v, (odd.get(v) || []).concat([r])); });
    checks.push({ id: 'status', l: 'Tình trạng kiện ngoài danh sách chuẩn', d: 'Các giá trị ghi tay khác danh sách ' + STD.join(', ') + '. Chọn giá trị chuẩn để đổi cho mọi lần kiểm tra mang giá trị đó.', n: [...odd.values()].reduce((s, a) => s + a.length, 0), groups: [...odd.entries()].sort((a, b) => b[1].length - a[1].length), kind: 'status', std: STD });
    // 5) Kiểm đếm tại cảng (chưa về công trường)
    const port = K.filter(r => !r.GIR && SCHEMA.atPort(r));
    checks.push({ id: 'port', l: 'Kiện mới kiểm đếm tại cảng (chưa về công trường)', d: 'Chưa tính là đã về. Khi hàng về: tạo biên bản kiểm đếm "Tại công trường" → Chọn kiện → chế độ "Mới kiểm đếm tại cảng".', n: port.length, rows: port, kind: 'info', info: true });
    // 6) Biên bản không có kiện nào
    const empty = ['MGMER', 'GIR', 'OSD'].flatMap(t => DB.rows(t).filter(r => !cnt[t].get(r[DB.keyField(t)])).map(r => ({ t, r })));
    checks.push({ id: 'empty', l: 'Biên bản không có kiện nào', d: 'Biên bản tạo nhầm / thử, hoặc chưa chọn kiện. Mở để chọn kiện, hoặc xoá nếu thừa.', n: empty.length, items: empty, kind: 'empty' });
    // 7) Đã mở kiện nhưng chưa có biên bản kiểm đếm
    const noMg = K.filter(r => r.GIR && !r.MGMER);
    checks.push({ id: 'nomg', l: 'Kiện đã mở (có GIR) nhưng chưa có biên bản kiểm đếm', d: 'Thường do nhập thiếu MGMER. Mở kiện / biên bản để bổ sung.', n: noMg.length, rows: noMg, kind: 'info', info: true });
    // 8) Số biên bản trùng trong cùng gói
    const dup = [];
    ['MGMER', 'GIR', 'OSD'].forEach(t => { const m = new Map(); DB.rows(t).forEach(r => { const k = (r.Goi_thau || '') + '|' + chkSo(t, r.So); if (!chkSo(t, r.So)) return; m.set(k, (m.get(k) || []).concat([r])); });
      m.forEach(rs => { if (rs.length > 1) dup.push({ t, rs }); }); });
    checks.push({ id: 'dup', l: 'Số biên bản trùng trong cùng gói', d: 'Thường là dữ liệu cũ (cùng số, khác ngày). Mở từng biên bản để kiểm tra, sửa số hoặc gộp kiện.', n: dup.length, items: dup, kind: 'dup', info: true });

    const need = checks.filter(c => c.n && !c.info).length;
    const LIM = 60;
    const list = rows => `<div class="ck-list">${rows.slice(0, LIM).map(r => `<div>${kLink(r)} <span class="muted small">${esc([r.Goi_thau, r.PKL_No, r.Package_No].filter(Boolean).join(' · '))}</span></div>`).join('')}
      ${rows.length > LIM ? `<div class="muted small">… và ${U.int(rows.length - LIM)} kiện khác</div>` : ''}</div>`;
    const goiOpts = DB.rows('GOI_THAU').map(g => `<option value="${esc(g.MaGoi)}">${esc(g.MaGoi + (g.TenGoi ? ' – ' + g.TenGoi : ''))}</option>`).join('');
    const body = c => {
      if (!c.n) return '';
      if (c.kind === 'goi') return `<div class="ck-act"><span class="muted small">${c.sub}</span><button type="button" class="btn sm" data-do="${c.id}">${Icon('check', 'sm')} Chuyển ${U.int(c.n)} kiện sang gói ${esc(c.goi)}</button></div>${list(c.rows)}`;
      if (c.kind === 'pickgoi') return `<div class="ck-act"><select data-goi="${c.id}"><option value="">— Chọn gói thầu —</option>${goiOpts}</select><button type="button" class="btn sm" data-do="${c.id}">Gán gói cho ${U.int(c.n)} kiện</button></div>${list(c.rows)}`;
      if (c.kind === 'dates') return `<div class="ck-list">${c.items.slice(0, LIM).map((x, i) => { const cur = String(x.r.Ngay).slice(0, 10), sug = fixYear(cur);
        return `<div class="ck-row"><span>${esc(x.l)}: ${dLink(x.t, x.r)} <span class="muted small">${esc(x.r.Goi_thau || '')}</span></span>
          <span class="ck-date"><s>${esc(U.fmtDate(cur))}</s> → <input type="date" data-di="${i}" value="${esc(sug)}"><button type="button" class="btn sm" data-fixdate="${i}">Sửa</button></span></div>`; }).join('')}</div>`;
      if (c.kind === 'status') return `<div class="ck-list">${c.groups.map(([v, rs], i) => `<div class="ck-row"><span><b>${esc(v)}</b> <span class="muted small">${U.int(rs.length)} lần kiểm tra</span></span>
          <span class="ck-date">→ <select data-si="${i}"><option value="">— Giá trị chuẩn —</option>${c.std.map(o => `<option>${esc(o)}</option>`).join('')}</select><button type="button" class="btn sm" data-fixst="${i}">Đổi</button></span></div>`).join('')}</div>`;
      if (c.kind === 'empty') return `<div class="ck-list">${c.items.slice(0, LIM).map((x, i) => `<div class="ck-row"><span>${dLink(x.t, x.r)} <span class="muted small">${esc([x.r.Goi_thau, x.r.Ngay && U.fmtDate(x.r.Ngay), x.r.File ? 'có file' : ''].filter(Boolean).join(' · '))}</span></span>
          <button type="button" class="btn sm danger ghost" data-del="${i}">Xoá</button></div>`).join('')}</div>`;
      if (c.kind === 'dup') return `<div class="ck-list">${c.items.slice(0, LIM).map(x => `<div>${x.rs.map(r => dLink(x.t, r) + ` <span class="muted small">${esc([r.Goi_thau, r.Ngay && U.fmtDate(r.Ngay)].filter(Boolean).join(' · '))}</span>`).join(' · ')}</div>`).join('')}</div>`;
      return list(c.rows);
    };
    App.main.innerHTML = `<div class="card ck-top"><b>${need ? need + ' nhóm cần xem' : 'Không có dữ liệu bất thường cần sửa'}</b>
        <span class="muted small">Kiểm tra trên toàn bộ dữ liệu đang có trên máy (bấm ⟳ để lấy mới nhất). Mọi lần sửa ở đây được ghi vào Lịch sử chỉnh sửa.</span></div>
      ${checks.map(c => `<details class="card ck" data-c="${c.id}" ${c.n && !c.info ? 'open' : ''}><summary>
          <span class="badge ${!c.n ? 'ok' : c.info ? 'info' : 'warn'}">${c.n ? U.int(c.n) : '✓'}</span><b>${esc(c.l)}</b></summary>
          <p class="muted small">${esc(c.d)}</p>${body(c)}</details>`).join('')}`;
    const C = id => checks.find(c => c.id === id);
    const busy = async (b, fn) => { const l = b.innerHTML; b.disabled = true; b.textContent = 'Đang sửa…'; try { await fn(); } catch (e) { if (e.message !== 'Đã huỷ') U.toast(e.message, 'err'); b.disabled = false; b.innerHTML = l; return; } A.check(); };
    // Gán gói (theo quy tắc PKL / chọn tay) — tạo gói nếu chưa có trong danh sách
    App.main.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const c = C(b.dataset.do), sel = App.main.querySelector(`[data-goi="${c.id}"]`), goi = c.goi || (sel && sel.value);
      if (!goi) return U.toast('Chọn gói thầu trước', 'err');
      busy(b, async () => {
        if (!(await U.confirm(`Gán gói ${goi} cho ${U.int(c.rows.length)} kiện?`))) throw new Error('Đã huỷ');
        if (!DB.get('GOI_THAU', goi)) await DB.add('GOI_THAU', { MaGoi: goi, TenGoi: c.goiTen || 'Gói ' + goi, Tinh_trang: 'Đang thực hiện', Ghi_chu: 'Tạo từ trang Kiểm tra dữ liệu' });
        await DB.updateMany('KIEN', c.rows.map(r => ({ id: r.id, Goi_thau: goi })), (d, n) => { b.textContent = `Đang sửa ${U.int(d)}/${U.int(n)}…`; }, CHK_VIA + ': gán gói ' + goi);
        U.toast(`Đã gán gói ${goi} cho ${U.int(c.rows.length)} kiện`, 'ok');
      });
    });
    App.main.querySelectorAll('[data-fixdate]').forEach(b => b.onclick = () => {
      const x = C('dates').items[+b.dataset.fixdate], v = App.main.querySelector(`[data-di="${b.dataset.fixdate}"]`).value;
      if (!v) return U.toast('Nhập ngày đúng trước', 'err');
      busy(b, async () => { await DB.update(x.t, { [DB.keyField(x.t)]: x.r[DB.keyField(x.t)], Ngay: v }); U.toast('Đã sửa ngày thành ' + U.fmtDate(v), 'ok'); });
    });
    App.main.querySelectorAll('[data-fixst]').forEach(b => b.onclick = () => {
      const [v, rs] = C('status').groups[+b.dataset.fixst], to = App.main.querySelector(`[data-si="${b.dataset.fixst}"]`).value;
      if (!to) return U.toast('Chọn giá trị chuẩn trước', 'err');
      busy(b, async () => { await DB.updateMany('KIEM_TRA', rs.map(r => ({ id: r.id, Tinh_trang: to })), null, CHK_VIA + ': đổi tình trạng'); U.toast(`Đã đổi "${v}" → "${to}" (${U.int(rs.length)} lần kiểm tra)`, 'ok'); });
    });
    App.main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const x = C('empty').items[+b.dataset.del];
      busy(b, async () => {
        if (!(await U.confirm(`Xoá ${DB.title(x.t, x.r)}${x.r.File ? ' (biên bản có file đính kèm)' : ''}? Biên bản không có kiện nào.`))) throw new Error('Đã huỷ');
        await DB.remove(x.t, x.r[DB.keyField(x.t)]); U.toast('Đã xoá', 'ok');
      });
    });
  };

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

    // Công tắc khoá app (riêng máy này): bật = đặt mã PIN; tắt = nhập mã PIN hiện tại rồi bỏ khoá. Đang bật mới hiện đổi PIN / tự khoá / vân tay
    const la = Lock.after(), lockOn = Lock.hasPin();
    h += group('Khoá ứng dụng',
      srow('lock', 'var(--g6)', 'Khoá app bằng mã PIN', lockOn ? 'Đang bật · cần nhập mã PIN khi mở app trên máy này' : 'Đang tắt — ai cầm máy này cũng mở được app',
        `<input type="checkbox" class="sw" data-act="lockon" ${lockOn ? 'checked' : ''} aria-label="Khoá app bằng mã PIN">`)
      + (lockOn ? srow('refresh', 'var(--g6)', 'Đổi mã PIN', 'Nhập mã cũ rồi đặt mã mới', '<button class="btn sm ghost" data-act="chgpin">Đổi</button>')
        + srow('clock', 'var(--g6)', 'Tự khoá khi rời app hoặc không thao tác', 'Áp dụng trên máy này',
          `<div class="seg mini" data-act="lockafter">${[[0, 'Ngay'], [1, '1 phút'], [5, '5 phút'], [15, '15 phút']].map(([v, l]) => `<button type="button" class="segb ${v === la ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`)
        + `<div data-biorow hidden>${srow('key', 'var(--g6)', 'Mở khoá bằng vân tay / khuôn mặt', 'Windows Hello, vân tay, Face ID của máy này — mã PIN vẫn dùng được',
          `<input type="checkbox" class="sw" data-act="bio" ${Lock.bioOn() ? 'checked' : ''} aria-label="Mở khoá bằng vân tay / khuôn mặt">`)}</div>` : ''));
    h += group('Giao diện', srow(th === 'dark' ? 'moon' : 'sun', 'var(--g4)', 'Chế độ màu', 'Áp dụng trên máy này',
      `<div class="seg mini" data-act="theme">${[['', 'Theo máy'], ['light', 'Sáng'], ['dark', 'Tối']].map(([v, l]) => `<button type="button" class="segb ${v === th ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`));

    h += group('Ứng dụng',
      srow('download', 'var(--g0)', 'Cài app vào máy', esc(Install.hint()),
        `<button class="btn sm${App.installPrompt ? '' : ' ghost'}" data-act="install">${App.installPrompt ? 'Cài' : 'Hướng dẫn'}</button>`)
      + srow('refresh', 'var(--g0)', 'Phiên bản ' + esc(C.version), demo ? 'Chế độ DEMO — dữ liệu giả' : 'Dữ liệu trên Google Sheets', '<button class="btn sm ghost" data-act="update">Kiểm tra</button>')
      + srow('saved', 'var(--g0)', 'Dữ liệu lưu tạm trên máy', '<span data-disk>Giúp mở app nhanh và xem được khi mất mạng</span>', '<button class="btn sm ghost" data-act="wipe">Xoá</button>')
      + slink('privacy.html', 'shield', 'var(--g0)', 'Chính sách bảo mật', ''));

    if (App.user.admin) {
      h += group('Quản trị', slink('#/admin', 'users', 'var(--g7)', 'Phân quyền', '<span data-ucount>Người dùng và quyền truy cập</span>')
        + (App.user.owner ? slink('#/admin/log', 'clock', 'var(--g7)', 'Lịch sử chỉnh sửa', 'Ai thêm / sửa / xoá gì, lúc nào') : '')
        + (App.user.owner ? slink('#/admin/online', 'wifi', 'var(--g7)', 'Ai đang online', 'Tài khoản đang mở app, lần cuối dùng app, máy và phiên bản')
          + slink('#/admin/srcfiles', 'file', 'var(--g7)', 'Gắn file biên bản từ Drive', 'Ghép file MGMER / GIR / OSD có sẵn trên Drive phòng vào biên bản, không phải tải lên')
          + slink('#/admin/check', 'check', 'var(--g7)', 'Kiểm tra dữ liệu', 'Kiện chưa có gói, ngày gõ nhầm, tình trạng lạ… và sửa nhanh') : '')
        + srow('folder', 'var(--g7)', 'Kho file (PDF, ảnh tải lên)', '<span data-fstore>Đang kiểm tra…</span>'));
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
    const lsw = App.main.querySelector('[data-act="lockon"]');
    if (lsw) lsw.onchange = () => {
      if (lsw.checked) { Lock.enable(); watchPin(); return; }
      lsw.checked = true;   // chỉ tắt khi đã nhập đúng mã PIN
      Lock.disable(() => { if (location.hash === '#/settings') A.settings(); });
    };
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
      if (Outbox.pending()) return U.toast('Đang có thay đổi chưa lưu lên máy chủ — đợi lưu xong (ô góc dưới) rồi hãy xoá', 'err');
      if (!await U.confirm('Xoá dữ liệu lưu tạm trên máy này (danh sách, ảnh nhỏ)? Dữ liệu trên Google Sheets không bị ảnh hưởng; lần mở sau sẽ tải lại.')) return;
      await DB.wipe(); U.toast('Đã xoá dữ liệu lưu tạm', 'ok'); location.reload();
    });
    // Kho file: Drive của phòng (FileService.gs) hay Drive tài khoản chính + dung lượng còn lại
    const fsEl = App.main.querySelector('[data-fstore]');
    if (fsEl) API.fileStore().then(x => {
      if (!fsEl.isConnected) return;
      const gb = b => (b >= 1e12 ? (b / 1e12).toFixed(1) + ' TB' : (b / 1e9).toFixed(1) + ' GB').replace('.', ',');
      const cap = x.limit ? ` · đã dùng ${gb(x.used)} / ${gb(x.limit)}` : '';
      fsEl.innerHTML = x.local ? `Drive tài khoản chính <b>${esc(x.email)}</b>${cap}${x.limit && x.used / x.limit > 0.8 ? ' · <b>sắp đầy</b>' : ''} — có thể chuyển sang Drive của phòng`
        : `Drive của phòng <b>${esc(x.email)}</b>${cap} ✓`;
    }).catch(e => { if (fsEl.isConnected) fsEl.textContent = /không hợp lệ/.test(e.message) ? 'Máy chủ chưa cập nhật Code.gs mới' : e.message; });
    const du = App.main.querySelector('[data-disk]');
    if (du) DB.diskUsage().then(b => { if (du.isConnected && b) du.textContent = 'Đang dùng ' + (b / 1048576).toFixed(1).replace('.', ',') + ' MB trên máy'; });
    on('unlock', async () => { if (await Vault.ensureOpen()) A.settings(); });
    on('lock', () => { Vault.lock(); A.settings(); });
    on('install', () => Install.prompt());
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
