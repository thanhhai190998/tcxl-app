// =====================================================================
//  DASHBOARD — số liệu tổng hợp + biểu đồ (không cần thư viện ngoài)
//  Màu biểu đồ: --s1 (xanh dương) / --s2 (cam) đã kiểm tra đạt chuẩn cho người
//  mù màu trên cả nền sáng và tối. Xanh lá/đỏ KHÔNG dùng cho cặp series vì
//  người mù màu đỏ-lục không phân biệt được.
// =====================================================================
(function () {
  const esc = U.esc;
  const D = (window.Dash = { state: {} });
  const can = t => permTableLevel(App.user, t) > 0;

  // ---------------- Định dạng số ----------------
  const nf = (x, d) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }).format(x);
  // Rút gọn: 15.000.000 → "15 tr", 2.500.000 → "2,5 tr", 1.200.000.000 → "1,2 tỷ"
  const compact = v => {
    const n = Math.abs(v), s = v < 0 ? '−' : '';
    if (n >= 1e9) return s + nf(n / 1e9, n < 1e10 ? 1 : 0) + ' tỷ';
    if (n >= 1e6) return s + nf(n / 1e6, n < 1e7 ? 1 : 0) + ' tr';
    if (n >= 1e3) return s + nf(n / 1e3, 0) + ' N';
    return s + nf(n, 0);
  };
  const pct = x => nf(x, 0) + '%';
  const niceMax = m => {
    if (m <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= m) return f * p;
    return 10 * p;
  };

  // ---------------- Thời gian ----------------
  const monthsBack = (n, endOffset = 0) => {
    const a = [], d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - endOffset);
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); a.push(U.month(x)); }
    return a;
  };
  const PERIODS = [
    { v: '1', l: 'Tháng này' }, { v: '3', l: '3 tháng' }, { v: '6', l: '6 tháng' }, { v: '12', l: '12 tháng' }, { v: 'ytd', l: 'Năm nay' }
  ];
  const periodMonths = p => p === 'ytd' ? monthsBack(new Date().getMonth() + 1) : monthsBack(Number(p));
  const prevMonths = p => { const n = periodMonths(p).length; return monthsBack(n, n); };
  const mLabel = m => m.slice(5) + '/' + m.slice(2, 4);

  // So sánh với kỳ trước: up = tăng là tốt hay xấu
  const delta = (cur, prev, upGood) => {
    if (!prev) return null;
    const d = (cur - prev) / Math.abs(prev) * 100;
    if (Math.abs(d) < 0.5) return { t: '≈ như kỳ trước', cls: '' };
    const up = d > 0;
    return { t: (up ? '▲ ' : '▼ ') + pct(Math.abs(d)) + ' so với kỳ trước', cls: up === upGood ? 'good' : 'bad' };
  };

  // ---------------- Thành phần giao diện ----------------
  const filterRow = (key, opts, cur) => `<div class="dfilter" data-fk="${key}">${opts.map(o =>
    `<button type="button" class="chip2 ${o.v === cur ? 'on' : ''}" data-v="${esc(o.v)}">${esc(o.l)}</button>`).join('')}</div>`;
  const tile = k => `<${k.href ? `a href="${k.href}"` : 'div'} class="kcard ${k.cls || ''}">
    <span class="kic">${Icon(k.ic)}</span><span class="kn">${esc(k.v)}${k.u ? `<small>${esc(k.u)}</small>` : ''}</span><span class="kl">${esc(k.l)}</span>
    ${k.delta ? `<span class="kd ${k.delta.cls}">${esc(k.delta.t)}</span>` : ''}</${k.href ? 'a' : 'div'}>`;
  const card = (title, ic, color, body, extra = '') => `<section class="card dcard"><div class="dc-h"><span class="gic" style="--gc:${color}">${Icon(ic)}</span>
    <h3>${esc(title)}</h3>${extra}</div>${body}</section>`;
  const none = msg => `<div class="dnone">${Icon('check', 'sm')} ${esc(msg || 'Không có')}</div>`;

  // Thanh ngang (1 series, 1 màu): giá trị ở đầu thanh, bấm được nếu có href
  const bars = (rows, { cls = 's1', fmt = U.int, share = false } = {}) => {
    if (!rows.length) return none('Không có dữ liệu');
    const max = Math.max(...rows.map(r => r.value), 1), total = rows.reduce((s, r) => s + r.value, 0) || 1;
    return `<div class="hbars">${rows.map(r => `<${r.href ? `a href="${r.href}"` : 'div'} class="hb" ${r.goi ? `data-goi="${esc(r.goi)}"` : ''} title="${esc(r.label + ': ' + fmt(r.value))}">
      <span class="hb-l">${esc(r.label)}</span>
      <span class="hb-t"><span class="hb-f ${cls}" style="width:${Math.max(1.5, r.value / max * 100)}%"></span></span>
      <span class="hb-v">${esc(fmt(r.value))}${share ? ` <i>${pct(r.value / total * 100)}</i>` : ''}</span></${r.href ? 'a' : 'div'}>`).join('')}</div>`;
  };

  // Biểu đồ cột theo tháng: vẽ bằng SVG theo đúng bề rộng thật (chữ không bị co), có tooltip + xem bảng
  const charts = [];
  const columns = cfg => { charts.push(cfg); return `<div class="chart" data-ch="${charts.length - 1}"></div>`; };

  function drawColumns(el, cfg) {
    const { labels, series, stacked, fmt = compact, full = U.int } = cfg;
    const W = Math.max(280, el.clientWidth), H = 190, pl = 46, pr = 6, pt = 22, pb = 24;
    const n = labels.length;
    const totals = labels.map((_, i) => stacked ? series.reduce((s, se) => s + se.values[i], 0) : Math.max(...series.map(se => se.values[i])));
    const max = niceMax(Math.max(...totals, 0));
    const band = (W - pl - pr) / n;
    const k = series.length;
    const bw = Math.min(24, stacked ? band * 0.55 : (band * 0.72 - (k - 1) * 2) / k);
    const gw = stacked ? bw : k * bw + (k - 1) * 2;
    const yv = v => pt + (H - pt - pb) * (1 - v / max);
    const top = (x, y, w, h, r) => { r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
    let s = '';
    [0, max / 2, max].forEach(tv => {
      const y = yv(tv).toFixed(1);
      s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="${tv === 0 ? 'cx-base' : 'cx-grid'}"/>`;
      s += `<text x="${pl - 6}" y="${y}" class="cx-tick" text-anchor="end" dominant-baseline="middle">${esc(fmt(tv))}</text>`;
    });
    labels.forEach((lb, i) => {
      const x0 = pl + band * i + (band - gw) / 2;
      let acc = 0;
      series.forEach((se, j) => {
        const v = se.values[i]; if (!v) return;
        if (stacked) {
          const y1 = yv(acc + v), y0 = yv(acc), h = Math.max(0, y0 - y1 - (acc > 0 ? 2 : 0));
          const isTop = series.slice(j + 1).every(o => !o.values[i]);
          s += isTop ? `<path d="${top(x0, y1, bw, h, 4)}" class="cx-bar ${se.cls}"/>` : `<rect x="${x0}" y="${y1}" width="${bw}" height="${h}" class="cx-bar ${se.cls}"/>`;
          acc += v;
        } else {
          const x = x0 + j * (bw + 2), y = yv(v);
          s += `<path d="${top(x, y, bw, yv(0) - y, 4)}" class="cx-bar ${se.cls}"/>`;
        }
      });
      const step = n > 8 ? 2 : 1;
      if ((n - 1 - i) % step === 0) s += `<text x="${pl + band * i + band / 2}" y="${H - 6}" class="cx-tick" text-anchor="middle">${esc(lb)}</text>`;
      // Nhãn giá trị chỉ cho tháng gần nhất (không ghi số lên mọi cột)
      if (i === n - 1 && totals[i] > 0) {
        if (stacked) s += `<text x="${x0 + bw / 2}" y="${yv(totals[i]) - 6}" class="cx-val" text-anchor="middle">${esc(fmt(totals[i]))}</text>`;
        else series.forEach((se, j) => { if (se.values[i]) s += `<text x="${x0 + j * (bw + 2) + bw / 2}" y="${yv(se.values[i]) - 6}" class="cx-val" text-anchor="middle">${esc(fmt(se.values[i]))}</text>`; });
      }
      s += `<rect x="${pl + band * i}" y="${pt}" width="${band}" height="${H - pt - pb}" class="cx-hit" data-i="${i}" tabindex="0"/>`;
    });
    el.innerHTML = `<div class="legend">${series.map(se => `<span><i class="${se.cls}"></i>${esc(se.name)}</span>`).join('')}</div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || '')}">${s}</svg>
      <div class="ttip" hidden></div>`;
    const tip = el.querySelector('.ttip');
    const show = (hit, i) => {
      tip.replaceChildren();
      const h = document.createElement('div'); h.className = 'tt-h'; h.textContent = cfg.titles ? cfg.titles[i] : labels[i]; tip.appendChild(h);
      series.forEach(se => {
        const row = document.createElement('div'); row.className = 'tt-r';
        const key = document.createElement('i'); key.className = se.cls;
        const val = document.createElement('b'); val.textContent = full(se.values[i]);
        const nm = document.createElement('span'); nm.textContent = se.name;
        row.append(key, val, nm); tip.appendChild(row);
      });
      tip.hidden = false;
      const r = hit.getBoundingClientRect(), box = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - box.left + r.width / 2 - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
      tip.style.left = x + 'px'; tip.style.top = '28px';
      el.querySelectorAll('.cx-hit').forEach(x => x.classList.toggle('on', x === hit));
    };
    el.querySelectorAll('.cx-hit').forEach(hit => {
      const i = +hit.dataset.i;
      hit.addEventListener('pointerenter', () => show(hit, i));
      hit.addEventListener('focus', () => show(hit, i));
      hit.addEventListener('click', () => show(hit, i));
    });
    el.addEventListener('pointerleave', () => { tip.hidden = true; el.querySelectorAll('.cx-hit.on').forEach(x => x.classList.remove('on')); });
  }

  const tableOf = cfg => `<table class="dtable"><thead><tr><th>${esc(cfg.head || 'Tháng')}</th>${cfg.series.map(se => `<th>${esc(se.name)}</th>`).join('')}</tr></thead>
    <tbody>${cfg.labels.map((lb, i) => `<tr><td>${esc(cfg.titles ? cfg.titles[i] : lb)}</td>${cfg.series.map(se => `<td>${esc((cfg.full || U.int)(se.values[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  function mount(root) {
    root.querySelectorAll('.chart[data-ch]').forEach(el => drawColumns(el, charts[+el.dataset.ch]));
    root.querySelectorAll('.dtbl').forEach(b => b.onclick = () => {
      const cardEl = b.closest('.dcard'), ch = cardEl.querySelector('.chart[data-ch]');
      let tb = cardEl.querySelector('.dtable');
      if (tb) { tb.remove(); b.classList.remove('on'); return; }
      ch.insertAdjacentHTML('afterend', tableOf(charts[+ch.dataset.ch])); b.classList.add('on');
    });
  }
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const r = document.querySelector('.dash'); if (r) r.querySelectorAll('.chart[data-ch]').forEach(el => drawColumns(el, charts[+el.dataset.ch])); }, 150); });

  // Thanh xếp chồng 3 giai đoạn (P3 đậm → P2 nhạt → P1 xám): cùng 1 màu, đậm dần theo tiến độ —
  // người mù màu vẫn phân biệt được nhờ độ sáng; có chú thích và % đã về ở cuối dòng
  const SEGS = [{ name: 'Đã mở kiện', cls: 'ph3' }, { name: 'Đã về, chưa mở', cls: 'ph2' }, { name: 'Chưa về', cls: 'ph1' }];
  const stackLegend = () => `<div class="legend">${SEGS.map(s => `<span><i class="${s.cls}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  const stack = rows => {
    if (!rows.length) return none('Không có dữ liệu');
    const max = Math.max(...rows.map(r => r.v.reduce((a, b) => a + b, 0)), 1);
    return stackLegend() + `<div class="hbars">${rows.map(r => {
      const tot = r.v.reduce((a, b) => a + b, 0), came = r.v[0] + r.v[1];
      const tip = `${r.label}: ${U.int(tot)} kiện — ` + SEGS.map((s, i) => `${s.name.toLowerCase()} ${U.int(r.v[i])}`).join(', ');
      return `<a class="hb sb" href="${r.href}" title="${esc(tip)}"><span class="hb-l">${esc(r.label)}</span>
        <span class="sb-t" style="width:${Math.max(2, tot / max * 100)}%">${r.v.map((v, i) => v ? `<span class="sb-s ${SEGS[i].cls}" style="flex:${v}"></span>` : '').join('')}</span>
        <span class="hb-v">${esc(U.int(tot))} <i>${tot ? pct(came / tot * 100) + ' đã về' : ''}</i></span></a>`;
    }).join('')}</div>`;
  };

  // ---------------- Khung chung ----------------
  // host = phần tử chứa (thẻ "Biểu đồ" trong trang Tổng quan); không có → vẽ cả trang như trước
  D.render = async (it, host) => {
    if (!host) { App.head(it.label, { back: true }); App.loading(); }
    const root = host || App.main;
    const draw = { DASH_VATTU: vatTu }[it.key];
    const st = (D.state[it.key] = D.state[it.key] || {});
    const paint = async () => {
      charts.length = 0;
      root.innerHTML = `<div class="dash">${await draw(st)}</div>`;
      mount(root);
      root.querySelectorAll('.dfilter').forEach(f => f.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        st[f.dataset.fk] = b.dataset.v; paint();
      }));
      Views.hydrate(root);
    };
    await paint();
  };

  async function load(ts) { await Promise.all(ts.filter(can).map(t => DB.loadDeps(t).catch(() => {}))); }

  // ---------------- THỐNG KÊ TỔNG VẬT TƯ ----------------
  async function vatTu(st) {
    await load(['KIEN', 'MGMER', 'GIR', 'OSD', 'KIEM_TRA', 'GOI_THAU']);
    if (!can('KIEN')) return '<div class="empty">Bạn chưa có quyền xem danh sách kiện.</div>';
    const PH = SCHEMA.PHASES, all = DB.rows('KIEN');
    const goiAll = [...new Set(all.map(r => r.Goi_thau).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    st.g = st.g && (st.g === '*' || goiAll.includes(st.g)) ? st.g : '*';
    const inG = r => st.g === '*' || r.Goi_thau === st.g;
    const rows = all.filter(inG);
    const ph = r => r.GIR ? 0 : r.MGMER ? 1 : 2;   // chỉ số trong SEGS
    const tri = rs => { const v = [0, 0, 0]; rs.forEach(r => v[ph(r)]++); return v; };
    const link = (o = {}) => '#/i/KIEN?' + new URLSearchParams(Object.assign(st.g === '*' ? {} : { Goi_thau: st.g }, o)).toString();
    const [p3, p2, p1] = tri(rows), came = p3 + p2;
    const tons = rows.filter(r => /^kg$/i.test(r.Don_vi_KL || 'Kg')).reduce((s, r) => s + U.num(r.KL_tinh), 0) / 1000;
    const osd = DB.rows('OSD').filter(inG), osdKien = rows.filter(r => r.OSD).length;

    let h = goiAll.length > 1 ? filterRow('g', [{ v: '*', l: 'Tất cả gói' }, ...goiAll.map(g => ({ v: g, l: g }))], st.g) : '';
    h += `<section class="dhero2"><div class="dh2-l">${st.g === '*' ? 'Tổng số kiện vật tư' : 'Số kiện vật tư gói ' + esc(st.g)}</div>
      <div class="dh2-v">${esc(U.int(rows.length))} kiện</div>
      <div class="dh2-s">${esc(nf(tons, tons < 100 ? 1 : 0))} tấn hàng (khối lượng tịnh) · ${st.g === '*' ? goiAll.length + ' gói thầu' : 'đã về ' + pct(rows.length ? came / rows.length * 100 : 0)}</div></section>`;
    h += `<div class="kpi-row k4">${[
      { ic: 'inspect', l: 'Đã về công trường', v: U.int(came), href: link(), delta: rows.length ? { t: pct(came / rows.length * 100) + ' số kiện', cls: '' } : null },
      { ic: 'box', l: 'Đã về, chờ mở kiện', v: U.int(p2), href: link({ Phase: PH[1] }) },
      { ic: 'open', l: 'Đã mở kiện', v: U.int(p3), href: link({ Phase: PH[2] }), delta: came ? { t: pct(p3 / came * 100) + ' số đã về', cls: '' } : null },
      { ic: 'alert', l: 'Biên bản OSD (dư / thiếu / hỏng)', v: U.int(osd.length), href: '#/i/OSD' + (st.g === '*' ? '' : '?Goi_thau=' + encodeURIComponent(st.g)),
        delta: osdKien ? { t: U.int(osdKien) + ' kiện liên quan', cls: '' } : null }
    ].map(tile).join('')}</div>`;

    // Tiến độ theo gói / theo hệ thống
    const by = (rs, key) => { const m = new Map(); rs.forEach(r => { const k = key(r) || '(trống)'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
    if (st.g === '*' && goiAll.length > 1) {   // chỉ được xem 1 gói thì bỏ thẻ này
      const g = by(rows, r => r.Goi_thau);
      h += card('Tiến độ theo gói thầu', 'folder', 'var(--g2)', stack(goiAll.map(k => ({ label: k, v: tri(g.get(k) || []), href: '#/i/KIEN?Goi_thau=' + encodeURIComponent(k) }))));
    }
    const sys = [...by(rows, r => r.He_thong)].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
    h += card('Tiến độ theo hệ thống', 'layers', 'var(--g2)', stack(sys.map(([k, rs]) => ({ label: k, v: tri(rs), href: link({ He_thong: k }) }))),
      `<span class="cnt">${sys.length} hệ thống lớn nhất</span>`);

    // Hàng về / mở kiện theo thời gian: dữ liệu trải dài nhiều năm → theo năm, ngắn → theo tháng
    const dDem = r => U.isoOf(DB.val('KIEN', r, 'Ngay_dem')), dMo = r => U.isoOf(DB.val('KIEN', r, 'Ngay_mo'));
    // Ngày vô lý (ở tương lai, vd gõ nhầm 31/08/2108; hoặc trước năm 2000) không đưa vào biểu đồ — nếu không trục năm
    // kéo dài cả trăm năm. Ngày nằm ở biên bản MGMER/GIR → liệt kê biên bản để sửa.
    const maxD = U.iso(U.addDays(U.today(), 31)), okD = d => !!d && d >= '2000-01-01' && d <= maxD;
    const badDocs = ['MGMER', 'GIR'].flatMap(t => DB.rows(t).filter(d => inG(d) && d.Ngay && !okD(U.isoOf(d.Ngay))).map(d => [t, d]));
    const badN = rows.filter(r => [dDem(r), dMo(r)].some(d => d && !okD(d))).length;
    const badNote = badDocs.length || badN ? `<div class="dnote dbad">⚠️ <b>${U.int(badN)} kiện</b> mang ngày bất thường nên không đưa vào biểu đồ — sửa ngày ở biên bản:
        ${badDocs.slice(0, 8).map(([t, d]) => `<a href="#/r/${t}/${encodeURIComponent(DB.keyOf(t, d))}">${t} ${esc(d.So || '?')} (${esc(U.fmtDate(d.Ngay))})</a>`).join(', ')}${badDocs.length > 8 ? '…' : ''}</div>` : '';
    const dates = rows.flatMap(r => [dDem(r), dMo(r)]).filter(okD).sort();
    if (dates.length) {
      const yearly = U.daysBetween(dates[0], dates[dates.length - 1]) > 730;
      const keyOf = d => yearly ? d.slice(0, 4) : d.slice(0, 7);
      let labels;
      if (yearly) { labels = []; for (let y = +dates[0].slice(0, 4); y <= +dates[dates.length - 1].slice(0, 4); y++) labels.push(String(y)); }
      else { labels = []; const d = new Date(+dates[0].slice(0, 4), +dates[0].slice(5, 7) - 1, 1), end = dates[dates.length - 1].slice(0, 7);
        while (U.month(d) <= end && labels.length < 36) { labels.push(U.month(d)); d.setMonth(d.getMonth() + 1); } }
      const cnt = f => labels.map(k => rows.filter(r => { const d = f(r); return d && keyOf(d) === k; }).length);
      const cfg = { title: 'Kiện kiểm đếm và mở kiện theo ' + (yearly ? 'năm' : 'tháng'), head: yearly ? 'Năm' : 'Tháng',
        labels: yearly ? labels : labels.map(mLabel), titles: yearly ? labels.map(y => 'Năm ' + y) : labels.map(m => 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4)),
        series: [{ name: 'Kiểm đếm (về công trường)', cls: 's1', values: cnt(dDem) }, { name: 'Mở kiện', cls: 's2', values: cnt(dMo) }],
        fmt: v => nf(v, 0), full: v => U.int(v) + ' kiện' };
      h += card('Hàng về và mở kiện theo ' + (yearly ? 'năm' : 'tháng'), 'chart', 'var(--g2)', badNote + columns(cfg), '<button class="dtbl" type="button">Bảng</button>');
    }

    // Vị trí lưu kho theo lần kiểm tra mới nhất của từng kiện
    const last = rows.map(r => SCHEMA.lastCheck(DB, r.id)).filter(Boolean);
    const lost = last.filter(c => c.Tinh_trang === 'Không thấy');
    const loc = [...by(last.filter(c => c.Tinh_trang !== 'Không thấy'), c => c.Vi_tri)].map(([label, rs]) => ({ label, value: rs.length })).sort((a, b) => b.value - a.value);
    h += card('Vị trí lưu kho', 'pin', 'var(--g2)', (last.length ? `<div class="dnote">theo lần kiểm tra gần nhất của ${U.int(last.length)} kiện${lost.length ? ` · <b>${U.int(lost.length)} kiện không thấy</b>` : ''}</div>` : '')
      + bars(loc.slice(0, 12), { share: true, fmt: v => U.int(v) }));

    // Cần chú ý
    const C = window.APP_CONFIG, waitN = C.waitOpenDays || 180;
    const waiting = rows.filter(r => r.MGMER && !r.GIR && U.daysBetween(dDem(r), U.today()) > waitN)
      .sort((a, b) => dDem(a).localeCompare(dDem(b)));
    const lostRows = rows.filter(r => { const c = SCHEMA.lastCheck(DB, r.id); return c && c.Tinh_trang === 'Không thấy'; });
    const part = (title, note, rs, t, href) => `<div class="att"><div class="att-h"><b>${esc(title)}</b><span class="cnt">${U.int(rs.length)}</span>
        ${href && rs.length ? `<a class="btn sm ghost" href="${href}">Xem tất cả</a>` : ''}</div>
      ${note ? `<div class="dnote">${esc(note)}</div>` : ''}
      ${rs.length ? Views.renderRows(t, rs.slice(0, 5), { flat: true, sortBy: 'none', compact: true }) : none()}</div>`;
    h += card('Cần chú ý', 'bell', 'var(--g4)',
      (can('OSD') ? part('Biên bản OSD gần đây', 'mới lập ở trên · ghi chú xử lý hiện ngay dưới số OSD',
        [...osd].sort((a, b) => U.isoOf(b.Ngay).localeCompare(U.isoOf(a.Ngay))), 'OSD', '#/i/OSD') : '')
      + part('Đã về quá ' + waitN + ' ngày chưa mở kiện', 'cũ nhất ở trên', waiting, 'KIEN', link({ Phase: PH[1] }))
      + part('Không thấy ở lần kiểm tra gần nhất', 'cần tìm lại hoặc lập biên bản', lostRows, 'KIEN', ''));

    // Theo nhà cung cấp
    const sup = [...by(rows, r => r.Nha_cung_cap)].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    h += card('Theo nhà cung cấp', 'users', 'var(--g2)', stack(sup.map(([k, rs]) => ({ label: k, v: tri(rs), href: link({ Nha_cung_cap: k }) }))),
      `<span class="cnt">10 nhà cung cấp lớn nhất</span>`);
    return h;
  }
})();
