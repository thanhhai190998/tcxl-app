// =====================================================================
//  API DEMO: dữ liệu GIẢ lưu trong trình duyệt (localStorage) để chạy thử.
//  Cùng giao diện với LiveAPI và áp dụng y hệt logic phân quyền.
//  Số liệu sinh ngẫu nhiên (cố định theo hạt giống) theo đúng tỷ lệ của file
//  "Goods delivered to Site": gói EPC cũ phần lớn đã mở kiện, T12 mới kiểm đếm một phần,
//  các gói còn lại mới thông báo. Không có dữ liệu thật nào ở đây.
// =====================================================================
(function () {
  const KEY = 'tcxl-demo-v1', FKEY = 'tcxl-demo-files-v1', UKEY = 'tcxl-demo-user';
  const OWNER = 'quan.tri@demo';
  const T = () => window.SCHEMA.tables;

  // Số ngẫu nhiên có hạt giống → lần nào đặt lại demo cũng ra cùng bộ dữ liệu
  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const pad = (n, w) => String(n).padStart(w, '0');
  const iso = d => U.iso(d);
  const addDays = (s, n) => { const d = U.parseDate(s); d.setDate(d.getDate() + n); return iso(d); };

  function seed() {
    const R = rng(20261015);
    const pick = a => a[Math.floor(R() * a.length)];
    const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    let nid = 0;
    const id = p => p + pad(++nid, 5);

    const t = { GOI_THAU: [], NHAN_SU: [], LINK: [], KIEN: [], MGMER: [], GIR: [], OSD: [], KIEM_TRA: [], NHAP_EXCEL: [] };

    // ---- Danh bạ ----
    const ns = (Ho_ten, Nhom, Chuc_vu, Don_vi, Goi_thau, i) => {
      const r = { id: id('NS'), Ho_ten, Nhom, Chuc_vu, Don_vi, Goi_thau: Goi_thau || '', Dien_thoai: '09000000' + pad(i, 2), Email: 'demo' + i + '@example.com', Ghi_chu: '' };
      t.NHAN_SU.push(r); return r.id;
    };
    const tp = ns('Nguyễn Văn An (demo)', 'Phòng TCXL', 'Trưởng phòng', 'Phòng Thi công Xây lắp', '', 1);
    const pp = ns('Trần Thị Bình (demo)', 'Phòng TCXL', 'Phó phòng', 'Phòng Thi công Xây lắp', '', 2);
    const cv = [ns('Lê Văn Cường (demo)', 'Phòng TCXL', 'Chuyên viên', 'Phòng Thi công Xây lắp', '', 3),
      ns('Phạm Minh Dũng (demo)', 'Phòng TCXL', 'Chuyên viên', 'Phòng Thi công Xây lắp', '', 4),
      ns('Hoàng Thu Hà (demo)', 'Phòng TCXL', 'Chuyên viên', 'Phòng Thi công Xây lắp', '', 5),
      ns('Võ Quốc Khánh (demo)', 'Phòng TCXL', 'Chuyên viên', 'Phòng Thi công Xây lắp', '', 6)];
    ns('Đỗ Văn Lâm (demo)', 'Ban QLDA', 'Phó Giám đốc Ban', 'Ban QLDA Long Phú 1', '', 7);
    ns('Bùi Thị Mai (demo)', 'Ban QLDA', 'Văn thư', 'Văn phòng Ban', '', 8);
    ns('Kỹ sư kho bãi (demo)', 'Nhà thầu', 'Giám sát kho', 'Nhà thầu T12 (demo)', 'T12', 9);
    ns('Chỉ huy trưởng (demo)', 'Nhà thầu', 'Chỉ huy trưởng', 'Nhà thầu T12 (demo)', 'T12', 10);
    ns('Điều phối vật tư (demo)', 'Nhà thầu', 'Điều phối', 'Nhà thầu T22 (demo)', 'T22', 11);
    ns('Tư vấn giám sát (demo)', 'Tư vấn', 'Kỹ sư TVGS', 'Đơn vị tư vấn (demo)', '', 12);

    // ---- Gói thầu ----
    const goi = (MaGoi, TenGoi, Nha_thau, Tinh_trang, Ngay_ky, Thoi_gian, Can_bo) => t.GOI_THAU.push({ MaGoi, TenGoi, Nha_thau, Thau_phu: '', Tinh_trang, Ngay_ky,
      Thoi_gian, Ngay_bat_dau: Ngay_ky, Ngay_ket_thuc: Ngay_ky && Thoi_gian ? addDays(Ngay_ky, parseInt(Thoi_gian, 10)) : '', Can_bo, Thu_muc: 'https://example.com/ho-so/' + MaGoi, Ghi_chu: '' });
    goi('EPC', 'Hàng của tổng thầu EPC trước (Previous EPC) (demo)', 'Tổng thầu EPC cũ (demo)', 'Đã hoàn thành', '2015-06-01', '', pp);
    goi('T09', 'Gói T09 (demo)', 'Nhà thầu T09 (demo)', 'Đang thực hiện', '2025-11-10', '480 ngày', cv[0]);
    goi('T12', 'Gói T12 – ESP & FGD (demo)', 'Nhà thầu T12 (demo)', 'Đang thực hiện', '2025-08-20', '540 ngày', cv[1]);
    goi('T17', 'Gói T17 (demo)', 'Nhà thầu T17 (demo)', 'Đang thực hiện', '2026-01-15', '365 ngày', cv[2]);
    goi('T21', 'Gói T21 (demo)', 'Nhà thầu T21 (demo)', 'Đang thực hiện', '2026-02-01', '420 ngày', cv[2]);
    goi('T22', 'Gói T22 – Hệ thống đá vôi, thạch cao (demo)', 'Nhà thầu T22 (demo)', 'Đang thực hiện', '2025-12-05', '510 ngày', cv[3]);
    goi('T23', 'Gói T23 – Hệ thống thải xỉ (demo)', 'Nhà thầu T23 (demo)', 'Chưa triển khai', '2026-06-01', '534 ngày', cv[3]);

    // ---- Liên kết nhanh ----
    [['Thư mục biên bản kiểm đếm (MGMER)', 'Thư mục Drive', 1], ['Thư mục hồ sơ gói thầu', 'Thư mục Drive', 2], ['Hệ thống văn bản điện tử', 'Hệ thống văn bản', 3],
      ['Báo cáo tuần của Phòng', 'Báo cáo', 4], ['Mẫu nhập liệu vật tư (Excel)', 'Công cụ', 5], ['Lịch họp giao ban', 'Khác', 6]]
      .forEach(([Ten, Nhom, Thu_tu]) => t.LINK.push({ id: id('LK'), Ten: Ten + ' (demo)', Nhom, Link: 'https://example.com/' + Thu_tu, Mo_ta: '', Thu_tu }));

    // ---- Kiện ----
    const SYS = {
      Boiler: { sup: ['TKZ', 'Đại Dũng'], items: ['Pressure Parts – Economizer', 'Pressure Parts – Superheater', 'Main Steel Structure – Column', 'Main Steel Structure – Beam', 'Connection Bolts', 'Grating', 'Furnace Platform', 'Boiler Stair & Elevator'] },
      ESP: { sup: ['KC Cottrell'], items: ['Casing, Nozzle, Hopper', 'Collecting Electrode', 'Discharge Electrode', 'Rapping System', 'Transformer Rectifier', 'Support Structure', 'Expansion Joint'] },
      FGD: { sup: ['KC Cottrell'], items: ['Absorber Area Steel Structure', 'GGH Heating Elements – Single-Layer Baskets', 'Flue Gas Duct', 'GGH Casing', 'Limestone Slurry Pump', 'Oxidation Air Blower', 'Access Walkway'] },
      'RAPH & SCR': { sup: ['Howden', 'Termokimik'], items: ['RAPH Rotor Module', 'RAPH Steel Structure', 'SCR Catalyst Module', 'SCR Reactor Casing'] },
      'Boiler Auxiliaries': { sup: ['Loesche', 'Agrimeco'], items: ['Coal Pulverizer', 'Coal Feeder', 'Seal Air Fan'] },
      'PH Building': { sup: ['Đại Dũng'], items: ['Column, Beam, Plate', 'Roof Truss', 'Wall Cladding'] },
      'Hoist & Crane': { sup: ['Vinalift', 'Alimak'], items: ['Overhead Crane', 'Electric Hoist', 'Rack & Pinion Elevator'] },
      'Water Treatment Plant': { sup: ['Wabag'], items: ['Filter Vessel', 'Chemical Dosing Skid', 'RO Membrane'] },
      'Auxiliary Boiler': { sup: ['KPA'], items: ['Auxiliary Boiler Package'] },
      'CW System': { sup: ['KSB'], items: ['CW Pump', 'Butterfly Valve'] },
      Transformer: { sup: ['GE'], items: ['Generator Transformer Accessories', 'Unit Auxiliary Transformer'] },
      'Limestone and gypsum': { sup: ['FL Smidth'], items: ['Ball Mill Parts', 'Belt Conveyor'] },
      'Coal Handling System': { sup: ['FL Smidth'], items: ['Stacker Reclaimer Parts', 'Conveyor Idler'] },
      'Compressed Air System': { sup: ['Atlas Copco'], items: ['Air Compressor', 'Air Dryer'] }
    };
    const DVT = ['Package', 'Package', 'Package', 'Pcs', 'Bundle', 'Crate', 'Box', 'Skid', 'Pallet'];
    const PM = { Boiler: '014.1 Boiler', ESP: '042. ESP', FGD: '049. FGD', 'RAPH & SCR': '080. SCR', 'Boiler Auxiliaries': '029. Coal Pulverizer', 'PH Building': '015. Main Steel Structure' };
    let stt = 0;
    const kien = (goi, sys, pkl, i, n) => {
      const s = SYS[sys], dv = pick(DVT);
      const r = { id: id('K'), STT: ++stt, Goi_thau: goi, To_may: pick(['1', '1', '2', '2', 'C']), He_thong: sys, Goi_PM: PM[sys] || '', Hang_muc: '',
        Mo_ta: pick(s.items), Ban_ve: 'LP1-DEMO-' + sys.slice(0, 3).toUpperCase().replace(/\W/g, 'X') + '-DWG-' + pad(int(1, 899), 4),
        Nha_cung_cap: pick(s.sup), PKL_No: pkl, PSIC_No: String(int(1, 2500)),
        Package_No: goi === 'EPC' && R() < 0.25 ? 'N/A' : goi === 'EPC' ? i + '/' + n : 'LPF-' + goi + '-' + pkl.replace(/\D/g, '').slice(-3) + '-' + pad(i, 3),
        DVT: dv, So_luong: dv === 'Pcs' ? int(1, 400) : 1, Don_vi_KL: 'Kg', KL_tinh: dv === 'Box' ? int(20, 600) : int(150, 18000),
        Ghi_chu: '', MGMER: '', GIR: '', OSD: '' };
      t.KIEN.push(r); return r;
    };
    // Gói → [số kiện, hệ thống, ngày kiểm đếm sớm nhất/ muộn nhất, tỷ lệ đã về, tỷ lệ đã mở trong số đã về]
    const PLAN = [
      ['EPC', 900, Object.keys(SYS), '2016-03-01', '2019-06-30', 0.985, 0.86],
      ['T12', 450, ['ESP', 'FGD'], '2026-02-20', '2026-03-05', 0.22, 0],
      ['T09', 120, ['Water Treatment Plant', 'CW System', 'Compressed Air System'], '2026-08-10', '2026-09-25', 0.25, 0],
      ['T21', 26, ['Transformer'], '', '', 0, 0],
      ['T22', 19, ['Limestone and gypsum'], '', '', 0, 0],
      ['T17', 6, ['Coal Handling System'], '', '', 0, 0]
    ];
    let mg = 0, gi = 0;
    const span = (a, b) => Math.max(1, U.daysBetween(a, b));
    PLAN.forEach(([goi, total, systems, d0, d1, arrived, opened]) => {
      let made = 0, p = 0;
      while (made < total) {
        const sys = pick(systems), n = Math.min(total - made, int(4, 36));
        const pkl = (goi === 'EPC' ? '' : pad(++p, 2) + '-') + (goi === 'EPC' ? int(100, 990) : sys.replace(/\W/g, '').slice(0, 3).toUpperCase());
        const rows = []; for (let i = 1; i <= n; i++) rows.push(kien(goi, sys, String(pkl), i, n));
        made += n;
        if (R() >= arrived) continue;
        // Hàng đã về: 1 biên bản kiểm đếm cho cả PKL
        const date = addDays(d0, int(0, span(d0, d1)));
        const m = { id: id('MG'), So: goi === 'EPC' ? String(++mg) : goi + '-' + pad(++mg, 3), Ngay: date, Goi_thau: goi, Dia_diem: 'Tại công trường',
          Thanh_phan: 'Ban QLDA, nhà thầu, TVGS (demo)', File: '', Thu_muc: 'https://example.com/mgmer/' + mg, Ghi_chu: '' };
        t.MGMER.push(m);
        rows.forEach(r => { r.MGMER = m.id; });
        if (R() >= opened) continue;
        // Mở kiện sau 2–8 tháng, có khi chia 2 lần mở
        const parts = n > 12 && R() < 0.4 ? 2 : 1, cut = Math.ceil(n / parts);
        for (let k = 0; k < parts; k++) {
          const g = { id: id('GI'), So: m.So + '-' + (k + 1), Ngay: addDays(date, int(60, 240)), Goi_thau: goi, MGMER: m.id, Thanh_phan: 'Ban QLDA, nhà thầu (demo)', File: '', Ghi_chu: '' };
          t.GIR.push(g); gi++;
          rows.slice(k * cut, (k + 1) * cut).forEach(r => { r.GIR = g.id; });
        }
      }
    });
    // ---- OSD: vài lần mở kiện phát hiện thiếu / hỏng ----
    t.GIR.filter((g, i) => i % 6 === 2).slice(0, 8).forEach((g, i) => {
      const o = { id: id('OS'), So: 'OSD-DEMO-' + pad(i + 1, 3), Ngay: addDays(g.Ngay, int(0, 3)), Goi_thau: g.Goi_thau, GIR: g.id,
        Loai: pick(['Thiếu (Shortage)', 'Hư hỏng (Damage)', 'Hư hỏng (Damage)', 'Dư (Overage)']),
        Noi_dung: 'Phát hiện khi mở kiện (demo)' + (i < 3 ? '' : '. ' + pick(['Nhà thầu đã bù đủ hàng', 'Đã thay thế thiết bị hỏng', 'Chủ đầu tư chấp nhận, ghi nhận vào biên bản', 'Chuyển bảo hiểm xử lý']) + ' ngày ' + U.fmtDate(addDays(g.Ngay, int(20, 120)))),
        File: '' };
      t.OSD.push(o);
      t.KIEN.filter(r => r.GIR === g.id).slice(0, int(1, 3)).forEach(r => { r.OSD = o.id; });
    });
    // ---- Kiểm tra vị trí / tình trạng ----
    const chk = (r, Ngay, Vi_tri, Tinh_trang, Nguoi_KT, RFI) => t.KIEM_TRA.push({ id: id('KT'), Kien: r.id, Ngay, Vi_tri, Tinh_trang, Nguoi_KT, RFI: RFI || '', Ghi_chu: '', Hinh_anh: '' });
    // Đợt kiểm tra hàng tồn của EPC cũ (10/2023 – 3/2024), các kiện đã về nhưng chưa mở + một phần đã mở
    t.KIEN.filter(r => r.Goi_thau === 'EPC' && r.MGMER && (!r.GIR || R() < 0.25)).forEach(r => {
      chk(r, addDays('2023-10-12', int(0, 150)), pick(['Closed WH', 'Closed WH', 'Workshop', 'Opened WH', 'F5-4', 'Cold WH', 'F6']),
        R() < 0.88 ? 'OK' : pick(['Opened', 'Box Broken', 'Tarpaulin Broken']), 'Đơn vị bảo quản (demo)', 'RFI-DEMO-' + pad(int(1, 22), 3));
    });
    // Đợt kiểm tra T12 tháng 9/2026 (kể cả kiện chưa có biên bản kiểm đếm) — ~10% không thấy
    t.KIEN.filter(r => r.Goi_thau === 'T12' && R() < 0.6).forEach(r => {
      const seen = R() > 0.1;
      chk(r, pick(['2026-09-23', '2026-09-28', '2026-09-29']), seen ? pick(['Bãi Giáo', 'Bãi Giáo', 'A4', 'A5', 'A7', 'Closed WH', 'Kho Than', 'FGD']) : 'Bãi Giáo',
        seen ? 'OK' : 'Không thấy', pick(['Lê Văn Cường (demo)', 'Phạm Minh Dũng (demo)', 'Hoàng Thu Hà (demo)']));
    });

    const users = [
      { Email: 'can.bo.t12@demo', Ho_ten: 'Cán bộ phụ trách T12 (demo)', Kich_hoat: true, Admin: false, Goi_thau: 'T12',
        Quyen: { DASH_VATTU: 'view', KIEN: 'edit', MGMER: 'edit', KIEM_TRA: 'edit', GIR: 'edit', OSD: 'edit', EXCEL: 'edit', GOI_THAU: 'view', NHAN_SU: 'view', LINK: 'view' } },
      { Email: 'lanh.dao@demo', Ho_ten: 'Lãnh đạo Ban (demo)', Kich_hoat: true, Admin: false, Goi_thau: '',
        Quyen: { DASH_VATTU: 'view', KIEN: 'view', MGMER: 'view', KIEM_TRA: 'view', GIR: 'view', OSD: 'view', GOI_THAU: 'view', NHAN_SU: 'view', LINK: 'view' } }
    ];
    return { db: { tables: t, users, config: {} }, files: {} };
  }

  // Kho demo trong IndexedDB 'tcxl-demo' (localStorage chỉ ~5 MB — không đủ khi nạp thử 12.709 kiện thật)
  const KV = {
    p: null,
    open() {
      return this.p || (this.p = new Promise((ok, no) => {
        const r = indexedDB.open('tcxl-demo', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
      }));
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((ok, no) => { const tx = db.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => ok(q && q.result); tx.onerror = tx.onabort = () => no(tx.error); });
    },
    get(k) { return this.run('readonly', s => s.get(k)); },
    set(k, v) { return this.run('readwrite', s => s.put(v, k)); },
    del(k) { return this.run('readwrite', s => s.delete(k)); }
  };
  let state = null, files = null, loading = null, saving = Promise.resolve();
  // Gọi đầu mọi thao tác: lần đầu đọc kho (hoặc chuyển từ localStorage bản cũ, hoặc tạo dữ liệu mẫu)
  function ready() {
    if (state) return Promise.resolve();
    return loading || (loading = (async () => {
      let s = await KV.get(KEY), f = await KV.get(FKEY);
      if (!s) { try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); f = JSON.parse(localStorage.getItem(FKEY) || 'null'); } catch (e) { s = null; } }
      if (!s || !f) { const sd = seed(); s = sd.db; f = sd.files; }
      state = s; files = f;
      await persist();
      try { localStorage.removeItem(KEY); localStorage.removeItem(FKEY); } catch (e) { /* bỏ qua */ }
    })().finally(() => { loading = null; }));
  }
  // Ghi lần lượt (không chồng nhau); lỗi đầy bộ nhớ báo ra ngoài
  function persist() {
    saving = saving.catch(() => {}).then(() => KV.set(KEY, state)).then(() => KV.set(FKEY, files))
      .catch(e => { throw new Error('Không lưu được dữ liệu demo trong trình duyệt: ' + (e && e.message)); });
    return saving;
  }

  // ?slow=1500 giả lập máy chủ trả lời chậm 1,5 giây (Apps Script thật thường 1–3 giây) để thử tốc độ
  const LAG = Number(new URLSearchParams(location.search).get('slow')) || 0;
  const wait = () => new Promise(r => setTimeout(r, 60 + LAG)).then(ready);
  const clone = o => JSON.parse(JSON.stringify(o));
  const currentEmail = () => localStorage.getItem(UKEY) || OWNER;

  function me() {
    const email = currentEmail();
    if (email === OWNER) return { email, name: 'Quản trị viên (demo)', admin: true, owner: true, goi: [], quyen: {} };
    const u = state.users.find(x => x.Email === email && x.Kich_hoat);
    if (!u) { const e = new Error('Tài khoản ' + email + ' chưa được cấp quyền dùng app'); e.code = 'NOT_ALLOWED'; throw e; }
    return { email, name: u.Ho_ten, admin: !!u.Admin, owner: false, goi: (u.Goi_thau || '').split(',').map(s => s.trim()).filter(Boolean), quyen: u.Quyen || {} };
  }
  const rows = t => { if (!T()[t]) throw new Error('Sai bảng'); return (state.tables[t] = state.tables[t] || []); };
  // Dòng cha theo khoá (dùng cho quyền theo gói của bảng con) — có chỉ mục, không quét cả bảng kiện cho từng dòng
  const pidx = {};
  const parentGetter = (pt, k) => {
    const arr = rows(pt);
    if (!pidx[pt] || pidx[pt].arr !== arr || pidx[pt].n !== arr.length) pidx[pt] = { arr, n: arr.length, m: new Map(arr.map(r => [String(r[T()[pt].key]), r])) };
    return pidx[pt].m.get(String(k));
  };
  const level = (u, t, r) => permRowLevel(u, t, r, parentGetter);
  const findIdx = (t, kf, key) => rows(t).findIndex(r => String(r[kf]) === String(key));
  // Giống máy chủ (Code.gs autoStt_): kiện mới chưa có STT → số tiếp theo sau số lớn nhất của cả bảng
  const autoStt = (t, list) => {
    if (t !== 'KIEN') return;
    let max = 0;
    for (const r of [...rows(t), ...list]) { const n = parseFloat(r.STT); if (n > max) max = n; }
    max = Math.floor(max);
    list.forEach(r => { if (r.STT == null || String(r.STT).trim() === '') r.STT = ++max; });
  };
  // Giống máy chủ (Code.gs checkUniqueNo_): thêm / sửa từng biên bản — số đã có trong cùng gói → lỗi
  const soKey = (t, s) => { const k = U.norm(s).replace(/\s+/g, '').replace(new RegExp('^' + t.toLowerCase() + '[-_.:#]*(no\\.?)?(?=.)'), ''); return /^\d+$/.test(k) ? String(+k) : k; };
  const checkUniqueNo = (t, kf, row, old) => {
    if (!['MGMER', 'GIR', 'OSD'].includes(t)) return;
    const k = soKey(t, row.So), g = String(row.Goi_thau ?? '');
    if (!k || (old && soKey(t, old.So) === k && String(old.Goi_thau ?? '') === g)) return;
    const dup = rows(t).find(x => String(x[kf]) !== String(row[kf]) && String(x.Goi_thau ?? '') === g && soKey(t, x.So) === k);
    if (dup) throw new Error(`Số "${row.So}" đã có ${g ? 'trong gói ' + g : '(biên bản chưa có gói)'}${dup.Ngay ? ', ngày ' + U.fmtDate(dup.Ngay) : ''} — hãy dùng số khác`);
  };

  // Giống máy chủ (Code.gs audit_): lịch sử chỉnh sửa trong state.audit — chỉ quản trị viên chính đọc (history)
  const AUDIT_ROWS = 200;
  const short = v => typeof v === 'string' && v.length > 1000 ? '(' + v.length + ' ký tự)' : v;
  const snap = r => { const o = {}; Object.keys(r || {}).forEach(k => { if (r[k] !== '' && r[k] != null) o[k] = short(r[k]); }); return o; };
  const diff = (old, row, kf) => { const c = {}; Object.keys(row || {}).forEach(k => { if (k === kf) return; const a = old[k] ?? '', b = row[k] ?? ''; if (String(a) !== String(b)) c[k] = [short(a), short(b)]; }); return c; };
  const pad2 = n => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  const audit = (u, act, t, key, n, detail, via) => { (state.audit = state.audit || []).push({ Thoi_gian: stamp(), Email: u.email, Ten: u.name || '', Thao_tac: act, Bang: t,
    Ma: key == null ? '' : String(key), So_dong: n ?? 1, Chi_tiet: detail ? JSON.stringify(detail) : '', Nguon: via || '' }); };
  const auditBulk = (u, act, t, keys, via, extra) => { const k = keys.map(String); audit(u, act, t, '', k.length, { keys: k.length > 40 ? [...k.slice(0, 20), '…', ...k.slice(-20)] : k, ...(extra || {}) }, via); };
  const viaCheck = (u, via) => { if (/file Total/i.test(String(via || '')) && !u.admin) throw new Error('Chỉ quản trị viên được nạp file Total'); };

  window.MockAPI = {
    async me() { await wait(); return me(); },
    async list(t) { await wait(); const u = me(); return clone(rows(t).filter(r => level(u, t, r) >= 1)); },
    async batch(ts) {
      await wait(); const u = me(), out = {};
      ts.forEach(t => { try { out[t] = clone(rows(t).filter(r => level(u, t, r) >= 1)); } catch (e) { out[t] = { error: e.message }; } });
      return out;
    },
    async files(items) {
      await wait(); const u = me();
      return items.map(it => {
        try {
          const r = rows(it.table).find(x => String(x[it.keyField]) === String(it.key));
          if (!r || level(u, it.table, r) < 1) throw new Error('Không có quyền xem file');
          const du = files[r[it.field]]; return du ? U.dataUrlParts(du) : null;
        } catch (e) { return { error: e.message }; }
      });
    },
    async add(t, kf, row, via) {
      await wait(); const u = me();
      if (level(u, t, row) < 2) throw new Error('Bạn không có quyền thêm vào mục này');
      if (!row[kf]) throw new Error('Thiếu khoá ' + kf);
      if (findIdx(t, kf, row[kf]) >= 0) throw new Error('Khoá đã tồn tại: ' + row[kf]);
      checkUniqueNo(t, kf, row, null);
      row = clone(row); autoStt(t, [row]);
      rows(t).push(clone(row)); audit(u, 'add', t, row[kf], 1, t === 'NHAP_EXCEL' ? null : snap(row), via); await persist(); return clone(row);
    },
    async update(t, kf, row, via) {
      await wait(); const u = me();
      const i = findIdx(t, kf, row[kf]); if (i < 0) throw new Error('Không tìm thấy dòng');
      const old = rows(t)[i], merged = Object.assign({}, old, row);
      if (level(u, t, old) < 2 || level(u, t, merged) < 2) throw new Error('Bạn không có quyền sửa dòng này');
      checkUniqueNo(t, kf, merged, old);
      const ch = diff(old, row, kf); if (Object.keys(ch).length) audit(u, 'update', t, row[kf], 1, t === 'NHAP_EXCEL' ? null : ch, via);
      rows(t)[i] = merged; await persist(); return clone(merged);
    },
    // Thêm / sửa nhiều dòng một lần (gắn hàng trăm kiện vào 1 biên bản): kiểm tra quyền TỪNG dòng,
    // có dòng không hợp lệ thì không ghi dòng nào
    async addMany(t, kf, list, via, bulk) {
      await wait(); const u = me(), all = rows(t), have = new Set(all.map(r => String(r[kf])));
      viaCheck(u, via);
      list.forEach(row => {
        if (!row[kf]) throw new Error('Thiếu khoá ' + kf);
        if (have.has(String(row[kf]))) throw new Error('Khoá đã tồn tại: ' + row[kf]);
        if (level(u, t, row) < 2) throw new Error('Bạn không có quyền thêm vào mục này');
        have.add(String(row[kf]));
      });
      list = clone(list); autoStt(t, list);
      list.forEach(row => all.push(clone(row)));
      if (list.length <= AUDIT_ROWS && !bulk) list.forEach(row => audit(u, 'add', t, row[kf], 1, t === 'NHAP_EXCEL' ? null : snap(row), via)); else auditBulk(u, 'add', t, list.map(r => r[kf]), via);
      await persist(); return clone(list);
    },
    async updateMany(t, kf, list, via, bulk) {
      await wait(); const u = me(), all = rows(t), at = new Map(all.map((r, i) => [String(r[kf]), i]));
      viaCheck(u, via);
      const out = list.map(row => {
        const i = at.get(String(row[kf])); if (i == null) throw new Error('Không tìm thấy dòng ' + row[kf]);
        const old = all[i], merged = Object.assign({}, old, row);
        if (level(u, t, old) < 2 || level(u, t, merged) < 2) throw new Error('Bạn không có quyền sửa dòng ' + row[kf]);
        return [i, merged, diff(old, row, kf), row[kf]];
      });
      out.forEach(([i, m]) => { all[i] = m; });
      const chg = out.filter(x => Object.keys(x[2]).length);
      if (chg.length <= AUDIT_ROWS && !bulk) chg.forEach(x => audit(u, 'update', t, x[3], 1, t === 'NHAP_EXCEL' ? null : x[2], via));
      else auditBulk(u, 'update', t, chg.map(x => x[3]), via, { cols: [...new Set(chg.flatMap(x => Object.keys(x[2])))] });
      await persist(); return clone(out.map(x => x[1]));
    },
    async removeMany(t, kf, keys, via, bulk) {
      await wait(); const u = me(), drop = new Set(keys.map(String));
      viaCheck(u, via);
      const gone = rows(t).filter(r => drop.has(String(r[kf])));
      gone.forEach(r => { if (level(u, t, r) < 2) throw new Error('Bạn không có quyền xoá dòng ' + r[kf]); });
      state.tables[t] = rows(t).filter(r => !drop.has(String(r[kf])));
      if (gone.length <= AUDIT_ROWS && !bulk) gone.forEach(r => audit(u, 'remove', t, r[kf], 1, snap(r), via)); else auditBulk(u, 'remove', t, gone.map(r => r[kf]), via);
      await persist(); return true;
    },
    async remove(t, kf, key, via) {
      await wait(); const u = me();
      const i = findIdx(t, kf, key); if (i < 0) return true;
      if (level(u, t, rows(t)[i]) < 2) throw new Error('Bạn không có quyền xoá dòng này');
      audit(u, 'remove', t, key, 1, snap(rows(t)[i]), via);
      rows(t).splice(i, 1); await persist(); return true;
    },
    // Nạp lại toàn bộ file Total: xoá sạch các bảng vật tư — chỉ quản trị viên
    async clearTables(ts, via) {
      await wait(); const u = me();
      if (!u.admin) throw new Error('Chỉ quản trị viên');
      ts.forEach(t => { if (!['KIEM_TRA', 'KIEN', 'OSD', 'GIR', 'MGMER'].includes(t)) throw new Error('Không được xoá cả bảng ' + t); });
      const out = {};
      ts.forEach(t => { out[t] = rows(t).length; state.tables[t] = []; audit(u, 'clear', t, '', out[t], null, via); });
      await persist(); return out;
    },
    async fileStore() { await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên'); return { local: true, email: 'quan.tri@demo', used: 7.1e9, limit: 15e9 }; },
    // Lịch sử chỉnh sửa — chỉ quản trị viên chính; r = số thứ tự (1 = cũ nhất), before = xem tiếp phần cũ hơn
    async history(o = {}) {
      await wait(); const u = me();
      if (!u.owner) throw new Error('Chỉ quản trị viên chính xem được lịch sử chỉnh sửa');
      const all = (state.audit || []).map((h, i) => ({ r: i + 2, ...h })), q = String(o.q || '').toLowerCase(), lim = Math.min(Number(o.limit) || 100, 500), out = [];
      if (o.key) return { rows: all.filter(h => h.Ma === String(o.key) && (!o.table || h.Bang === o.table)).reverse().slice(0, lim), next: 0 };
      let next = 0;
      for (let i = (o.before ? o.before - 2 : all.length) - 1; i >= 0; i--) {
        const h = all[i]; next = h.r;
        if ((o.table && h.Bang !== o.table) || (o.act && h.Thao_tac !== o.act) || (q && !(h.Email + ' ' + h.Ten).toLowerCase().includes(q))) continue;
        out.push(h); if (out.length >= lim) break;
      }
      return { rows: out, next: next > 2 ? next : 0 };
    },
    async upload(t, field, name, dataUrl) {
      await wait(); const u = me();
      if (permTableLevel(u, t) < 2) throw new Error('Bạn không có quyền tải file lên mục này');
      const ext = (name.split('.').pop() || 'bin').slice(0, 5);
      const p = 'demo/' + U.uid() + '.' + ext; files[p] = dataUrl; await persist(); return p;
    },
    async file(t, kf, key, field) {
      await wait(); const u = me();
      const r = rows(t).find(x => String(x[kf]) === String(key));
      if (!r || level(u, t, r) < 1) throw new Error('Không có quyền xem file');
      const du = files[r[field]]; if (!du) return null;
      return U.dataUrlParts(du);
    },
    async users() { await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên'); return clone(state.users); },
    async saveUser(u) {
      await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên');
      if (!u.Email) throw new Error('Thiếu email');
      u.Email = u.Email.trim().toLowerCase();
      if (u.Email === OWNER) throw new Error('Không sửa được tài khoản quản trị viên chính');
      const i = state.users.findIndex(x => x.Email === u.Email);
      const uo = x => ({ Ho_ten: x.Ho_ten || '', Kich_hoat: !!x.Kich_hoat, Admin: !!x.Admin, Goi_thau: String(x.Goi_thau || ''), Quyen: JSON.stringify(x.Quyen || {}) });
      audit(me(), i >= 0 ? 'update' : 'add', '_NGUOIDUNG', u.Email, 1, i >= 0 ? diff(uo(state.users[i]), uo(u), '') : snap(uo(u)));
      if (i >= 0) state.users[i] = u; else state.users.push(u);
      await persist(); return clone(u);
    },
    async deleteUser(email) {
      await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên');
      const old = state.users.find(x => x.Email === email);
      if (old) audit(me(), 'remove', '_NGUOIDUNG', email, 1, snap({ Ho_ten: old.Ho_ten, Admin: old.Admin, Goi_thau: old.Goi_thau, Quyen: JSON.stringify(old.Quyen || {}) }));
      state.users = state.users.filter(x => x.Email !== email); await persist(); return true;
    },
    async getConfig(k) { await wait(); return state.config[k] ?? null; },
    async setConfig(k, v) {
      await wait(); const u = me();
      if (!u.admin) throw new Error('Chỉ quản trị viên');
      state.config[k] = v; await persist(); return true;
    },
    async undoData(id) { await wait(); const r = rows('NHAP_EXCEL').find(x => x.id === id); if (!r || level(me(), 'NHAP_EXCEL', r) < 2) throw new Error('Không có quyền'); return r.Hoan_tac || ''; },
    async signOut() { /* demo: không làm gì */ },
    async logoutAll() { await wait(); return 0; },

    // Riêng cho demo
    demo: {
      owner: OWNER,
      current: currentEmail,
      switchUser(email) { localStorage.setItem(UKEY, email); },
      async reset() { await saving.catch(() => {}); state = null; files = null; await KV.del(KEY); await KV.del(FKEY); localStorage.removeItem(KEY); localStorage.removeItem(FKEY); },
      emails() { return [OWNER, ...((state && state.users) || []).map(u => u.Email), 'nguoi.la@demo']; }
    }
  };
})();
