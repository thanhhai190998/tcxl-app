// Bộ đệm dữ liệu phía app: tải bảng theo nhu cầu, tính cột ảo, định dạng hiển thị.
// Dữ liệu tải về được lưu lâu dài trên máy (IndexedDB): mở app / mở mục lần sau hiện ngay bản đã lưu,
// đồng thời hỏi máy chủ ngầm phía sau — có thay đổi thì tự vẽ lại trang đang xem.
(function () {
  const T = () => window.SCHEMA.tables;

  // ---- Kho lưu trên máy (IndexedDB, khoá theo chế độ + email để mỗi người một kho) ----
  const IDB = {
    p: null,
    open() {
      if (!this.p) this.p = new Promise(res => {
        try {
          const r = indexedDB.open('tcxl-app', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => res(r.result);
          r.onerror = r.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
      return this.p;
    },
    async run(mode, fn) {
      const db = await this.open(); if (!db) return null;
      return new Promise(res => {
        try { const tx = db.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q ? q.result : null); tx.onerror = tx.onabort = () => res(null); }
        catch (e) { res(null); }
      });
    },
    get(k) { return this.run('readonly', s => s.get(k)); },
    set(k, v) { return this.run('readwrite', s => s.put(v, k)); },
    del(k) { return this.run('readwrite', s => s.delete(k)); },
    clear() { return this.run('readwrite', s => s.clear()); }
  };
  const ns = () => window.APP_CONFIG.mode + '|' + ((window.App && App.user && App.user.email) || '') + '|t:';
  const CHUNK = 6;   // số bảng tối đa trong 1 lần gọi ngầm
  // Lần ghi lớn (> 200 dòng) hoặc nạp file Total → máy chủ ghi lịch sử chỉnh sửa dạng tóm tắt, không ghi từng dòng
  const bulk = (list, via) => list.length > 200 || /file Total/i.test(via || '');

  const DB = (window.DB = {
    data: {}, pending: {}, fresh: new Set(), queue: new Set(), track: new Set(), noBatch: false,
    ver: {},   // phiên bản bảng máy chủ báo (bảng không đổi → máy chủ chỉ trả { same: true }, không tải lại 12.000+ kiện)
    onChange: null,   // main.js đặt: (danh sách bảng vừa đổi) => vẽ lại trang đang xem

    // Lấy 1 bảng: có trong bộ nhớ / trên máy thì trả ngay (rồi cập nhật ngầm), chưa có thì chờ máy chủ.
    // force = luôn lấy bản mới nhất từ máy chủ.
    async load(t, force) {
      this.track.add(t);
      if (force) { await this.fetch([t]); return this.data[t] || []; }
      if (this.data[t] || await this.fromDisk(t)) { this.later(t); return this.data[t]; }
      await this.fetch([t]);
      return this.data[t] || [];
    },

    // Tải bảng + các bảng nó cần (tham chiếu, cột ảo, bảng con) — các bảng còn thiếu gộp trong 1 lần gọi
    async loadDeps(t, withRelated) {
      const def = T()[t]; if (!def) throw new Error('Không có bảng ' + t);
      const set = new Set([t, ...(def.needs || [])]);
      def.fields.forEach(f => f.ref && set.add(f.ref));
      if (withRelated) (def.related || []).forEach(r => {
        set.add(r.t);
        (T()[r.t].needs || []).forEach(n => set.add(n));
      });
      const ts = [...set], miss = [];
      ts.forEach(x => this.track.add(x));
      await Promise.all(ts.map(async x => { if (!this.data[x] && !await this.fromDisk(x)) miss.push(x); }));
      if (miss.length) await this.fetch(miss).catch(e => { console.warn(miss, e); miss.forEach(x => { this.data[x] = this.data[x] || []; }); });
      ts.forEach(x => this.later(x));
    },

    async fromDisk(t) {
      const c = await IDB.get(ns() + t);
      if (c && Array.isArray(c.rows) && !this.data[t]) { this.data[t] = c.rows; if (c.v) this.ver[t] = c.v; }
      return !!this.data[t];
    },
    // v = phiên bản máy chủ của đúng bản dữ liệu này; sửa trên máy (thêm/sửa/xoá) → không còn khớp → bỏ
    persist(t, v) { if (v) this.ver[t] = v; else delete this.ver[t]; IDB.set(ns() + t, { rows: this.data[t] || [], at: Date.now(), v: v || '' }); },
    // Máy chủ (Code.gs mới) trả phiên bản bảng trước (v0) / sau (v) lần ghi. Máy đang giữ đúng bản trước → dữ liệu trên máy
    // + thay đổi vừa ghi = bản sau → nhận luôn, lần làm mới tới máy chủ chỉ trả "không đổi" (khỏi tải lại cả 12.709 kiện).
    // Không khớp (có người khác vừa sửa) → bỏ phiên bản → lần làm mới tới tải lại cả bảng như cũ.
    gotVer(vs) { Object.keys(vs).forEach(t => { const x = vs[t]; if (x && this.ver[t] && this.ver[t] === x.v0) this.ver[t] = x.v; else delete this.ver[t]; }); },
    // Lưu nền (outbox.js): gộp dòng (thêm mới / sửa) vào dữ liệu trên máy theo khoá, chưa gửi máy chủ.
    // Bảng chưa tải lên máy thì bỏ qua (lấy từ máy chủ sau) — không tạo bảng chỉ có vài dòng.
    localPut(t, rows) {
      if (!this.data[t] || !rows || !rows.length) return;
      const kf = this.keyField(t), by = new Map(rows.map(r => [String(r[kf]), r]));
      const arr = this.data[t].map(r => { const k = String(r[kf]), n = by.get(k); if (!n) return r; by.delete(k); return { ...r, ...n }; });
      this.data[t] = by.size ? arr.concat([...by.values()].map(r => ({ ...r }))) : arr;
      this.persist(t, this.ver[t]);
    },

    // Hẹn cập nhật ngầm (mỗi bảng 1 lần trong 1 phiên mở app)
    later(t) {
      if (this.fresh.has(t) || this.pending[t] || this.queue.has(t)) return;
      this.queue.add(t);
      clearTimeout(this._qt);
      this._qt = setTimeout(async () => {
        const ts = [...this.queue]; this.queue.clear();
        this.setBusy(1);
        try { for (let i = 0; i < ts.length; i += CHUNK) await this.fetch(ts.slice(i, i + CHUNK), true).catch(() => {}); }
        finally { this.setBusy(-1); }
      }, 60);
    },
    busy: 0, onBusy: null,   // main.js: hiện thanh mỏng "đang cập nhật" khi cập nhật ngầm
    setBusy(d) { this.busy += d; if (this.onBusy) this.onBusy(this.busy > 0); },

    // Tải từ máy chủ; bảng đang được tải thì chờ chung lần gọi đó
    fetch(ts, background) {
      const waits = [], todo = [];
      ts.forEach(t => (this.pending[t] ? waits.push(this.pending[t]) : todo.push(t)));
      if (todo.length) {
        const p = this.request(todo).then(res => this.apply(res, background));
        todo.forEach(t => { this.pending[t] = p; });
        p.catch(() => {}).then(() => todo.forEach(t => { if (this.pending[t] === p) delete this.pending[t]; }));
        waits.push(p);
      }
      return Promise.all(waits);
    },
    async request(ts) {
      if (ts.length > 1 && !this.noBatch && API.batch) {
        const have = {};
        ts.forEach(t => { if (this.data[t] && this.ver[t]) have[t] = this.ver[t]; });
        try { return await API.batch(ts, have); }
        catch (e) { if (!/Thao tác không hợp lệ/.test(e.message)) throw e; this.noBatch = true; }   // máy chủ bản cũ chưa có "batch"
      }
      const out = {};
      await Promise.all(ts.map(t => API.list(t).then(r => { out[t] = r; })));
      return out;
    },
    apply(res, background) {
      const changed = [];
      Object.keys(res).forEach(t => {
        // Máy chủ trả: mảng dòng (bản cũ / demo) · { rows, v } · { same: true, v } (không đổi) · { error }
        const x = res[t], same = x && x.same, rows = Array.isArray(x) ? x : x && Array.isArray(x.rows) ? x.rows : null, v = x && !Array.isArray(x) ? x.v : '';
        if (same && this.data[t]) { this.fresh.add(t); return; }
        if (this.data[t] && window.Outbox && Outbox.busy(t)) return;   // còn thay đổi đang lưu nền → giữ dữ liệu trên máy
        if (!rows) { console.warn(t, x && x.error); if (!this.data[t]) this.data[t] = []; return; }
        const had = this.data[t];
        this.fresh.add(t);
        if (had && JSON.stringify(had) === JSON.stringify(rows)) { if (v && v !== this.ver[t]) this.persist(t, v); return; }
        this.data[t] = rows;
        this.persist(t, v);
        if (had && background) changed.push(t);
      });
      if (changed.length && this.onChange) this.onChange(changed);
      return changed;
    },

    // Nút ⟳: hỏi lại máy chủ mọi bảng được phép (bảng của trang đang xem trước) → số bảng có thay đổi
    async refresh() {
      this.fresh.clear(); this.queue.clear(); clearTimeout(this._qt);
      const all = Object.keys(T()).filter(t => permTableLevel(App.user, t) > 0);
      const cur = all.filter(t => this.track.has(t)), rest = all.filter(t => !this.track.has(t));
      let n = 0;
      const run = async ts => { (await this.fetch(ts, true)).forEach(x => { n += Array.isArray(x) ? x.length : 0; }); };
      this.setBusy(1);
      try {
        if (cur.length) await run(cur);
        for (let i = 0; i < rest.length; i += CHUNK) await run(rest.slice(i, i + CHUNK));
      } finally { this.setBusy(-1); }
      return n;
    },

    // Sau khi trang đầu đã hiện: tải ngầm mọi bảng được phép → lần đầu mở mục nào cũng nhanh;
    // bảng đã mất quyền thì xoá khỏi máy
    prefetch() {
      Object.keys(T()).forEach(t => {
        if (permTableLevel(App.user, t) > 0) this.later(t);
        else { IDB.del(ns() + t); delete this.data[t]; }
      });
    },

    // File chờ tải lên nền (outbox.js): giữ nội dung file trên máy (IndexedDB) tới khi tải xong; ô file tạm ghi "@up:<khoá>"
    upPut(k, dataUrl) { return IDB.set('up|' + k, dataUrl); },
    upGet(k) { return IDB.get('up|' + k); },
    upDel(k) { return IDB.del('up|' + k); },
    invalidate(t) { delete this.data[t]; this.fresh.delete(t); },
    clear() { this.data = {}; this.fresh.clear(); },
    // Xoá mọi dữ liệu lưu tạm trên máy (bảng + ảnh) — dùng khi đăng xuất / đổi người
    async wipe() {
      this.clear();
      await IDB.clear();
      try { await caches.delete('tcxl-img-v1'); await caches.delete('tcxl-files-v1'); localStorage.removeItem('tcxl-files-lru'); } catch (e) { /* bỏ qua */ }
    },
    async diskUsage() {
      try { const e = await navigator.storage.estimate(); return e.usage || 0; } catch (e) { return 0; }
    },
    rows(t) { return this.data[t] || []; },
    keyField(t) { return T()[t].key; },
    keyOf(t, r) { return r && r[T()[t].key]; },
    // Tìm theo khoá qua chỉ mục (bảng kiện 12.000+ dòng: không quét cả bảng mỗi lần).
    // Chỉ mục gắn với mảng dữ liệu hiện tại — thêm/sửa/xoá/tải về luôn thay mảng mới nên chỉ mục tự làm lại.
    _ix: {},
    get(t, k) {
      if (k == null || k === '') return null;
      const arr = this.rows(t);
      let ix = this._ix[t];
      if (!ix || ix.arr !== arr) {
        const kf = T()[t].key, m = new Map();
        arr.forEach(r => m.set(String(r[kf]), r));
        ix = this._ix[t] = { arr, m };
      }
      return ix.m.get(String(k)) || null;
    },
    field(t, n) { return T()[t].fields.find(f => f.n === n); },

    // Giá trị (kể cả cột ảo)
    val(t, r, n) {
      const f = this.field(t, n);
      if (f && f.v) { try { return f.v(r, this); } catch (e) { console.warn(e); return ''; } }
      return r[n];
    },
    title(t, r) {
      if (!r) return '';
      const def = T()[t];
      try { return String(def.title(r, this) ?? '') || '(không tên)'; } catch (e) { return String(this.keyOf(t, r)); }
    },
    sub(t, r) { const def = T()[t]; try { return def.sub ? String(def.sub(r, this) ?? '') : ''; } catch (e) { return ''; } },
    badge(t, r) { const def = T()[t]; try { return def.badge ? def.badge(r, this) : null; } catch (e) { return null; } },

    // Hiển thị 1 giá trị dạng HTML an toàn (ảnh/file/mã hoá xử lý riêng ở views)
    // plain = true: không tạo link (dùng bên trong dòng danh sách vốn đã là link)
    show(t, r, n, plain) {
      const f = this.field(t, n); if (!f) return U.esc(r[n]);
      const v = this.val(t, r, n);
      if (v === '' || v == null) return '';
      if (plain && (f.t === 'email' || f.t === 'phone' || f.t === 'url')) return U.esc(v);
      switch (f.t) {
        case 'date': return U.esc(U.fmtDate(v));
        case 'datetime': return U.esc(U.fmtDateTime(v));
        case 'expiry': return U.esc(U.parseDate(v) ? U.fmtDate(v) : v);
        case 'price': return U.esc(U.money(v));
        case 'number': return U.esc(U.int(v));
        case 'ref': {
          if (f.multi) return U.esc(U.splitList(v).map(x => { const rr = this.get(f.ref, x); return rr ? this.title(f.ref, rr) : x; }).join(', '));
          const rr = this.get(f.ref, v); return U.esc(rr ? this.title(f.ref, rr) : v);
        }
        case 'email': return `<a href="mailto:${U.esc(v)}">${U.esc(v)}</a>`;
        case 'phone': return `<a href="tel:${U.esc(String(v).replace(/\s/g, ''))}">${U.esc(v)}</a>`;
        case 'url': { const u = /^https?:\/\//i.test(v) ? v : 'https://' + v; return `<a href="${U.esc(u)}" target="_blank" rel="noopener">${U.esc(v)}</a>`; }
        default: return U.esc(v).replace(/\n/g, '<br>');
      }
    },

    // Ghi trực tiếp (xoá, nhập Excel, đồng bộ file Total…) phải đi SAU các thay đổi của bảng đó đang lưu nền (outbox.js),
    // vd xoá biên bản vừa tạo khi lệnh tạo còn đang gửi. Hàng đợi đang lỗi → dừng, báo xử lý trước.
    async afterOutbox(t) {
      if (!window.Outbox || !Outbox.busy(t)) return;
      U.toast('Đang chờ lưu xong các thay đổi trước…');
      if (!(await Outbox.idle())) throw new Error('Còn thay đổi chưa lưu được lên máy chủ — bấm "Thử lại" hoặc "Bỏ thay đổi" ở góc dưới trước');
    },

    // Luôn tạo mảng mới (không sửa tại chỗ) → chỉ mục / số liệu tính sẵn biết là dữ liệu đã đổi
    async add(t, row) {
      await this.afterOutbox(t);
      const saved = await API.add(t, this.keyField(t), row);
      this.data[t] = [...(this.data[t] || []), saved];
      this.persist(t, this.ver[t]);   // giữ phiên bản: máy chủ vẫn so lại, khác thì tải mới (gotVer đã nhận bản sau khi ghi)
      return saved;
    },
    async update(t, row) {
      await this.afterOutbox(t);
      const saved = await API.update(t, this.keyField(t), row);
      const arr = (this.data[t] || []).slice(), kf = this.keyField(t);
      const i = arr.findIndex(r => String(r[kf]) === String(saved[kf]));
      if (i >= 0) arr[i] = saved; else arr.push(saved);
      this.data[t] = arr;
      this.persist(t, this.ver[t]);   // giữ phiên bản: máy chủ vẫn so lại, khác thì tải mới (gotVer đã nhận bản sau khi ghi)
      return saved;
    },
    // Thêm / sửa nhiều dòng: gửi từng lô 1.000 dòng (Apps Script giới hạn thời gian mỗi lần gọi),
    // onStep(đã xong, tổng) để hiện tiến trình
    // via = nguồn thao tác (ghi vào lịch sử chỉnh sửa trên máy chủ)
    async addMany(t, list, onStep, via) {
      await this.afterOutbox(t);
      const kf = this.keyField(t), saved = [];
      for (let i = 0; i < list.length; i += 1000) {
        saved.push(...await API.addMany(t, kf, list.slice(i, i + 1000), via, bulk(list, via)));
        if (onStep) onStep(Math.min(i + 1000, list.length), list.length);
      }
      this.data[t] = [...(this.data[t] || []), ...saved];
      this.persist(t, this.ver[t]);   // giữ phiên bản: máy chủ vẫn so lại, khác thì tải mới (gotVer đã nhận bản sau khi ghi)
      return saved;
    },
    async updateMany(t, list, onStep, via) {
      await this.afterOutbox(t);
      const kf = this.keyField(t), saved = [];
      for (let i = 0; i < list.length; i += 1000) {
        saved.push(...await API.updateMany(t, kf, list.slice(i, i + 1000), via, bulk(list, via)));
        if (onStep) onStep(Math.min(i + 1000, list.length), list.length);
      }
      const by = new Map(saved.map(r => [String(r[kf]), r]));
      this.data[t] = (this.data[t] || []).map(r => by.get(String(r[kf])) || r);
      this.persist(t, this.ver[t]);   // giữ phiên bản: máy chủ vẫn so lại, khác thì tải mới (gotVer đã nhận bản sau khi ghi)
      return saved;
    },
    async removeMany(t, keys, onStep, size = 1000, via) {   // size: số dòng mỗi lần gọi (xoá nhiều: lớn hơn cho nhanh — mỗi lần máy chủ viết lại bảng)
      await this.afterOutbox(t);
      const kf = this.keyField(t);
      for (let i = 0; i < keys.length; i += size) {
        await API.removeMany(t, kf, keys.slice(i, i + size), via, bulk(keys, via));
        if (onStep) onStep(Math.min(i + size, keys.length), keys.length);
      }
      const drop = new Set(keys.map(String));
      this.data[t] = (this.data[t] || []).filter(r => !drop.has(String(r[kf])));
      this.persist(t, this.ver[t]);   // giữ phiên bản: máy chủ vẫn so lại, khác thì tải mới (gotVer đã nhận bản sau khi ghi)
    },
    // Xoá sạch cả bảng trong 1 lần gọi (nạp lại toàn bộ file Total — chỉ quản trị viên)
    async clearTables(ts, via) {
      for (const t of ts) await this.afterOutbox(t);
      const r = await API.clearTables(ts, via);
      ts.forEach(t => { this.data[t] = []; this.persist(t, this.ver[t]); });
      return r;
    },
    async remove(t, key) {
      await this.afterOutbox(t);
      await API.remove(t, this.keyField(t), key);
      const kf = this.keyField(t);
      this.data[t] = (this.data[t] || []).filter(r => String(r[kf]) !== String(key));
      this.persist(t, this.ver[t]);   // giữ phiên bản: máy chủ vẫn so lại, khác thì tải mới (gotVer đã nhận bản sau khi ghi)
    }
  });

  // ---- Ảnh / file: tải qua API (có kiểm tra quyền) ----
  // size: 'thumb' (ảnh nhỏ trong danh sách) · 'preview' (ảnh xem lớn, đã thu nhỏ ~1600px) · 'full' (file gốc).
  // Ảnh nhỏ + ảnh xem lớn được lưu trên máy (Cache Storage 'tcxl-img-v1'); ảnh nhỏ được gom ~10 ảnh / 1 lần gọi.
  const IMG = 'tcxl-img-v1';
  const mem = new Map();
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  // Khoá gồm cả giá trị ô ảnh → đổi ảnh khác thì tự tải lại, không dùng nhầm ảnh cũ
  const keyOf = (t, key, field, size) => { const r = DB.get(t, key); return ['img', t, key, field, size, hash(r ? r[field] : '')].map(encodeURIComponent).join('/'); };
  async function diskGet(k) { try { const r = await (await caches.open(IMG)).match(k); return r ? await r.blob() : null; } catch (e) { return null; } }
  async function diskPut(k, b) { try { await (await caches.open(IMG)).put(k, new Response(b, { headers: { 'Content-Type': b.type } })); } catch (e) { /* đầy bộ nhớ → bỏ qua */ } }

  // File gốc (biên bản PDF…) đã tải: lưu trên máy (Cache Storage 'tcxl-files-v1') → lần sau mở tức thì, không qua máy chủ.
  // Giới hạn ~150 MB: vượt thì bỏ file lâu không mở nhất (thời điểm mở + dung lượng ghi ở localStorage 'tcxl-files-lru').
  const FILES = 'tcxl-files-v1', FILES_MAX = 150 * 1048576, LRU = 'tcxl-files-lru';
  const lruGet = () => { try { return JSON.parse(localStorage.getItem(LRU) || '{}'); } catch (e) { return {}; } };
  const lruSet = m => { try { localStorage.setItem(LRU, JSON.stringify(m)); } catch (e) { /* bỏ qua */ } };
  async function fileGet(k) {
    try {
      const r = await (await caches.open(FILES)).match(k); if (!r) return null;
      const m = lruGet(); if (m[k]) { m[k].at = Date.now(); lruSet(m); }
      return await r.blob();
    } catch (e) { return null; }
  }
  async function filePut(k, b) {
    try {
      if (b.size > FILES_MAX / 3) return;   // file rất lớn: không giữ trên máy
      const c = await caches.open(FILES), m = lruGet();
      m[k] = { at: Date.now(), n: b.size };
      let tot = Object.values(m).reduce((s, x) => s + (x.n || 0), 0);
      for (const [ok] of Object.entries(m).sort((a, b2) => a[1].at - b2[1].at)) {
        if (tot <= FILES_MAX || ok === k) continue;
        tot -= m[ok].n || 0; delete m[ok]; c.delete(ok);
      }
      await c.put(k, new Response(b, { headers: { 'Content-Type': b.type } }));
      lruSet(m);
    } catch (e) { /* đầy bộ nhớ → bỏ qua */ }
  }
  // Tải trước khi mạng rẻ: máy tính (chuột) hoặc Wi-Fi, không bật tiết kiệm dữ liệu
  const cheapNet = () => {
    const c = navigator.connection;
    if (c && c.saveData) return false;
    if (c && c.type) return /wifi|ethernet/.test(c.type);
    return !matchMedia('(pointer: coarse)').matches;
  };
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

  let q = [], qt = null, noFiles = false;
  const one = g => API.file(g.t, DB.keyField(g.t), g.key, g.field, true).then(g.ok, g.no);
  function thumb(t, key, field) {
    return new Promise((ok, no) => { q.push({ t, key, field, ok, no }); clearTimeout(qt); qt = setTimeout(flush, 25); });
  }
  function flush() {
    const all = q; q = [];
    for (let i = 0; i < all.length; i += 10) send(all.slice(i, i + 10));
  }
  async function send(g) {
    if (noFiles || !API.files || g.length === 1) return g.forEach(one);
    try {
      const res = await API.files(g.map(x => ({ table: x.t, keyField: DB.keyField(x.t), key: x.key, field: x.field })), 'thumb');
      g.forEach((x, i) => { const f = res[i]; if (f && f.error) x.no(new Error(f.error)); else x.ok(f || null); });
    } catch (e) {
      if (/Thao tác không hợp lệ/.test(e.message)) { noFiles = true; g.forEach(one); }   // máy chủ bản cũ chưa có "files"
      else g.forEach(x => x.no(e));
    }
  }

  window.Files = {
    url(t, key, field, size) {
      size = size === true ? 'thumb' : size || 'full';
      const ck = keyOf(t, key, field, size);
      if (mem.has(ck)) return mem.get(ck);
      const p = (async () => {
        // File còn đang chờ tải lên nền → mở luôn bản trên máy (khỏi chờ)
        const rec = DB.get(t, key), pend = rec && String(rec[field] || '').match(/^@up:(.+)$/);
        if (pend) { const du = await DB.upGet(pend[1]); if (du) return URL.createObjectURL(U.b64ToBlob(U.dataUrlParts(du).data, U.dataUrlParts(du).mime)); }
        const hit = size === 'full' ? await fileGet(ck) : await diskGet(ck);
        if (hit) return URL.createObjectURL(hit);
        const f = size === 'thumb' ? await thumb(t, key, field) : await API.file(t, DB.keyField(t), key, field, false, size);
        if (!f) return null;
        const b = U.b64ToBlob(f.data, f.mime);
        if (size === 'full') filePut(ck, b); else diskPut(ck, b);
        return URL.createObjectURL(b);
      })();
      mem.set(ck, p);
      p.catch(() => mem.delete(ck));
      return p;
    },
    // Ảnh đã có sẵn (trong phiên) — dùng làm ảnh mờ tạm khi chờ ảnh lớn
    ready(t, key, field, size) { return mem.get(keyOf(t, key, field, size)) || null; },
    forget(t, key) { const p = ['img', t, key].map(encodeURIComponent).join('/') + '/'; [...mem.keys()].filter(k => k.startsWith(p)).forEach(k => mem.delete(k)); },
    // Tải trước file gốc (không mở) — gọi khi mở trang chi tiết / khi trỏ chuột, chạm vào nút file
    prefetch(t, key, field, force) {
      if (!force && !cheapNet()) return;
      this.url(t, key, field, 'full').catch(() => {});
    },
    cheapNet,
    // btn = nút vừa bấm: hiện "Đang tải… n giây" ngay trên nút, chặn bấm lặp
    async open(t, key, field, btn) {
      if (btn && btn.classList.contains('busy')) return;
      const ck = keyOf(t, key, field, 'full');
      const rec = DB.get(t, key);
      let ready = /^@up:/.test(String(rec && rec[field] || '')) || (mem.has(ck) && await Promise.race([mem.get(ck).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), 30))]));
      if (!ready) try { ready = !!(await (await caches.open(FILES)).match(ck)); } catch (e) { /* bỏ qua */ }   // đã lưu trên máy
      // Chưa có sẵn → mở ngay 1 tab "Đang tải…" trong lúc bấm (trình duyệt chặn tab mở sau vài giây chờ, coi là popup),
      // tải xong mới chuyển tab đó sang file. iPhone (app cài trên màn hình chính) không dùng được cách này → giữ cách cũ.
      let w = null;
      if (!ready && !isIOS) {
        try {
          w = window.open('', '_blank');
          if (w) w.document.write('<!doctype html><meta charset="utf-8"><title>Đang tải file…</title><body style="font:16px system-ui,sans-serif;color:#555;display:grid;place-items:center;height:90vh;margin:0">Đang tải file…</body>');
        } catch (e) { w = null; }
      }
      const lb = btn && btn.querySelector('span'), orig = lb && lb.textContent, t0 = Date.now();
      let tick = null;
      if (btn) { btn.classList.add('busy'); if (lb && !ready) { lb.textContent = 'Đang tải…'; tick = setInterval(() => { lb.textContent = 'Đang tải… ' + Math.round((Date.now() - t0) / 1000) + ' giây'; }, 1000); } }
      else if (!ready) U.toast('Đang mở file…');
      try {
        const u = await this.url(t, key, field, 'full');
        if (!u) { if (w) w.close(); return U.toast('Không tìm thấy file', 'err'); }
        if (w && !w.closed) { w.location.href = u; return; }
        const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { if (w) w.close(); U.toast(e.message, 'err'); }
      finally { clearInterval(tick); if (btn) { btn.classList.remove('busy'); if (lb) lb.textContent = orig; } }
    }
  };
})();
