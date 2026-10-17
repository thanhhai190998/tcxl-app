// =====================================================================
//  API THẬT: gọi Apps Script (Google Sheets) + đăng nhập Google
//  Đăng nhập Google cho token chỉ sống 1 giờ → đổi ngay lấy PHIÊN của app (30 ngày, tự gia hạn
//  mỗi lần dùng). Mọi yêu cầu kèm phiên (hoặc token Google khi chưa có phiên); Apps Script kiểm tra
//  phiên/token và bảng phân quyền trước khi trả dữ liệu.
// =====================================================================
(function () {
  const CFG = () => window.APP_CONFIG;
  const SKEY = 'tcxl-session';

  function decodeJwt(t) {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '==='.slice((b.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }

  const Auth = (window.Auth = {
    token: null, exp: 0, email: '', name: '', picture: '', session: null, sexp: 0,
    restore() {
      try {
        const s = JSON.parse(localStorage.getItem('tcxl-auth') || 'null');
        if (s && s.t) { this.hint = String(decodeJwt(s.t).email || '').toLowerCase(); this.set(s.t, true); }   // hint: email lần đăng nhập trước (kể cả khi token đã hết hạn)
        const ss = JSON.parse(localStorage.getItem(SKEY) || 'null');
        if (ss && ss.sid && ss.exp > Date.now()) {
          this.session = ss.sid; this.sexp = ss.exp; this.hint = this.hint || ss.email;
          if (!this.token) { this.email = ss.email; this.name = ss.name || ''; this.given = ss.given || ''; this.picture = ss.picture || ''; }
        }
      } catch (e) { /* bỏ qua */ }
    },
    hasSession() { return !!this.session && this.sexp > Date.now(); },
    tokenValid() { return !!this.token && this.exp * 1000 > Date.now() + 60000; },
    valid() { return this.hasSession() || this.tokenValid(); },
    set(cred, silent) {
      const p = decodeJwt(cred);
      if (p.exp * 1000 <= Date.now() + 60000) { if (silent) return; }
      this.token = cred; this.exp = p.exp; this.email = p.email; this.name = p.name || ''; this.given = p.given_name || ''; this.picture = p.picture || '';
      try { localStorage.setItem('tcxl-auth', JSON.stringify({ t: cred })); } catch (e) { /* bỏ qua */ }
    },
    setSession(sid, exp) {
      this.session = sid; this.sexp = exp;
      const email = String(this.email || '').toLowerCase();
      try { localStorage.setItem(SKEY, JSON.stringify({ sid, exp, email, name: this.name, given: this.given, picture: this.picture })); } catch (e) { /* bỏ qua */ }
    },
    clearSession() {
      this.session = null; this.sexp = 0;
      try { localStorage.removeItem(SKEY); } catch (e) { /* bỏ qua */ }
    },
    clear() {
      this.token = null; this.exp = 0;
      try { localStorage.removeItem('tcxl-auth'); } catch (e) { /* bỏ qua */ }
    },
    async signOut() {
      const sid = this.session;
      this.clear(); this.clearSession();
      if (sid) await Promise.race([post({ action: 'logout', session: sid }).catch(() => {}), new Promise(r => setTimeout(r, 3000))]);   // huỷ phiên trên máy chủ
      try { google.accounts.id.disableAutoSelect(); } catch (e) { /* bỏ qua */ }
    },
    // Hiện màn hình đăng nhập Google, chờ đến khi có token
    signIn() {
      if (this._waiting) return this._waiting;
      this._waiting = new Promise((resolve, reject) => {
        const box = document.getElementById('login');
        box.hidden = false;
        const start = () => {
          google.accounts.id.initialize({
            client_id: CFG().googleClientId,
            auto_select: true,
            callback: r => { this.set(r.credential); box.hidden = true; this._waiting = null; resolve(); }
          });
          google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'vi' });
          google.accounts.id.prompt();
        };
        if (window.google && google.accounts) return start();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = start;
        s.onerror = () => { this._waiting = null; reject(new Error('Không tải được dịch vụ đăng nhập Google — kiểm tra mạng')); };
        document.head.appendChild(s);
      });
      return this._waiting;
    }
  });

  // Google đôi khi trả trang HTML lỗi (quá tải, hết giờ…) thay cho JSON — ở chính Apps Script, hoặc ở bước máy chủ
  // hỏi Google kiểm tra đăng nhập (Code.gs cũ báo "Unexpected token '<'…"). Lệnh chỉ đọc → tự gửi lại tối đa 3 lần.
  const SAFE = new Set(['me', 'login', 'logout', 'list', 'batch', 'file', 'files', 'users', 'getConfig']);
  const GLITCH = /Unexpected token|not valid JSON/i;
  const NOJSON = 'Máy chủ Google đang trục trặc (trả về trang lỗi thay cho dữ liệu) — đợi vài phút rồi bấm Thử lại';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function post(body) {
    const tries = SAFE.has(body.action) ? 3 : 1;
    for (let i = 1; ; i++) {
      let txt, j = null;
      // Không đặt Content-Type → text/plain, tránh preflight CORS với Apps Script
      try { txt = await (await fetch(CFG().apiUrl, { method: 'POST', body: JSON.stringify(body) })).text(); }
      catch (e) { throw new Error('Mất kết nối máy chủ'); }
      try { j = JSON.parse(txt); } catch (e) { console.warn('Máy chủ trả về không phải JSON:', body.action, txt.slice(0, 300)); }
      if (j && !(j.ok === false && GLITCH.test(String(j.error || '')))) return j;
      if (i < tries) { await wait(1000 * i); continue; }
      return { ok: false, error: NOJSON };
    }
  }

  // Đổi token Google lấy phiên 30 ngày (gọi 1 lần ngay sau khi đăng nhập; nhiều yêu cầu cùng lúc dùng chung)
  let exchanging = null, noSession = false;
  function exchange() {
    if (Auth.hasSession() || noSession || !Auth.tokenValid()) return Promise.resolve();
    return exchanging || (exchanging = post({ action: 'login', token: Auth.token }).then(j => {
      if (j.ok && j.data && j.data.session) Auth.setSession(j.data.session, j.data.exp);
      else if (j.error === 'Thao tác không hợp lệ') noSession = true;   // máy chủ bản cũ chưa có phiên → dùng token Google như trước
    }).catch(() => {}).finally(() => { exchanging = null; }));
  }

  async function call(action, payload, retry = true) {
    if (!CFG().apiUrl) throw new Error('Chưa cấu hình apiUrl trong js/config.js');
    if (!Auth.hasSession()) {
      if (!Auth.tokenValid()) await Auth.signIn();
      await exchange();
    }
    const cred = Auth.hasSession() ? { session: Auth.session } : { token: Auth.token };
    const j = await post(Object.assign({ action }, cred, payload || {}));
    if (!j.ok) {
      // Phiên / token hết hạn hoặc đã bị huỷ → bỏ đi, thử lại (cần thì hiện màn hình đăng nhập Google)
      if (j.error === 'AUTH' && retry) { if (cred.session) Auth.clearSession(); else Auth.clear(); return call(action, payload, false); }
      const err = new Error(j.error === 'NOT_ALLOWED' ? 'Tài khoản ' + (j.email || '') + ' chưa được cấp quyền dùng app' : j.error);
      err.code = j.error; throw err;
    }
    if (j.v && window.DB && DB.gotVer) DB.gotVer(j.v);   // lần ghi: phiên bản bảng trước / sau khi ghi
    return j.data;
  }

  window.LiveAPI = {
    me: () => call('me'),
    list: t => call('list', { table: t }),
    add: (t, keyField, row) => call('add', { table: t, keyField, row }),
    update: (t, keyField, row) => call('update', { table: t, keyField, row }),
    remove: (t, keyField, key) => call('remove', { table: t, keyField, key }),
    addMany: (t, keyField, rows) => call('addMany', { table: t, keyField, rows }),          // cần Code.gs bản TCXL
    updateMany: (t, keyField, rows) => call('updateMany', { table: t, keyField, rows }),
    removeMany: (t, keyField, keys) => call('removeMany', { table: t, keyField, keys }),
    upload: (t, field, name, dataUrl) => { const p = U.dataUrlParts(dataUrl); return call('upload', { table: t, field, name, mime: p.mime, data: p.data }); },
    file: (t, keyField, key, field, thumb, size) => call('file', { table: t, keyField, key, field, thumb: !!thumb, size }),
    files: (items, size) => call('files', { items, size }),
    batch: (ts, have) => call('batch', { tables: ts, have: have || {} }),
    undoData: id => call('undoData', { id }),
    users: () => call('users'),
    saveUser: u => call('saveUser', { user: u }),
    deleteUser: email => call('deleteUser', { email }),
    getConfig: k => call('getConfig', { key: k }),
    setConfig: (k, v) => call('setConfig', { key: k, value: v }),
    logoutAll: () => call('logoutAll'),
    signOut: () => Auth.signOut()
  };
})();
