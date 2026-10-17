// =====================================================================
//  TRANG PHASE 1 / 2 / 3 — giao diện tối giản: vài số liệu nhanh + các nút thao tác
//   P1: Danh sách kiện · Thêm kiện · Tải file mẫu · Tải file lên
//   P2: Tạo MGMER (xong tự sang chọn kiện) · Danh sách MGMER · Kiểm tra vị trí · Lịch sử vị trí · Tải form · Tải file lên
//   P3: Tạo GIR · Tạo OSD (xong tự sang chọn kiện) · Danh sách GIR · Danh sách OSD · Tải form · Tải file lên
//  Nút chỉ hiện khi đủ quyền: tạo = "Sửa" bảng đó; danh sách = "Xem"; tải form = Excel "Xem"; tải lên = Excel "Sửa".
//  Tải form / tải lên mở trang Nhập / xuất Excel đúng mẫu của Phase (?m=…; &s=up cuộn tới ô tải file).
// =====================================================================
(function () {
  const esc = U.esc;
  const H = (window.Hub = {});
  const lv = t => App.user.admin ? 2 : permTableLevel(App.user, t);
  const xl = () => App.user.admin ? 2 : Perm.rank((App.user.quyen || {}).EXCEL);
  const n = v => U.int(v);

  const PAGES = {
    P1: {
      intro: 'Nhập thông tin kiện hàng theo thông báo / packing list của nhà thầu: thêm tay từng kiện, hoặc nhập cả loạt bằng file Excel (app đối soát, xem trước rồi mới ghi).',
      acts: [
        { ic: 'plus', l: 'Thêm kiện', d: 'Nhập tay từng kiện', href: '#/f/KIEN/new', ok: () => lv('KIEN') > 1, main: true },
        { ic: 'table', l: 'Danh sách kiện', d: 'Xem, tìm, lọc toàn bộ kiện', href: '#/i/KIEN', ok: () => lv('KIEN') > 0 },
        { ic: 'download', l: 'Tải file mẫu', d: 'Mẫu Excel P1: trống, hoặc kèm kiện hiện có để sửa', href: '#/i/EXCEL?m=KIEN', ok: () => xl() > 0 },
        { ic: 'upload', l: 'Tải file lên', d: 'Nhập cả loạt từ file đã điền', href: '#/i/EXCEL?m=KIEN&s=up', ok: () => xl() > 1 }
      ],
      stats: () => { const k = DB.rows('KIEN'); return lv('KIEN') ? [[k.length, 'kiện'], [k.filter(r => !r.MGMER).length, 'chưa về (chỉ thông báo)']] : []; }
    },
    P2: {
      intro: 'Tạo biên bản kiểm đếm (MGMER) trước, rồi chọn các kiện thuộc biên bản; có thể ghi luôn vị trí lưu kho. Kiểm kho định kỳ: dùng nút Kiểm tra vị trí.',
      acts: [
        { ic: 'plus', l: 'Tạo MGMER', d: 'Lập biên bản kiểm đếm → chọn kiện', href: '#/f/MGMER/new', ok: () => lv('MGMER') > 1, main: true },
        { ic: 'table', l: 'Danh sách MGMER', d: 'Xem biên bản, thêm / bỏ kiện', href: '#/i/MGMER', ok: () => lv('MGMER') > 0 },
        { ic: 'pin', l: 'Kiểm tra vị trí', d: 'Ghi vị trí, tình trạng kiện', href: '#/f/KIEM_TRA/new', ok: () => lv('KIEM_TRA') > 1 },
        { ic: 'clock', l: 'Lịch sử vị trí', d: 'Các lần kiểm tra vị trí & tình trạng', href: '#/i/KIEM_TRA', ok: () => lv('KIEM_TRA') > 0 },
        { ic: 'download', l: 'Tải form Excel', d: 'Kiện chưa kiểm đếm (nhập nhanh) hoặc toàn bộ kiện (báo cáo)', href: '#/i/EXCEL?m=MGMER', ok: () => xl() > 0 },
        { ic: 'upload', l: 'Tải file lên', d: 'Kiểm đếm + vị trí cả loạt từ file đã điền', href: '#/i/EXCEL?m=MGMER&s=up', ok: () => xl() > 1 }
      ],
      stats: () => {
        const out = [];
        if (lv('MGMER')) out.push([DB.rows('MGMER').length, 'biên bản MGMER']);
        if (lv('KIEN')) { const k = DB.rows('KIEN'); out.push([k.filter(r => r.MGMER && !r.GIR).length, 'kiện đã về, chờ mở']); }
        if (lv('KIEM_TRA')) out.push([DB.rows('KIEM_TRA').length, 'lần kiểm tra vị trí']);
        return out;
      }
    },
    P3: {
      intro: 'Tạo biên bản mở kiện (GIR) hoặc biên bản dư / thiếu / hư hỏng (OSD), rồi chọn các kiện thuộc biên bản.',
      acts: [
        { ic: 'plus', l: 'Tạo GIR', d: 'Lập biên bản mở kiện → chọn kiện', href: '#/f/GIR/new', ok: () => lv('GIR') > 1, main: true },
        { ic: 'plus', l: 'Tạo OSD', d: 'Lập biên bản dư / thiếu / hỏng → chọn kiện', href: '#/f/OSD/new', ok: () => lv('OSD') > 1, main: true },
        { ic: 'table', l: 'Danh sách GIR', d: 'Xem biên bản mở kiện, thêm / bỏ kiện', href: '#/i/GIR', ok: () => lv('GIR') > 0 },
        { ic: 'alert', l: 'Danh sách OSD', d: 'Xem biên bản OSD, ghi chú xử lý, thêm / bỏ kiện', href: '#/i/OSD', ok: () => lv('OSD') > 0 },
        { ic: 'download', l: 'Tải form Excel', d: 'Kiện đã kiểm đếm, điền số GIR / OSD', href: '#/i/EXCEL?m=GIR', ok: () => xl() > 0 },
        { ic: 'upload', l: 'Tải file lên', d: 'Mở kiện + OSD cả loạt từ file đã điền', href: '#/i/EXCEL?m=GIR&s=up', ok: () => xl() > 1 }
      ],
      stats: () => {
        const out = [];
        if (lv('GIR')) out.push([DB.rows('GIR').length, 'biên bản GIR']);
        if (lv('KIEN')) out.push([DB.rows('KIEN').filter(r => r.GIR).length, 'kiện đã mở']);
        if (lv('OSD')) out.push([DB.rows('OSD').length, 'biên bản OSD']);
        return out;
      }
    }
  };

  H.render = async it => {
    const pg = PAGES[it.key];
    if (!pg) return App.notFound();
    App.head(it.label, { back: true });
    App.loading();
    await Promise.all([...it.tables, 'KIEN'].filter(t => lv(t) > 0).map(t => DB.loadDeps(t).catch(() => {})));
    const acts = pg.acts.filter(a => a.ok()), stats = pg.stats();
    App.main.innerHTML = `<div class="hub" style="--gc:${it.color}">
      <p class="hub-intro">${esc(pg.intro)}</p>
      ${stats.length ? `<div class="hub-stats">${stats.map(([v, l]) => `<div class="hstat"><b>${n(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
      <div class="hub-grid">${acts.map(a => `<a class="htile ${a.main ? 'main' : ''}" href="${a.href}">
          <span class="ht-ic">${Icon(a.ic)}</span><span class="ht-t"><b>${esc(a.l)}</b><small>${esc(a.d)}</small></span>${Icon('chevron', 'ht-go')}</a>`).join('')
        || '<div class="empty">Bạn chưa được cấp quyền thao tác ở mục này — liên hệ quản trị viên.</div>'}</div>
    </div>`;
  };
})();
