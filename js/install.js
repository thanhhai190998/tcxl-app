// =====================================================================
//  Cài app lên màn hình chính — hướng dẫn theo đúng loại máy / trình duyệt đang dùng.
//  iPhone KHÔNG có nút "Cài" như Android/PC: phải mở bằng Safari → Chia sẻ → Thêm vào MH chính.
//  Link mở trong Zalo/Facebook… (trình duyệt nhúng) không cài được và Google chặn đăng nhập → nhắc mở bằng Safari/Chrome.
// =====================================================================
(function () {
  const ua = navigator.userAgent;
  const IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const ANDROID = /Android/i.test(ua);
  const IN_APP = [[/Zalo/i, 'Zalo'], [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/Messenger/i, 'Messenger'], [/Instagram/i, 'Instagram'],
    [/\bLine\//, 'LINE'], [/MicroMessenger/i, 'WeChat'], [/musical_ly|Bytedance|TikTok/i, 'TikTok']];
  const k = (t) => `<b class="ins-k">${t}</b>`;          // tên nút / mục trên máy
  const ic = (n) => `<span class="ins-i">${Icon(n)}</span>`;

  const I = (window.Install = {
    IOS, ANDROID,
    // Đang chạy như app đã cài (mở từ biểu tượng trên màn hình chính)
    standalone: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    inApp: () => (IN_APP.find(([re]) => re.test(ua)) || [])[1] || '',
    browser() {
      if (IOS) return /CriOS/.test(ua) ? 'Chrome' : /EdgiOS/.test(ua) ? 'Edge' : /FxiOS/.test(ua) ? 'Firefox' : 'Safari';
      return /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : 'Chrome';
    },
    url: () => location.origin + location.pathname,
    // Câu ngắn cho dòng "Cài app vào máy" ở Cài đặt
    hint() {
      if (I.standalone()) return 'Đang chạy như app đã cài trên máy này';
      if (I.inApp()) return `Đang mở trong ${I.inApp()} — hãy mở bằng ${IOS ? 'Safari' : 'Chrome'} để cài`;
      if (IOS) return 'iPhone: Safari → Chia sẻ → Thêm vào MH chính';
      return ANDROID ? 'Chrome: menu ⋮ → Cài đặt ứng dụng / Thêm vào màn hình chính' : 'Chrome / Edge: biểu tượng cài ở cuối thanh địa chỉ';
    },

    // Các bước cho từng loại máy
    steps: {
      inapp: (app) => [
        `Bạn đang mở link trong ${k(app)}. Trình duyệt bên trong ${U.esc(app)} <b>không cài được app</b> và Google thường <b>chặn đăng nhập</b>.`,
        `Bấm nút ${k('⋯')} (thường ở góc trên bên phải) → chọn ${k('Mở bằng trình duyệt')} / ${k(IOS ? 'Mở trong Safari' : 'Mở trong Chrome')}.`,
        `Hoặc bấm ${k('Sao chép liên kết')} bên dưới rồi dán vào ${IOS ? 'Safari' : 'Chrome'}.`,
        `Sau đó làm theo hướng dẫn cài cho ${IOS ? 'iPhone' : 'Android'}.`],
      ios: () => [
        `Mở địa chỉ app bằng ${k('Safari')} (trình duyệt la bàn có sẵn của iPhone).`,
        `Bấm nút ${k('Chia sẻ')} ${ic('share')} ở thanh dưới cùng. iOS 26 trở lên: bấm ${k('⋯')} cạnh thanh địa chỉ → ${k('Chia sẻ')}.`,
        `Chọn ${k('Thêm vào MH chính')} ${ic('addsq')} — không thấy thì bấm ${k('Xem thêm')} hoặc kéo xuống cuối danh sách.`,
        `Có công tắc ${k('Mở dưới dạng ứng dụng web')} thì để bật → bấm ${k('Thêm')}.`,
        `Mở app bằng biểu tượng ${k('TCXL')} trên màn hình chính và đăng nhập Google một lần nữa (iPhone tách riêng app với Safari).`],
      iosOther: (b) => [
        `${U.esc(b)} trên iPhone (iOS 16.4 trở lên) cũng cài được: bấm nút ${k('Chia sẻ')} ${ic('share')} trên thanh địa chỉ → ${k('Thêm vào MH chính')} → ${k('Thêm')}.`,
        `Không thấy mục này: mở địa chỉ app bằng ${k('Safari')} rồi làm theo hướng dẫn cho Safari.`],
      android: (b) => b === 'Samsung Internet'
        ? [`Bấm menu ${k('≡')} ở thanh dưới → ${k('Thêm trang vào')} → ${k('Màn hình chính')}.`, `Mở app bằng biểu tượng ${k('TCXL')} trên màn hình chính.`]
        : [`Mở địa chỉ app bằng ${k('Chrome')}.`,
          `Bấm menu ${k('⋮')} ở góc trên bên phải → ${k('Cài đặt ứng dụng')} (hoặc ${k('Thêm vào màn hình chính')} → ${k('Cài đặt')}).`,
          `Mở app bằng biểu tượng ${k('TCXL')} trên màn hình chính / trong danh sách ứng dụng.`],
      pc: () => [
        `Dùng ${k('Chrome')} hoặc ${k('Edge')}.`,
        `Bấm biểu tượng cài ${ic('download')} ở cuối thanh địa chỉ. Không thấy: Chrome menu ${k('⋮')} → ${k('Truyền, lưu và chia sẻ')} → ${k('Cài đặt trang dưới dạng ứng dụng')}; Edge menu ${k('…')} → ${k('Ứng dụng')} → ${k('Cài đặt trang web này dưới dạng ứng dụng')}.`,
        `Bấm ${k('Cài đặt')}. App có biểu tượng riêng trên thanh tác vụ / menu Start.`]
    },

    // Hộp thoại hướng dẫn: phần của máy đang dùng mở sẵn, các máy khác thu gọn
    show() {
      const app = I.inApp(), b = I.browser();
      const mine = app ? ['inapp', `Đang mở trong ${app}`, I.steps.inapp(app)]
        : IOS ? (b === 'Safari' ? ['ios', 'iPhone / iPad · Safari', I.steps.ios()] : ['iosOther', `iPhone · ${b}`, I.steps.iosOther(b)])
          : ANDROID ? ['android', `Android · ${b}`, I.steps.android(b)] : ['pc', `Máy tính · ${b}`, I.steps.pc()];
      const others = [['ios', 'iPhone / iPad (Safari)', I.steps.ios()], ['android', 'Android (Chrome)', I.steps.android('Chrome')], ['pc', 'Máy tính (Chrome / Edge)', I.steps.pc()]]
        .filter(o => o[0] !== mine[0]);
      const ol = (st) => `<ol class="ins-ol">${st.map(s => `<li>${s}</li>`).join('')}</ol>`;
      const wrap = document.createElement('div');
      wrap.className = 'modal-bg';
      wrap.innerHTML = `<div class="modal ins" role="dialog" aria-modal="true" aria-label="Cài app lên máy">
        <div class="ins-h"><img src="icons/icon.svg" alt="" width="40" height="40"><div><h3>Cài app lên máy</h3>
          <p class="muted small">Có biểu tượng trên màn hình chính, mở toàn màn hình như app thường. Không cần vào App Store / CH Play.</p></div></div>
        ${I.standalone() ? `<p class="ins-ok">${Icon('check')} Bạn đang dùng app đã cài trên máy này.</p>` : ''}
        ${App.installPrompt && !app ? `<button type="button" class="btn" data-ins="now">${Icon('download')} Cài ngay trên máy này</button>` : ''}
        <section class="ins-me"><h4>${U.esc(mine[1])} <span class="ins-tag">máy bạn đang dùng</span></h4>${ol(mine[2])}</section>
        ${others.map(o => `<details class="ins-o"><summary>${U.esc(o[1])}</summary>${ol(o[2])}</details>`).join('')}
        <div class="ins-url"><span>${Icon('link')}<code>${U.esc(I.url().replace(/^https?:\/\//, ''))}</code></span>
          <button type="button" class="btn sm ghost" data-ins="copy">${Icon('copy')} Sao chép liên kết</button></div>
        <p class="muted small">Gửi liên kết này cho đồng nghiệp: họ đăng nhập bằng Gmail đã được quản trị viên cấp quyền.</p>
        <div class="row-end"><button type="button" class="btn ghost" data-ins="x">Đóng</button></div></div>`;
      document.body.appendChild(wrap);
      const close = () => wrap.remove();
      wrap.addEventListener('click', async e => {
        if (e.target === wrap) return close();
        const a = e.target.closest('[data-ins]'); if (!a) return;
        if (a.dataset.ins === 'x') close();
        if (a.dataset.ins === 'now') { close(); I.prompt(); }
        if (a.dataset.ins === 'copy') {
          let ok = false;
          try { await navigator.clipboard.writeText(I.url()); ok = true; } catch (err) {
            const t = document.createElement('textarea'); t.value = I.url(); t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t);
            t.select(); try { ok = document.execCommand('copy'); } catch (er) { /* bỏ qua */ } t.remove();
          }
          U.toast(ok ? 'Đã sao chép liên kết app' : 'Không sao chép được — giữ tay vào địa chỉ để chép', ok ? '' : 'err');
        }
      });
    },
    // Android/PC: hộp cài của trình duyệt
    async prompt() {
      const p = App.installPrompt; if (!p) return I.show();
      App.installPrompt = null;
      p.prompt();
      try { await p.userChoice; } catch (e) { /* bỏ qua */ }
    },

    // Màn hình đăng nhập: cảnh báo trình duyệt nhúng (Zalo…) + link hướng dẫn cài
    login() {
      const box = document.querySelector('#login .login-box'); if (!box || box.querySelector('.ins-login')) return;
      const app = I.inApp();
      if (app) {
        const w = document.createElement('div');
        w.className = 'ins-warn';
        w.innerHTML = `${Icon('alert')}<div>Bạn đang mở trong <b>${U.esc(app)}</b> — Google có thể chặn đăng nhập và không cài app được.
          Bấm <b>⋯</b> → <b>Mở bằng trình duyệt</b> (${IOS ? 'Safari' : 'Chrome'}).</div>`;
        box.insertBefore(w, document.getElementById('gbtn'));
      }
      if (I.standalone()) return;
      const a = document.createElement('button');
      a.type = 'button'; a.className = 'ins-login';
      a.innerHTML = `${Icon('phone')} Cách cài app lên điện thoại / máy tính`;
      a.onclick = () => I.show();
      box.insertBefore(a, document.getElementById('lfoot'));
    }
  });
  window.addEventListener('appinstalled', () => { App.installPrompt = null; U.toast('Đã cài app — mở bằng biểu tượng TCXL trên màn hình'); });
})();
