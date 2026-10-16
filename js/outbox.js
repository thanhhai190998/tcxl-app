// =====================================================================
//  LƯU NỀN (hàng đợi ghi) — bấm Lưu là dữ liệu trên máy đổi ngay, app đi tiếp; việc gửi lên máy chủ chạy ngầm,
//  lần lượt đúng thứ tự (biên bản tạo trước rồi mới gắn kiện vào).
//   • Mất mạng → tự gửi lại khi có mạng.  • Máy chủ báo lỗi → dừng, báo kèm "Thử lại" / "Bỏ thay đổi"
//     (bỏ = tải lại các bảng liên quan từ máy chủ, dữ liệu trên máy về đúng như máy chủ).
//   • Hàng đợi lưu trên máy (localStorage) → tắt app giữa chừng, mở lại tự gửi tiếp.
//  Việc: { label, ops: [{ fn: 'add' | 'update' | 'addMany' | 'updateMany', t, rows, soft?, note? }] }
//   soft = lỗi không chặn cả việc (chỉ báo note), vd gán gói cho biên bản sau khi chọn kiện.
// =====================================================================
(function () {
  const O = (window.Outbox = {});
  const CHUNK = 1000;   // Apps Script giới hạn thời gian mỗi lần gọi → gửi từng lô
  const KEY = () => 'tcxl-outbox|' + window.APP_CONFIG.mode + '|' + ((window.App && App.user && App.user.email) || '');
  let q = [], running = false, err = null, net = false, netT = null, doneT = null;
  const save = () => { try { if (q.length) localStorage.setItem(KEY(), JSON.stringify(q)); else localStorage.removeItem(KEY()); } catch (e) { /* bỏ qua */ } };
  const isNet = e => /Mất kết nối|Failed to fetch|NetworkError|Load failed/i.test(e && e.message || '') || navigator.onLine === false;

  O.pending = () => q.length;
  O.busy = t => q.some(j => j.ops.some(o => o.t === t));   // bảng còn thay đổi chưa lưu → không lấy dữ liệu máy chủ đè lên
  O.push = (label, ops) => {
    ops = ops.filter(o => o.rows && o.rows.length);
    if (!ops.length) return;
    ops.forEach(o => DB.localPut(o.t, o.rows));   // dữ liệu trên máy đổi ngay
    q.push({ id: U.uid(), label, ops, at: Date.now() });
    save(); paint(); run();
  };
  // Mở app: còn việc chưa gửi (tắt app giữa chừng) → gửi tiếp. Dữ liệu trên máy (đã lưu kèm thay đổi) giữ nguyên.
  O.resume = () => {
    try { q = JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch (e) { q = []; }
    if (q.length) q.forEach(j => j.ops.forEach(o => { o.again = true; }));
    paint(); run();
  };
  O.clear = () => { q = []; err = null; save(); paint(); };
  // Chờ hàng đợi gửi xong (ghi trực tiếp như xoá, nhập Excel phải đi sau thay đổi đang lưu nền) → true nếu xong, false nếu đang lỗi
  O.idle = () => new Promise(res => { const chk = () => (err ? res(false) : !q.length ? res(true) : setTimeout(chk, 250)); chk(); });

  async function run() {
    if (running || err || !q.length) return;
    running = true; net = false; clearTimeout(netT); paint();
    try {
      while (q.length && !err) {
        try { await send(q[0]); q.shift(); save(); }
        catch (e) {
          if (isNet(e)) { net = true; netT = setTimeout(run, 15000); break; }   // mất mạng: 15 giây sau / khi có mạng thử lại
          err = { label: q[0].label, msg: e.message };
        }
      }
    } finally {
      running = false; paint();
      if (!q.length && !err) { done(); }
    }
  }
  async function send(job) {
    for (const o of job.ops) {
      if (o.ok) continue;
      try {
        const saved = await call(o);
        if (saved && saved.length) DB.localPut(o.t, saved);   // dòng máy chủ trả (đủ cột, STT kiện do máy chủ cấp…)
      } catch (e) {
        if (!o.soft || isNet(e)) throw e;
        U.toast((o.note || 'Chưa lưu được một phần') + ': ' + e.message, 'err');
      }
      o.ok = true; save();
    }
  }
  async function call(o) {
    const kf = DB.keyField(o.t), out = [];
    for (let i = o.ci || 0; i < o.rows.length; i += CHUNK) {
      const part = o.rows.slice(i, i + CHUNK), tried = o.again || o.tried === i;
      o.tried = i; save();
      try {
        if (o.fn === 'add') out.push(await API.add(o.t, kf, part[0]));
        else if (o.fn === 'update') out.push(await API.update(o.t, kf, part[0]));
        else out.push(...await API[o.fn](o.t, kf, part));
      } catch (e) {
        // Lần gửi trước đã tới máy chủ nhưng mất mạng lúc nhận trả lời → máy chủ báo trùng khoá = thực ra đã lưu (khoá do máy tạo, không trùng ai)
        if (!(tried && /^add/.test(o.fn) && /Khoá đã tồn tại/.test(e.message))) throw e;
      }
      o.ci = i + CHUNK; o.again = false; save();
    }
    return out;
  }

  // Bỏ mọi thay đổi chưa lưu: tải lại các bảng liên quan từ máy chủ (bỏ phiên bản → lấy đủ dữ liệu)
  async function discard() {
    const ts = [...new Set(q.flatMap(j => j.ops.map(o => o.t)))];
    q = []; err = null; save(); paint();
    ts.forEach(t => { delete DB.ver[t]; DB.fresh.delete(t); });
    try { await DB.fetch(ts, true); U.toast('Đã bỏ các thay đổi chưa lưu', 'ok'); }
    catch (e) { U.toast('Không tải lại được dữ liệu: ' + e.message, 'err'); }
  }

  // ---- Ô trạng thái (góc dưới) ----
  function box() {
    let el = document.getElementById('obox');
    if (!el) { el = document.createElement('div'); el.id = 'obox'; el.className = 'obox'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    return el;
  }
  function paint() {
    const el = box(), n = q.length;
    clearTimeout(doneT);
    el.className = 'obox' + (err ? ' err' : net ? ' warn' : '');
    if (!n && !err) { el.hidden = true; return; }
    el.hidden = false;
    const more = n > 1 ? ` (${n} việc)` : '';
    if (err) {
      el.innerHTML = `<div class="ob-t"><b>Chưa lưu được lên máy chủ</b> · ${U.esc(err.label)}${more}<div class="ob-m">${U.esc(err.msg)}</div></div>
        <div class="ob-a"><button type="button" class="btn sm" data-ob="retry">Thử lại</button><button type="button" class="btn sm ghost" data-ob="drop">Bỏ thay đổi</button></div>`;
    } else if (net) {
      el.innerHTML = `<div class="ob-t">Mất kết nối — sẽ tự lưu lại khi có mạng${more}</div><div class="ob-a"><button type="button" class="btn sm ghost" data-ob="retry">Thử ngay</button></div>`;
    } else {
      el.innerHTML = `<span class="ob-spin"></span><div class="ob-t">Đang lưu lên máy chủ…${more}</div>`;
    }
    el.querySelectorAll('[data-ob]').forEach(b => b.onclick = async () => {
      if (b.dataset.ob === 'retry') { err = null; net = false; run(); return; }
      if (await U.confirm(`Bỏ ${n} thay đổi chưa lưu? Dữ liệu trên máy sẽ được tải lại đúng như trên máy chủ.`)) discard();
    });
  }
  function done() {
    const el = box();
    el.className = 'obox ok'; el.hidden = false; el.innerHTML = `${Icon('check', 'sm')}<div class="ob-t">Đã lưu</div>`;
    doneT = setTimeout(() => { el.hidden = true; }, 1600);
  }

  window.addEventListener('online', () => { if (net) run(); });
  // Còn việc chưa gửi mà đóng / tải lại trang → trình duyệt hỏi lại
  window.addEventListener('beforeunload', e => { if (q.length) { e.preventDefault(); e.returnValue = ''; } });
})();
