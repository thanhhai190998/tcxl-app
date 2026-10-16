// =====================================================================
//  FILE TOTAL 28 CỘT ("Goods delivered to Site-fully formated.xlsx", sheet Full)
//   • Đồng bộ vào app: chỉ ĐỌC file người dùng chọn (trình duyệt đọc 1 bản sao của file, không ghi gì vào file),
//     tách thành kiện / biên bản MGMER, GIR, OSD / lần kiểm tra vị trí. Mã cố định theo số thứ tự (No.) và số biên bản
//     → nạp lại file mới hơn thì cập nhật đúng kiện cũ, không nhân đôi.
//   • Xuất: tạo FILE MỚI đúng bố cục 28 cột (A–AB) như file gốc.
// =====================================================================
(function () {
  const TS = (window.TotalSync = {});
  const SHEET = 'Full';
  // Tiêu đề dòng 3 của file gốc (giữ nguyên cả dấu cách thừa như ' Net Weight', 'OSD Status  ')
  const HEAD = ['No.', 'Unit', 'System', 'Package divided by PM', 'Restart Phase', 'Sub-System/Assembly', 'Goods Description', 'Drawing', 'Supplier',
    'PKL No.', 'PSIC No', 'Package No.', 'Unit', 'Quantity', 'Measure', ' Net Weight', 'MGMER Date', 'MGMER No.', 'GIR Date', 'GIR No.', 'OSD No.',
    'OSD Status  ', 'Remarks', 'Location', 'Status of package', 'Date', 'Remarks after checking', 'RFI (Hard Copy)'];
  const TITLE = 'LONG PHU 01 THERMAL POWER PLANT PROJECT\nLIST OF PACKAGES FOR MATERIALS/EQUIPMENT DELIVERED TO SITE';
  const WIDTH = [7.1, 5.1, 19.7, 28, 13.9, 30.9, 43.3, 32.5, 12.5, 18.1, 14.1, 20.3, 8.5, 10.1, 8.7, 13.7, 13.5, 13.5, 12.5, 9.9, 18.7, 11.5, 22.5, 11.5, 15.3, 10.5, 29.3, 19.5];
  const NONE = /^(n\/+a|not open)?$/i;   // ô "trống" theo quy ước của file gốc (có ô gõ nhầm "N//a")
  const pad = (n, w) => String(n).padStart(w, '0');
  const hash = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h.toString(36); };

  // ---------- Đọc giá trị ô ----------
  const raw = c => {
    const v = c.value;
    if (v == null) return { v: '' };
    if (v instanceof Date) return { v };
    if (typeof v === 'object') {
      if (v.hyperlink !== undefined) return { v: v.text && typeof v.text === 'object' ? (v.text.richText || []).map(x => x.text).join('') : v.text ?? '', link: v.hyperlink };
      if (v.result !== undefined) return { v: v.result instanceof Date ? v.result : v.result ?? '' };
      if (v.richText) return { v: v.richText.map(x => x.text).join('') };
      if (v.error) return { v: '' };
      return { v: '' };
    }
    return { v };
  };
  const txt = v => v instanceof Date ? isoOf(v) : typeof v === 'number' ? String(Number.isInteger(v) ? v : +v.toFixed(6)) : String(v ?? '').trim();
  const isoOf = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
  const date = v => v instanceof Date && !isNaN(v) ? isoOf(v) : (typeof v === 'number' && v > 20000 && v < 80000 ? isoOf(new Date(Math.round((v - 25569) * 86400000))) : '');
  const num = v => { if (v === '' || v == null) return ''; if (typeof v === 'number') return v; const s = String(v).trim().replace(/\s/g, '').replace(/,(?=\d{3}\b)/g, ''); const n = Number(s); return s && !isNaN(n) ? n : null; };
  const unlink = l => { try { return decodeURIComponent(String(l || '')).replace(/\\/g, '/'); } catch (e) { return String(l || '').replace(/\\/g, '/'); } };

  // ---------- Gói thầu: "Restart Phase" → mã gói ----------
  TS.defaultGoi = ph => {
    const s = String(ph || '').trim();
    if (!s) return 'KXĐ';
    if (/^previous\s*epc$/i.test(s)) return 'EPC';
    const m = s.match(/^(T\d+)\s*package$/i);
    return m ? m[1].toUpperCase() : s.replace(/\s*package$/i, '').slice(0, 12);
  };
  const goiName = (code, ph) => code === 'EPC' ? 'Hàng của tổng thầu EPC trước (Previous EPC)'
    : code === 'KXĐ' ? 'Chưa xác định gói (Restart Phase trống trong file Total)' : 'Gói ' + code;

  // ---------- 1. Đọc file Total ----------
  TS.parse = async file => {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ nhận file .xlsx');
    const ExcelJS = await Excel.lib(), wb = new ExcelJS.Workbook(), buf = await file.arrayBuffer();
    try { await wb.xlsx.load(buf); } catch (e) { throw new Error('Không đọc được file — file hỏng hoặc không phải Excel .xlsx'); }
    const ws = wb.getWorksheet(SHEET) || wb.worksheets[0];
    const links = await sheetLinks(buf, ws.name);
    const head = ws.getRow(3).values.slice(1, 29).map(x => txt(raw({ value: x }).v));
    const bad = HEAD.map((h, i) => h.trim() !== String(head[i] || '').trim() ? `${String.fromCharCode(65 + (i % 26)).replace(/^/, i >= 26 ? 'A' : '')}: "${head[i] || ''}"` : '').filter(Boolean);
    if (bad.length > 3) throw new Error('File không đúng mẫu "Goods delivered to Site" (dòng 3 phải là tiêu đề No., Unit, System…). Lệch ở: ' + bad.slice(0, 5).join(', '));
    const rows = [];
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), cells = [];
      let any = false;
      for (let c = 1; c <= 28; c++) {
        const x = raw(row.getCell(c));
        if (!x.link && links.has(colName(c) + r)) x.link = links.get(colName(c) + r);
        cells.push(x); if (txt(x.v) !== '') any = true;
      }
      if (any) rows.push({ r, c: cells });
    }
    return { name: file.name, rows, phases: countBy(rows, x => txt(x.c[4].v)) };
  };
  const countBy = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };

  // Link (hyperlink) đọc thẳng trong file .xlsx: file gốc gắn 1 link cho cả cụm ô (vd R5:R7) — ExcelJS bỏ qua kiểu này
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  let zipP = null;
  const zipLib = () => zipP || (zipP = new Promise((ok, no) => {
    if (window.JSZip) return ok(window.JSZip);
    const s = document.createElement('script'); s.src = JSZIP; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.JSZip); s.onerror = () => { zipP = null; s.remove(); no(new Error('Không tải được thư viện đọc file — kiểm tra mạng')); };
    document.head.appendChild(s);
  }));
  const attr = (tag, n) => { const m = tag.match(new RegExp('\\s' + n.replace(':', '\\:') + '="([^"]*)"')); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'") : ''; };
  const colNum = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const colName = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  async function sheetLinks(buf, sheetName) {
    const JSZip = await zipLib(), zip = await JSZip.loadAsync(buf), out = new Map();
    const read = p => zip.file(p) ? zip.file(p).async('string') : Promise.resolve('');
    const wbx = await read('xl/workbook.xml'), wbr = await read('xl/_rels/workbook.xml.rels');
    const sh = (wbx.match(/<sheet\b[^>]*>/g) || []).find(t => attr(t, 'name') === sheetName) || (wbx.match(/<sheet\b[^>]*>/g) || [])[0];
    if (!sh) return out;
    const rel = (wbr.match(/<Relationship\b[^>]*>/g) || []).find(t => attr(t, 'Id') === attr(sh, 'r:id'));
    if (!rel) return out;
    const path = 'xl/' + attr(rel, 'Target').replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = await read(path), rels = await read(path.replace(/([^/]+)$/, '_rels/$1.rels'));
    const tgt = new Map((rels.match(/<Relationship\b[^>]*>/g) || []).map(t => [attr(t, 'Id'), attr(t, 'Target')]));
    for (const h of xml.match(/<hyperlink\b[^>]*>/g) || []) {
      const target = tgt.get(attr(h, 'r:id')) || attr(h, 'location');
      if (!target) continue;
      const [a, b] = attr(h, 'ref').split(':'), A = a.match(/^([A-Z]+)(\d+)$/), B = (b || a).match(/^([A-Z]+)(\d+)$/);
      if (!A || !B) continue;
      for (let c = colNum(A[1]); c <= colNum(B[1]); c++) for (let r = +A[2]; r <= +B[2]; r++) out.set(colName(c) + r, target);
    }
    return out;
  }

  // ---------- 2. Lập kế hoạch (so với dữ liệu đang có trong app) ----------
  // map: Restart Phase → mã gói; mode: 'all' = thêm + cập nhật, 'new' = chỉ thêm cái chưa có
  TS.plan = (src, map, mode, empty) => {   // empty = coi như app chưa có kiện / biên bản nào (demo: xoá dữ liệu giả trước khi nạp)
    const I = { odd: [], txtNum: 0, badNum: [], mgDays: new Map(), giDays: new Map(), linkMix: new Set(), noDate: 0, noLoc: 0, mgWord: [] };
    const yearNow = new Date().getFullYear();
    const out = { KIEN: [], MGMER: new Map(), GIR: new Map(), OSD: new Map(), KIEM_TRA: [], GOI: new Map() };
    const usedIds = new Set();
    const he = DB.field('KIEN', 'He_thong').opts;
    const canonHe = s => he.find(o => U.norm(o) === U.norm(s)) || s;
    const checkDate = (d, r, col) => { if (d && (+d.slice(0, 4) < 2010 || +d.slice(0, 4) > yearNow + 1)) I.odd.push(`dòng ${r} cột ${col}: ${U.fmtDate(d)}`); return d; };

    for (const { r, c } of src.rows) {
      const V = i => c[i].v, T = i => txt(c[i].v);
      const goi = map.get(T(4)) || TS.defaultGoi(T(4));
      if (!out.GOI.has(goi)) out.GOI.set(goi, { MaGoi: goi, TenGoi: goiName(goi, T(4)), Restart_Phase: T(4), n: 0 });
      out.GOI.get(goi).n++;
      const no = num(V(0));
      let id = typeof no === 'number' && no > 0 && Number.isInteger(no) ? 'K' + pad(no, 5) : 'K-r' + r;
      if (usedIds.has(id)) id = 'K-r' + r;
      usedIds.add(id);
      const n = i => { const x = num(V(i)); if (typeof V(i) === 'string' && V(i).trim() && typeof x === 'number') I.txtNum++; if (x === null) { I.badNum.push(`dòng ${r} cột ${HEAD[i].trim()}: "${T(i)}"`); return T(i); } return x; };
      const k = {
        id, STT: typeof no === 'number' ? no : T(0), Goi_thau: goi, To_may: /^(1|2|C)$/i.test(T(1)) ? T(1).toUpperCase() : T(1),
        He_thong: T(2) ? canonHe(T(2)) : '', Goi_PM: T(3), Hang_muc: T(5), Mo_ta: T(6), Ban_ve: T(7), Nha_cung_cap: T(8),
        PKL_No: T(9), PSIC_No: T(10), Package_No: T(11), DVT: T(12), So_luong: n(13), Don_vi_KL: /^kg$/i.test(T(14)) ? 'Kg' : T(14), KL_tinh: n(15),
        Ghi_chu: T(22), MGMER: '', GIR: '', OSD: ''
      };
      // Biên bản kiểm đếm: theo gói + số + ngày (cùng số mà khác ngày → tách, giữ đúng ngày từng dòng)
      const mgNo = T(17), mgDate = checkDate(date(V(16)), r, 'MGMER Date');
      // Ô MGMER No. là chữ (vd "Unreleased") mà không có ngày → không phải số biên bản: coi như chưa về, giữ chữ ở Ghi chú
      if (mgNo && !NONE.test(mgNo) && !mgDate && !/\d/.test(mgNo)) {
        I.mgWord.push(`dòng ${r}: "${mgNo}"`);
        k.Ghi_chu = [k.Ghi_chu, 'MGMER No.: ' + mgNo].filter(Boolean).join(' · ');
      } else if (mgNo && !NONE.test(mgNo)) {
        const key = goi + '|' + mgNo + '|' + mgDate;
        let d = out.MGMER.get(key);
        if (!d) {
          d = { id: 'MG-' + goi + '-' + mgNo.replace(/[^\w-]/g, '') + (mgDate ? '-' + mgDate.replace(/-/g, '') : '') + (/[^\w-]/.test(mgNo) ? '-' + hash(mgNo) : ''),
            So: mgNo, Ngay: mgDate, Goi_thau: goi, Dia_diem: '', Thanh_phan: '', File: '', Thu_muc: '', Duong_dan: c[17].link ? unlink(c[17].link) : '', Ghi_chu: '', n: 0 };
          out.MGMER.set(key, d);
          const dk = goi + '|' + mgNo; I.mgDays.set(dk, (I.mgDays.get(dk) || new Set()).add(mgDate));
        } else if (c[17].link && unlink(c[17].link) !== d.Duong_dan) { if (!d.Duong_dan) d.Duong_dan = unlink(c[17].link); else I.linkMix.add(`MGMER ${mgNo} (${goi})`); }
        d.n++; k.MGMER = d.id;
      }
      // Biên bản mở kiện
      const giNo = T(19), giDate = checkDate(date(V(18)), r, 'GIR Date');
      if (giNo && !NONE.test(giNo)) {
        const key = goi + '|' + giNo + '|' + giDate;
        let d = out.GIR.get(key);
        if (!d) {
          d = { id: 'GI-' + goi + '-' + giNo.replace(/[^\w-]/g, '') + (giDate ? '-' + giDate.replace(/-/g, '') : '') + (/[^\w-]/.test(giNo) ? '-' + hash(giNo) : ''),
            So: giNo, Ngay: giDate, Goi_thau: goi, MGMER: '', Thanh_phan: '', File: '', Ghi_chu: '', mgs: new Set(), n: 0 };
          out.GIR.set(key, d);
          const dk = goi + '|' + giNo; I.giDays.set(dk, (I.giDays.get(dk) || new Set()).add(giDate));
        }
        d.mgs.add(k.MGMER); d.n++; k.GIR = d.id;
      }
      // Biên bản OSD: theo gói + số. Cột V "OSD Status" không đọc nữa — app bỏ trạng thái Open/Closed (16/10/2026);
      // không gửi Noi_dung để nạp lại file không xoá ghi chú xử lý đã nhập trong app
      const osNo = T(20);
      if (osNo && !NONE.test(osNo)) {
        const key = goi + '|' + osNo;
        let d = out.OSD.get(key);
        if (!d) { d = { id: 'OS-' + goi + '-' + hash(osNo), So: osNo, Goi_thau: goi, GIR: '', girs: new Set(), n: 0 }; out.OSD.set(key, d); }
        d.girs.add(k.GIR); d.n++; k.OSD = d.id;
      }
      // Kiểm tra tình trạng (X–AB) → 1 lần kiểm tra
      if ([23, 24, 25, 26, 27].some(i => T(i))) {
        const kd = checkDate(date(V(25)), r, 'Date');
        if (!kd) I.noDate++;
        if (!T(23)) I.noLoc++;
        out.KIEM_TRA.push({ id: 'KT-' + id + '-' + (kd ? kd.replace(/-/g, '') : '0'), Kien: id, Ngay: kd, Vi_tri: T(23), Tinh_trang: /^ok$/i.test(T(24)) ? 'OK' : T(24),
          Nguoi_KT: '', RFI: T(27), Ghi_chu: T(26), Anh_link: c[26].link ? unlink(c[26].link) : '', RFI_link: c[27].link ? unlink(c[27].link) : '', Hinh_anh: '' });
      }
      out.KIEN.push(k);
    }
    // Hoàn thiện biên bản
    out.GIR.forEach(d => { const m = [...d.mgs].filter(Boolean); d.MGMER = m.length === 1 ? m[0] : ''; delete d.mgs; });
    out.OSD.forEach(d => { const g = [...d.girs].filter(Boolean); d.GIR = g.length === 1 ? g[0] : ''; delete d.girs; });
    const multi = m => [...m].filter(([, s]) => s.size > 1).map(([k, s]) => `${k.split('|')[1]} (${k.split('|')[0]}): ${[...s].map(x => x ? U.fmtDate(x) : 'không ngày').join(', ')}`);

    // So với dữ liệu đang có: thêm / cập nhật / không đổi
    const strip = o => { const x = { ...o }; delete x.n; return x; };
    const diff = (t, list) => {
      const add = [], upd = [];
      let same = 0;
      list.map(strip).forEach(row => {
        const cur = empty ? null : DB.get(t, row[DB.keyField(t)]);
        if (!cur) return add.push(row);
        const ch = Object.keys(row).filter(f => String(cur[f] ?? '') !== String(row[f] ?? ''));
        if (!ch.length || mode === 'new') { same++; return; }
        upd.push({ row, old: Object.fromEntries(ch.map(f => [f, cur[f] ?? ''])), now: Object.fromEntries(ch.map(f => [f, row[f]])) });
      });
      return { add, upd, same };
    };
    const goiNew = [...out.GOI.values()].filter(g => !DB.get('GOI_THAU', g.MaGoi))
      .map(g => ({ MaGoi: g.MaGoi, TenGoi: g.TenGoi, Restart_Phase: g.Restart_Phase, Nha_thau: '', Thau_phu: '', Tinh_trang: 'Đang thực hiện', Ngay_ky: '', Thoi_gian: '',
        Ngay_bat_dau: '', Ngay_ket_thuc: '', Can_bo: '', Thu_muc: '', Ghi_chu: 'Tạo khi đồng bộ file Total' }));
    const P = {
      name: src.name, mode, empty: !!empty, goi: [...out.GOI.values()], goiNew,
      MGMER: diff('MGMER', [...out.MGMER.values()]), GIR: diff('GIR', [...out.GIR.values()]), OSD: diff('OSD', [...out.OSD.values()]),
      KIEN: diff('KIEN', out.KIEN), KIEM_TRA: diff('KIEM_TRA', out.KIEM_TRA),
      issues: [
        [I.odd.length, 'ngày bất thường (có thể gõ nhầm năm) — giữ nguyên, nên sửa trong app', I.odd],
        [multi(I.mgDays).length, 'số MGMER có nhiều ngày khác nhau — tách thành nhiều biên bản cùng số, đúng ngày từng dòng', multi(I.mgDays)],
        [multi(I.giDays).length, 'số GIR có nhiều ngày khác nhau — tách tương tự', multi(I.giDays)],
        [I.linkMix.size, 'biên bản MGMER có link thư mục khác nhau giữa các dòng — lấy link đầu tiên', [...I.linkMix]],
        [I.mgWord.length, 'ô MGMER No. ghi chữ, không có ngày — coi như chưa về, chép chữ vào Ghi chú', I.mgWord],
        [I.txtNum, 'ô số lượng / khối lượng gõ dạng chữ — đã đổi thành số', []],
        [I.badNum.length, 'ô số lượng / khối lượng không đọc được thành số — giữ nguyên chữ', I.badNum],
        [I.noDate, 'lần kiểm tra tình trạng không có ngày (cột Date) — nạp không ngày', []],
        [I.noLoc, 'lần kiểm tra tình trạng không ghi vị trí (cột Location)', []]
      ].filter(x => x[0])
    };
    P.OSD.add = P.OSD.add.map(r => ({ Ngay: '', Loai: '', Noi_dung: '', File: '', ...r }));   // biên bản mới: đủ cột; biên bản cũ: giữ ghi chú
    P.writes = goiNew.length + ['MGMER', 'GIR', 'OSD', 'KIEN', 'KIEM_TRA'].reduce((s, t) => s + P[t].add.length + P[t].upd.length, 0);
    return P;
  };

  // ---------- 3. Ghi vào app (thứ tự: gói → biên bản → kiện → kiểm tra), nhật ký + dữ liệu hoàn tác ----------
  TS.apply = async (P, step) => {
    const add = {}, upd = {};
    if (P.empty) {   // chỉ bản demo: xoá kiện / biên bản / vị trí / nhật ký giả trước khi nạp dữ liệu thật
      for (const t of ['KIEM_TRA', 'KIEN', 'OSD', 'GIR', 'MGMER', 'NHAP_EXCEL']) {
        const keys = DB.rows(t).map(r => r[DB.keyField(t)]);
        if (keys.length) await DB.removeMany(t, keys, (d, n) => step(`Đang xoá dữ liệu giả ${t} ${U.int(d)}/${U.int(n)}…`));
      }
    }
    if (P.goiNew.length) { step('Đang tạo ' + P.goiNew.length + ' gói thầu…'); await DB.addMany('GOI_THAU', P.goiNew); add.GOI_THAU = P.goiNew.map(g => g.MaGoi); }
    const NAME = { MGMER: 'biên bản kiểm đếm', GIR: 'biên bản mở kiện', OSD: 'biên bản OSD', KIEN: 'kiện', KIEM_TRA: 'lần kiểm tra vị trí' };
    for (const t of ['MGMER', 'GIR', 'OSD', 'KIEN', 'KIEM_TRA']) {
      const x = P[t];
      if (x.add.length) {
        await DB.addMany(t, x.add, (d, n) => step(`Đang thêm ${NAME[t]} ${U.int(d)}/${U.int(n)}…`));
        add[t] = x.add.map(r => r[DB.keyField(t)]);
      }
      if (x.upd.length) {
        await DB.updateMany(t, x.upd.map(u => ({ [DB.keyField(t)]: u.row[DB.keyField(t)], ...u.now })), (d, n) => step(`Đang cập nhật ${NAME[t]} ${U.int(d)}/${U.int(n)}…`));
        upd[t] = x.upd.map(u => ({ id: u.row[DB.keyField(t)], old: u.old, now: u.now }));
      }
    }
    const cnt = (t, k) => (P[t][k] || []).length;
    const log = { id: U.uid(), Thoi_gian: U.toLocalInput(new Date()).replace('T', ' '), Nguoi: App.user.name || App.user.email, Mau: 'Đồng bộ file Total',
      Goi_thau: '', Ten_file: P.name, So_moi: cnt('KIEN', 'add'), So_cap_nhat: cnt('KIEN', 'upd'),
      So_bien_ban: ['MGMER', 'GIR', 'OSD'].reduce((s, t) => s + cnt(t, 'add'), 0), So_vi_tri: cnt('KIEM_TRA', 'add'), So_bo_qua: 0, Trang_thai: 'Đã ghi',
      Hoan_tac: JSON.stringify({ add, upd }) };
    await DB.add('NHAP_EXCEL', log);
    return log;
  };

  // ---------- 4. Xuất file mới đúng bố cục 28 cột ----------
  TS.export = async goi => {
    const ExcelJS = await Excel.lib();
    const rows = DB.rows('KIEN').filter(k => (!goi || k.Goi_thau === goi) && permRowLevel(App.user, 'KIEN', k, (pt, x) => DB.get(pt, x)) >= 1)
      .sort((a, b) => (parseFloat(a.STT) || 1e12) - (parseFloat(b.STT) || 1e12));
    const wb = new ExcelJS.Workbook(); wb.creator = App.user.email; wb.created = new Date();
    const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }] });
    WIDTH.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const bold = { bold: true, size: 10, name: 'Arial' }, center = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.mergeCells('A1:AB1'); ws.mergeCells('A2:I2'); ws.mergeCells('J2:M2'); ws.mergeCells('X2:AB2');
    Object.assign(ws.getCell('A1'), { value: TITLE, font: { bold: true, size: 14, name: 'Arial' }, alignment: center });
    ws.getRow(1).height = 45;
    Object.assign(ws.getCell('A2'), { value: 'Materials/Equipment information in erection drawings', font: bold, alignment: center });
    Object.assign(ws.getCell('R2'), { value: 'Delivery at Site', font: bold });
    Object.assign(ws.getCell('X2'), { value: 'Condition check', font: bold, alignment: center, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } } });
    const hr = ws.getRow(3);
    HEAD.forEach((h, i) => Object.assign(hr.getCell(i + 1), { value: h, font: bold, alignment: center,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: i >= 23 ? 'FFFFF2CC' : 'FFDDEBF7' } },
      border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } }));
    const goiPh = new Map(DB.rows('GOI_THAU').map(g => [g.MaGoi, g.Restart_Phase !== undefined && g.Restart_Phase !== '' ? g.Restart_Phase : g.MaGoi === 'KXĐ' ? '' : g.MaGoi === 'EPC' ? 'Previous EPC' : g.MaGoi + ' Package']));
    const dt = s => { const d = U.parseDate(s); return d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null; };
    const asNumIf = s => /^[1-9]\d{0,14}$/.test(String(s ?? '')) ? Number(s) : (s ?? '');
    const link = (text, path) => path ? { text: String(text ?? ''), hyperlink: String(path).split('/').map(encodeURIComponent).join('\\') } : text;
    rows.forEach(k => {
      const m = k.MGMER ? DB.get('MGMER', k.MGMER) : null, g = k.GIR ? DB.get('GIR', k.GIR) : null, o = k.OSD ? DB.get('OSD', k.OSD) : null;
      const c = SCHEMA.lastCheck(DB, k.id);
      const r = ws.addRow([
        k.STT === '' ? '' : asNumIf(k.STT), /^[12]$/.test(k.To_may) ? Number(k.To_may) : k.To_may || '', k.He_thong, k.Goi_PM,
        goiPh.has(k.Goi_thau) ? goiPh.get(k.Goi_thau) : k.Goi_thau, k.Hang_muc, k.Mo_ta, k.Ban_ve, k.Nha_cung_cap,
        asNumIf(k.PKL_No), asNumIf(k.PSIC_No), asNumIf(k.Package_No), k.DVT, k.So_luong, k.Don_vi_KL, k.KL_tinh,
        m && m.Ngay ? dt(m.Ngay) : '', m ? link(asNumIf(m.So), m.Duong_dan) : '',
        g ? (g.Ngay ? dt(g.Ngay) : '') : m ? 'N/A' : '', g ? asNumIf(g.So) : m ? 'Not Open' : '',
        o ? asNumIf(o.So) : '', '', k.Ghi_chu,   // cột V OSD Status: app không theo dõi trạng thái OSD nữa → để trống
        c ? c.Vi_tri : '', c ? c.Tinh_trang : '', c && c.Ngay ? dt(c.Ngay) : '', c ? link(c.Ghi_chu, c.Anh_link) : '', c ? link(c.RFI, c.RFI_link) : ''
      ]);
      [17, 19, 26].forEach(i => { r.getCell(i).numFmt = 'mm-dd-yy'; });
      r.getCell(16).numFmt = '#,##0.00';
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: 28 } };
    const buf = await wb.xlsx.writeBuffer();
    return { buf, n: rows.length, name: `Goods delivered to Site - xuat tu app${goi ? ' - ' + goi : ''} - ${U.today().replace(/-/g, '')}.xlsx` };
  };
})();
