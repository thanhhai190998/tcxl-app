// =====================================================================
//  CẤU TRÚC DỮ LIỆU & MENU — app Phòng Thi công Xây lắp (TCXL).
//
//  Cột (field):  n = tên cột trong Sheet, l = nhãn hiển thị, t = kiểu:
//    text | longtext | number | price | date | datetime | expiry
//    enum (opts, other=true cho phép gõ giá trị khác, multi=true chọn nhiều — lưu "A, B") | ref (ref = bảng tham chiếu)
//    image | file | email | url | phone
//  Danh sách (list): group = nhóm theo cột, filter = cột (hoặc mảng cột) làm nút lọc nhanh,
//    sort/desc = sắp xếp mặc định, cols = cột hiện thêm trong mỗi dòng, avatar: 'initials' = chữ cái đầu,
//    lead = cột hiện thành ô màu đầu dòng (vd mã gói), sum/unit = cộng cột số, countUnit = đơn vị đếm dòng,
//    range = bộ lọc thời gian theo cột sort, page = hiện từng trang (danh sách dài), hint = chữ gợi ý ô tìm,
//    excel = mẫu Excel mở từ nút "Excel" trên danh sách (js/excel.js)
//  Chi tiết (detail): stats = các mốc làm nổi bật ở đầu trang, hide = cột không hiện
//  Thuộc tính khác: req (bắt buộc), init ('today' hoặc giá trị mặc định), v (cột ảo — hàm tính, không lưu vào Sheet),
//    ph (chữ gợi ý trong ô ghi chú dài)
//  Bảng: beforeSave(dòng, { db, user, isNew, old }) chạy trước khi lưu form — điền thêm cột, trả { f, msg } để chặn lưu;
//    unique = { f: cột số, scope: cột phạm vi } — số trùng trong cùng phạm vi thì không cho lưu, khác phạm vi thì cảnh báo;
//    fileName(dòng, db) = tên file (không đuôi) đặt cho file / ảnh tải lên Drive — trống thì giữ tên gốc
//
//  3 PHASE CỦA VẬT TƯ (theo file "Goods delivered to Site"):
//    Phase 1 — nhà thầu thông báo hàng (cột A–P)        → bảng KIEN
//    Phase 2 — hàng về, đếm kiện, chưa mở (MGMER, X, Z)  → bảng MGMER + KIEM_TRA (vị trí, tình trạng, ngày kiểm)
//    Phase 3 — mở kiện (GIR, OSD)                         → bảng GIR + OSD
//  Mỗi kiện có mã nội bộ (id) vì file gốc không có cột nào dùng làm khoá được
//  (Package No. trống/N/A ở ~2.660 dòng, ghép PKL + PSIC + Package No. vẫn trùng).
// =====================================================================
(function () {
  const C = () => window.APP_CONFIG;
  const T = {};   // định nghĩa bảng

  // ---------- Chỉ mục tính sẵn (12.000+ kiện: không quét lại cả bảng cho từng dòng) ----------
  // Tính lại khi mảng dữ liệu đổi (DB thay mảng mới mỗi lần thêm/sửa/xoá/tải về)
  const memo = {};
  function cached(name, deps, build) {
    const c = memo[name];
    if (c && c.deps.length === deps.length && c.deps.every((d, i) => d === deps[i])) return c.v;
    const v = build();
    memo[name] = { deps, v };
    return v;
  }
  // Tên file trên Drive khi tải biên bản lên: "<LOẠI> <số> - <gói>" (vd "GIR 1010 - T12"; số OSD đã có chữ OSD thì giữ nguyên)
  // → file Excel chỉ ghi số vẫn tìm ngay được file trên Drive. Kèm gói vì số được trùng giữa các gói (MGMER "1" ở EPC và T12).
  const docFile = pre => r => {
    const so = String(r.So || '').trim(); if (!so) return '';
    return [U.norm(so).startsWith(pre.toLowerCase()) ? so : pre + ' ' + so, r.Goi_thau].filter(Boolean).join(' - ');
  };
  // Số kiện theo từng biên bản (MGMER / GIR / OSD)
  const countBy = (db, col) => cached('cnt:' + col, [db.rows('KIEN')], () => {
    const m = new Map();
    db.rows('KIEN').forEach(r => { const k = r[col]; if (k) m.set(String(k), (m.get(String(k)) || 0) + 1); });
    return m;
  });
  // Lần kiểm tra vị trí / tình trạng mới nhất của từng kiện
  const lastCheck = (db, kien) => cached('last', [db.rows('KIEM_TRA')], () => {
    const m = new Map();
    db.rows('KIEM_TRA').forEach(r => {
      const k = String(r.Kien || ''); if (!k) return;
      const o = m.get(k);
      if (!o || String(U.isoOf(r.Ngay)) >= String(U.isoOf(o.Ngay))) m.set(k, r);
    });
    return m;
  }).get(String(kien)) || null;

  // Phase của 1 kiện: có GIR → đã mở; có MGMER → đã về, đã đếm; còn lại → mới thông báo
  const PHASES = ['P1 · Chỉ thông báo', 'P2 · Đã kiểm đếm', 'P3 · Đã mở kiện'];
  const phaseOf = r => r.GIR ? PHASES[2] : r.MGMER ? PHASES[1] : PHASES[0];
  const docDate = (db, t, id) => { const d = id && db.get(t, id); return d ? d.Ngay : ''; };
  const goiOpts = ['EPC', 'T09', 'T12', 'T17', 'T21', 'T22'];

  // ---------------- 1. QUẢN LÝ VẬT TƯ ----------------
  T.KIEN = {
    label: 'Danh sách kiện', key: 'id',
    title: r => r.Mo_ta || '(chưa có mô tả)',
    sub: r => [r.PKL_No && 'PKL ' + r.PKL_No, r.Package_No && r.Package_No !== 'N/A' && 'Kiện ' + r.Package_No, r.He_thong].filter(Boolean).join(' · '),
    needs: ['GOI_THAU', 'MGMER', 'GIR', 'OSD', 'KIEM_TRA'],
    fields: [
      // Phase 1 — thông tin nhà thầu thông báo (cột A–P, W)
      { n: 'STT', l: 'STT (No.)', t: 'number', auto: true },   // auto: ẩn khi thêm mới — máy chủ tự cấp số tiếp theo
      { n: 'Goi_thau', l: 'Gói thầu (Restart Phase)', t: 'ref', ref: 'GOI_THAU', req: true },
      { n: 'To_may', l: 'Tổ máy (Unit)', t: 'enum', opts: ['1', '2', 'C'] },
      { n: 'He_thong', l: 'Hệ thống (System)', t: 'enum', other: true, opts: ['Boiler', 'Boiler Auxiliaries', 'ESP', 'FGD', 'RAPH & SCR', 'PH Building', 'Hoist & Crane',
        'Water Treatment Plant', 'Auxiliary Boiler', 'CW System', 'STG', 'STG Auxiliaries', 'Transformer', 'CECB', 'Condenser & Auxiliaries', 'Piperack',
        'Compressed Air System', 'Coal Handling System', 'Limestone and gypsum', 'I&C and Monitoring', 'Fuel Oil System', 'NGR'] },
      { n: 'Goi_PM', l: 'Gói chia theo PM (Package divided by PM)', t: 'text' },
      { n: 'Hang_muc', l: 'Hạng mục (Sub-System/Assembly)', t: 'text' },
      { n: 'Mo_ta', l: 'Mô tả hàng (Goods Description)', t: 'longtext', req: true },
      { n: 'Ban_ve', l: 'Bản vẽ (Drawing)', t: 'text' },
      { n: 'Nha_cung_cap', l: 'Nhà cung cấp (Supplier)', s: 'NCC', t: 'enum', other: true, opts: ['KC Cottrell', 'Đại Dũng', 'TKZ', 'Termokimik', 'Loesche', 'Howden', 'Agrimeco',
        'Vinalift', 'Wabag', 'KPA', 'Alimak', 'PMTT', 'FL Smidth', 'GE', 'KSB', 'Atlas Copco'] },
      { n: 'PKL_No', l: 'Số PKL (PKL No.)', t: 'text' },
      { n: 'PSIC_No', l: 'Số PSIC', t: 'text' },
      { n: 'Package_No', l: 'Số kiện (Package No.)', t: 'text' },
      { n: 'DVT', l: 'Đơn vị (Unit)', t: 'enum', other: true, opts: ['Package', 'Pcs', 'Bundle', 'Crate', 'Box', 'Skid', 'Pallet', 'Wooden drum', 'Frame'] },
      { n: 'So_luong', l: 'Số lượng', t: 'number', init: 1 },
      { n: 'Don_vi_KL', l: 'Đơn vị đo (Measure)', t: 'enum', opts: ['Kg', 'm2', 'Liter', 'm'], init: 'Kg' },
      { n: 'KL_tinh', l: 'Khối lượng tịnh (Net Weight)', t: 'number' },
      { n: 'Ghi_chu', l: 'Ghi chú (Remarks)', t: 'longtext' },
      // Phase 2 / 3 — biên bản (mỗi biên bản nhập 1 lần, kiện chỉ trỏ tới)
      { n: 'MGMER', l: 'Biên bản kiểm đếm (MGMER)', s: 'MGMER', t: 'ref', ref: 'MGMER' },
      { n: 'GIR', l: 'Biên bản mở kiện (GIR)', s: 'GIR', t: 'ref', ref: 'GIR' },
      { n: 'OSD', l: 'Biên bản dư/thiếu/hỏng (OSD)', s: 'OSD', t: 'ref', ref: 'OSD' },
      // Cột ảo — tính từ biên bản và lần kiểm tra mới nhất
      { n: 'Phase', l: 'Giai đoạn', t: 'text', opts: PHASES, v: phaseOf },
      { n: 'Ngay_dem', l: 'Ngày kiểm đếm (MGMER Date)', s: 'Về ngày', t: 'date', v: (r, db) => docDate(db, 'MGMER', r.MGMER) },
      { n: 'Ngay_mo', l: 'Ngày mở kiện (GIR Date)', t: 'date', v: (r, db) => docDate(db, 'GIR', r.GIR) },
      { n: 'Vi_tri', l: 'Vị trí lưu kho (mới nhất)', s: 'Vị trí', t: 'text', v: (r, db) => { const c = lastCheck(db, r.id); return c ? c.Vi_tri : ''; } },
      { n: 'Tinh_trang', l: 'Tình trạng kiện (mới nhất)', t: 'text', v: (r, db) => { const c = lastCheck(db, r.id); return c ? c.Tinh_trang : ''; } },
      { n: 'Ngay_KT', l: 'Ngày kiểm tra (mới nhất)', t: 'date', v: (r, db) => { const c = lastCheck(db, r.id); return c ? c.Ngay : ''; } }
    ],
    list: { hint: 'Tìm mô tả, số PKL, số kiện, bản vẽ, nhà cung cấp…', excel: 'KIEN', filter: ['Goi_thau', 'Phase'], lead: 'Goi_thau', sort: 'STT', cols: ['Nha_cung_cap', 'Vi_tri', 'Ngay_dem'], countUnit: 'kiện', page: true },
    detail: { stats: ['Ngay_dem', 'Ngay_mo', 'Vi_tri'], hide: ['Phase'] },
    badge: (r, db) => {
      if (r.OSD && db.get('OSD', r.OSD)) return { text: 'Có OSD', cls: 'warn' };
      return r.GIR ? { text: 'Đã mở kiện', cls: 'ok' } : r.MGMER ? { text: 'Đã kiểm đếm', cls: 'info' } : { text: 'Chưa về', cls: 'muted' };
    },
    related: [{ t: 'KIEM_TRA', fk: 'Kien', l: 'Lịch sử vị trí & tình trạng' }]
  };

  T.MGMER = {
    label: 'Biên bản kiểm đếm (MGMER)', key: 'id', unique: { f: 'So', scope: 'Goi_thau' }, fileName: docFile('MGMER'),
    title: r => 'MGMER ' + (r.So || '?'), sub: r => [r.Goi_thau, r.Dia_diem].filter(Boolean).join(' · '),
    needs: ['GOI_THAU', 'KIEN'],
    fields: [
      { n: 'So', l: 'Số MGMER', t: 'text', req: true },
      { n: 'Ngay', l: 'Ngày kiểm đếm', t: 'date', init: 'today', req: true },
      { n: 'Goi_thau', l: 'Gói thầu', t: 'ref', ref: 'GOI_THAU', req: true },
      { n: 'Dia_diem', l: 'Nơi kiểm đếm', t: 'enum', opts: ['Tại công trường', 'Tại cảng'], init: 'Tại công trường' },
      { n: 'Thanh_phan', l: 'Thành phần tham gia', t: 'text' },
      { n: 'File', l: 'Biên bản (PDF)', t: 'file' },
      { n: 'Thu_muc', l: 'Thư mục hồ sơ trên Drive', s: 'Thư mục Drive', t: 'url' },
      { n: 'Duong_dan', l: 'Đường dẫn thư mục biên bản (từ file Total)', t: 'text' },
      { n: 'Ghi_chu', l: 'Ghi chú', t: 'longtext' },
      { n: 'So_kien', l: 'Số kiện', t: 'number', v: (r, db) => countBy(db, 'MGMER').get(String(r.id)) || 0 }
    ],
    list: { excel: 'MGMER', filter: 'Goi_thau', lead: 'Goi_thau', sort: 'Ngay', desc: true, cols: ['Ngay', 'So_kien'], sum: 'So_kien', unit: 'kiện', countUnit: 'biên bản', range: true },
    detail: { stats: ['Ngay', 'So_kien'] },
    related: [{ t: 'KIEN', fk: 'MGMER', l: 'Các kiện đã đếm trong biên bản', pick: true }, { t: 'GIR', fk: 'MGMER', l: 'Các lần mở kiện' }],
    // Chọn nhiều kiện cho biên bản (js/pick.js): field = cột của kiện trỏ tới biên bản, modes = các cách lọc sẵn,
    // loc = cho ghi luôn vị trí lưu kho (bảng KIEM_TRA, ngày = ngày biên bản) cho các kiện vừa chọn
    assign: { field: 'MGMER', verb: 'kiểm đếm', loc: true, modes: [
      { id: 'free', l: 'Chưa có biên bản kiểm đếm', f: k => !k.MGMER },
      { id: 'all', l: 'Tất cả kiện của gói', f: () => true }
    ] }
  };

  T.KIEM_TRA = {
    label: 'Vị trí & tình trạng kiện', key: 'id',
    // Ảnh kiểm tra: "KT No.<số thứ tự kiện (cột No. file Total)> - <gói> - <ngày>"
    fileName: (r, db) => { const k = db.get('KIEN', r.Kien); return ['KT No.' + (k && k.STT !== '' && k.STT != null ? k.STT : r.Kien), k && k.Goi_thau, U.fmtDate(r.Ngay).split('/').join('-')].filter(Boolean).join(' - '); },
    title: (r, db) => { const k = db.get('KIEN', r.Kien); return k ? db.title('KIEN', k) : '(kiện đã xoá)'; },
    sub: r => [r.Vi_tri, r.Tinh_trang].filter(Boolean).join(' · '),
    needs: ['KIEN'],
    fields: [
      { n: 'Kien', l: 'Kiện', t: 'ref', ref: 'KIEN', req: true },
      // Cột ảo: gói thầu lấy theo kiện (lần kiểm tra không lưu gói riêng) → lọc / hiện gói ở danh sách
      { n: 'Goi_thau', l: 'Gói thầu', t: 'ref', ref: 'GOI_THAU', v: (r, db) => { const k = db.get('KIEN', r.Kien); return k ? k.Goi_thau : ''; } },
      { n: 'Ngay', l: 'Ngày kiểm tra', s: 'Ngày', t: 'date', init: 'today', req: true },
      { n: 'Vi_tri', l: 'Vị trí lưu kho', t: 'enum', other: true, req: true, opts: ['Closed WH', 'Opened WH', 'Cold WH', 'Workshop', 'F5', 'F5-1A', 'F5-3', 'F5-4', 'F6',
        'Bãi Giáo', 'A4', 'A5', 'A7', 'Kho Than', 'FGD', 'Container', 'Installed'] },
      { n: 'Tinh_trang', l: 'Tình trạng kiện', t: 'enum', other: true, opts: ['OK', 'Không thấy', 'Opened', 'Box Broken', 'Tarpaulin Broken', 'Rusted', 'Bent'], init: 'OK' },
      { n: 'Nguoi_KT', l: 'Người kiểm tra', s: 'Người KT', t: 'text' },
      { n: 'RFI', l: 'RFI', t: 'text' },
      { n: 'Ghi_chu', l: 'Ghi chú sau kiểm tra', t: 'longtext' },
      { n: 'Anh_link', l: 'Đường dẫn ảnh / tài liệu kiểm tra (từ file Total)', t: 'text' },
      { n: 'RFI_link', l: 'Đường dẫn file RFI (từ file Total)', t: 'text' },
      { n: 'Hinh_anh', l: 'Hình ảnh', t: 'image' }
    ],
    list: { hint: 'Tìm kiện, vị trí, người kiểm tra…', filter: ['Goi_thau', 'Tinh_trang'], lead: 'Goi_thau', sort: 'Ngay', desc: true, cols: ['Ngay', 'Nguoi_KT'], countUnit: 'lần kiểm tra', range: true, page: true },
    detail: { stats: ['Ngay', 'Vi_tri', 'Tinh_trang'] },
    badge: r => !r.Tinh_trang || /^ok$/i.test(r.Tinh_trang) ? null : { text: r.Tinh_trang, cls: r.Tinh_trang === 'Không thấy' ? 'bad' : 'warn' }
  };

  T.GIR = {
    label: 'Biên bản mở kiện (GIR)', key: 'id', unique: { f: 'So', scope: 'Goi_thau' }, fileName: docFile('GIR'),
    title: r => 'GIR ' + (r.So || '?'), sub: (r, db) => { const m = db.get('MGMER', r.MGMER); return [r.Goi_thau, m && 'MGMER ' + m.So].filter(Boolean).join(' · '); },
    needs: ['GOI_THAU', 'MGMER', 'KIEN'],
    fields: [
      { n: 'So', l: 'Số GIR', t: 'text', req: true },
      { n: 'Ngay', l: 'Ngày mở kiện', t: 'date', init: 'today', req: true },
      { n: 'Goi_thau', l: 'Gói thầu', t: 'ref', ref: 'GOI_THAU', req: true },
      { n: 'MGMER', l: 'Thuộc biên bản kiểm đếm', t: 'ref', ref: 'MGMER' },
      { n: 'Thanh_phan', l: 'Thành phần tham gia', t: 'text' },
      { n: 'File', l: 'Biên bản (PDF)', t: 'file' },
      { n: 'Ghi_chu', l: 'Ghi chú', t: 'longtext' },
      { n: 'So_kien', l: 'Số kiện', t: 'number', v: (r, db) => countBy(db, 'GIR').get(String(r.id)) || 0 }
    ],
    list: { excel: 'GIR', filter: 'Goi_thau', lead: 'Goi_thau', sort: 'Ngay', desc: true, cols: ['Ngay', 'So_kien'], sum: 'So_kien', unit: 'kiện', countUnit: 'biên bản', range: true },
    detail: { stats: ['Ngay', 'So_kien'] },
    related: [{ t: 'KIEN', fk: 'GIR', l: 'Các kiện đã mở', pick: true }, { t: 'OSD', fk: 'GIR', l: 'Biên bản OSD phát sinh' }],
    assign: { field: 'GIR', verb: 'mở kiện', modes: [
      { id: 'mg', l: 'Thuộc biên bản kiểm đếm của lần mở này', when: rec => rec.MGMER, f: (k, rec) => k.MGMER === rec.MGMER },
      { id: 'free', l: 'Đã kiểm đếm, chưa mở', f: k => k.MGMER && !k.GIR },
      { id: 'all', l: 'Tất cả kiện của gói', f: () => true }
    ] }
  };

  T.OSD = {
    label: 'Biên bản OSD', key: 'id', unique: { f: 'So', scope: 'Goi_thau' }, fileName: docFile('OSD'),
    // OSD chỉ là biên bản ghi nhận dư / thiếu / hỏng — không theo dõi Open/Closed nữa (user chốt 16/10/2026);
    // biện pháp xử lý ghi dần vào Ghi chú. Ghi chú dùng lại cột Noi_dung có sẵn trên Sheet (không phải đổi máy chủ);
    // cột Trang_thai / Ngay_dong cũ trên Sheet để nguyên, app không đọc / ghi nữa.
    title: r => r.So || '(chưa có số)',
    sub: r => [r.Loai, r.Noi_dung && String(r.Noi_dung).replace(/\s+/g, ' ').slice(0, 90)].filter(Boolean).join(' · '),
    needs: ['GOI_THAU', 'GIR', 'KIEN'],
    fields: [
      { n: 'So', l: 'Số OSD', t: 'text', req: true },
      { n: 'Ngay', l: 'Ngày lập', t: 'date', init: 'today', req: true },
      // Gói không bắt buộc (kiện gắn vào OSD đã mang gói) — app tự điền khi biết: theo lần mở kiện, theo gói duy nhất
      // của người lập (beforeSave), hoặc theo các kiện được chọn (pick.js). Vẫn cần gói để phân quyền cán bộ / nhà thầu theo gói.
      { n: 'Goi_thau', l: 'Gói thầu', t: 'ref', ref: 'GOI_THAU' },
      { n: 'GIR', l: 'Phát sinh từ lần mở kiện', t: 'ref', ref: 'GIR' },
      // multi: 1 kiện có thể vừa thiếu vừa hỏng → chọn nhiều, lưu "A, B" trong cùng cột
      { n: 'Loai', l: 'Loại', t: 'enum', multi: true, opts: ['Thiếu (Shortage)', 'Hư hỏng (Damage)', 'Dư (Overage)', 'Khác'] },
      { n: 'Noi_dung', l: 'Ghi chú', t: 'longtext', ph: 'Dư / thiếu / hỏng gì, biện pháp xử lý (bù hàng, thay thế, chấp nhận, bảo hiểm…) — cập nhật dần' },
      { n: 'File', l: 'Biên bản (PDF)', t: 'file' },
      { n: 'So_kien', l: 'Số kiện', t: 'number', v: (r, db) => countBy(db, 'OSD').get(String(r.id)) || 0 }
    ],
    list: { hint: 'Tìm số OSD, ghi chú…', filter: ['Goi_thau', 'Loai'], lead: 'Goi_thau', sort: 'Ngay', desc: true, cols: ['Ngay', 'So_kien'], sum: 'So_kien', unit: 'kiện', countUnit: 'biên bản', range: true },
    detail: { stats: ['Ngay', 'Loai', 'So_kien'], hide: [] },
    // Trước khi lưu form: điền gói còn trống; trả { f, msg } nếu không lưu được
    beforeSave: (o, { db, user }) => {
      if (!o.Goi_thau && o.GIR) { const g = db.get('GIR', o.GIR); if (g && g.Goi_thau) o.Goi_thau = g.Goi_thau; }
      const goi = !user.admin && user.goi && user.goi.length ? user.goi : null;   // người chỉ được làm một số gói
      if (!o.Goi_thau && goi && goi.length === 1) o.Goi_thau = goi[0];
      if (!o.Goi_thau && goi) return { f: 'Goi_thau', msg: 'Bạn phụ trách nhiều gói — chọn gói thầu hoặc lần mở kiện để app biết OSD thuộc gói nào' };
      return null;
    },
    related: [{ t: 'KIEN', fk: 'OSD', l: 'Các kiện liên quan', pick: true }],
    assign: { field: 'OSD', verb: 'lập OSD', modes: [
      { id: 'gir', l: 'Thuộc lần mở kiện phát sinh OSD', when: rec => rec.GIR, f: (k, rec) => k.GIR === rec.GIR },
      { id: 'open', l: 'Đã mở kiện', f: k => !!k.GIR },
      { id: 'all', l: 'Tất cả kiện của gói', f: () => true }
    ] }
  };

  // Nhật ký mỗi lần nhập file Excel (js/excel.js) — Hoan_tac giữ những gì đã thêm / giá trị cũ để hoàn tác cả lô
  T.NHAP_EXCEL = {
    label: 'Lịch sử nhập Excel', key: 'id', title: r => r.Ten_file || '(không tên)',
    sub: r => [r.Mau, r.Goi_thau && 'gói ' + r.Goi_thau, U.fmtDateTime(r.Thoi_gian), r.Nguoi].filter(Boolean).join(' · '),
    fields: [
      { n: 'Thoi_gian', l: 'Thời gian', t: 'datetime' },
      { n: 'Nguoi', l: 'Người nhập', t: 'text' },
      { n: 'Mau', l: 'Mẫu', t: 'text' },
      { n: 'Goi_thau', l: 'Gói thầu', t: 'text' },
      { n: 'Ten_file', l: 'Tên file', t: 'text' },
      { n: 'So_moi', l: 'Kiện thêm mới', t: 'number' },
      { n: 'So_cap_nhat', l: 'Kiện cập nhật', t: 'number' },
      { n: 'So_bien_ban', l: 'Biên bản tạo mới', t: 'number' },
      { n: 'So_vi_tri', l: 'Dòng vị trí ghi thêm', t: 'number' },
      { n: 'So_bo_qua', l: 'Dòng lỗi / bỏ qua', t: 'number' },
      { n: 'Trang_thai', l: 'Trạng thái', t: 'text' },
      { n: 'Hoan_tac', l: 'Dữ liệu hoàn tác', t: 'longtext' }
    ],
    list: { sort: 'Thoi_gian', desc: true },
    detail: { hide: ['Hoan_tac'] },
    badge: r => r.Trang_thai === 'Đã hoàn tác' ? { text: 'Đã hoàn tác', cls: 'muted' } : { text: 'Đã ghi', cls: 'ok' }
  };

  // ---------------- 2. GÓI THẦU & NHÂN SỰ ----------------
  T.GOI_THAU = {
    label: 'Gói thầu', key: 'MaGoi', keyEditable: true, title: r => r.MaGoi, sub: r => r.TenGoi,
    needs: ['NHAN_SU', 'KIEN'],
    fields: [
      { n: 'MaGoi', l: 'Mã gói thầu', t: 'text', req: true },
      { n: 'TenGoi', l: 'Tên gói thầu', t: 'longtext', req: true },
      { n: 'Nha_thau', l: 'Nhà thầu chính', s: 'Nhà thầu', t: 'text' },
      { n: 'Thau_phu', l: 'Thầu phụ', t: 'text' },
      { n: 'Tinh_trang', l: 'Tình trạng', t: 'enum', opts: ['Đang thực hiện', 'Tạm dừng', 'Đã hoàn thành', 'Chưa triển khai'], init: 'Đang thực hiện' },
      { n: 'Ngay_ky', l: 'Ngày ký hợp đồng', t: 'date' },
      { n: 'Thoi_gian', l: 'Thời gian thực hiện', t: 'text' },
      { n: 'Ngay_bat_dau', l: 'Ngày bắt đầu', t: 'date' },
      { n: 'Ngay_ket_thuc', l: 'Ngày kết thúc dự kiến', t: 'date' },
      { n: 'Can_bo', l: 'Cán bộ phụ trách (Phòng)', t: 'ref', ref: 'NHAN_SU' },
      { n: 'Thu_muc', l: 'Thư mục hồ sơ', t: 'url' },
      { n: 'Restart_Phase', l: 'Tên trong file Total (cột Restart Phase)', t: 'text' },
      { n: 'Ghi_chu', l: 'Ghi chú', t: 'longtext' },
      { n: 'So_kien', l: 'Số kiện vật tư', s: 'Số kiện', t: 'number', v: (r, db) => countBy(db, 'Goi_thau').get(String(r.MaGoi)) || 0 }
    ],
    list: { group: 'Tinh_trang', lead: 'MaGoi', sort: 'MaGoi', cols: ['Nha_thau', 'So_kien'] },
    detail: { stats: ['So_kien', 'Ngay_ky', 'Ngay_ket_thuc'] },
    badge: r => r.Tinh_trang === 'Tạm dừng' ? { text: 'Tạm dừng', cls: 'warn' } : r.Tinh_trang === 'Đã hoàn thành' ? { text: 'Hoàn thành', cls: 'ok' } : null,
    related: [{ t: 'NHAN_SU', fk: 'Goi_thau', l: 'Liên hệ của gói' }, { t: 'MGMER', fk: 'Goi_thau', l: 'Biên bản kiểm đếm' }, { t: 'OSD', fk: 'Goi_thau', l: 'Biên bản OSD' }]
  };

  T.NHAN_SU = {
    label: 'Danh bạ', key: 'id', title: r => r.Ho_ten, sub: r => [r.Chuc_vu, r.Don_vi].filter(Boolean).join(' · '),
    needs: ['GOI_THAU'],
    fields: [
      { n: 'Ho_ten', l: 'Họ và tên', t: 'text', req: true },
      { n: 'Nhom', l: 'Nhóm', t: 'enum', opts: ['Phòng TCXL', 'Ban QLDA', 'Nhà thầu', 'Tư vấn', 'Khác'], init: 'Phòng TCXL', req: true },
      { n: 'Chuc_vu', l: 'Chức vụ', t: 'text' },
      { n: 'Don_vi', l: 'Đơn vị', t: 'text' },
      { n: 'Goi_thau', l: 'Gói thầu liên quan', t: 'ref', ref: 'GOI_THAU' },
      { n: 'Dien_thoai', l: 'Điện thoại', t: 'phone' },
      { n: 'Email', l: 'Email', t: 'email' },
      { n: 'Ghi_chu', l: 'Ghi chú', t: 'longtext' }
    ],
    list: { group: 'Nhom', filter: 'Nhom', sort: 'Ho_ten', cols: ['Dien_thoai', 'Goi_thau'], avatar: 'initials', countUnit: 'người' }
  };

  T.LINK = {
    label: 'Liên kết nhanh', key: 'id', title: r => r.Ten, sub: r => r.Mo_ta || r.Link,
    fields: [
      { n: 'Ten', l: 'Tên', t: 'text', req: true },
      { n: 'Nhom', l: 'Nhóm', t: 'enum', other: true, opts: ['Thư mục Drive', 'Hệ thống văn bản', 'Báo cáo', 'Công cụ', 'Khác'] },
      { n: 'Link', l: 'Địa chỉ (link)', t: 'url', req: true },
      { n: 'Mo_ta', l: 'Mô tả', t: 'text' },
      { n: 'Thu_tu', l: 'Thứ tự', t: 'number' }
    ],
    list: { group: 'Nhom', sort: 'Thu_tu', countUnit: 'liên kết' }
  };

  // ---------------- DẠNG BẢNG (js/grid.js) ----------------
  // Cột hiện mặc định — người dùng tự đổi bằng nút "Cột" (lưu theo từng máy); _badge = cột Trạng thái (nhãn màu)
  const TCOLS = {
    KIEN: ['STT', 'Goi_thau', 'He_thong', 'Mo_ta', 'PKL_No', 'Package_No', 'Nha_cung_cap', 'KL_tinh', 'Phase', 'Ngay_dem', 'Ngay_mo', 'Vi_tri', 'OSD'],
    MGMER: ['So', 'Ngay', 'Goi_thau', 'Dia_diem', 'So_kien', 'Thanh_phan', 'Ghi_chu'],
    KIEM_TRA: ['Ngay', 'Kien', 'Goi_thau', 'Vi_tri', 'Tinh_trang', 'Nguoi_KT', 'RFI', 'Ghi_chu'],
    GIR: ['So', 'Ngay', 'Goi_thau', 'MGMER', 'So_kien', 'Thanh_phan', 'Ghi_chu'],
    OSD: ['So', 'Ngay', 'Goi_thau', 'GIR', 'Loai', 'So_kien', 'Noi_dung'],
    GOI_THAU: ['MaGoi', 'TenGoi', 'Nha_thau', 'Tinh_trang', 'Ngay_ky', 'Can_bo', 'So_kien'],
    NHAN_SU: ['Ho_ten', 'Nhom', 'Chuc_vu', 'Don_vi', 'Goi_thau', 'Dien_thoai', 'Email'],
    LINK: ['Ten', 'Nhom', 'Link', 'Mo_ta'],
    NHAP_EXCEL: ['Thoi_gian', 'Nguoi', 'Mau', 'Goi_thau', 'Ten_file', 'So_moi', 'So_cap_nhat', 'Trang_thai']
  };
  Object.keys(TCOLS).forEach(t => { T[t].list = Object.assign(T[t].list || {}, { tcols: TCOLS[t] }); });
  // Độ rộng gợi ý (px) cho cột chữ dài; cột khác theo kiểu (ngày, số, danh sách…)
  const COLW = { 'KIEN.Mo_ta': 260, 'KIEN.Phase': 150, 'KIEN.He_thong': 150, 'KIEM_TRA.Kien': 240, 'OSD.Noi_dung': 300, 'OSD.Loai': 170,
    'GOI_THAU.TenGoi': 280, 'NHAN_SU.Ho_ten': 180, 'LINK.Ten': 220, 'MGMER.Thanh_phan': 200, 'GIR.Thanh_phan': 200 };
  Object.keys(COLW).forEach(k => { const [t, n] = k.split('.'), f = T[t].fields.find(x => x.n === n); if (f) f.w = COLW[k]; });
  T.KIEN.fields.find(f => f.n === 'STT').plain = true;   // số thứ tự: hiện "1112", không "1.112"

  // ---------------- MENU: NHÓM → MỤC ----------------
  // Mỗi mục có khoá quyền (perm). Mục bảng: perm = tên bảng. ic = biểu tượng (js/icons.js), desc = mô tả ngắn, color = màu nhóm
  const GROUPS = [
    { key: 'g0', label: 'Quản lý vật tư', ic: 'box', color: 'var(--g2)', items: [
      { key: 'DASH_VATTU', label: 'Thống kê tổng', ic: 'chart', desc: 'Tiến độ hàng về, mở kiện, OSD', type: 'dash' },
      { key: 'KIEN', label: 'P1 · Nhập vật tư', ic: 'box', desc: 'Danh sách kiện nhà thầu thông báo' },
      { key: 'MGMER', label: 'P2 · Kiểm đếm', ic: 'inspect', desc: 'Biên bản đếm kiện (MGMER)' },
      { key: 'KIEM_TRA', label: 'P2 · Vị trí & tình trạng', ic: 'pin', desc: 'Kiện để ở đâu, còn tốt không' },
      { key: 'GIR', label: 'P3 · Mở kiện', ic: 'open', desc: 'Biên bản mở kiện (GIR)' },
      { key: 'OSD', label: 'P3 · Biên bản OSD', ic: 'alert', desc: 'Dư, thiếu, hư hỏng' },
      { key: 'EXCEL', label: 'Nhập / xuất Excel', ic: 'upload', desc: 'Tải mẫu, điền, tải lên cả loạt', type: 'excel' }
    ] },
    { key: 'g1', label: 'Gói thầu & nhân sự', ic: 'folder', color: 'var(--g0)', items: [
      { key: 'GOI_THAU', ic: 'folder', desc: 'Nhà thầu, hợp đồng, phụ trách' },
      { key: 'NHAN_SU', ic: 'contacts', desc: 'Phòng, Ban, nhà thầu, tư vấn' },
      { key: 'LINK', ic: 'link', desc: 'Thư mục, hệ thống hay dùng' }
    ] }
  ];
  GROUPS.forEach(g => g.items.forEach(it => {
    if (!it.type) { it.type = 'table'; it.table = it.key; it.label = it.label || T[it.key].label; }
    it.perm = it.key;
    it.color = g.color;
  }));
  const groupsWithAlbums = () => GROUPS;   // app này không có album ảnh (giữ tên hàm cho khung chung)

  window.SCHEMA = { tables: T, groups: GROUPS, groupsWithAlbums, PHASES, phaseOf, lastCheck, goiOpts };
})();
