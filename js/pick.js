// =====================================================================
//  CHỌN NHIỀU KIỆN CHO 1 BIÊN BẢN (MGMER / GIR / OSD) — "nhập theo biên bản"
//  Biên bản nhập 1 lần (số, ngày, file), rồi tick chọn các kiện thuộc biên bản đó; lưu 1 lần cho cả loạt.
//  Cấu hình ở schema.js → assign của bảng biên bản: field = cột của kiện trỏ tới biên bản,
//  modes = các cách lọc sẵn danh sách kiện, loc = cho ghi luôn vị trí lưu kho (MGMER).
//  Địa chỉ: #/pick/<bảng biên bản>/<id>
// =====================================================================
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const P = (window.Pick = {});
  const PAGE = 200;   // số dòng vẽ mỗi lần (gói EPC thật có hàng nghìn kiện)
  const rowLv = (t, r) => permRowLevel(App.user, t, r, (pt, k) => DB.get(pt, k));
  const num = v => { const n = parseFloat(v); return isNaN(n) ? Infinity : n; };

  P.render = async (t, id) => {
    const def = SCHEMA.tables[t], A = def && def.assign;
    if (!A) return App.notFound();
    App.head('Chọn kiện', { back: true });
    App.loading();
    await Promise.all([DB.loadDeps(t), DB.loadDeps('KIEN')]);
    const rec = DB.get(t, id);
    if (!rec) { App.main.innerHTML = '<div class="empty">Không tìm thấy biên bản (có thể đã bị xoá hoặc bạn không có quyền xem).</div>'; return; }
    if (rowLv(t, rec) < 2 || permTableLevel(App.user, 'KIEN') < 2) {
      App.main.innerHTML = '<div class="empty">Bạn chỉ có quyền xem — không chọn kiện cho biên bản này được.</div>'; return;
    }
    const F = A.field, title = DB.title(t, rec), recId = String(rec.id);
    App.head('Chọn kiện · ' + title, { back: true });

    // Kiện cùng gói thầu mà người dùng được sửa; đã thuộc biên bản này thì tick sẵn.
    // Biên bản chưa có gói (OSD không bắt buộc gói) → chọn trong mọi gói được sửa; lưu xong tự gán gói theo kiện.
    const noGoi = !rec.Goi_thau, ofGoi = noGoi ? '' : ' của gói ' + rec.Goi_thau;
    const pool = DB.rows('KIEN').filter(k => (noGoi || k.Goi_thau === rec.Goi_thau) && rowLv('KIEN', k) >= 2)
      .sort((a, b) => num(a.STT) - num(b.STT));
    const orig = new Set(pool.filter(k => String(k[F] || '') === recId).map(k => String(k.id)));
    const sel = new Set(orig);
    const modes = A.modes.filter(m => !m.when || m.when(rec)).map(m => noGoi ? { ...m, l: m.l.replace(/ của gói$/, '') } : m);
    const st = { mode: modes[0].id, pkl: '*', q: '', only: false, lim: PAGE };
    const dirty = () => sel.size !== orig.size || [...sel].some(x => !orig.has(x));
    App.guard = async () => !dirty() || U.confirm('Bỏ các kiện vừa chọn mà chưa lưu?');

    const modeF = () => modes.find(m => m.id === st.mode).f;
    const cands = () => pool.filter(k => sel.has(String(k.id)) || orig.has(String(k.id)) || modeF()(k, rec));
    const text = k => [noGoi ? k.Goi_thau : '', DB.title('KIEN', k), DB.sub('KIEN', k), k.Package_No, k.PKL_No, k.PSIC_No, k.Ban_ve, k.Nha_cung_cap, k.Hang_muc].join(' ');
    const shown = () => {
      let rs = cands();
      if (st.pkl !== '*') rs = rs.filter(k => String(k.PKL_No || '') === st.pkl);
      if (st.only) rs = rs.filter(k => sel.has(String(k.id)));
      if (st.q) rs = rs.filter(k => U.match(text(k), st.q));
      return rs;
    };
    // Nhãn cảnh báo cho từng kiện
    const flag = k => {
      const cur = k[F] && String(k[F]) !== recId ? DB.get(t, k[F]) : null;
      if (k[F] && String(k[F]) !== recId) return { text: 'Đang ở ' + (cur ? DB.title(t, cur) : 'biên bản khác'), cls: 'warn' };
      if (F === 'GIR' && !k.MGMER) return { text: 'Chưa kiểm đếm', cls: 'warn' };
      if (F === 'OSD' && !k.GIR) return { text: 'Chưa mở kiện', cls: 'warn' };
      return DB.badge('KIEN', k);
    };
    const pklOpts = () => {
      const m = new Map();
      cands().forEach(k => { const p = String(k.PKL_No || ''); const o = m.get(p) || { n: 0, s: 0 }; o.n++; if (sel.has(String(k.id))) o.s++; m.set(p, o); });
      return [{ v: '*', l: 'Tất cả PKL', s: m.size + ' PKL' }, ...[...m].sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true }))
        .map(([p, o]) => ({ v: p, l: p ? 'PKL ' + p : '(chưa có PKL)', s: o.n + ' kiện' + (o.s ? ' · đã chọn ' + o.s : '') }))];
    };
    const locOpts = () => V.enumOpts('KIEM_TRA', DB.field('KIEM_TRA', 'Vi_tri'));
    const V = Views;

    App.main.innerHTML = `<div class="pwrap">
      <section class="card phead"><span class="lead tx" style="--gc:var(--g2)">${esc(String(rec.Goi_thau || '').slice(0, 5))}</span>
        <div class="row-main"><div class="row-title">${esc(title)}</div>
        <div class="row-sub">${esc([rec.Ngay && 'Ngày ' + U.fmtDate(rec.Ngay), DB.sub(t, rec)].filter(Boolean).join(' · '))}</div></div>
        <span class="badge info">${esc(U.int(orig.size))} kiện đang có</span></section>
      <div class="seg pmode">${modes.map(m => `<button type="button" class="segb ${m.id === st.mode ? 'on' : ''}" data-mode="${m.id}">${esc(m.l)}</button>`).join('')}</div>
      <div class="pfil">
        <label class="lsearch">${Icon('search')}<input type="search" id="pq" placeholder="Tìm mô tả, số kiện, PKL, bản vẽ…" autocomplete="off"></label>
        <div id="ppkl"></div>
      </div>
      <div class="lsum" id="psum"></div>
      <div id="plist"></div>
      ${A.loc ? `<section class="card form ploc"><div class="fsec"><span class="gic" style="--gc:var(--g2)">${Icon('pin')}</span>Ghi vị trí lưu kho (không bắt buộc)</div>
        <div class="muted small">Áp cho các kiện <b>mới chọn</b>, ngày kiểm tra = ngày biên bản (${esc(U.fmtDate(rec.Ngay) || 'hôm nay')}). Để trống nếu chưa biết vị trí.</div>
        <div class="cbx" data-opts="${esc(JSON.stringify(locOpts()))}"><input id="ploc" placeholder="Chọn hoặc gõ vị trí, vd Closed WH, Bãi Giáo…" autocomplete="off" role="combobox" aria-expanded="false">
          <button type="button" class="cbx-tg" tabindex="-1" aria-label="Mở danh sách">${Icon('chevron')}</button><div class="cbx-pop" role="listbox" hidden></div></div></section>` : ''}
      <div class="pbar"><div class="pb-info"><b id="pn">0</b> kiện đã chọn <span id="pd" class="muted"></span></div>
        <button type="button" class="btn ghost sm" data-all></button><button type="button" class="btn ghost sm" data-none></button>
        <button type="button" class="btn" data-save>${Icon('check')} Lưu</button></div>
    </div>`;
    if (A.loc) V.combo(App.main);

    const $ = s => App.main.querySelector(s);
    const drawPkl = () => {
      const box = $('#ppkl');
      box.innerHTML = V.pickInput('data-pkl', st.pkl, pklOpts());
      V.pickers(box);
      const hid = box.querySelector('[data-pkl]');
      hid.addEventListener('change', () => { st.pkl = hid.value || '*'; st.lim = PAGE; draw(); });
    };
    // Thanh dưới: số đã chọn (+ thêm / − bỏ) và nút chọn / bỏ cả loạt đang lọc
    const drawBar = rs => {
      const add = [...sel].filter(x => !orig.has(x)).length, del = [...orig].filter(x => !sel.has(x)).length;
      $('#pn').textContent = U.int(sel.size);
      $('#pd').textContent = add || del ? `(${[add && '+' + U.int(add) + ' thêm', del && '−' + U.int(del) + ' bỏ'].filter(Boolean).join(', ')})` : '';
      const on = rs.filter(k => sel.has(String(k.id))).length;
      const ba = $('[data-all]'), bn = $('[data-none]');
      ba.textContent = 'Chọn tất cả đang lọc (' + U.int(rs.length - on) + ')'; ba.disabled = on === rs.length;
      bn.textContent = 'Bỏ chọn đang lọc (' + U.int(on) + ')'; bn.disabled = !on;
      $('[data-save]').disabled = !dirty();
    };
    const rowHtml = k => {
      const on = sel.has(String(k.id)), b = flag(k), sub = [noGoi && k.Goi_thau, DB.sub('KIEN', k)].filter(Boolean).join(' · ');
      return `<label class="row prow ${on ? 'on' : ''}" data-id="${esc(k.id)}"><input type="checkbox" class="pchk" ${on ? 'checked' : ''} aria-label="Chọn kiện">
        <div class="row-main"><div class="row-title">${esc(DB.title('KIEN', k))}</div>${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}</div>
        ${b && b.text ? `<span class="badge ${esc(b.cls || '')}">${esc(b.text)}</span>` : ''}</label>`;
    };
    let cur = [];
    const draw = () => {
      cur = shown();
      const pool2 = cands().length;
      $('#psum').innerHTML = `${Icon('box', 'sm')}<span><b>${U.int(cur.length)}</b> kiện đang hiện
        <span class="muted">· trong ${U.int(pool2)} kiện phù hợp${esc(ofGoi)}${st.pkl !== '*' ? ' · PKL ' + esc(st.pkl || '(trống)') : ''}${st.q ? ' · khớp "' + esc(st.q) + '"' : ''}</span>
        <label class="chk ponly"><input type="checkbox" id="ponly" ${st.only ? 'checked' : ''}> Chỉ kiện đã chọn</label></span>`;
      $('#ponly').onchange = e => { st.only = e.target.checked; st.lim = PAGE; draw(); };
      const lim = Math.min(st.lim, cur.length);
      $('#plist').innerHTML = cur.length
        ? `<div class="rows">${cur.slice(0, lim).map(rowHtml).join('')}</div>`
          + (cur.length > lim ? `<button type="button" class="btn ghost lmore" data-more>${Icon('chevron', 'sm')} Hiện thêm · còn ${U.int(cur.length - lim)} kiện</button>` : '')
        : `<div class="lempty"><span class="tic" style="--gc:var(--g2)">${Icon('box')}</span><div>${pool.length ? 'Không có kiện nào khớp — thử "Tất cả kiện' + esc(ofGoi ? ' của gói' : '') + '" hoặc bỏ bớt bộ lọc'
          : noGoi ? 'Bạn chưa được sửa kiện nào' : 'Gói ' + esc(rec.Goi_thau) + ' chưa có kiện nào (hoặc bạn không được sửa kiện của gói này)'}</div></div>`;
      const more = $('[data-more]');
      if (more) more.onclick = () => { st.lim += PAGE; draw(); };
      drawBar(cur);
    };
    // Tick 1 kiện: chỉ đổi dòng đó + thanh dưới (không vẽ lại cả danh sách)
    $('#plist').addEventListener('change', e => {
      const box = e.target.closest('.prow'); if (!box || !e.target.classList.contains('pchk')) return;
      const k = box.dataset.id;
      if (e.target.checked) sel.add(k); else sel.delete(k);
      box.classList.toggle('on', e.target.checked);
      drawBar(cur);
    });
    const bulk = on => { cur.forEach(k => { if (on) sel.add(String(k.id)); else sel.delete(String(k.id)); }); draw(); drawPkl(); };
    $('[data-all]').onclick = () => bulk(true);
    $('[data-none]').onclick = () => bulk(false);
    App.main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      st.mode = b.dataset.mode; st.pkl = '*'; st.lim = PAGE;
      App.main.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
      drawPkl(); draw();
    });
    let qt = null;
    $('#pq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value; st.lim = PAGE; draw(); }, pool.length > 2000 ? 200 : 0); };

    $('[data-save]').onclick = async () => {
      const add = [...sel].filter(x => !orig.has(x)), del = [...orig].filter(x => !sel.has(x));
      if (!add.length && !del.length) return U.toast('Chưa thay đổi gì');
      const K = x => DB.get('KIEN', x);
      const moving = add.filter(x => { const k = K(x); return k && k[F] && String(k[F]) !== recId; }).length;
      const notes = [];
      if (add.length) notes.push(`Thêm ${U.int(add.length)} kiện vào ${title}.`);
      if (del.length) notes.push(`Bỏ ${U.int(del.length)} kiện khỏi ${title}.`);
      if (moving) notes.push(`⚠️ ${U.int(moving)} kiện đang thuộc biên bản ${A.verb} khác sẽ chuyển sang biên bản này.`);
      if (F === 'GIR') { const n = add.filter(x => !(K(x) || {}).MGMER).length; if (n) notes.push(`⚠️ ${U.int(n)} kiện chưa có biên bản kiểm đếm.`); }
      if (F === 'OSD') { const n = add.filter(x => !(K(x) || {}).GIR).length; if (n) notes.push(`⚠️ ${U.int(n)} kiện chưa mở kiện.`); }
      const loc = A.loc ? ($('#ploc').value || '').trim() : '';
      if (loc && add.length) notes.push(`Ghi vị trí "${loc}" cho ${U.int(add.length)} kiện mới chọn.`);
      if (!(await U.confirm(notes.join(' ')))) return;
      // Lưu nền (outbox.js): dữ liệu trên máy đổi ngay, quay về trang biên bản; gửi máy chủ chạy ngầm (ô "Đang lưu…" góc dưới)
      const rows = [...add.map(x => ({ id: x, [F]: rec.id })), ...del.map(x => ({ id: x, [F]: '' }))];
      const checks = loc && add.length ? add.map(x => ({ id: U.uid(), Kien: x, Ngay: U.isoOf(rec.Ngay) || U.today(), Vi_tri: loc, Tinh_trang: 'OK',
        Nguoi_KT: App.user.name || App.user.email, RFI: '', Ghi_chu: 'Ghi khi ' + A.verb + ' (' + title + ')', Hinh_anh: '' })) : [];
      // Biên bản chưa có gói: các kiện đã chọn cùng 1 gói → gán gói đó (để cán bộ / nhà thầu của gói thấy biên bản);
      // gán lỗi (vd gói đó đã có biên bản cùng số) thì chỉ báo, không coi cả lần lưu kiện là hỏng
      const gs = new Set([...sel].map(x => (K(x) || {}).Goi_thau).filter(Boolean));
      const goiOp = noGoi && gs.size === 1 ? [{ fn: 'update', t, rows: [{ [DB.keyField(t)]: rec.id, Goi_thau: [...gs][0] }], soft: true,
        note: 'Đã lưu kiện nhưng chưa gán được gói ' + [...gs][0] + ' cho ' + title }] : [];
      Outbox.push(`${title}: ${[add.length && '+' + U.int(add.length), del.length && '−' + U.int(del.length)].filter(Boolean).join(' ')} kiện`,
        [{ fn: 'updateMany', t: 'KIEN', rows }, { fn: 'addMany', t: 'KIEM_TRA', rows: checks }, ...goiOp]);
      orig.clear(); sel.forEach(x => orig.add(x));   // đã ghi → không hỏi lại khi rời trang
      location.replace('#/r/' + t + '/' + enc(rec.id));
    };
    drawPkl(); draw();
  };
})();
