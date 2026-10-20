// Khoá ứng dụng bằng mã PIN 4 số (riêng từng máy, có công tắc bật / tắt) — chặn người khác cầm máy mở app.
// Lần đầu mở app hỏi đặt PIN, có nút "Không dùng khoá trên máy này"; bật / tắt lại ở Cài đặt → Khoá ứng dụng.
// Khoá khi mở app, khi rời app quá N phút, khi không thao tác quá N phút, hoặc bấm 🔒 trên thanh tiêu đề.
// PIN chỉ lưu dạng mã băm (PBKDF2) trên máy; sai 5 lần phải chờ 30 giây, sai 10 lần tự đăng xuất + xoá dữ liệu trên máy.
// Có thể mở bằng vân tay / khuôn mặt / Windows Hello (WebAuthn — xác thực ngay trên máy, không gửi đi đâu).
(function () {
  const C = () => window.APP_CONFIG;
  const enc = new TextEncoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ls = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } }
  };
  const ITER = 150000, MAX_SOFT = 5, MAX_HARD = 10, WAIT_MS = 30000;
  const key = () => 'tcxl-pin|' + C().mode + '|' + ((App.user && App.user.email) || '');
  const rec = () => ls.get(key(), null);
  const offKey = () => 'tcxl-lock-off|' + C().mode + '|' + ((App.user && App.user.email) || '');   // người dùng chọn không khoá máy này
  async function hash(pin, salt, iter) {
    const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, k, 256));
  }

  const L = (window.Lock = {
    locked: false,
    hasPin() { return !!(rec() && rec().hash); },
    after() { return Number(ls.get('tcxl-lock-after', 5)); },          // phút; 0 = khoá ngay khi rời app
    setAfter(m) { ls.set('tcxl-lock-after', Number(m)); },
    async setPin(pin) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const r = rec() || {};
      ls.set(key(), { ...r, salt: b64(salt), iter: ITER, hash: await hash(pin, salt, ITER), fails: 0, until: 0 });
    },
    async check(pin) { const r = rec(); return !!r && (await hash(pin, ub64(r.salt), r.iter)) === r.hash; },
    forget() { ls.del(key()); },

    // ---- Vân tay / khuôn mặt (WebAuthn) ----
    async bioAvailable() {
      try { return !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
      catch (e) { return false; }
    },
    bioOn() { return !!(rec() && rec().bio); },
    // Mã người dùng cố định theo app + email (app DTH cùng tên miền github.io dùng tiền tố 'dth-app|') → đăng ký lại sẽ THAY
    // passkey cũ trên máy thay vì đẻ thêm passkey mới mỗi lần
    async bioEnable() {
      const u = App.user;
      const uid = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('tcxl-app|' + C().mode + '|' + u.email))).slice(0, 16);
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: C().appName },
        user: { id: uid, name: u.email, displayName: 'Phòng TCXL · ' + (u.name || u.email) },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        hints: ['client-device'], timeout: 60000, attestation: 'none' } });
      ls.set(key(), { ...rec(), bio: b64(cred.rawId) });
    },
    bioDisable() { const r = rec(); if (r) { delete r.bio; ls.set(key(), r); } },
    async bioCheck() {
      const r = rec(); if (!r || !r.bio) return false;
      await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: ub64(r.bio), transports: ['internal'] }], userVerification: 'required',
        hints: ['client-device'], timeout: 60000 } });
      return true;
    },

    // Gọi ngay khi biết người dùng (trước khi vẽ trang): chưa có PIN → bắt đặt; có rồi → khoá
    boot() {
      if (!L._wired) wire();
      if (!L.hasPin()) return L.isOff() ? undefined : setupScreen(false);   // đã chọn không dùng khoá → vào thẳng
      L.lock();
    },
    isOff() { return !!ls.get(offKey(), false); },
    lock() {
      if (!L.hasPin()) return;
      L.locked = true;
      if (window.Vault && Vault.isOpen && Vault.isOpen()) Vault.lock();   // khoá luôn dữ liệu mã hoá
      pinScreen();
    },
    unlock() { L.locked = false; hide(); lastAct = Date.now(); if (App.lockIcon) App.lockIcon(); }
  });

  // ---------------- tự khoá: rời app quá N phút / không thao tác quá N phút ----------------
  let hiddenAt = 0, lastAct = Date.now();
  function wire() {
    L._wired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); if (L.after() === 0 && L.hasPin()) L.lock(); return; }
      if (hiddenAt && L.hasPin() && !L.locked && Date.now() - hiddenAt >= L.after() * 60000) L.lock();
    });
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
    setInterval(() => {
      if (!L.locked && L.hasPin() && !document.hidden && Date.now() - lastAct >= Math.max(1, L.after()) * 60000) L.lock();
    }, 15000);
    // Đang khoá: phím số / xoá dùng cho bàn phím PIN, chặn mọi phím khác đến trang bên dưới
    document.addEventListener('keydown', e => {
      const box = document.getElementById('lockscr'); if (!box || box.hidden) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); box._press && box._press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); box._press && box._press('del'); }
      if (!e.target.closest || !e.target.closest('#lockscr')) e.stopPropagation();
    }, true);
  }

  // ---------------- giao diện ----------------
  function el() {
    let box = document.getElementById('lockscr');
    if (!box) { box = document.createElement('div'); box.id = 'lockscr'; box.className = 'lockscr'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); document.body.appendChild(box); }
    box.hidden = false; document.body.classList.add('locked');
    return box;
  }
  function hide() { const box = document.getElementById('lockscr'); if (box) { box.hidden = true; box.innerHTML = ''; box._press = null; } document.body.classList.remove('locked'); }
  const who = () => {
    const u = App.user || {}, name = (window.Auth && Auth.name) || u.name || u.email || '';
    return `<div class="lk-who"><img src="icons/icon.svg" alt="" width="56" height="56"><b>${U.esc(name)}</b><small>${U.esc(u.email || '')}</small></div>`;
  };
  // Bàn phím số 4 chấm; onDone(pin) trả về false = sai (rung + xoá)
  function pad(box, { title, sub, bio, foot, onDone }) {
    let pin = '', busy = false;
    box.innerHTML = `<div class="lk-in">${who()}<h2>${U.esc(title)}</h2><p class="lk-sub">${sub || ''}</p>
      <div class="lk-dots" aria-live="polite">${'<i></i>'.repeat(4)}</div><p class="lk-msg" role="alert"></p>
      <div class="lk-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        ${bio ? `<button type="button" class="lk-bio" data-k="bio" aria-label="Mở bằng vân tay / khuôn mặt">${Icon('key')}</button>` : '<span></span>'}
        <button type="button" data-k="0">0</button><button type="button" class="lk-del" data-k="del" aria-label="Xoá">⌫</button></div>
      <div class="lk-foot">${foot || ''}</div></div>`;
    const dots = box.querySelectorAll('.lk-dots i'), msg = box.querySelector('.lk-msg');
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    box._msg = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };
    box._press = async k => {
      if (busy) return;
      if (k === 'bio') return bio && bio();
      if (k === 'del') { pin = pin.slice(0, -1); paint(); return; }
      if (pin.length >= 4) return;
      pin += k; paint();
      if (pin.length === 4) {
        busy = true;
        const ok = await onDone(pin);
        busy = false;
        if (ok === false) { box.querySelector('.lk-dots').classList.add('shake'); setTimeout(() => { const d = box.querySelector('.lk-dots'); if (d) d.classList.remove('shake'); pin = ''; paint(); }, 450); }
        else pin = '';
      }
    };
    box.querySelector('.lk-keys').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) box._press(b.dataset.k); });
    return box;
  }

  // Màn hình đặt PIN (bắt buộc lần đầu, hoặc đổi PIN từ Cài đặt)
  function setupScreen(changing) {
    const box = el();
    let first = '';
    const demo = C().mode === 'demo';
    const step1 = () => pad(box, {
      title: changing ? 'Mã PIN mới' : 'Đặt mã PIN cho máy này',
      sub: changing ? 'Nhập 4 số mới' : 'Mỗi lần mở app trên máy này sẽ cần mã PIN 4 số — để người khác cầm máy không xem được dữ liệu. Không cần thì bấm "Không dùng khoá" bên dưới.',
      foot: changing ? '<button type="button" class="linkbtn" data-x>Huỷ</button>'
        : '<button type="button" class="linkbtn" data-off>Không dùng khoá trên máy này</button>' + (demo ? ' · <button type="button" class="linkbtn" data-skip>Bỏ qua (chỉ ở bản demo)</button>' : ''),
      onDone: pin => {
        if (/^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) { box._msg('Mã quá dễ đoán (1111, 1234…) — chọn mã khác', true); return false; }
        first = pin; step2(); return true;
      }
    });
    const step2 = () => pad(box, {
      title: 'Nhập lại mã PIN', sub: 'Nhập lại 4 số vừa chọn để xác nhận',
      foot: '<button type="button" class="linkbtn" data-back>Chọn lại</button>',
      onDone: async pin => {
        if (pin !== first) { box._msg('Hai lần nhập không khớp', true); return false; }
        await L.setPin(pin); L.locked = false; hide(); lastAct = Date.now(); if (App.lockIcon) App.lockIcon();
        U.toast(changing ? 'Đã đổi mã PIN' : 'Đã đặt mã PIN — app sẽ khoá khi bạn rời đi', 'ok');
        if (!changing) offerBio();
        return true;
      }
    });
    box.onclick = async e => {
      if (e.target.closest('[data-back]')) step1();
      else if (e.target.closest('[data-x]')) hide();
      else if (e.target.closest('[data-skip]')) { L.locked = false; hide(); }
      else if (e.target.closest('[data-off]')) {
        if (!(await U.confirm('Không dùng khoá app trên máy này? Ai cầm máy cũng mở được app. Có thể bật lại bất cứ lúc nào ở Cài đặt → Khoá ứng dụng.'))) return;
        ls.set(offKey(), true); L.locked = false; hide(); lastAct = Date.now(); if (App.lockIcon) App.lockIcon();
        U.toast('Đã tắt khoá app trên máy này', 'ok');
      }
    };
    step1();
  }
  L.setup = () => setupScreen(false);
  // Bật khoá (Cài đặt): bỏ lựa chọn "không khoá", đặt mã PIN
  L.enable = () => { ls.del(offKey()); setupScreen(false); };
  // Tắt khoá (Cài đặt): nhập đúng mã PIN hiện tại mới tắt được (người khác cầm máy không tự tắt được) → xoá PIN + vân tay
  L.disable = done => {
    const finish = () => {
      L.forget(); ls.set(offKey(), true); L.locked = false; hide(); if (App.lockIcon) App.lockIcon();
      U.toast('Đã tắt khoá app trên máy này', 'ok'); if (done) done();
    };
    if (!L.hasPin()) return finish();
    const box = el();
    pad(box, {
      title: 'Nhập mã PIN hiện tại', sub: 'Để tắt khoá app trên máy này', foot: '<button type="button" class="linkbtn" data-x>Huỷ</button>',
      onDone: async pin => { if (!(await L.check(pin))) { box._msg('Mã PIN không đúng', true); return false; } finish(); return true; }
    });
    box.onclick = e => { if (e.target.closest('[data-x]')) { hide(); if (done) done(); } };
  };
  L.changePin = () => {   // từ Cài đặt: xác nhận PIN cũ rồi đặt PIN mới
    const box = el();
    pad(box, {
      title: 'Nhập mã PIN hiện tại', sub: 'Để đổi sang mã PIN mới', foot: '<button type="button" class="linkbtn" data-x>Huỷ</button>',
      onDone: async pin => { if (!(await L.check(pin))) { box._msg('Mã PIN không đúng', true); return false; } setupScreen(true); return true; }
    });
    box.onclick = e => { if (e.target.closest('[data-x]')) hide(); };
  };

  async function offerBio() {
    if (!(await L.bioAvailable()) || L.bioOn()) return;
    if (!(await U.confirm('Máy này có vân tay / khuôn mặt / Windows Hello. Dùng để mở khoá app cho nhanh (mã PIN vẫn dùng được)?'))) return;
    try { await L.bioEnable(); U.toast('Đã bật mở khoá bằng vân tay / khuôn mặt', 'ok'); } catch (e) { U.toast('Chưa bật được: ' + e.message, 'err'); }
  }

  // Màn hình khoá
  async function pinScreen() {
    const box = el();
    const bioOk = L.bioOn() && await L.bioAvailable();
    let bioFailed = false;
    const tryBio = async () => {
      try { if (await L.bioCheck()) { const r = rec(); ls.set(key(), { ...r, fails: 0, until: 0 }); L.unlock(); } }
      catch (e) {
        bioFailed = true;
        box._msg && box._msg('Windows Hello / vân tay chưa mở được khoá' + (e && e.name ? ' (' + e.name + ')' : '') + ' — nhập mã PIN, app sẽ hỏi đăng ký lại', true);
      }
    };
    // Passkey trên máy hỏng / bị xoá (Windows báo "There was a problem signing in with your passkey"…) →
    // mở bằng PIN xong thì đề nghị đăng ký lại (thay passkey cũ)
    const offerReBio = async () => {
      if (!(await U.confirm('Mở khoá bằng Windows Hello / vân tay vừa bị lỗi. Đăng ký lại cho app trên máy này?'))) return;
      try { await L.bioEnable(); U.toast('Đã đăng ký lại — lần khoá sau bấm 🔑 để mở', 'ok'); }
      catch (e) { U.toast('Chưa đăng ký lại được (' + (e.name || e.message) + ') — vẫn dùng mã PIN; có thể tắt mục này trong Cài đặt → Khoá ứng dụng', 'err'); }
    };
    pad(box, {
      title: 'Nhập mã PIN', sub: 'App đang khoá', bio: bioOk ? tryBio : null,
      foot: '<button type="button" class="linkbtn" data-forgot>Quên mã PIN?</button>',
      onDone: async pin => {
        const r = rec(); if (!r) { L.unlock(); return true; }
        if (r.until && Date.now() < r.until) { box._msg('Thử lại sau ' + Math.ceil((r.until - Date.now()) / 1000) + ' giây', true); return false; }
        if (await L.check(pin)) { ls.set(key(), { ...rec(), fails: 0, until: 0 }); L.unlock(); if (bioFailed) offerReBio(); return true; }
        const fails = (r.fails || 0) + 1;
        if (fails >= MAX_HARD) { L.forget(); box._msg('Sai quá nhiều lần — đang đăng xuất…', true); setTimeout(() => App.signOut(), 1200); return false; }
        const until = fails >= MAX_SOFT ? Date.now() + WAIT_MS : 0;
        ls.set(key(), { ...r, fails, until });
        box._msg(until ? `Sai ${fails} lần — chờ 30 giây rồi thử lại (sai ${MAX_HARD} lần sẽ tự đăng xuất)` : `Mã PIN không đúng (còn ${MAX_SOFT - fails} lần trước khi phải chờ)`, true);
        return false;
      }
    });
    box.onclick = async e => {
      if (!e.target.closest('[data-forgot]')) return;
      if (!(await U.confirm('Quên mã PIN: app sẽ đăng xuất và xoá dữ liệu lưu tạm trên máy này. Đăng nhập Google lại rồi đặt mã PIN mới. Dữ liệu trên Google Sheets không bị ảnh hưởng.'))) return;
      L.forget(); App.signOut();
    };
    const r = rec();
    if (r && r.until && Date.now() < r.until) box._msg('Sai nhiều lần — chờ ' + Math.ceil((r.until - Date.now()) / 1000) + ' giây rồi thử lại', true);
  }
})();
