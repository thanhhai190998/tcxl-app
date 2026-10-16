// Hàm tiện ích dùng chung
(function () {
  const U = (window.U = {});
  const pad = n => String(n).padStart(2, '0');

  U.esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Khoá 8 ký tự hex — giống UNIQUEID() của AppSheet
  U.uid = () => [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');

  U.iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  U.today = () => U.iso(new Date());

  // Nhận 'yyyy-MM-dd', 'yyyy-MM-dd HH:mm[:ss]', 'yyyy-MM-ddTHH:mm', 'dd/MM/yyyy' → Date (giờ địa phương)
  U.parseDate = v => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  };
  U.isoOf = v => { const d = U.parseDate(v); return d ? U.iso(d) : ''; };
  U.fmtDate = v => { const d = U.parseDate(v); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : (v || ''); };
  U.fmtDateTime = v => {
    const d = U.parseDate(v);
    return d ? U.fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : (v || '');
  };
  U.toLocalInput = v => { const d = U.parseDate(v); return d ? U.iso(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''; };
  U.addDays = (v, n) => { const d = U.parseDate(v); if (!d) return null; const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  U.daysBetween = (a, b) => Math.round((U.parseDate(b) - U.parseDate(a)) / 86400000);
  U.month = v => { const d = U.parseDate(v); return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) : ''; };

  U.num = v => { if (v === '' || v == null) return 0; const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };
  U.money = v => new Intl.NumberFormat('vi-VN').format(Math.round(U.num(v))) + ' ₫';
  U.int = v => new Intl.NumberFormat('vi-VN').format(U.num(v));

  U.norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  // Cột chọn nhiều giá trị (field multi) lưu dạng "A, B" → mảng ['A', 'B']
  U.splitList = s => String(s ?? '').split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean);
  // Tìm kiếm dễ dãi: không dấu, không phân biệt hoa/thường, bỏ qua dấu cách / gạch nối / chấm ("0441" khớp "T-0441",
  // "22" khớp "T22", "kc112" khớp "LPF-KC-112-007"); gõ nhiều từ thì mỗi từ phải có mặt, thứ tự nào cũng được.
  // dates = chữ ngày tháng của dòng (dd/mm/yyyy): chỉ từ có "/" hoặc ":" mới so với ngày — gõ số trần như "202"
  // không bị khớp với năm "2026" của mọi dòng
  const compact = s => s.replace(/[^a-z0-9]/g, '');
  U.match = (hay, q, dates) => {
    const words = U.norm(q).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const h = U.norm(hay), hc = compact(h), hd = dates ? h + ' ' + U.norm(dates) : h;
    return words.every(w => /[/:]/.test(w) ? hd.includes(w) : (h.includes(w) || (compact(w) !== '' && hc.includes(compact(w)))));
  };
  // Giá trị trông như ngày (yyyy-mm-dd…, dd/mm/yyyy, mm/yyyy) → dùng cho phần "dates" của U.match
  U.isDateLike = v => /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{4}|^\d{1,2}\/\d{4}$/.test(String(v ?? '').trim());

  U.toast = (msg, kind) => {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5000 : 2500);
  };

  // Hộp thoại nhập (thay prompt()), hỗ trợ ô mật khẩu
  U.ask = ({ title, message = '', fields = [{ name: 'v', label: '', type: 'text' }], ok = 'Đồng ý' }) =>
    new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-bg';
      wrap.innerHTML = `<form class="modal">
        <h3>${U.esc(title)}</h3>${message ? `<p class="muted">${message}</p>` : ''}
        ${fields.map(f => `<label class="fld"><span>${U.esc(f.label)}</span>
          ${f.type === 'textarea' ? `<textarea name="${f.name}" rows="${f.rows || 5}" placeholder="${U.esc(f.placeholder || '')}" ${f.required === false ? '' : 'required'}>${U.esc(f.value || '')}</textarea>`
            : `<input name="${f.name}" type="${f.type || 'text'}" value="${U.esc(f.value || '')}" placeholder="${U.esc(f.placeholder || '')}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}
              autocomplete="${f.type === 'password' ? 'new-password' : 'off'}" ${f.required === false ? '' : 'required'}>`}</label>`).join('')}
        <div class="row-end"><button type="button" class="btn ghost" data-x>Huỷ</button><button class="btn">${U.esc(ok)}</button></div>
      </form>`;
      document.body.appendChild(wrap);
      const form = wrap.querySelector('form');
      const first = form.querySelector('input, textarea');
      if (first) { first.focus(); if (first.select) first.select(); }
      const done = v => { wrap.remove(); resolve(v); };
      wrap.querySelector('[data-x]').onclick = () => done(null);
      form.onsubmit = e => { e.preventDefault(); done(Object.fromEntries(new FormData(form))); };
    });

  U.confirm = (msg) => new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML = `<div class="modal"><p>${U.esc(msg)}</p>
      <div class="row-end"><button class="btn ghost" data-n>Huỷ</button><button class="btn danger" data-y>Đồng ý</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-n]').onclick = () => { wrap.remove(); resolve(false); };
    wrap.querySelector('[data-y]').onclick = () => { wrap.remove(); resolve(true); };
  });

  // Thu nhỏ ảnh trước khi tải lên (giảm dung lượng, tải nhanh trên điện thoại)
  U.resizeImage = (file, max = 1600, quality = 0.85) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
  U.readDataUrl = file => new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
  });
  U.dataUrlParts = du => { const m = String(du).match(/^data:([^;,]+)?(;base64)?,(.*)$/); return m ? { mime: m[1] || 'application/octet-stream', data: m[3] } : null; };
  U.b64ToBlob = (b64, mime) => {
    const bin = atob(b64); const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  };
})();
