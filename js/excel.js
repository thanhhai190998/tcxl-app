// =====================================================================
//  NHẬP / XUẤT EXCEL — mẫu cho 3 phase, tải lên, xem trước, ghi cả loạt, nhật ký + hoàn tác
//   P1 (KIEN)  : thêm kiện mới / sửa kiện có sẵn (cột A–P của file Total)
//   P2 (MGMER) : mẫu điền sẵn kiện của gói → điền số + ngày MGMER, vị trí lưu kho
//   P3 (GIR)   : mẫu điền sẵn kiện đã kiểm đếm → điền số + ngày GIR, OSD nếu có
//  Mỗi mẫu dành cho 1 gói thầu; sheet ẩn "_meta" ghi loại mẫu + gói + thứ tự cột → app không nhận nhầm file.
//  Thư viện ExcelJS tải từ cdnjs khi cần (chỉ ở trang này).
// =====================================================================
(function () {
  const esc = U.esc;
  const X = (window.Excel = { state: { m: 'KIEN', goi: '', scope: {} } });
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const MAGIC = 'TCXL', VER = '1', BLANK_ROWS = 1000, PAGE = 100;
  let libP = null;
  const lib = () => libP || (libP = new Promise((ok, no) => {
    if (window.ExcelJS) return ok(window.ExcelJS);
    const s = document.createElement('script');
    s.src = LIB; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.ExcelJS);
    s.onerror = () => { libP = null; s.remove(); no(new Error('Không tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại')); };
    document.head.appendChild(s);
  }));

  X.lib = lib;
  const rowLv = (t, r) => permRowLevel(App.user, t, r, (pt, k) => DB.get(pt, k));
  const norm = s => U.norm(String(s ?? '').trim()).replace(/\s+/g, ' ');
  const enumOpts = (t, n) => Views.enumOpts(t, DB.field(t, n));

  // ---------------- Định nghĩa 3 mẫu ----------------
  // c: k = khoá cột, h = tiêu đề, w = độ rộng, req = bắt buộc, type = number | date, list = danh sách chọn,
  //    other = được gõ giá trị ngoài danh sách, info = cột xám chỉ để xem (app không đọc), note = ghi chú ở tiêu đề
  const ID = { k: 'id', h: 'Mã kiện', w: 12, info: true, note: 'Mã do app cấp — KHÔNG sửa. Mẫu P1: để trống = kiện mới.' };
  const INFO = [
    { k: 'PKL_No', h: 'Số PKL', w: 11, info: true }, { k: 'Package_No', h: 'Số kiện (Package No.)', w: 22, info: true },
    { k: 'Mo_ta', h: 'Mô tả hàng', w: 34, info: true }, { k: 'He_thong', h: 'Hệ thống', w: 16, info: true }
  ];
  const ymd = d => (d ? U.isoOf(d) : '');
  const docOf = (t, id) => (id ? DB.get(t, id) : null);

  const TPL = {
    KIEN: {
      label: 'P1 · Nhập vật tư', short: 'P1-Nhap-vat-tu', sheet: 'Nhap vat tu', table: 'KIEN',
      desc: 'Thêm kiện mới theo thông báo của nhà thầu, hoặc sửa thông tin kiện đã có. Dòng có "Mã kiện" = sửa kiện đó; để trống = thêm kiện mới.',
      scopes: [{ v: 'empty', l: 'Mẫu trống (thêm kiện mới)' }, { v: 'all', l: 'Kèm kiện hiện có (để sửa)' }],
      pick: (k, sc) => sc === 'all',
      cols: () => [
        { ...ID, info: false, w: 12 },   // không có cột STT (No.): kiện mới được app tự cấp số tiếp theo khi nạp
        { k: 'To_may', h: 'Tổ máy (Unit)', w: 9, list: DB.field('KIEN', 'To_may').opts },
        { k: 'He_thong', h: 'Hệ thống (System)', w: 20, list: enumOpts('KIEN', 'He_thong'), other: true },
        { k: 'Goi_PM', h: 'Gói chia theo PM', w: 22 },
        { k: 'Hang_muc', h: 'Hạng mục (Sub-System/Assembly)', w: 24 },
        { k: 'Mo_ta', h: 'Mô tả hàng (Goods Description)', w: 40, req: true },
        { k: 'Ban_ve', h: 'Bản vẽ (Drawing)', w: 28 },
        { k: 'Nha_cung_cap', h: 'Nhà cung cấp (Supplier)', w: 18, list: enumOpts('KIEN', 'Nha_cung_cap'), other: true },
        { k: 'PKL_No', h: 'Số PKL (PKL No.)', w: 12 },
        { k: 'PSIC_No', h: 'Số PSIC', w: 10 },
        { k: 'Package_No', h: 'Số kiện (Package No.)', w: 22 },
        { k: 'DVT', h: 'Đơn vị (Unit)', w: 11, list: enumOpts('KIEN', 'DVT'), other: true },
        { k: 'So_luong', h: 'Số lượng', w: 9, type: 'number' },
        { k: 'Don_vi_KL', h: 'Đơn vị đo (Measure)', w: 10, list: DB.field('KIEN', 'Don_vi_KL').opts },
        { k: 'KL_tinh', h: 'Khối lượng tịnh (Net Weight)', w: 13, type: 'number' },
        { k: 'Ghi_chu', h: 'Ghi chú (Remarks)', w: 30 }
      ],
      fill: k => ({ ...k }),
      guide: ['Mỗi dòng là 1 kiện của gói ghi ở sheet Hướng dẫn.', 'Cột "Mã kiện": để trống khi thêm kiện mới; dòng đã có mã là kiện có sẵn — sửa các cột khác rồi tải lên để cập nhật.',
        'Cột có dấu * là bắt buộc. Cột có mũi tên chọn: chọn trong danh sách (Hệ thống, Nhà cung cấp, Đơn vị được gõ giá trị khác).',
        'Không cần đánh số thứ tự (STT / No.): kiện mới được app tự cấp số tiếp theo sau số lớn nhất đang có.',
        'Có thể dán thẳng từ packing list của nhà thầu vào đúng cột.']
    },
    MGMER: {
      label: 'P2 · Kiểm đếm', short: 'P2-Kiem-dem', sheet: 'Kiem dem', table: 'MGMER', field: 'MGMER',
      desc: 'Mẫu có sẵn danh sách kiện của gói. Điền số + ngày biên bản MGMER cho các kiện đã đếm; có thể ghi luôn vị trí lưu kho. Kiện chưa đếm thì để trống.',
      scopes: [{ v: 'p1', l: 'Kiện chưa kiểm đếm' }, { v: 'all', l: 'Tất cả kiện của gói' }],
      pick: (k, sc) => sc === 'all' || !k.MGMER,
      cols: () => [ID, ...INFO,
        { k: 'vt_now', h: 'Vị trí hiện tại', w: 14, info: true },
        { k: 'mg_so', h: 'Số MGMER', w: 12, note: 'Cùng 1 số = cùng 1 biên bản. Số đã có trong app thì dùng lại biên bản đó.' },
        { k: 'mg_ngay', h: 'Ngày kiểm đếm', w: 13, type: 'date', note: 'dd/mm/yyyy — bắt buộc khi là biên bản mới' },
        { k: 'vi_tri', h: 'Vị trí lưu kho', w: 16, list: enumOpts('KIEM_TRA', 'Vi_tri'), other: true, note: 'Không bắt buộc. Điền = ghi 1 lần kiểm tra vị trí mới.' },
        { k: 'tinh_trang', h: 'Tình trạng kiện', w: 14, list: enumOpts('KIEM_TRA', 'Tinh_trang'), other: true },
        { k: 'ngay_kt', h: 'Ngày kiểm tra vị trí', w: 13, type: 'date', note: 'Trống = lấy ngày kiểm đếm (hoặc hôm nay)' },
        { k: 'nguoi_kt', h: 'Người kiểm tra', w: 16 },
        { k: 'ghi_chu_kt', h: 'Ghi chú kiểm tra', w: 24 }],
      fill: k => { const m = docOf('MGMER', k.MGMER), c = SCHEMA.lastCheck(DB, k.id);
        return { ...k, vt_now: c ? [c.Vi_tri, c.Tinh_trang].filter(Boolean).join(' · ') : '', mg_so: m ? m.So : '', mg_ngay: m ? m.Ngay : '' }; },
      guide: ['Mỗi dòng là 1 kiện có sẵn trong app (cột xám chỉ để xem, không sửa).', 'Điền "Số MGMER" và "Ngày kiểm đếm" cho kiện đã đếm. Nhiều kiện cùng số = cùng 1 biên bản.',
        'Số MGMER đã có trong app → kiện được đưa vào biên bản đó (giữ ngày cũ).', 'Để trống = không đổi. Muốn bỏ kiện khỏi biên bản thì làm trong app (trang biên bản → Chọn kiện).',
        'Vị trí / tình trạng (không bắt buộc): mỗi dòng có điền sẽ thêm 1 lần kiểm tra vị trí cho kiện đó.']
    },
    GIR: {
      label: 'P3 · Mở kiện', short: 'P3-Mo-kien', sheet: 'Mo kien', table: 'GIR', field: 'GIR',
      desc: 'Mẫu có sẵn các kiện đã kiểm đếm của gói. Điền số + ngày biên bản mở kiện (GIR); nếu dư / thiếu / hỏng thì điền thêm số OSD.',
      scopes: [{ v: 'p2', l: 'Đã kiểm đếm, chưa mở' }, { v: 'arrived', l: 'Tất cả kiện đã kiểm đếm' }, { v: 'all', l: 'Tất cả kiện của gói' }],
      pick: (k, sc) => sc === 'all' || (k.MGMER && (sc === 'arrived' || !k.GIR)),
      cols: () => [ID, ...INFO,
        { k: 'mg_now', h: 'Số MGMER', w: 11, info: true },
        { k: 'gir_so', h: 'Số GIR', w: 12, note: 'Cùng 1 số = cùng 1 biên bản mở kiện. Số đã có trong app thì dùng lại.' },
        { k: 'gir_ngay', h: 'Ngày mở kiện', w: 13, type: 'date', note: 'dd/mm/yyyy — bắt buộc khi là biên bản mới' },
        { k: 'osd_so', h: 'Số OSD (nếu có)', w: 18, note: 'Chỉ điền khi kiện dư / thiếu / hư hỏng' },
        { k: 'osd_loai', h: 'Loại OSD', w: 16, list: DB.field('OSD', 'Loai').opts },
        { k: 'osd_nd', h: 'Nội dung OSD', w: 30 }],
      fill: k => { const m = docOf('MGMER', k.MGMER), g = docOf('GIR', k.GIR), o = docOf('OSD', k.OSD);
        return { ...k, mg_now: m ? m.So : '', gir_so: g ? g.So : '', gir_ngay: g ? g.Ngay : '', osd_so: o ? o.So : '', osd_loai: o ? o.Loai : '', osd_nd: o ? o.Noi_dung : '' }; },
      guide: ['Mỗi dòng là 1 kiện có sẵn trong app (cột xám chỉ để xem, không sửa).', 'Điền "Số GIR" và "Ngày mở kiện" cho kiện đã mở. Nhiều kiện cùng số = cùng 1 biên bản.',
        'Kiện dư / thiếu / hư hỏng: điền thêm "Số OSD", loại và nội dung — app tạo biên bản OSD (trạng thái Open) gắn với lần mở kiện.',
        'Để trống = không đổi.']
    }
  };

  // ---------------- Tải mẫu ----------------
  const goiRows = () => DB.rows('GOI_THAU').filter(g => rowLv('GOI_THAU', g) >= 1)
    .sort((a, b) => String(a.MaGoi).localeCompare(String(b.MaGoi), 'vi', { numeric: true }));
  const parcels = (goi, m, sc) => DB.rows('KIEN').filter(k => k.Goi_thau === goi && rowLv('KIEN', k) >= 1 && TPL[m].pick(k, sc))
    .sort((a, b) => (parseFloat(a.STT) || 1e9) - (parseFloat(b.STT) || 1e9));
  const utcDate = iso => { const d = U.parseDate(iso); return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null; };
  const colL = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

  // Dựng file mẫu → { buf, name, n }; download() lưu về máy
  async function build(m, goi, sc) {
    const ExcelJS = await lib(), T = TPL[m], cols = T.cols(), rows = parcels(goi, m, sc).map(T.fill);
    const wb = new ExcelJS.Workbook();
    wb.creator = App.user.email; wb.created = new Date();
    const ws = wb.addWorksheet(T.sheet, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    const dm = wb.addWorksheet('Danh muc'); dm.state = 'hidden';
    ws.columns = cols.map(c => ({ header: c.h + (c.req ? ' *' : ''), key: c.k, width: c.w }));
    rows.forEach(r => ws.addRow(cols.map(c => c.type === 'date' ? utcDate(r[c.k]) : r[c.k] === undefined ? '' : r[c.k])));
    const last = Math.max(rows.length + (m === 'KIEN' ? BLANK_ROWS : 0), 2) + 1;
    // Tiêu đề: cột nhập màu xanh, cột chỉ xem màu xám
    const head = ws.getRow(1); head.height = 34;
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.info ? 'FF64748B' : 'FF0E8A6B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      if (c.note) cell.note = c.note;
      const col = ws.getColumn(i + 1), L = colL(i + 1), rng = `${L}2:${L}${last}`;
      if (!c.type && !c.info) col.numFmt = '@';
      if (c.type === 'date') {
        col.numFmt = 'dd/mm/yyyy';
        ws.dataValidations.add(rng, { type: 'date', operator: 'greaterThan', allowBlank: true, showErrorMessage: true, formulae: [new Date(Date.UTC(2000, 0, 1))],
          errorTitle: 'Ngày chưa đúng', error: 'Nhập ngày dạng dd/mm/yyyy' });
      }
      if (c.list && c.list.length) {
        dm.getColumn(i + 1).values = [c.h, ...c.list];
        ws.dataValidations.add(rng, { type: 'list', allowBlank: true, formulae: [`'Danh muc'!$${L}$2:$${L}$${c.list.length + 1}`],
          showErrorMessage: !c.other, errorTitle: 'Giá trị không có trong danh sách', error: 'Chọn một giá trị trong danh sách' });
      }
      if (c.info) for (let r = 2; r <= rows.length + 1; r++) {
        const x = ws.getCell(r, i + 1);
        x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F6' } };
        x.font = { color: { argb: 'FF475569' } };
      }
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    // Hướng dẫn
    const g = wb.addWorksheet('Huong dan');
    g.getColumn(1).width = 110;
    const lines = [[`MẪU ${T.label.toUpperCase()} — GÓI ${goi}`, true], [`Tạo ngày ${U.fmtDate(U.today())} bởi ${App.user.name || App.user.email} · ${rows.length} kiện có sẵn trong mẫu`, false], ['', false],
      ...T.guide.map(s => ['• ' + s, false]), ['', false],
      ['• Ngày nhập dạng dd/mm/yyyy. Không đổi tên sheet, không xoá / đổi thứ tự cột, không sửa sheet ẩn.', false],
      ['• Xong thì vào app → Nhập / xuất Excel → bước 2 tải file lên. App sẽ cho xem trước từng dòng (thêm / cập nhật / lỗi) rồi mới ghi.', false]];
    lines.forEach(([t, b], i) => { const c = g.getCell(i + 1, 1); c.value = t; c.font = { bold: b, size: b ? 13 : 11 }; c.alignment = { wrapText: true }; });
    // Sheet ẩn nhận diện mẫu
    const meta = wb.addWorksheet('_meta'); meta.state = 'veryHidden';
    meta.getRow(1).values = [MAGIC, m, goi, VER, U.today()];
    meta.getRow(2).values = cols.map(c => c.k);
    const buf = await wb.xlsx.writeBuffer();
    return { buf, name: `TCXL_${T.short}_${goi}_${U.today().replace(/-/g, '')}.xlsx`, n: rows.length };
  }
  async function download(m, goi, sc) {
    const { buf, name, n } = await build(m, goi, sc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { name, n };
  }

  // ---------------- Đọc file ----------------
  const cellVal = v => {
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if (v.result !== undefined) return cellVal(v.result);
      if (v.richText) return v.richText.map(x => x.text).join('');
      if (v.text !== undefined) return cellVal(v.text);
      return '';
    }
    return v;
  };
  const asText = v => v instanceof Date ? ymd(v) : String(v ?? '').trim();
  // Ngày: ô ngày của Excel (giờ UTC), số seri, hoặc chữ dd/mm/yyyy → yyyy-mm-dd; null = sai
  const asDate = v => {
    if (v === '' || v == null) return '';
    if (v instanceof Date) return isNaN(v) ? null : `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    if (typeof v === 'number') return v > 20000 && v < 80000 ? asDate(new Date(Math.round((v - 25569) * 86400000))) : null;
    const s = String(v).trim(); if (!s) return '';
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/), d = m ? new Date(+m[3], m[2] - 1, +m[1]) : U.parseDate(s);
    if (!d || isNaN(d) || (m && (d.getDate() !== +m[1] || d.getMonth() !== m[2] - 1))) return null;
    return U.iso(d);
  };
  // Số: 1234 / 1234.5 / 1.234,5 (kiểu Việt) → số; null = sai
  const asNum = v => {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') return v;
    let s = String(v).trim().replace(/\s/g, ''); if (!s) return '';
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.');
    const n = Number(s); return isNaN(n) ? null : n;
  };

  async function readFile(file, m) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ nhận file .xlsx (Excel). File .xls cũ: mở bằng Excel rồi Lưu thành .xlsx.');
    if (file.size > 20 * 1048576) throw new Error('File lớn hơn 20 MB');
    const ExcelJS = await lib(), wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(await file.arrayBuffer()); } catch (e) { throw new Error('Không đọc được file — file hỏng hoặc không phải Excel .xlsx'); }
    const meta = wb.getWorksheet('_meta');
    const mv = meta ? meta.getRow(1).values.slice(1).map(x => asText(cellVal(x))) : [];
    if (mv[0] !== MAGIC) {
      const full = wb.getWorksheet('Full'), h = full ? full.getRow(3).values.map(x => asText(cellVal(x))) : [];
      if (h[1] === 'No.' && /restart phase/i.test(h[5] || '')) {   // file Total 28 cột ("Goods delivered to Site")
        const e = new Error('Đây là file Total 28 cột ("Goods delivered to Site") — file này nạp ở thẻ "File Total 28 cột", không phải ở mẫu ' + TPL[m].label + '.');
        e.code = 'TOTAL'; throw e;
      }
      throw new Error('File này không phải mẫu tải từ app (thiếu sheet nhận diện). Hãy tải mẫu ở bước 1 rồi điền vào đó.');
    }
    if (mv[1] !== m) throw new Error(`Đây là mẫu "${(TPL[mv[1]] || {}).label || mv[1]}", không phải "${TPL[m].label}". Chọn đúng loại mẫu ở trên rồi tải lên lại.`);
    const goi = mv[2], keys = meta.getRow(2).values.slice(1).map(x => asText(cellVal(x)));
    const ws = wb.getWorksheet(TPL[m].sheet) || wb.worksheets.find(w => w.state === 'visible');
    if (!ws) throw new Error('Không thấy sheet nhập liệu "' + TPL[m].sheet + '"');
    const cols = TPL[m].cols(), byKey = new Map(cols.map(c => [c.k, c]));
    const heads = ws.getRow(1).values.slice(1).map(x => asText(cellVal(x)).replace(/\s*\*$/, ''));
    keys.forEach((k, i) => {
      const c = byKey.get(k);
      if (c && heads[i] !== c.h) throw new Error(`Cột ${colL(i + 1)} phải là "${c.h}" nhưng file ghi "${heads[i] || '(trống)'}" — có thể cột đã bị xoá / đổi chỗ. Hãy tải mẫu mới.`);
    });
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), o = { _no: r };
      let any = false;
      keys.forEach((k, i) => { const v = cellVal(row.getCell(i + 1).value); o[k] = v; if (asText(v) !== '' && !(byKey.get(k) || {}).info) any = true; });
      if (any || (m !== 'KIEN' && asText(o.id))) rows.push(o);
    }
    return { goi, rows, created: mv[4] };
  }

  // ---------------- Kiểm tra + lập kế hoạch ghi ----------------
  // Mỗi dòng → { no, st: new | upd | same | skip | err, id, title, sub, msgs[], warns[], chg[] }
  const LBL = { STT: 'STT', To_may: 'Tổ máy', He_thong: 'Hệ thống', Goi_PM: 'Gói PM', Hang_muc: 'Hạng mục', Mo_ta: 'Mô tả', Ban_ve: 'Bản vẽ', Nha_cung_cap: 'Nhà cung cấp',
    PKL_No: 'PKL', PSIC_No: 'PSIC', Package_No: 'Số kiện', DVT: 'Đơn vị', So_luong: 'Số lượng', Don_vi_KL: 'Đơn vị đo', KL_tinh: 'KL tịnh', Ghi_chu: 'Ghi chú' };
  const show = (k, v) => v === '' || v == null ? '(trống)' : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? U.fmtDate(v) : String(v);
  // Giá trị trong danh sách: khớp không phân biệt hoa/thường, dấu cách → dùng đúng cách viết đã có (tránh "KSB" / "KSB ")
  const canon = (list, v) => { const n = norm(v); return n ? (list.find(o => norm(o) === n) || String(v).trim()) : ''; };

  function plan(m, file) {
    const T = TPL[m], goi = file.goi, cols = T.cols(), out = [], seen = new Map();
    const kienOk = k => k && k.Goi_thau === goi && rowLv('KIEN', k) >= 2;
    const base = (r, k) => ({ no: r._no, id: k ? k.id : '', title: k ? DB.title('KIEN', k) : asText(r.Mo_ta) || '(chưa có mô tả)', sub: k ? DB.sub('KIEN', k) : '', msgs: [], warns: [], chg: [] });
    const needKien = (r, x) => {
      const id = asText(r.id), k = id && DB.get('KIEN', id);
      if (!id) x.msgs.push('Thiếu mã kiện (cột A) — dòng này không phải từ mẫu');
      else if (!k) x.msgs.push('Không tìm thấy kiện mã ' + id);
      else if (k.Goi_thau !== goi) x.msgs.push(`Kiện ${id} thuộc gói ${k.Goi_thau}, không phải gói ${goi} của mẫu`);
      else if (!kienOk(k)) x.msgs.push('Bạn không có quyền sửa kiện này');
      else if (seen.has(id)) x.msgs.push(`Trùng kiện với dòng ${seen.get(id)}`);
      if (id) seen.set(id, r._no);
      return x.msgs.length ? null : k;
    };
    // Biên bản theo số: dùng lại biên bản có sẵn cùng gói, hoặc gom thành biên bản mới (các dòng cùng số phải cùng ngày)
    const docs = { MGMER: new Map(), GIR: new Map(), OSD: new Map() };
    const doc = (t, so, ngay, x, extra) => {
      const key = norm(so), have = DB.rows(t).find(d => d.Goi_thau === goi && norm(d.So) === key);
      let d = docs[t].get(key);
      if (!d) {
        d = have ? { t, so: have.So, id: have.id, ngay: have.Ngay, isNew: false, rows: [] } : { t, so: String(so).trim(), id: null, ngay: ngay || '', isNew: true, rows: [], ...extra };
        if (!have && !ngay) { x.msgs.push(`${t} "${so}" chưa có trong app — cần điền ngày`); return null; }
        docs[t].set(key, d);
      } else if (d.isNew && ngay && d.ngay && ngay !== d.ngay) { x.msgs.push(`${t} "${so}" có ngày ${U.fmtDate(d.ngay)} ở dòng ${d.rows[0]}, dòng này ghi ${U.fmtDate(ngay)}`); return null; }
      else if (d.isNew && !d.ngay && ngay) d.ngay = ngay;
      if (!d.isNew && ngay && ngay !== ymd(d.ngay)) x.warns.push(`${t} ${d.so} đã có trong app với ngày ${U.fmtDate(d.ngay)} — giữ ngày cũ`);
      d.rows.push(x.no);
      return d;
    };

    for (const r of file.rows) {
      if (m === 'KIEN') {
        const id = asText(r.id), k = id ? DB.get('KIEN', id) : null, x = base(r, k);
        if (id) { if (!k) x.msgs.push('Không tìm thấy kiện mã ' + id); else if (k.Goi_thau !== goi) x.msgs.push(`Kiện ${id} thuộc gói ${k.Goi_thau}`); else if (!kienOk(k)) x.msgs.push('Bạn không có quyền sửa kiện này'); else if (seen.has(id)) x.msgs.push(`Trùng mã kiện với dòng ${seen.get(id)}`); seen.set(id, r._no); }
        const v = {};
        for (const c of cols) {
          if (c.k === 'id') continue;
          let val = r[c.k];
          if (c.type === 'number') { val = asNum(val); if (val === null) { x.msgs.push(`"${c.h}" không phải số: ${asText(r[c.k])}`); continue; } }
          else val = asText(val);
          if (c.list && val !== '') {
            const cv = canon(c.list, val);
            if (!c.other && !c.list.includes(cv)) { x.msgs.push(`"${c.h}" phải là một trong: ${c.list.join(', ')}`); continue; }
            val = cv;
          }
          if (c.req && val === '') x.msgs.push(`Thiếu "${c.h}"`);
          v[c.k] = val;
        }
        if (k && !x.msgs.length) {
          Object.keys(v).forEach(f => { const o = k[f] ?? ''; if (String(o) !== String(v[f])) x.chg.push({ f, o, n: v[f], l: LBL[f] || f }); });
          x.st = x.chg.length ? 'upd' : 'same';
        } else if (!k && !x.msgs.length) {
          x.st = 'new'; x.sub = [v.PKL_No && 'PKL ' + v.PKL_No, v.Package_No && 'Kiện ' + v.Package_No, v.He_thong].filter(Boolean).join(' · ');
          const dupKey = v.PKL_No && v.Package_No && v.Package_No !== 'N/A' ? norm(v.PKL_No) + '|' + norm(v.Package_No) : '';
          if (dupKey) {
            const ex = DB.rows('KIEN').find(o => o.Goi_thau === goi && norm(o.PKL_No) + '|' + norm(o.Package_No) === dupKey);
            if (ex) x.warns.push(`Có thể trùng kiện đã có ${ex.id} (cùng PKL + số kiện)`);
            if (seen.has('dup:' + dupKey)) x.warns.push(`Trùng PKL + số kiện với dòng ${seen.get('dup:' + dupKey)}`);
            seen.set('dup:' + dupKey, r._no);
          }
        }
        if (x.msgs.length) x.st = 'err';
        x.data = v;
        out.push(x);
        continue;
      }
      const x0 = base(r, null), k = needKien(r, x0), x = k ? base(r, k) : x0;
      if (!k) { x.st = 'err'; out.push(x); continue; }

      if (m === 'MGMER') {
        const so = asText(r.mg_so), ng = asDate(r.mg_ngay), ngKt = asDate(r.ngay_kt);
        if (ng === null) x.msgs.push('"Ngày kiểm đếm" chưa đúng dạng dd/mm/yyyy: ' + asText(r.mg_ngay));
        if (ngKt === null) x.msgs.push('"Ngày kiểm tra vị trí" chưa đúng dạng dd/mm/yyyy: ' + asText(r.ngay_kt));
        if (!so && ng) x.msgs.push('Có ngày kiểm đếm nhưng thiếu số MGMER');
        let d = null;
        if (so && !x.msgs.length) d = doc('MGMER', so, ng, x, {});
        const cur = docOf('MGMER', k.MGMER);
        if (d && !(cur && !d.isNew && String(cur.id) === String(d.id))) {
          if (cur) x.warns.push(`Chuyển từ MGMER ${cur.So} sang MGMER ${d.so}`);
          x.chg.push({ f: 'MGMER', o: cur ? cur.So : '', n: d.so + (d.isNew ? ' (mới)' : ''), l: 'MGMER' });
          x.doc = d;
        }
        const vt = asText(r.vi_tri), tt = asText(r.tinh_trang);
        if ((vt || tt) && !x.msgs.length) {
          x.check = { Vi_tri: canon(enumOpts('KIEM_TRA', 'Vi_tri'), vt), Tinh_trang: canon(enumOpts('KIEM_TRA', 'Tinh_trang'), tt) || 'OK',
            Ngay: ngKt || (d && (ng || ymd(d.ngay))) || ymd(cur && cur.Ngay) || U.today(), Nguoi_KT: asText(r.nguoi_kt) || App.user.name || App.user.email, Ghi_chu: asText(r.ghi_chu_kt) };
          x.chg.push({ f: 'vt', o: '', n: [x.check.Vi_tri, x.check.Tinh_trang].filter(Boolean).join(' · ') + ' (' + U.fmtDate(x.check.Ngay) + ')', l: 'Vị trí' });
        }
      } else if (m === 'GIR') {
        const so = asText(r.gir_so), ng = asDate(r.gir_ngay), oso = asText(r.osd_so);
        if (ng === null) x.msgs.push('"Ngày mở kiện" chưa đúng dạng dd/mm/yyyy: ' + asText(r.gir_ngay));
        if (!so && ng) x.msgs.push('Có ngày mở kiện nhưng thiếu số GIR');
        const osdTypes = DB.field('OSD', 'Loai').opts, loai = asText(r.osd_loai) && canon(osdTypes, r.osd_loai);
        if (loai && !osdTypes.includes(loai)) x.msgs.push('"Loại OSD" phải là một trong: ' + osdTypes.join(', '));
        if (!oso && (loai || asText(r.osd_nd))) x.msgs.push('Có loại / nội dung OSD nhưng thiếu số OSD');
        let d = null;
        if (so && !x.msgs.length) d = doc('GIR', so, ng, x, {});
        const cur = docOf('GIR', k.GIR);
        if (d && !(cur && !d.isNew && String(cur.id) === String(d.id))) {
          if (cur) x.warns.push(`Chuyển từ GIR ${cur.So} sang GIR ${d.so}`);
          if (!k.MGMER) x.warns.push('Kiện chưa có biên bản kiểm đếm (MGMER)');
          x.chg.push({ f: 'GIR', o: cur ? cur.So : '', n: d.so + (d.isNew ? ' (mới)' : ''), l: 'GIR' });
          x.doc = d;
          if (d.isNew) (d.mg = d.mg || new Set()).add(String(k.MGMER || ''));
        }
        if (oso && !x.msgs.length) {
          const girD = d || (cur ? { id: cur.id, ngay: cur.Ngay } : null);
          if (!girD) x.warns.push('Có OSD nhưng kiện chưa có biên bản mở kiện (GIR)');
          const od = doc('OSD', oso, (d && (ng || ymd(d.ngay))) || ymd(cur && cur.Ngay) || U.today(), x, { loai, nd: asText(r.osd_nd), gir: girD });
          const curO = docOf('OSD', k.OSD);
          if (od && !(curO && !od.isNew && String(curO.id) === String(od.id))) {
            x.chg.push({ f: 'OSD', o: curO ? curO.So : '', n: od.so + (od.isNew ? ' (mới)' : ''), l: 'OSD' });
            x.osd = od;
          }
        }
      }
      x.st = x.msgs.length ? 'err' : x.chg.length ? 'upd' : 'same';
      if (x.st === 'err') { x.chg = []; x.doc = x.osd = x.check = null; }
      out.push(x);
    }
    // Biên bản mới mà mọi dòng của nó đều lỗi → không tạo
    const used = new Set(out.filter(x => x.st === 'upd').flatMap(x => [x.doc, x.osd]).filter(Boolean));
    const newDocs = [...docs.MGMER.values(), ...docs.GIR.values(), ...docs.OSD.values()].filter(d => d.isNew && used.has(d));
    const oldDocs = [...docs.MGMER.values(), ...docs.GIR.values(), ...docs.OSD.values()].filter(d => !d.isNew && used.has(d));
    const cnt = st => out.filter(x => x.st === st).length;
    return { m, goi, rows: out, newDocs, oldDocs, n: { new: cnt('new'), upd: cnt('upd'), same: cnt('same'), err: cnt('err'), warn: out.filter(x => x.warns.length && x.st !== 'err').length } };
  }

  // ---------------- Ghi vào app ----------------
  async function apply(P, fileName, step) {
    const add = {}, upd = {}, now = new Date();
    const note = 'Tạo từ file Excel ' + fileName;
    // 1. Biên bản mới
    for (const t of ['MGMER', 'GIR', 'OSD']) {
      const ds = P.newDocs.filter(d => d.t === t); if (!ds.length) continue;
      ds.forEach(d => { d.id = U.uid(); });
      const rows = ds.map(d => t === 'MGMER' ? { id: d.id, So: d.so, Ngay: d.ngay, Goi_thau: P.goi, Dia_diem: 'Tại công trường', Thanh_phan: '', File: '', Thu_muc: '', Ghi_chu: note }
        : t === 'GIR' ? { id: d.id, So: d.so, Ngay: d.ngay, Goi_thau: P.goi, MGMER: d.mg && d.mg.size === 1 ? [...d.mg][0] : '', Thanh_phan: '', File: '', Ghi_chu: note }
        : { id: d.id, So: d.so, Ngay: d.ngay, Goi_thau: P.goi, GIR: d.gir ? d.gir.id : '', Loai: d.loai || '', Noi_dung: d.nd || '', Trang_thai: 'Open', Ngay_dong: '', File: '' });
      step('Đang tạo ' + ds.length + ' biên bản ' + t + '…');
      await DB.addMany(t, rows);
      add[t] = rows.map(r => r.id);
    }
    // 2. Kiện: thêm mới / cập nhật (giữ giá trị cũ để hoàn tác)
    const ok = P.rows.filter(x => x.st === 'new' || x.st === 'upd');
    if (P.m === 'KIEN') {
      // Kiện mới: cột để trống mà schema có giá trị mặc định (vd Số lượng 1, Đơn vị đo Kg) → điền mặc định
      const init = SCHEMA.tables.KIEN.fields.filter(f => f.init != null && f.init !== 'today' && !f.v);
      const news = ok.filter(x => x.st === 'new').map(x => {
        const r = { id: U.uid(), Goi_thau: P.goi, MGMER: '', GIR: '', OSD: '', ...x.data };
        init.forEach(f => { if (r[f.n] === '' || r[f.n] == null) r[f.n] = f.init; });
        return r;
      });
      if (news.length) { step('Đang thêm ' + news.length + ' kiện…'); await DB.addMany('KIEN', news, (d, n) => step(`Đang thêm kiện ${d}/${n}…`)); add.KIEN = news.map(r => r.id); }
      const ups = ok.filter(x => x.st === 'upd');
      if (ups.length) {
        upd.KIEN = ups.map(x => ({ id: x.id, old: Object.fromEntries(x.chg.map(c => [c.f, c.o])), now: Object.fromEntries(x.chg.map(c => [c.f, c.n])) }));
        step('Đang cập nhật ' + ups.length + ' kiện…');
        await DB.updateMany('KIEN', upd.KIEN.map(u => ({ id: u.id, ...u.now })), (d, n) => step(`Đang cập nhật kiện ${d}/${n}…`));
      }
    } else {
      const ups = ok.filter(x => x.doc || x.osd).map(x => {
        const k = DB.get('KIEN', x.id), now = {}, old = {};
        if (x.doc) { now[P.m] = x.doc.id; old[P.m] = k[P.m] || ''; }
        if (x.osd) { now.OSD = x.osd.id; old.OSD = k.OSD || ''; }
        return { id: x.id, old, now };
      });
      if (ups.length) {
        upd.KIEN = ups;
        step('Đang cập nhật ' + ups.length + ' kiện…');
        await DB.updateMany('KIEN', ups.map(u => ({ id: u.id, ...u.now })), (d, n) => step(`Đang cập nhật kiện ${d}/${n}…`));
      }
      const checks = ok.filter(x => x.check).map(x => ({ id: U.uid(), Kien: x.id, ...x.check, RFI: '', Hinh_anh: '', Ghi_chu: [x.check.Ghi_chu, note].filter(Boolean).join(' · ') }));
      if (checks.length) { step('Đang ghi ' + checks.length + ' lần kiểm tra vị trí…'); await DB.addMany('KIEM_TRA', checks); add.KIEM_TRA = checks.map(r => r.id); }
    }
    // 3. Nhật ký
    const log = { id: U.uid(), Thoi_gian: U.toLocalInput(now).replace('T', ' '), Nguoi: App.user.name || App.user.email, Mau: TPL[P.m].label, Goi_thau: P.goi, Ten_file: fileName,
      So_moi: (add.KIEN || []).length, So_cap_nhat: (upd.KIEN || []).length, So_bien_ban: ['MGMER', 'GIR', 'OSD'].reduce((s, t) => s + (add[t] || []).length, 0),
      So_vi_tri: (add.KIEM_TRA || []).length, So_bo_qua: P.n.err, Trang_thai: 'Đã ghi', Hoan_tac: JSON.stringify({ add, upd }) };
    await DB.add('NHAP_EXCEL', log);
    return log;
  }

  // Hoàn tác cả lô: xoá những gì đã thêm, trả kiện về giá trị cũ
  const undoRaw = async log => String(log.Hoan_tac || '').startsWith('file:') ? API.undoData(log.id) : (log.Hoan_tac || '{}');
  async function undo(log, step) {
    step('Đang đọc dữ liệu hoàn tác…');
    const h = JSON.parse(await undoRaw(log)), add = h.add || {}, upd = h.upd || {};
    if ((add.KIEM_TRA || []).length) { step('Đang xoá ' + add.KIEM_TRA.length + ' lần kiểm tra vị trí…'); await DB.removeMany('KIEM_TRA', add.KIEM_TRA.filter(x => DB.get('KIEM_TRA', x))); }
    for (const t of ['KIEN', 'MGMER', 'GIR', 'OSD', 'KIEM_TRA']) {
      const us = (upd[t] || []).filter(u => DB.get(t, u.id)); if (!us.length) continue;
      step('Đang trả ' + us.length + ' dòng ' + t + ' về giá trị cũ…');
      await DB.updateMany(t, us.map(u => ({ [DB.keyField(t)]: u.id, ...u.old })));
    }
    if ((add.KIEN || []).length) {
      const live = add.KIEN.filter(x => DB.get('KIEN', x)), used = new Set(DB.rows('KIEM_TRA').map(r => String(r.Kien)));
      const keep = live.filter(x => used.has(String(x)));   // kiện mới đã có người ghi vị trí sau đó → giữ lại
      step('Đang xoá ' + (live.length - keep.length) + ' kiện đã thêm…');
      await DB.removeMany('KIEN', live.filter(x => !keep.includes(x)));
      h.kept = (h.kept || []).concat(keep);
    }
    for (const t of ['OSD', 'GIR', 'MGMER']) {
      if (!(add[t] || []).length) continue;
      const refBy = new Set(DB.rows('KIEN').map(k => String(k[t] || '')).concat(t === 'GIR' ? DB.rows('OSD').map(o => String(o.GIR || '')) : [], t === 'MGMER' ? DB.rows('GIR').map(g => String(g.MGMER || '')) : []));
      const live = add[t].filter(x => DB.get(t, x)), keep = live.filter(x => refBy.has(String(x)));   // biên bản đã được dùng tiếp → giữ
      step('Đang xoá biên bản ' + t + '…');
      await DB.removeMany(t, live.filter(x => !keep.includes(x)));
      h.kept = (h.kept || []).concat(keep);
    }
    if ((add.GOI_THAU || []).length) {
      const used = new Set(DB.rows('KIEN').map(k => String(k.Goi_thau)));
      const live = add.GOI_THAU.filter(x => DB.get('GOI_THAU', x)), keep = live.filter(x => used.has(String(x)));
      if (live.length > keep.length) { step('Đang xoá gói thầu đã tạo…'); await DB.removeMany('GOI_THAU', live.filter(x => !keep.includes(x))); }
      h.kept = (h.kept || []).concat(keep);
    }
    await DB.update('NHAP_EXCEL', { id: log.id, Trang_thai: 'Đã hoàn tác' });
    return (h.kept || []).length;
  }
  // Kiện đã bị sửa tiếp sau lần nhập (hoàn tác sẽ ghi đè)
  const changedAfter = log => {
    if (String(log.Hoan_tac || '').startsWith('file:')) return 0;   // lần nhập lớn: không kiểm tra trước (dữ liệu nằm ở file Drive)
    const h = JSON.parse(log.Hoan_tac || '{}');
    return ((h.upd || {}).KIEN || []).filter(u => { const k = DB.get('KIEN', u.id); return k && Object.keys(u.now).some(f => String(k[f] ?? '') !== String(u.now[f] ?? '')); }).length;
  };

  // ---------------- Màn hình ----------------
  X.render = async it => {
    App.head(it.label, { back: true });
    App.loading();
    const ts = ['GOI_THAU', 'KIEN', 'MGMER', 'GIR', 'OSD', 'KIEM_TRA', 'NHAP_EXCEL'];
    const MODS = [...Object.entries(TPL).map(([k, t]) => [k, t.label]), ['TOTAL', 'File Total 28 cột']];
    await Promise.all(ts.map(t => DB.loadDeps(t).catch(() => {})));
    lib().catch(() => {});   // tải sẵn thư viện ở nền
    const st = X.state, qs = new URLSearchParams(location.hash.split('?')[1] || '');
    if (qs.get('m') && (TPL[qs.get('m')] || qs.get('m') === 'TOTAL')) { st.m = qs.get('m'); st.touched = true; history.replaceState(null, '', '#/i/' + it.key); }
    // App chưa có kiện nào (Sheet mới) → quản trị viên thấy thẻ File Total trước
    if (!st.touched && App.user.admin && !DB.rows('KIEN').length) st.m = 'TOTAL';
    const goiL = goiRows();
    if (!goiL.some(g => g.MaGoi === st.goi)) st.goi = (goiL.find(g => DB.rows('KIEN').some(k => k.Goi_thau === g.MaGoi)) || goiL[0] || {}).MaGoi || '';
    const canUp = App.user.admin || Perm.rank((App.user.quyen || {}).EXCEL) === 2;
    let P = null, fileName = '', view = { f: 'all', lim: PAGE };
    App.guard = async () => !(P || TP) || U.confirm('Bỏ file đang xem trước (chưa ghi vào app)?');

    const paint = () => {
      if (st.m === 'TOTAL') return paintTotal();
      const T = TPL[st.m], sc = st.scope[st.m] || T.scopes[0].v;
      const n = st.goi ? parcels(st.goi, st.m, sc).length : 0;
      App.main.innerHTML = `<div class="xwrap">
        ${modsHtml()}
        <section class="card xstep"><div class="fsec"><span class="xn">1</span>Tải mẫu Excel</div>
          <p class="muted small">${esc(T.desc)}</p>
          ${goiL.length ? `<div class="fld"><span class="lbl">Gói thầu</span><div class="seg" data-goi>${goiL.map(g => `<button type="button" class="segb ${g.MaGoi === st.goi ? 'on' : ''}" data-v="${esc(g.MaGoi)}">${esc(g.MaGoi)}</button>`).join('')}</div></div>
          <div class="fld"><span class="lbl">${st.m === 'KIEN' ? 'Nội dung mẫu' : 'Kiện đưa vào mẫu'}</span><div class="seg" data-sc>${T.scopes.map(s => `<button type="button" class="segb ${s.v === sc ? 'on' : ''}" data-v="${s.v}">${esc(s.l)}</button>`).join('')}</div></div>
          <div class="xact"><button type="button" class="btn" data-dl>${Icon('download')} Tải mẫu</button>
            <span class="muted small">${st.m === 'KIEN' && sc === 'empty' ? 'Mẫu trống, sẵn ' + U.int(BLANK_ROWS) + ' dòng để điền' : U.int(n) + ' kiện của gói ' + esc(st.goi) + ' sẽ có sẵn trong mẫu'}</span></div>`
          : `<div class="empty">${App.user.admin ? 'Chưa có gói thầu nào trong app. Nạp file Total ở thẻ <b>File Total 28 cột</b> (tự tạo các gói) hoặc thêm gói ở mục Gói thầu.'
            : 'Bạn chưa được xem gói thầu nào — liên hệ quản trị viên.'}</div>`}
        </section>
        <section class="card xstep"><div class="fsec"><span class="xn">2</span>Điền rồi tải lên — xem trước trước khi ghi</div>
          ${canUp ? `<label class="upbox xdrop" id="xdrop">${Icon('upload')}<span><b>Chọn file .xlsx</b> hoặc kéo thả vào đây</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden id="xfile"></label>
            <div id="xprev"></div>` : '<div class="muted small">Bạn chỉ có quyền tải mẫu — cần quyền "Sửa" ở mục Nhập / xuất Excel để tải file lên.</div>'}
        </section>
        <section class="card xstep"><div class="fsec"><span class="xn">${Icon('clock', 'sm')}</span>Lịch sử nhập</div><div id="xlog"></div></section>
      </div>`;
      const $ = s => App.main.querySelector(s);
      bindMods();
      const segGoi = $('[data-goi]'), segSc = $('[data-sc]');
      if (segGoi) segGoi.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; st.goi = b.dataset.v; paint(); };
      if (segSc) segSc.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; st.scope[st.m] = b.dataset.v; paint(); };
      const dl = $('[data-dl]');
      if (dl) dl.onclick = async () => {
        const lbl = dl.innerHTML; dl.disabled = true; dl.textContent = 'Đang tạo file…';
        try { const r = await download(st.m, st.goi, sc); U.toast(`Đã tải ${r.name} (${U.int(r.n)} kiện)`, 'ok'); }
        catch (e) { U.toast(e.message, 'err'); }
        dl.disabled = false; dl.innerHTML = lbl;
      };
      if (canUp) {
        const inp = $('#xfile'), drop = $('#xdrop');
        inp.onchange = () => { if (inp.files[0]) load(inp.files[0]); inp.value = ''; };
        ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('on')));
        drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); });
      }
      drawPrev(); drawLog();
    };

    function modsHtml() {
      return `<div class="seg xmods">${MODS.map(([k, l]) => `<button type="button" class="segb ${k === st.m ? 'on' : ''}" data-m="${k}">${esc(l)}</button>`).join('')}</div>`;
    }
    function bindMods() {
      App.main.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
        if ((P || TP) && !(await U.confirm('Bỏ file đang xem trước?'))) return;
        P = null; TP = null; TSRC = null; st.m = b.dataset.m; st.touched = true; paint();
      });
    }

    // ----- File Total 28 cột: xuất (ai có quyền Excel) + đồng bộ (quản trị viên) -----
    let TSRC = null, TP = null;
    const demo = window.APP_CONFIG.mode === 'demo';
    st.tx = st.tx || { goi: '', mode: 'all', empty: demo };
    function paintTotal() {
      const goiK = [...new Set(DB.rows('KIEN').map(k => k.Goi_thau))].filter(g => goiRows().some(x => x.MaGoi === g)).sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
      const n = DB.rows('KIEN').filter(k => (!st.tx.goi || k.Goi_thau === st.tx.goi) && rowLv('KIEN', k) >= 1).length;
      App.main.innerHTML = `<div class="xwrap">${modsHtml()}
        <section class="card xstep"><div class="fsec"><span class="xn">${Icon('download', 'sm')}</span>Xuất danh sách kiện (mẫu 28 cột)</div>
          <p class="muted small">Tạo <b>file Excel mới</b> đúng bố cục file "Goods delivered to Site" (cột A–AB) từ dữ liệu trong app.
            Ngày kiểm đếm / mở kiện lấy từ biên bản; vị trí, tình trạng (X–AB) lấy lần kiểm tra mới nhất.</p>
          <div class="fld"><span class="lbl">Gói thầu</span><div class="seg" data-tgoi><button type="button" class="segb ${!st.tx.goi ? 'on' : ''}" data-v="">Tất cả</button>
            ${goiK.map(g => `<button type="button" class="segb ${g === st.tx.goi ? 'on' : ''}" data-v="${esc(g)}">${esc(g)}</button>`).join('')}</div></div>
          <div class="xact"><button type="button" class="btn" data-tx>${Icon('download')} Xuất Excel</button><span class="muted small">${U.int(n)} kiện</span></div>
        </section>
        ${App.user.admin ? `<section class="card xstep"><div class="fsec"><span class="xn">${Icon('upload', 'sm')}</span>Đồng bộ từ file Total</div>
          <p class="muted small">Chọn file "Goods delivered to Site-fully formated.xlsx" (sheet Full). App <b>chỉ đọc</b> file — không sửa, không lưu lại file —
            rồi tách thành kiện, biên bản MGMER / GIR / OSD và lần kiểm tra vị trí. Mã kiện theo cột No. nên lần sau nạp file mới hơn sẽ cập nhật đúng kiện cũ, không nhân đôi.</p>
          <label class="upbox xdrop" id="tdrop">${Icon('upload')}<span><b>Chọn file Total .xlsx</b> hoặc kéo thả vào đây</span><input type="file" accept=".xlsx" hidden id="tfile"></label>
          <div id="tprev"></div></section>` : ''}
        <section class="card xstep"><div class="fsec"><span class="xn">${Icon('clock', 'sm')}</span>Lịch sử nhập</div><div id="xlog"></div></section></div>`;
      const $ = s => App.main.querySelector(s);
      bindMods();
      $('[data-tgoi]').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; st.tx.goi = b.dataset.v; paintTotal(); };
      $('[data-tx]').onclick = async () => {
        const b = $('[data-tx]'), lbl = b.innerHTML; b.disabled = true; b.textContent = 'Đang tạo file…';
        try {
          const r = await TotalSync.export(st.tx.goi);
          if (X.onExport) X.onExport(r); else saveFile(r.buf, r.name);
          U.toast(`Đã xuất ${r.name} (${U.int(r.n)} kiện)`, 'ok');
        } catch (e) { U.toast(e.message, 'err'); }
        b.disabled = false; b.innerHTML = lbl;
      };
      const inp = $('#tfile'), drop = $('#tdrop');
      if (inp) {
        inp.onchange = () => { if (inp.files[0]) tload(inp.files[0]); inp.value = ''; };
        ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('on')));
        drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) tload(f); });
      }
      tdraw(); drawLog();
    }
    async function tload(file) {
      const box = App.main.querySelector('#tprev');
      box.innerHTML = '<div class="center pad"><span class="spin"></span> Đang đọc file (khoảng vài giây với 12.000+ dòng)…</div>';
      try { TSRC = await TotalSync.parse(file); TSRC.map = new Map([...TSRC.phases.keys()].map(ph => [ph, TotalSync.defaultGoi(ph)])); TP = null; }
      catch (e) { TSRC = null; box.innerHTML = `<div class="xerr">${Icon('alert')}<span>${esc(e.message)}</span></div>`; return; }
      tdraw();
    }
    // Bước chọn: gán "Restart Phase" → gói thầu, chế độ ghi; rồi xem trước
    function tdraw() {
      const box = App.main.querySelector('#tprev'); if (!box) return;
      const bar = App.main.querySelector('.pbar'); if (bar) bar.remove();
      if (!TSRC) return;
      const codes = goiRows().map(g => g.MaGoi);
      box.innerHTML = `<div class="xfile">${Icon('file')}<span><b>${esc(TSRC.name)}</b> · ${U.int(TSRC.rows.length)} dòng dữ liệu</span>
          <button type="button" class="btn sm ghost" data-tclear>${Icon('x', 'sm')} Bỏ file</button></div>
        <div class="tmap"><div class="lbl">Gán "Restart Phase" (cột E) vào gói thầu của app</div>
          ${[...TSRC.phases].map(([ph, n]) => `<label class="tmrow"><span class="tmph">${esc(ph || '(trống)')} <i>${U.int(n)} dòng</i></span>
            <input class="tmin" data-ph="${esc(ph)}" value="${esc(TSRC.map.get(ph))}" list="tgoilist" autocomplete="off" maxlength="12"></label>`).join('')}
          <datalist id="tgoilist">${codes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          <div class="muted small">Mã chưa có trong app sẽ được tạo thành gói mới. "(trống)" = dòng không ghi Restart Phase — mặc định vào gói KXĐ (chưa xác định), có thể gõ mã khác.</div></div>
        <div class="fld"><span class="lbl">Kiện / biên bản đã có trong app</span><div class="seg" data-tmode>
          <button type="button" class="segb ${st.tx.mode === 'all' ? 'on' : ''}" data-v="all">Thêm mới + cập nhật theo file</button>
          <button type="button" class="segb ${st.tx.mode === 'new' ? 'on' : ''}" data-v="new">Chỉ thêm cái chưa có</button></div></div>
        ${demo ? `<label class="chk"><input type="checkbox" id="tempty" ${st.tx.empty ? 'checked' : ''}> Xoá dữ liệu vật tư <b>giả</b> của bản demo trước khi nạp (chỉ có ở bản demo)</label>` : ''}
        <div class="xact"><button type="button" class="btn" data-tplan>${Icon('eye')} Xem trước</button></div>
        <div id="tplan"></div>`;
      box.querySelector('[data-tclear]').onclick = () => { TSRC = null; TP = null; box.innerHTML = ''; const b2 = App.main.querySelector('.pbar'); if (b2) b2.remove(); };
      box.querySelectorAll('.tmin').forEach(i => i.oninput = () => { TSRC.map.set(i.dataset.ph, i.value.trim().toUpperCase() || TotalSync.defaultGoi(i.dataset.ph)); TP = null; tplanDraw(); });
      box.querySelector('[data-tmode]').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; st.tx.mode = b.dataset.v; TP = null; tdraw(); };
      const em = box.querySelector('#tempty'); if (em) em.onchange = () => { st.tx.empty = em.checked; TP = null; tplanDraw(); };
      box.querySelector('[data-tplan]').onclick = () => {
        const b = box.querySelector('[data-tplan]'); b.disabled = true; b.textContent = 'Đang so sánh…';
        setTimeout(() => { try { TP = TotalSync.plan(TSRC, TSRC.map, st.tx.mode, demo && st.tx.empty); } catch (e) { U.toast(e.message, 'err'); } b.disabled = false; b.innerHTML = `${Icon('eye')} Xem trước`; tplanDraw(); }, 30);
      };
      tplanDraw();
    }
    function tplanDraw() {
      const box = App.main.querySelector('#tplan'); if (!box) return;
      const bar = App.main.querySelector('.pbar'); if (bar) bar.remove();
      if (!TP) { box.innerHTML = ''; return; }
      const NAME = [['KIEN', 'Kiện'], ['MGMER', 'Biên bản kiểm đếm (MGMER)'], ['GIR', 'Biên bản mở kiện (GIR)'], ['OSD', 'Biên bản OSD'], ['KIEM_TRA', 'Lần kiểm tra vị trí / tình trạng']];
      const sample = TP.KIEN.upd.slice(0, 20);
      box.innerHTML = `<table class="dtable ttable"><thead><tr><th>Dữ liệu</th><th>Thêm mới</th><th>Cập nhật</th><th>Không đổi</th></tr></thead><tbody>
          ${TP.goiNew.length ? `<tr><td>Gói thầu mới: ${esc(TP.goiNew.map(g => g.MaGoi).join(', '))}</td><td>${TP.goiNew.length}</td><td>–</td><td>–</td></tr>` : ''}
          ${NAME.map(([t, l]) => `<tr><td>${esc(l)}</td><td>${U.int(TP[t].add.length)}</td><td>${U.int(TP[t].upd.length)}</td><td>${U.int(TP[t].same)}</td></tr>`).join('')}</tbody></table>
        <div class="muted small">Theo gói: ${TP.goi.map(g => `<b>${esc(g.MaGoi)}</b> ${U.int(g.n)}`).join(' · ')}</div>
        ${TP.issues.length ? `<div class="tiss"><div class="lbl">Cần biết trước khi nạp</div>${TP.issues.map(([n, t, ex]) => `<details class="tis"><summary><b>${U.int(n)}</b> ${esc(t)}</summary>
          ${ex.length ? `<div class="xm">${ex.slice(0, 15).map(esc).join('<br>')}${ex.length > 15 ? '<br>… và ' + (ex.length - 15) + ' mục khác' : ''}</div>` : ''}</details>`).join('')}</div>` : ''}
        ${sample.length ? `<details class="tis"><summary>Xem ${sample.length} kiện cập nhật đầu tiên (cũ → mới)</summary>${sample.map(u => `<div class="xm"><b>${esc(u.row.id)}</b> ${
          Object.keys(u.now).map(f => `${esc(f)}: <s>${esc(String(u.old[f] ?? ''))}</s> → <b>${esc(String(u.now[f] ?? ''))}</b>`).join(' · ')}</div>`).join('')}</details>` : ''}
        ${TP.empty ? '<div class="xerr warn">' + Icon('alert') + '<span>Sẽ xoá toàn bộ kiện, biên bản, vị trí và lịch sử nhập <b>giả</b> của bản demo trước khi nạp (hoàn tác không khôi phục được dữ liệu giả).</span></div>' : ''}`;
      App.main.querySelector('.xwrap').insertAdjacentHTML('beforeend', `<div class="pbar"><div class="pb-info"><b>${U.int(TP.writes)}</b> dòng sẽ được ghi
          <span class="muted">${esc(TP.name)}</span></div>
        <button type="button" class="btn ghost sm" data-tcancel>Huỷ</button><button type="button" class="btn" data-write ${TP.writes ? '' : 'disabled'}>${Icon('check')} Nạp vào app</button></div>`);
      App.main.querySelector('[data-tcancel]').onclick = () => { TP = null; tplanDraw(); };
      App.main.querySelector('[data-write]').onclick = async () => {
        if (!(await U.confirm(`Nạp ${U.int(TP.writes)} dòng từ "${TP.name}" vào app? File gốc không bị thay đổi. Có thể hoàn tác trong "Lịch sử nhập".`))) return;
        const b = App.main.querySelector('[data-write]'), lbl = b.innerHTML; b.disabled = true;
        const t0 = Date.now();
        try {
          const log = await TotalSync.apply(TP, t => { b.textContent = t; });
          TP = null; TSRC = null;
          U.toast(`Đã nạp: ${U.int(log.So_moi)} kiện mới, ${U.int(log.So_cap_nhat)} kiện cập nhật, ${U.int(log.So_bien_ban)} biên bản, ${U.int(log.So_vi_tri)} lần kiểm tra (${Math.round((Date.now() - t0) / 1000)} giây)`, 'ok');
          paintTotal();
        } catch (e) { U.toast('Lỗi khi nạp: ' + e.message, 'err'); b.disabled = false; b.innerHTML = lbl; }
      };
    }
    const saveFile = (buf, name) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };

    async function load(file) {
      const box = App.main.querySelector('#xprev');
      box.innerHTML = '<div class="center pad"><span class="spin"></span> Đang đọc file…</div>';
      try {
        const f = await readFile(file, st.m);
        if (!goiRows().some(g => g.MaGoi === f.goi)) throw new Error(`File là mẫu của gói ${f.goi} — bạn không có quyền với gói này`);
        P = plan(st.m, f); fileName = file.name; view = { f: P.n.err ? 'err' : 'all', lim: PAGE };
        if (!P.rows.length) { P = null; throw new Error('File không có dòng nào được điền'); }
      } catch (e) {
        P = null;
        // Chọn nhầm file Total ở thẻ mẫu → quản trị viên: tự chuyển sang thẻ File Total và đọc luôn file đó
        if (e.code === 'TOTAL' && App.user.admin) {
          U.toast('Đây là file Total 28 cột — đã chuyển sang thẻ "File Total 28 cột"', 'ok');
          st.m = 'TOTAL'; st.touched = true; paint(); tload(file); return;
        }
        box.innerHTML = `<div class="xerr">${Icon('alert')}<span>${esc(e.code === 'TOTAL' ? e.message + ' Chỉ quản trị viên được đồng bộ file Total.' : e.message)}</span></div>`; return;
      }
      drawPrev();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const ST = { new: ['Thêm mới', 'info'], upd: ['Cập nhật', 'ok'], same: ['Không đổi', 'muted'], err: ['Lỗi', 'bad'] };
    function drawPrev() {
      const box = App.main.querySelector('#xprev'); if (!box) return;
      const bar = App.main.querySelector('.pbar'); if (bar) bar.remove();
      if (!P) { if (!box.querySelector('.xerr')) box.innerHTML = ''; return; }
      const flt = { all: () => true, err: x => x.st === 'err', warn: x => x.warns.length && x.st !== 'err', new: x => x.st === 'new', upd: x => x.st === 'upd', same: x => x.st === 'same' };
      const rows = P.rows.filter(flt[view.f]), lim = Math.min(view.lim, rows.length);
      const chip = (f, l, n, cls) => n || f === 'all' ? `<button type="button" class="chip2 ${view.f === f ? 'on' : ''} ${cls || ''}" data-xf="${f}">${esc(l)} <b>${U.int(n)}</b></button>` : '';
      const docLine = (ds, l) => ds.length ? `<div class="xdocs"><b>${esc(l)}:</b> ${ds.map(d => `<span class="xdoc">${esc(d.t + ' ' + d.so)}${d.ngay ? ' · ' + esc(U.fmtDate(d.ngay)) : ''} · ${U.int(d.rows.length)} dòng</span>`).join('')}</div>` : '';
      const write = P.n.new + P.n.upd;
      box.innerHTML = `<div class="xfile">${Icon('file')}<span><b>${esc(fileName)}</b> · ${esc(TPL[P.m].label)} · gói ${esc(P.goi)} · ${U.int(P.rows.length)} dòng có dữ liệu</span>
          <button type="button" class="btn sm ghost" data-xclear>${Icon('x', 'sm')} Bỏ file</button></div>
        <div class="chips-row xchips">${chip('all', 'Tất cả', P.rows.length)}${chip('err', 'Lỗi', P.n.err, 'bad')}${chip('warn', 'Cảnh báo', P.n.warn, 'warn')}
          ${chip('new', 'Thêm mới', P.n.new)}${chip('upd', 'Cập nhật', P.n.upd)}${chip('same', 'Không đổi', P.n.same)}</div>
        ${docLine(P.newDocs, 'Sẽ tạo biên bản mới')}${docLine(P.oldDocs, 'Dùng biên bản có sẵn')}
        ${rows.length ? `<div class="rows xrows">${rows.slice(0, lim).map(x => {
          const s = ST[x.st] || ['', ''];
          const lines = [...x.msgs.map(t => `<div class="xm bad">${Icon('alert', 'sm')} ${esc(t)}</div>`), ...x.warns.map(t => `<div class="xm warn">${Icon('alert', 'sm')} ${esc(t)}</div>`),
            ...x.chg.slice(0, 6).map(c => `<div class="xm">${esc(c.l)}: <s>${esc(show(c.f, c.o))}</s> → <b>${esc(show(c.f, c.n))}</b></div>`), x.chg.length > 6 ? `<div class="xm">… và ${x.chg.length - 6} cột khác</div>` : ''].join('');
          return `<div class="row xrow" data-tone="${x.st === 'err' ? 'bad' : x.warns.length ? 'warn' : s[1]}"><span class="xno">Dòng ${x.no}</span>
            <div class="row-main"><div class="row-title">${esc(x.title)}</div>${x.sub || x.id ? `<div class="row-sub">${esc([x.id, x.sub].filter(Boolean).join(' · '))}</div>` : ''}${lines}</div>
            <span class="badge ${s[1]}">${s[0]}</span></div>`;
        }).join('')}</div>${rows.length > lim ? `<button type="button" class="btn ghost lmore" data-more>${Icon('chevron', 'sm')} Hiện thêm · còn ${U.int(rows.length - lim)} dòng</button>` : ''}`
          : '<div class="muted small pad">Không có dòng nào.</div>'}`;
      App.main.querySelector('.xwrap').insertAdjacentHTML('beforeend', `<div class="pbar"><div class="pb-info"><b>${U.int(write)}</b> dòng sẽ được ghi
          <span class="muted">${[P.newDocs.length && '+' + P.newDocs.length + ' biên bản mới', P.n.err && P.n.err + ' dòng lỗi bỏ qua', P.n.same && P.n.same + ' không đổi'].filter(Boolean).join(' · ')}</span></div>
        <button type="button" class="btn ghost sm" data-xclear>Huỷ</button><button type="button" class="btn" data-write ${write ? '' : 'disabled'}>${Icon('check')} Ghi vào app</button></div>`);
      box.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => { view = { f: b.dataset.xf, lim: PAGE }; drawPrev(); });
      const more = box.querySelector('[data-more]'); if (more) more.onclick = () => { view.lim += PAGE; drawPrev(); };
      App.main.querySelectorAll('[data-xclear]').forEach(b => b.onclick = () => { P = null; drawPrev(); });
      App.main.querySelector('[data-write]').onclick = writeIt;
    }

    async function writeIt() {
      const btn = App.main.querySelector('[data-write]'), lbl = btn.innerHTML;
      const msg = [`Ghi ${U.int(P.n.new + P.n.upd)} dòng từ file "${fileName}" vào app`, P.newDocs.length ? `tạo ${P.newDocs.length} biên bản mới` : '',
        P.n.err ? `bỏ qua ${P.n.err} dòng lỗi` : '', P.n.warn ? `${P.n.warn} dòng có cảnh báo — đã xem chưa?` : ''].filter(Boolean).join(', ') + '. Có thể hoàn tác cả lô trong "Lịch sử nhập".';
      if (!(await U.confirm(msg))) return;
      btn.disabled = true;
      try {
        const log = await apply(P, fileName, t => { btn.textContent = t; });
        P = null;
        U.toast(`Đã ghi: ${log.So_moi} kiện mới, ${log.So_cap_nhat} kiện cập nhật${log.So_bien_ban ? ', ' + log.So_bien_ban + ' biên bản mới' : ''}`, 'ok');
        paint();
      } catch (e) {
        U.toast('Lỗi khi ghi: ' + e.message + ' — xem Lịch sử nhập / dữ liệu trước khi thử lại', 'err');
        btn.disabled = false; btn.innerHTML = lbl;
      }
    }

    function drawLog() {
      const box = App.main.querySelector('#xlog'); if (!box) return;
      const logs = DB.rows('NHAP_EXCEL').slice().sort((a, b) => String(b.Thoi_gian).localeCompare(String(a.Thoi_gian))).slice(0, 30);
      box.innerHTML = logs.length ? `<div class="rows">${logs.map(l => `<div class="row" data-tone="${l.Trang_thai === 'Đã hoàn tác' ? '' : 'ok'}">
          <span class="lead tx" style="--gc:var(--g2)">${esc(String(l.Goi_thau || '').slice(0, 5))}</span>
          <div class="row-main"><div class="row-title">${esc(l.Ten_file)}</div><div class="row-sub">${esc(DB.sub('NHAP_EXCEL', l))}</div>
          <div class="row-meta">${[l.So_moi && `<span>+${U.int(l.So_moi)} kiện mới</span>`, l.So_cap_nhat && `<span>${U.int(l.So_cap_nhat)} kiện cập nhật</span>`,
            l.So_bien_ban && `<span>${U.int(l.So_bien_ban)} biên bản mới</span>`, l.So_vi_tri && `<span>${U.int(l.So_vi_tri)} vị trí</span>`, l.So_bo_qua && `<span>${U.int(l.So_bo_qua)} dòng lỗi bỏ qua</span>`].filter(Boolean).join('')}</div></div>
          ${l.Trang_thai === 'Đã hoàn tác' ? '<span class="badge">Đã hoàn tác</span>'
            : canUp && rowLv('NHAP_EXCEL', l) >= 2 ? `<button type="button" class="btn sm danger ghost" data-undo="${esc(l.id)}">Hoàn tác</button>` : '<span class="badge ok">Đã ghi</span>'}</div>`).join('')}</div>`
        : '<div class="muted small">Chưa có lần nhập nào.</div>';
      box.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => {
        const l = DB.get('NHAP_EXCEL', b.dataset.undo); if (!l) return;
        const ch = changedAfter(l);
        if (!(await U.confirm(`Hoàn tác lần nhập "${l.Ten_file}"? Kiện / biên bản / vị trí đã thêm sẽ bị xoá, kiện đã cập nhật trở về giá trị cũ.`
          + (ch ? ` ⚠️ ${ch} kiện đã bị sửa tiếp sau lần nhập này — hoàn tác sẽ ghi đè các thay đổi đó.` : '')))) return;
        b.disabled = true;
        try {
          const kept = await undo(l, t => { b.textContent = t; });
          U.toast(kept ? `Đã hoàn tác — giữ lại ${kept} mục vì đã được dùng tiếp sau lần nhập` : 'Đã hoàn tác lần nhập', 'ok');
          drawLog();
        } catch (e) { U.toast('Hoàn tác lỗi: ' + e.message, 'err'); b.disabled = false; b.textContent = 'Hoàn tác'; }
      });
    }
    paint();
  };

  // Cho kiểm thử: dựng file mẫu / đọc file mà không cần bấm nút
  X._test = { build, readFile, plan, apply, undo, TPL, lib };
})();
