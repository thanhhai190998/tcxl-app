// =====================================================================
//  MÃ HOÁ BẰNG MẬT KHẨU CHỦ (chạy hoàn toàn trên máy người dùng)
//  - Dữ liệu được mã hoá AES-GCM 256 bit bằng một "khoá dữ liệu" (DEK).
//  - Mật khẩu chủ → PBKDF2-SHA256 (600.000 vòng) → khoá bọc (KEK) dùng để khoá DEK.
//    Đổi mật khẩu chủ = bọc lại DEK bằng mật khẩu mới → KHÔNG phải mã hoá lại dữ liệu.
//  - Google Sheet / Apps Script chỉ thấy chuỗi "enc1:...", không đọc được.
//  - Quên mật khẩu chủ = KHÔNG khôi phục được dữ liệu đã mã hoá.
//
//  Cấu hình (lưu ở _CAUHINH, không chứa mật khẩu):
//    v1 (cũ):  { v:1, salt, iter, check }            khoá dữ liệu = PBKDF2(mật khẩu chủ)
//    v2:       { v:2, salt, iter, wrap, check }      wrap = DEK được khoá bằng PBKDF2(mật khẩu chủ)
//  Khi đổi mật khẩu lần đầu, v1 tự chuyển thành v2 với DEK chính là khoá cũ
//  (PBKDF2 deriveBits cho đúng 256 bit mà deriveKey đã dùng) → dữ liệu cũ vẫn giải mã được.
// =====================================================================
(function () {
  const PREFIX = 'enc1:';
  const CHECK = 'vault-ok';
  const ITER = 600000;
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = a => btoa(String.fromCharCode(...a));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));

  async function pbkdf2Base(pass) { return crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey', 'deriveBits']); }
  // Khoá AES từ mật khẩu (không xuất được ra ngoài)
  async function derive(pass, salt, iter) {
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(salt), iterations: iter, hash: 'SHA-256' },
      await pbkdf2Base(pass), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // Đúng 256 bit mà derive() dùng làm khoá (để chuyển cấu hình v1 → v2)
  async function deriveRaw(pass, salt, iter) {
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64d(salt), iterations: iter, hash: 'SHA-256' }, await pbkdf2Base(pass), 256));
  }
  const importRaw = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  async function encWith(key, text) {
    const iv = rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(String(text))));
    return PREFIX + b64e(iv) + ':' + b64e(ct);
  }
  async function decWith(key, v) {
    const [iv, ct] = String(v).slice(PREFIX.length).split(':');
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) }, key, b64d(ct)));
  }
  // Lấy khoá dữ liệu dạng thô từ cấu hình + mật khẩu (ném lỗi nếu sai mật khẩu)
  async function rawDek(cfg, pass) {
    if (cfg.v === 2) {
      const kek = await derive(pass, cfg.salt, cfg.iter);
      try { return b64d(await decWith(kek, cfg.wrap)); } catch (e) { throw new Error('Sai mật khẩu chủ'); }
    }
    return deriveRaw(pass, cfg.salt, cfg.iter);
  }
  // Khoá dữ liệu (CryptoKey) từ cấu hình + mật khẩu, đã kiểm tra bằng chuỗi check
  async function keyFrom(cfg, pass) {
    const raw = await rawDek(cfg, pass);
    const key = await importRaw(raw); raw.fill(0);
    try { if (await decWith(key, cfg.check) !== CHECK) throw 0; } catch (e) { throw new Error('Sai mật khẩu chủ'); }
    return key;
  }
  // Bọc khoá dữ liệu bằng mật khẩu mới → cấu hình v2 mới
  async function wrapCfg(raw, pass, check) {
    const salt = b64e(rand(16));
    const kek = await derive(pass, salt, ITER);
    return { v: 2, salt, iter: ITER, wrap: await encWith(kek, b64e(raw)), check };
  }

  const V = (window.Vault = {
    key: null, cfg: null, timer: null, onChange: null,
    isEnc: v => typeof v === 'string' && v.startsWith(PREFIX),
    isSet() { return !!(this.cfg && this.cfg.salt); },
    isOpen() { return !!this.key; },

    // Tạo cấu hình mới: khoá dữ liệu ngẫu nhiên, bọc bằng mật khẩu chủ
    async create(pass) {
      const raw = rand(32);
      const check = await encWith(await importRaw(raw), CHECK);
      const cfg = await wrapCfg(raw, pass, check);
      raw.fill(0);
      return cfg;
    },

    async unlock(pass) {
      if (!this.isSet()) throw new Error('Chưa đặt mật khẩu chủ');
      this.key = await keyFrom(this.cfg, pass);
      this.touch(); this.onChange && this.onChange();
    },

    // Đổi mật khẩu chủ: trả về cấu hình mới (chưa lưu) + khoá đã kiểm tra.
    // Dữ liệu không đổi vì khoá dữ liệu giữ nguyên, chỉ lớp bọc thay đổi.
    async rewrap(oldPass, newPass, samples = []) {
      if (!this.isSet()) throw new Error('Chưa đặt mật khẩu chủ');
      let raw;
      try { raw = await rawDek(this.cfg, oldPass); } catch (e) { throw new Error('Mật khẩu chủ hiện tại không đúng'); }
      const key = await importRaw(raw);
      try { if (await decWith(key, this.cfg.check) !== CHECK) throw 0; } catch (e) { raw.fill(0); throw new Error('Mật khẩu chủ hiện tại không đúng'); }
      const next = await wrapCfg(raw, newPass, this.cfg.check);
      raw.fill(0);
      // Kiểm tra lại trước khi cho lưu: mở bằng mật khẩu mới được, và giải mã đúng dữ liệu thật
      const k2 = await keyFrom(next, newPass);
      for (const s of samples) { try { await decWith(k2, s); } catch (e) { throw new Error('Kiểm tra thất bại: không giải mã được dữ liệu hiện có — chưa đổi gì'); } }
      return { cfg: next, key: k2 };
    },

    // Dùng sau khi đã lưu cấu hình mới thành công
    adopt(cfg, key) { this.cfg = cfg; this.key = key; this.touch(); this.onChange && this.onChange(); },

    // Tải lại cấu hình mới nhất (vd mật khẩu chủ vừa được đổi ở máy khác)
    async reload() {
      try { const v = await API.getConfig('vault'); if (v) this.cfg = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { /* giữ cấu hình cũ */ }
    },

    lock() { this.key = null; clearTimeout(this.timer); this.onChange && this.onChange(); },

    touch() {
      if (!this.key) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.lock(), (window.APP_CONFIG.autoLockMinutes || 5) * 60000);
    },

    async enc(text) { if (!this.key) throw new Error('Chưa mở khoá'); this.touch(); return encWith(this.key, text); },
    async dec(v) {
      if (!this.isEnc(v)) return v;
      if (!this.key) throw new Error('Chưa mở khoá');
      this.touch();
      try { return await decWith(this.key, v); } catch (e) { return '⚠ (không giải mã được)'; }
    },

    // Hỏi mật khẩu chủ nếu đang khoá. Trả về true nếu đã mở.
    async ensureOpen() {
      if (this.key) { this.touch(); return true; }
      await this.reload();
      if (!this.isSet()) { U.toast('Chưa đặt mật khẩu chủ — vào Cài đặt để đặt', 'err'); return false; }
      for (;;) {
        const r = await U.ask({ title: 'Mở khoá dữ liệu bảo mật', fields: [{ name: 'p', label: 'Mật khẩu chủ', type: 'password' }], ok: 'Mở khoá' });
        if (!r) return false;
        try { await this.unlock(r.p); return true; } catch (e) { U.toast(e.message, 'err'); }
      }
    }
  });

  // Mọi thao tác chạm/gõ đều gia hạn thời gian tự khoá
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => V.touch(), { passive: true }));
})();
