// =====================================================================
//  TRANG TỔNG QUAN (mục DASH_VATTU — giữ khoá quyền cũ "Thống kê tổng")
//   • Thẻ "Bảng": mỗi kiện 1 dòng, gộp P1–P3 (thông tin kiện · MGMER · vị trí / tình trạng mới nhất · GIR · OSD);
//     chọn cột (bộ cột riêng của Tổng quan, lưu theo máy), lọc tự do theo cột, xuất Excel đúng phần đang lọc.
//   • Thẻ "Biểu đồ": trang Thống kê (dash.js).
//  Địa chỉ: #/i/DASH_VATTU · ?tab=bieudo · kèm bộ lọc cột (vd ?Goi_thau=T12&Phase=…)
// =====================================================================
(function () {
  const esc = U.esc;
  const O = (window.Overview = { state: { tab: 'bang', q: '', flt: {}, sort: { n: 'STT', dir: 1 } } });
  const VIEW = { key: 'TONG_QUAN', tcols: ['STT', 'Goi_thau', 'He_thong', 'Mo_ta', 'PKL_No', 'Package_No', 'Nha_cung_cap', 'KL_tinh', 'Phase',
    'MGMER', 'Ngay_dem', 'Vi_tri', 'Tinh_trang', 'Ngay_KT', 'GIR', 'Ngay_mo', 'OSD', 'Loai_OSD', 'Ghi_chu_OSD'] };
  const TAB_KEY = 'tcxl-tq-tab';

  O.render = async it => {
    const st = O.state;
    try { st.tab = localStorage.getItem(TAB_KEY) || st.tab; } catch (e) { /* bỏ qua */ }
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    if ([...qs.keys()].length) {
      if (qs.get('tab')) st.tab = qs.get('tab') === 'bieudo' ? 'bieudo' : 'bang';
      const f = {}; qs.forEach((v, k) => { if (k !== 'tab' && DB.field('KIEN', k)) f[k] = { vals: [v === '' || v === '(trống)' ? Grid.EMPTY : v] }; });
      if (Object.keys(f).length) { st.flt = f; st.tab = 'bang'; st.top = 0; }
      history.replaceState(null, '', '#/i/' + encodeURIComponent(it.key));
    }
    App.head(it.label, { back: true });
    const canTable = permTableLevel(App.user, 'KIEN') > 0;
    if (!canTable) st.tab = 'bieudo';
    App.main.innerHTML = `<div class="lbar otop">
        ${canTable ? `<div class="seg otabs"><button type="button" class="segb ${st.tab === 'bang' ? 'on' : ''}" data-tab="bang">${Icon('table', 'sm')}Bảng</button>
          <button type="button" class="segb ${st.tab === 'bieudo' ? 'on' : ''}" data-tab="bieudo">${Icon('chart', 'sm')}Biểu đồ</button></div>` : ''}
        <div class="otools" id="otools"></div></div>
      <div id="ohost"></div>`;
    App.main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      st.tab = b.dataset.tab; try { localStorage.setItem(TAB_KEY, st.tab); } catch (e) { /* bỏ qua */ }
      O.render(it);
    });
    const host = document.getElementById('ohost'), tools = document.getElementById('otools');
    if (st.tab === 'bieudo') { tools.innerHTML = ''; host.innerHTML = '<div class="loading"></div>'; return Dash.render(it, host); }
    host.innerHTML = '<div class="loading"></div>';
    await DB.loadDeps('KIEN');
    table(host, tools, st);
  };

  function table(host, tools, st) {
    const t = 'KIEN', L = SCHEMA.tables[t].list || {};
    tools.innerHTML = `<label class="lsearch">${Icon('search')}<input type="search" placeholder="Tìm trong tổng hợp: mô tả, PKL, số kiện, biên bản…" value="${esc(st.q)}"></label>
      <button type="button" class="btn ghost ladd" data-cols title="Chọn cột hiển thị, đổi thứ tự cột">${Icon('cols')}<span>Cột</span></button>
      <button type="button" class="btn ghost ladd" data-xlsx title="Xuất Excel các dòng đang hiện (theo bộ lọc)">${Icon('download')}<span>Xuất Excel</span></button>`;
    host.innerHTML = `<div class="lsum" id="lsum"></div><div class="gfbar" id="gfbar" hidden></div><div class="gwrap" id="grid"></div>`;
    let shown = [];
    const drawFbar = () => {
      const box = document.getElementById('gfbar'), act = Grid.active(st.flt);
      box.hidden = !act.length;
      box.innerHTML = `${Icon('filter', 'sm')}${act.map(n => `<button type="button" class="xchip" data-xf="${esc(n)}" title="Bỏ lọc cột này">${esc(Grid.short(DB.field(t, n).l))}: <b>${esc(Grid.summary(t, n, st.flt[n]))}</b> ${Icon('x', 'sm')}</button>`).join('')}
        ${act.length > 1 ? '<button type="button" class="linkbtn" data-xall>Xoá tất cả lọc</button>' : ''}`;
      box.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => { delete st.flt[b.dataset.xf]; st.top = 0; draw(); });
      const xa = box.querySelector('[data-xall]'); if (xa) xa.onclick = () => { st.flt = {}; st.top = 0; draw(); };
    };
    const drawSum = () => {
      const all = DB.rows(t).length;
      const tons = shown.filter(r => /^kg$/i.test(r.Don_vi_KL || 'Kg')).reduce((s, r) => s + U.num(r.KL_tinh), 0) / 1000;
      document.getElementById('lsum').innerHTML = `${Icon('table', 'sm')}<span><b>${U.int(shown.length)}</b> kiện · ${esc(new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(tons))} tấn
        ${shown.length < all || st.q ? `<span class="muted">· ${[st.q ? 'khớp "' + st.q + '"' : '', 'trong ' + U.int(all)].filter(Boolean).map(esc).join(' · ')}</span>` : ''}</span>`;
    };
    const draw = () => {
      drawFbar();
      const grid = document.getElementById('grid');
      shown = Grid.mount(grid, { t, st, view: VIEW, rows: Views.filterRows({ table: t }, st.q), onFilter: draw,
        empty: st.q || Grid.active(st.flt).length ? 'Không có kiện nào khớp — bỏ bớt bộ lọc' : 'Chưa có kiện nào' });
      drawSum();
      Grid.fit(grid); grid.dispatchEvent(new Event('scroll'));
    };
    let qt = null;
    tools.querySelector('.lsearch input').oninput = e => { st.q = e.target.value; st.top = 0; clearTimeout(qt); qt = setTimeout(draw, 220); };
    tools.querySelector('[data-cols]').onclick = () => Grid.chooser(t, draw, VIEW);
    tools.querySelector('[data-xlsx]').onclick = async e => {
      const b = e.currentTarget, html = b.innerHTML;
      if (!shown.length) return U.toast('Không có dòng nào để xuất');
      b.disabled = true; b.innerHTML = `${Icon('download')}<span>Đang xuất…</span>`;
      try { await exportXlsx(t, shown); U.toast(`Đã xuất ${U.int(shown.length)} kiện ra Excel`, 'ok'); }
      catch (er) { U.toast(er.message, 'err'); }
      finally { b.disabled = false; b.innerHTML = html; }
    };
    draw();
  }

  // Xuất Excel đúng các cột đang hiện, các dòng đang lọc / sắp xếp; ngày là ngày thật (dd/mm/yyyy), số là số
  async function exportXlsx(t, rows) {
    const ExcelJS = await Excel.lib();
    const cols = Grid.colsOf(t, VIEW);
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Tong quan', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    ws.columns = cols.map(c => ({ header: (c.f.l || c.l), key: c.n, width: Math.max(8, Math.round(Grid.width(t, c, VIEW) / 7)) }));
    rows.forEach(r => ws.addRow(Object.fromEntries(cols.map(c => {
      const f = c.f, v = c.n === '_badge' ? '' : DB.val(t, r, c.n);
      if (/^(date|datetime|expiry)$/.test(f.t)) { const d = U.parseDate(v); return [c.n, d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : '']; }
      if (/^(number|price)$/.test(f.t) && v !== '' && v != null && isFinite(U.num(v))) return [c.n, U.num(v)];
      return [c.n, Grid.text(t, r, c.n)];
    }))));
    cols.forEach((c, i) => { if (/^(date|datetime|expiry)$/.test(c.f.t)) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy'; });
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.alignment = { vertical: 'middle', wrapText: true }; h.height = 30;
    h.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E8A6B' } }; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'Tong quan vat tu ' + U.fmtDate(U.today()).replace(/\//g, '-') + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
})();
