// =====================================================================
//  LƯU NỀN (hàng đợi ghi) — bấm Lưu là dữ liệu trên máy đổi ngay, app đi tiếp; việc gửi lên máy chủ chạy ngầm,
//  lần lượt đúng thứ tự (biên bản tạo trước rồi mới gắn kiện vào).
//   • Mất mạng → tự gửi lại khi có mạng.  • Máy chủ báo lỗi → dừng, báo kèm "Thử lại" / "Bỏ thay đổi"
//     (bỏ = tải lại các bảng liên quan từ máy chủ, dữ liệu trên máy về đúng như máy chủ).
//   • Hàng đợi lưu trên máy (localStorage) → tắt app giữa chừng, mở lại tự gửi tiếp.
//  Việc: { label, ops: [{ fn: 'add' | 'update' | 'addMany' | 'updateMany', t, rows, soft?, note? }] }
//   soft = lỗi không chặn cả việc (chỉ báo note), vd gán gói cho biên bản sau khi chọn kiện.
//   { fn: 'upload', t, field, name, key }: tải file (nội dung giữ trên máy, DB.upGet(key)) lên trước; mã file trả về
//   thay cho "@up:<key>" trong các việc sau của cùng lần lưu → bấm Lưu không phải chờ tải file.
//   { fn: 'rename', t, key, field, name }: đổi tên file đính kèm trên Drive (sửa số biên bản) — thường đi kèm soft.
// =====================================================================
(function () {
  const O = (window.Outbox = {});
  const CHUNK = 1000;   // Apps Script giới hạn thời gian mỗi lần gọi → gửi từng lô
  const KEY = () => 'tcxl-outbox|' + window.APP_CONFIG.mode + '|' + ((window.App && App.user && App.user.email) || '');
  let q = [], running = false, err = null, net = false, netT = null, doneT = null, stage = '';
  const save = () => { try { if (q.length) localStorage.setItem(KEY(), JSON.stringify(q)); else localStorage.removeItem(KEY()); } catch (e) { /* bỏ qua */ } };
  const isNet = e => /Mất kết nối|Failed to fetch|NetworkError|Load failed/i.test(e && e.message || '') || navigator.onLine === false;

  O.pending = () => q.length;
  O.busy = t => q.some(j => j.ops.some(o => o.t === t));   // bảng còn thay đổi chưa lưu → không lấy dữ liệu máy chủ đè lên
  O.push = (label, ops) => {
    ops = ops.filter(o => o.fn === 'upload' || o.fn === 'rename' || (o.rows && o.rows.length));
    if (!ops.length) return;
    ops.forEach(o => { if (o.rows) DB.localPut(o.t, o.rows); });   // dữ liệu trên máy đổi ngay
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
        try { const j = await send(q[0]); q.shift(); save(); upClean(j); }
        catch (e) {
          if (e && e.code === 'MAINT') { net = 'maint'; netT = setTimeout(run, 60000); break; }   // đang bảo trì: giữ thay đổi trên máy, 1 phút sau gửi lại
          if (isNet(e)) { net = true; netT = setTimeout(run, 15000); break; }   // mất mạng: 15 giây sau / khi có mạng thử lại
          err = { label: q[0].label, msg: e.message };
        }
      }
    } finally {
      running = false; paint();
      if (!q.length && !err) { done(); }
    }
  }
  const upClean = job => job.ops.forEach(o => { if (o.fn === 'upload') DB.upDel(o.key); });   // xoá bản file giữ tạm trên máy
  async function send(job) {
    for (const o of job.ops) {
      if (o.ok) continue;
      // Ô file "@up:<khoá>" → mã file vừa tải lên ở việc upload trước đó
      const ups = job.ops.filter(x => x.fn === 'upload' && x.val);
      if (ups.length && o.rows) o.rows.forEach(r => Object.keys(r).forEach(k => { const u = ups.find(x => r[k] === '@up:' + x.key); if (u) r[k] = u.val; }));
      try {
        const saved = await call(o);
        if (saved && saved.length) DB.localPut(o.t, saved);   // dòng máy chủ trả (đủ cột, STT kiện do máy chủ cấp…)
      } catch (e) {
        if (!o.soft || isNet(e)) throw e;
        U.toast((o.note || 'Chưa lưu được một phần') + ': ' + e.message, 'err');
      }
      o.ok = true; save();
    }
    return job;
  }
  async function call(o) {
    if (o.fn === 'upload') {
      if (!o.val) {
        const du = await DB.upGet(o.key);
        if (!du) throw new Error('File "' + o.name + '" chờ tải lên không còn trên máy — mở lại và chọn lại file');
        stage = 'Đang tải file lên… ' + o.name; paint();
        try { o.val = await API.upload(o.t, o.field, o.name, du); } finally { stage = ''; paint(); }
        save();
      }
      return null;
    }
    if (o.fn === 'rename') { await API.renameFile(o.t, DB.keyField(o.t), o.key, o.field, o.name); return null; }
    const kf = DB.keyField(o.t), out = [];
    for (let i = o.ci || 0; i < o.rows.length; i += CHUNK) {
      const part = o.rows.slice(i, i + CHUNK), tried = o.again || o.tried === i;
      o.tried = i; save();
      try {
        if (o.fn === 'add') out.push(await API.add(o.t, kf, part[0]));
        else if (o.fn === 'update') out.push(await API.update(o.t, kf, part[0]));
        else out.push(...await API[o.fn](o.t, kf, part, o.via, o.rows.length > 200));
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
    q.forEach(upClean);
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
      el.innerHTML = `<div class="ob-t">${net === 'maint' ? 'App đang bảo trì — thay đổi giữ trên máy, hết bảo trì sẽ tự lưu' : 'Mất kết nối — sẽ tự lưu lại khi có mạng'}${more}</div><div class="ob-a"><button type="button" class="btn sm ghost" data-ob="retry">Thử ngay</button></div>`;
    } else {
      el.innerHTML = `<span class="ob-spin"></span><div class="ob-t">${U.esc(stage || 'Đang lưu lên máy chủ…')}${more}</div>`;
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
