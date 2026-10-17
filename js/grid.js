// =====================================================================
//  BẢNG KIỂU MS ACCESS cho danh sách
//   • Mỗi dòng 1 bản ghi, mỗi cột 1 trường; tô màu xen kẽ; tiêu đề + cột đầu đứng yên khi cuộn.
//   • Nút "Cột": chọn cột hiện / ẩn, đổi thứ tự (lưu theo từng máy: localStorage 'tcxl-cols|<bảng>').
//     Kéo mép tiêu đề để đổi độ rộng cột ('tcxl-colw|<bảng>').
//   • Bấm tiêu đề để sắp xếp; nút phễu ở tiêu đề → lọc cột đó: chọn nhiều giá trị (kèm số lượng),
//     dòng chứa chữ, khoảng ngày / số. Nhiều cột lọc cùng lúc (điều kiện "và").
//   • Chỉ vẽ các dòng đang thấy → 12.709 kiện vẫn cuộn mượt.
//  Cột mặc định: schema list.tcols; độ rộng: field.w hoặc theo kiểu cột.
//  Bộ lọc (st.flt): { <cột>: { vals: [giá trị thô], q: 'chữ', from, to } } — giá trị thô của cột tham chiếu là mã.
// =====================================================================
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const G = (window.Grid = {});
  const TT = () => SCHEMA.tables;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }
  };
  const RH = 36;   // chiều cao 1 dòng (px) — cố định để biết dòng nào đang thấy
  const isDate = f => f && /^(date|datetime|expiry)$/.test(f.t);
  const isNum = f => f && /^(number|price)$/.test(f.t);
  const EMPTY = (G.EMPTY = '\u0000');   // khoá của giá trị trống trong bộ lọc
  G.short = l => String(l || '').replace(/\s*\(.*\)$/, '');   // "Gói thầu (Restart Phase)" → "Gói thầu"

  // ---------- Cột ----------
  G.allCols = t => {
    const def = TT()[t], out = def.fields.filter(f => !f.enc).map(f => ({ n: f.n, l: f.s || G.short(f.l), f }));   // f.s = nhãn ngắn
    if (def.badge) out.push({ n: '_badge', l: 'Trạng thái', f: { n: '_badge', t: 'badge' } });
    return out;
  };
  G.defaults = (t, view) => {   // view = { key, tcols }: kiểu xem riêng (vd bảng Tổng quan) — bộ cột, độ rộng lưu riêng
    const def = TT()[t], L = def.list || {}, all = G.allCols(t).map(c => c.n);
    const pick = (view && view.tcols) || L.tcols || [L.lead, ...(L.cols || []), L.sort].concat(def.fields.filter(f => f.req && !/^(image|file)$/.test(f.t)).map(f => f.n));
    return [...new Set(pick.filter(n => n && all.includes(n)))];
  };
  G.visible = (t, view) => {
    const all = G.allCols(t).map(c => c.n), saved = ls.get('tcxl-cols|' + vk(t, view), null);
    const v = (saved || G.defaults(t, view)).filter(n => all.includes(n));
    return v.length ? v : G.defaults(t, view);
  };
  const WIDTH = { date: 106, datetime: 140, expiry: 106, number: 92, price: 120, ref: 130, enum: 132, longtext: 240, url: 170, email: 190, phone: 120, file: 70, image: 70, badge: 120 };
  G.width = (t, c, view) => (ls.get('tcxl-colw|' + vk(t, view), {})[c.n]) || c.f.w || WIDTH[c.f.t] || (c.n === 'STT' ? 70 : 150);
  const colOf = (t, n) => G.allCols(t).find(c => c.n === n);
  const vk = (t, view) => (view && view.key) || t;   // khoá lưu bộ cột / độ rộng: theo kiểu xem hoặc theo bảng
  G.colsOf = (t, view) => G.visible(t, view).map(n => colOf(t, n)).filter(Boolean);   // cột đang hiện (đối tượng cột)

  // ---------- Giá trị ô ----------
  // Khoá lọc của 1 ô (mảng — cột chọn nhiều có nhiều giá trị); trống → EMPTY
  G.keys = (t, r, n) => {
    if (n === '_badge') { const b = DB.badge(t, r); return [b && b.text ? b.text : EMPTY]; }
    const f = DB.field(t, n), v = DB.val(t, r, n);
    if (f && f.multi) { const a = U.splitList(v); return a.length ? a : [EMPTY]; }
    if (f && /^(file|image)$/.test(f.t)) return [v ? 'có' : EMPTY];
    const s = v == null ? '' : String(v).trim();
    return [s === '' ? EMPTY : isDate(f) ? U.isoOf(s) || s : s];
  };
  G.label = (t, n, k) => {
    if (k === EMPTY) return '(trống)';
    const f = DB.field(t, n);
    if (f && f.t === 'ref') { const rr = DB.get(f.ref, k); return rr ? DB.title(f.ref, rr) : k; }
    if (isDate(f)) return U.fmtDate(k);
    if (f && /^(file|image)$/.test(f.t)) return 'Có file';
    return k;
  };
  G.text = (t, r, n) => G.keys(t, r, n).filter(k => k !== EMPTY).map(k => G.label(t, n, k)).join(', ');
  G.cell = (t, r, n) => {
    if (n === '_badge') return Views.badgeHtml(DB.badge(t, r));
    const f = DB.field(t, n);
    if (f && /^(file|image)$/.test(f.t)) return r[n] ? `<span class="gfile">${Icon('file', 'sm')}</span>` : '';
    if (f && f.plain) return esc(DB.val(t, r, n) ?? '');
    return String(DB.show(t, r, n, true) || '').replace(/<br>/g, ' ');
  };
  const sortVal = (t, r, n) => {
    const f = DB.field(t, n);
    if (isNum(f)) { const v = DB.val(t, r, n); return v === '' || v == null ? null : U.num(v); }
    if (isDate(f)) return U.isoOf(DB.val(t, r, n)) || null;
    const s = G.text(t, r, n); return s === '' ? null : s;
  };
  G.sort = (t, rows, n, dir) => {
    const f = DB.field(t, n), num = isNum(f);
    const vals = new Map(rows.map(r => [r, sortVal(t, r, n)]));
    return rows.slice().sort((a, b) => {
      const x = vals.get(a), y = vals.get(b);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;   // trống luôn ở cuối
      return (num ? x - y : String(x).localeCompare(String(y), 'vi', { numeric: true })) * dir;
    });
  };

  // ---------- Lọc ----------
  const pass = (t, r, n, c) => {
    const f = DB.field(t, n);
    if (c.vals && c.vals.length) { const ks = G.keys(t, r, n); if (!ks.some(k => c.vals.includes(k))) return false; }
    if (c.q && !U.match(G.text(t, r, n), c.q)) return false;
    if (c.from || c.to) {
      if (isNum(f)) { const v = DB.val(t, r, n); if (v === '' || v == null) return false; const x = U.num(v); if (c.from !== '' && c.from != null && x < U.num(c.from)) return false; if (c.to !== '' && c.to != null && x > U.num(c.to)) return false; }
      else { const v = U.isoOf(DB.val(t, r, n)); if (!v || (c.from && v < c.from) || (c.to && v > c.to)) return false; }
    }
    return true;
  };
  G.active = flt => Object.keys(flt || {}).filter(n => { const c = flt[n]; return c && ((c.vals && c.vals.length) || c.q || c.from || c.to); });
  G.apply = (t, rows, flt, skip) => G.active(flt).filter(n => n !== skip).reduce((rs, n) => rs.filter(r => pass(t, r, n, flt[n])), rows);
  G.summary = (t, n, c) => {
    const f = DB.field(t, n), parts = [];
    if (c.vals && c.vals.length) parts.push(c.vals.slice(0, 2).map(k => G.label(t, n, k)).join(', ') + (c.vals.length > 2 ? ` +${c.vals.length - 2}` : ''));
    if (c.q) parts.push(`chứa "${c.q}"`);
    if (c.from || c.to) {
      const fm = v => isDate(f) ? U.fmtDate(v) : U.int(v);
      parts.push(c.from && c.to ? `${fm(c.from)} → ${fm(c.to)}` : c.from ? 'từ ' + fm(c.from) : 'đến ' + fm(c.to));
    }
    return parts.join(' · ');
  };

  // ---------- Vẽ bảng ----------
  // o: { t, rows (đã lọc tìm kiếm / thời gian), st (giữ sort, flt, top), onFilter(), base() → dòng trước lọc cột (đếm giá trị) }
  G.mount = (wrap, o) => {
    const { t, st } = o;
    const cols = G.visible(t, o.view).map(n => colOf(t, n)).filter(Boolean);
    let rows = G.apply(t, o.rows, st.flt);
    if (st.sort && st.sort.n && cols.concat(G.allCols(t)).some(c => c.n === st.sort.n)) rows = G.sort(t, rows, st.sort.n, st.sort.dir);
    const widths = cols.map(c => G.width(t, c, o.view)), total = widths.reduce((a, b) => a + b, 0);
    wrap.innerHTML = `<table class="dt" style="min-width:${total}px"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>
      <thead><tr>${cols.map((c, i) => {
        const s = st.sort && st.sort.n === c.n ? st.sort.dir : 0, on = G.active(st.flt).includes(c.n);
        return `<th data-n="${esc(c.n)}" class="${on ? 'fon' : ''}" title="${esc(c.f.l || c.l)}"><button type="button" class="th-l" data-sort>${esc(c.l)}${s ? Icon(s > 0 ? 'sortup' : 'sortdown', 'sm') : ''}</button>
          <button type="button" class="th-f" data-flt aria-label="Lọc cột ${esc(c.l)}">${Icon('filter', 'sm')}</button><span class="th-r" data-rz="${i}"></span></th>`;
      }).join('')}</tr></thead><tbody></tbody></table>
      ${rows.length ? '' : `<div class="gempty">${o.empty || 'Không có dòng nào khớp'}</div>`}`;
    const tb = wrap.querySelector('tbody'), kf = DB.keyField(t);
    let f0 = -1, f1 = -1, rh = RH;
    const rowHtml = (r, i) => {
      const b = DB.badge(t, r);
      return `<tr data-k="${esc(String(r[kf]))}" class="${i % 2 ? 'odd' : ''}${b && b.cls === 'bad' ? ' bad' : ''}">${cols.map(c => {
        const h = G.cell(t, r, c.n);
        return `<td${c.n === '_badge' ? '' : ` title="${esc(G.text(t, r, c.n))}"`}${isNum(c.f) ? ' class="num"' : ''}>${h}</td>`;
      }).join('')}</tr>`;
    };
    const paint = force => {
      const top = wrap.scrollTop, h = wrap.clientHeight;
      const a = Math.max(0, Math.floor(top / rh) - 12), z = Math.min(rows.length, Math.ceil((top + h) / rh) + 12);
      if (!force && a === f0 && z === f1) return;
      f0 = a; f1 = z;
      const sp = n => n > 0 ? `<tr class="gsp" style="height:${n * rh}px"><td colspan="${cols.length}"></td></tr>` : '';
      tb.innerHTML = sp(a) + rows.slice(a, z).map((r, j) => rowHtml(r, a + j)).join('') + sp(rows.length - z);
    };
    // Vẽ ngay khi cuộn (trình duyệt đã gộp sự kiện cuộn theo khung hình; khoảng dòng không đổi thì không vẽ lại)
    wrap.onscroll = () => { st.top = wrap.scrollTop; st.left = wrap.scrollLeft; paint(); };
    G.fit(wrap);
    wrap.scrollTop = st.top || 0; wrap.scrollLeft = st.left || 0;
    paint(true);
    // Chiều cao dòng thật (theo font / màn hình) → tính lại khoảng trống trên dưới cho khớp
    const tr0 = tb.querySelector('tr[data-k]');
    if (tr0 && Math.abs(tr0.getBoundingClientRect().height - rh) > 0.3) { rh = tr0.getBoundingClientRect().height; paint(true); }
    // Bấm dòng → chi tiết
    tb.onclick = e => { const tr = e.target.closest('tr[data-k]'); if (tr && !e.target.closest('a')) location.hash = '#/r/' + t + '/' + enc(tr.dataset.k); };
    // Tiêu đề: sắp xếp / lọc / kéo đổi độ rộng
    wrap.querySelectorAll('th').forEach(th => {
      const n = th.dataset.n;
      th.querySelector('[data-sort]').onclick = () => {
        st.sort = st.sort && st.sort.n === n ? { n, dir: -st.sort.dir } : { n, dir: isDate(DB.field(t, n)) ? -1 : 1 };
        st.top = 0; G.mount(wrap, o);
      };
      th.querySelector('[data-flt]').onclick = e => { e.stopPropagation(); G.filterPop(th, t, n, o); };
    });
    wrap.querySelectorAll('[data-rz]').forEach(hd => hd.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      const i = +hd.dataset.rz, col = wrap.querySelectorAll('col')[i], x0 = e.clientX, w0 = widths[i], tbl = wrap.querySelector('table');
      const mv = ev => { widths[i] = Math.max(56, w0 + ev.clientX - x0); col.style.width = widths[i] + 'px'; tbl.style.minWidth = widths.reduce((a, b) => a + b, 0) + 'px'; };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        const m = ls.get('tcxl-colw|' + vk(t, o.view), {}); m[cols[i].n] = Math.round(widths[i]); ls.set('tcxl-colw|' + vk(t, o.view), m);
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    return rows;
  };
  // Bảng cao vừa màn hình (cuộn trong bảng, tiêu đề đứng yên); chừa thanh menu dưới trên điện thoại
  G.fit = wrap => {
    if (!wrap.isConnected) return;
    const bn = document.getElementById('bnav'), bh = bn && getComputedStyle(bn).display !== 'none' ? bn.offsetHeight : 0;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    wrap.style.height = Math.max(300, window.innerHeight - top - bh - 14) + 'px';
  };
  let rzT = null;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => document.querySelectorAll('.gwrap').forEach(w => { G.fit(w); w.dispatchEvent(new Event('scroll')); }), 120); });

  // ---------- Ô lọc của 1 cột ----------
  G.closePop = () => { document.querySelectorAll('.gpop, .gpop-bg').forEach(e => e.remove()); };
  G.filterPop = (th, t, n, o) => {
    G.closePop();
    const st = o.st, f = DB.field(t, n) || { t: n === '_badge' ? 'badge' : 'text' }, cur = Object.assign({}, st.flt[n] || {});
    const range = isDate(f) || isNum(f);
    // Đếm giá trị trên các dòng đã qua các bộ lọc KHÁC (giống Excel)
    const base = G.apply(t, o.rows, st.flt, n), cnt = new Map();
    if (!range) base.forEach(r => G.keys(t, r, n).forEach(k => cnt.set(k, (cnt.get(k) || 0) + 1)));
    const keys = [...cnt.keys()].sort((a, b) => a === EMPTY ? 1 : b === EMPTY ? -1 : (f.opts && f.opts.includes(a) && f.opts.includes(b) ? f.opts.indexOf(a) - f.opts.indexOf(b)
      : G.label(t, n, a).localeCompare(G.label(t, n, b), 'vi', { numeric: true })));
    const sel = new Set(cur.vals || []);
    const bg = document.createElement('div'); bg.className = 'gpop-bg';
    const pop = document.createElement('div'); pop.className = 'gpop';
    const dl = isDate(f) ? ['Cũ → mới', 'Mới → cũ'] : isNum(f) ? ['Nhỏ → lớn', 'Lớn → nhỏ'] : ['A → Z', 'Z → A'];
    pop.innerHTML = `<div class="gp-h"><b>${esc(G.short(f.l || 'Trạng thái'))}</b><button type="button" class="ibtn3" data-x aria-label="Đóng">${Icon('x', 'sm')}</button></div>
      <div class="gp-sort"><button type="button" class="btn sm ghost" data-s="1">${Icon('sortup', 'sm')}${dl[0]}</button><button type="button" class="btn sm ghost" data-s="-1">${Icon('sortdown', 'sm')}${dl[1]}</button></div>
      ${range ? `<div class="gp-rng"><label>Từ ${isDate(f) ? Views.dateInput('data-from', cur.from || '') : `<input type="number" step="any" data-from value="${esc(cur.from ?? '')}">`}</label>
          <label>Đến ${isDate(f) ? Views.dateInput('data-to', cur.to || '') : `<input type="number" step="any" data-to value="${esc(cur.to ?? '')}">`}</label></div>`
        : `<label class="lsearch gp-q">${Icon('search')}<input type="search" placeholder="Tìm giá trị…" value="${esc(cur.q || '')}" data-q></label>
          <div class="gp-list" data-list></div><div class="gp-more muted small" data-more></div>`}
      <div class="gp-f"><button type="button" class="btn sm ghost" data-clear>Xoá lọc cột</button><button type="button" class="btn sm" data-ok>${Icon('check', 'sm')}Lọc</button></div>`;
    document.body.append(bg, pop);
    if (range && isDate(f)) Views.dates(pop);
    const q$ = s => pop.querySelector(s);
    // Danh sách giá trị có ô tick (tối đa 300 dòng; gõ để tìm giá trị khác)
    const drawList = () => {
      const box = q$('[data-list]'); if (!box) return;
      const qv = q$('[data-q]').value.trim();
      const ks = qv ? keys.filter(k => U.match(G.label(t, n, k), qv)) : keys, show = ks.slice(0, 300);
      const allOn = show.length && show.every(k => sel.has(k));
      box.innerHTML = (show.length ? `<label class="gp-it all"><input type="checkbox" data-all ${allOn ? 'checked' : ''}><span>(Chọn tất cả${qv ? ' đang tìm' : ''})</span></label>` : '<div class="muted small">Không có giá trị nào khớp</div>')
        + show.map(k => `<label class="gp-it"><input type="checkbox" data-k="${esc(k)}" ${sel.has(k) ? 'checked' : ''}><span>${esc(G.label(t, n, k))}</span><i>${U.int(cnt.get(k))}</i></label>`).join('');
      q$('[data-more]').textContent = ks.length > show.length ? `Còn ${U.int(ks.length - show.length)} giá trị khác — gõ để tìm` : (qv && !ks.length ? '' : '');
      box.querySelectorAll('[data-k]').forEach(c => c.onchange = () => { if (c.checked) sel.add(c.dataset.k); else sel.delete(c.dataset.k); drawList(); });
      const all = box.querySelector('[data-all]'); if (all) all.onchange = () => { show.forEach(k => all.checked ? sel.add(k) : sel.delete(k)); drawList(); };
    };
    if (!range) { const qi = q$('[data-q]'); qi.oninput = drawList; drawList(); }
    // Vị trí: dưới tiêu đề cột (máy tính) / tấm dưới đáy (điện thoại)
    const place = () => {
      if (innerWidth < 640) { pop.classList.add('sheet'); return; }
      const rc = th.getBoundingClientRect(), w = pop.offsetWidth;
      pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.left)) + 'px';
      pop.style.top = Math.min(rc.bottom + 4, innerHeight - pop.offsetHeight - 8) + 'px';
    };
    place();
    const done = () => { G.closePop(); st.top = 0; o.onFilter(); };
    const close = () => G.closePop();
    bg.onclick = close; q$('[data-x]').onclick = close;
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target.matches('input')) q$('[data-ok]').click(); });
    pop.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st.sort = { n, dir: +b.dataset.s }; done(); });
    q$('[data-clear]').onclick = () => { delete st.flt[n]; done(); };
    q$('[data-ok]').onclick = () => {
      const c = {};
      if (range) {
        const fr = q$('[data-from]').value, to = q$('[data-to]').value;
        if (pop.querySelector('.dinp.bad')) return U.toast('Ngày chưa đúng dạng dd/mm/yyyy', 'err');
        if (fr !== '') c.from = fr; if (to !== '') c.to = to;
      } else {
        const qv = q$('[data-q]').value.trim();
        if (sel.size) c.vals = [...sel];
        else if (qv) c.q = qv;   // không tick giá trị nào mà có gõ chữ → lọc dòng chứa chữ đó
      }
      if (Object.keys(c).length) st.flt[n] = c; else delete st.flt[n];
      done();
    };
    setTimeout(() => (q$('[data-q]') || q$('[data-ok]')).focus(), 30);
  };

  // ---------- Chọn cột ----------
  G.chooser = (t, onDone, view) => {
    const all = G.allCols(t);
    let vis = G.visible(t, view);
    const wrap = document.createElement('div'); wrap.className = 'modal-bg';
    const paint = () => {
      const order = [...vis, ...all.map(c => c.n).filter(n => !vis.includes(n))];
      wrap.innerHTML = `<div class="modal gcols"><h3>${Icon('cols')} Chọn cột hiển thị</h3>
        <p class="muted small">Tick để hiện cột, dùng mũi tên để đổi thứ tự. Lưu trên máy này.</p>
        <div class="gc-list">${order.map(n => { const c = all.find(x => x.n === n), on = vis.includes(n), i = vis.indexOf(n);
          return `<div class="gc-it ${on ? 'on' : ''}"><label><input type="checkbox" data-c="${esc(n)}" ${on ? 'checked' : ''}><span>${esc(c.f.l || c.l)}</span></label>
            ${on ? `<button type="button" class="ibtn3" data-up="${esc(n)}" ${i === 0 ? 'disabled' : ''} aria-label="Lên">${Icon('sortup', 'sm')}</button>
              <button type="button" class="ibtn3" data-dn="${esc(n)}" ${i === vis.length - 1 ? 'disabled' : ''} aria-label="Xuống">${Icon('sortdown', 'sm')}</button>` : ''}</div>`; }).join('')}</div>
        <div class="row-end"><button type="button" class="btn ghost" data-def>Mặc định</button><button type="button" class="btn" data-ok>${Icon('check', 'sm')}Xong</button></div></div>`;
      wrap.querySelectorAll('[data-c]').forEach(c => c.onchange = () => { const n = c.dataset.c; vis = c.checked ? [...vis, n] : vis.filter(x => x !== n); if (!vis.length) vis = [n]; paint(); });
      const mv = (n, d) => { const i = vis.indexOf(n), j = i + d; if (j < 0 || j >= vis.length) return; [vis[i], vis[j]] = [vis[j], vis[i]]; paint(); };
      wrap.querySelectorAll('[data-up]').forEach(b => b.onclick = () => mv(b.dataset.up, -1));
      wrap.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => mv(b.dataset.dn, 1));
      wrap.querySelector('[data-def]').onclick = () => { vis = G.defaults(t, view); ls.set('tcxl-colw|' + vk(t, view), null); paint(); };
      wrap.querySelector('[data-ok]').onclick = () => { ls.set('tcxl-cols|' + vk(t, view), vis); wrap.remove(); onDone(); };
    };
    wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
    paint(); document.body.appendChild(wrap);
  };

  // ---------- Bảng nhỏ trong trang chi tiết (danh sách liên quan, không lọc) ----------
  G.mini = (t, rows, opts = {}) => {
    if (!rows.length) return '<div class="empty">Chưa có dữ liệu</div>';
    const cols = G.visible(t).filter(n => n !== opts.skip).map(n => colOf(t, n)).filter(Boolean);
    const lim = opts.limit && rows.length > opts.limit ? opts.limit : rows.length, kf = DB.keyField(t);
    const L = TT()[t].list || {};
    if (L.sort) rows = G.sort(t, rows, L.sort, L.desc ? -1 : 1);
    return `<div class="gmini"><table class="dt"><colgroup>${cols.map(c => `<col style="width:${G.width(t, c)}px">`).join('')}</colgroup>
      <thead><tr>${cols.map(c => `<th title="${esc(c.f.l || c.l)}"><span class="th-l">${esc(c.l)}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, lim).map((r, i) => `<tr class="${i % 2 ? 'odd' : ''}" data-href="#/r/${t}/${enc(String(r[kf]))}">${cols.map(c => `<td${isNum(c.f) ? ' class="num"' : ''} title="${esc(G.text(t, r, c.n))}">${G.cell(t, r, c.n)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      + (lim < rows.length ? `<button type="button" class="btn ghost lmore" data-more>${Icon('chevron', 'sm')} Hiện thêm · còn ${U.int(rows.length - lim)} ${esc(L.countUnit || 'mục')}</button>` : '');
  };
  // Bấm dòng của bảng nhỏ → chi tiết
  document.addEventListener('click', e => { const tr = e.target.closest('.gmini tr[data-href]'); if (tr && !e.target.closest('a, button, input')) location.hash = tr.dataset.href; });
})();
