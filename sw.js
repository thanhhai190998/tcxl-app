// Service worker: cho phép cài app và mở được khi mạng yếu.
// Khi phát hành bản mới, tăng số phiên bản dưới đây để máy người dùng tải lại.
const CACHE = 'tcxl-v0.15.5';
const FONT_CACHE = 'fonts-v1';   // font giữ qua các phiên bản, không tải lại
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/util.js', 'js/icons.js', 'js/perm.js', 'js/vault.js', 'js/schema.js', 'js/api.js', 'js/mock.js',
  'js/store.js', 'js/outbox.js', 'js/grid.js', 'js/views.js', 'js/dash.js', 'js/overview.js', 'js/hub.js', 'js/admin.js', 'js/pick.js', 'js/excel.js', 'js/total.js', 'js/lock.js', 'js/install.js', 'js/main.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
// Xoá bộ nhớ phiên bản cũ CỦA APP NÀY ('tcxl-v…'). Không đụng bộ nhớ của app khác cùng địa chỉ github.io
// (app DTH dùng 'app-v…', 'music-…', 'img-…'), font dùng chung và ảnh đã lưu ('tcxl-img-…', js/store.js).
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => /^tcxl-v/.test(k) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

// Ưu tiên mạng (luôn có bản mới nhất), mất mạng hoặc chậm quá 8 giây thì dùng bản đã lưu.
// Dữ liệu (Apps Script) và đăng nhập Google không đi qua cache.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Font Google: dùng bản đã lưu nếu có (mở nhanh, vẫn đúng font khi mất mạng)
  if (e.request.method === 'GET' && /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(FONT_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'));
    const timer = setTimeout(() => fromCache().then(r => { if (!done && r) { done = true; resolve(r); } }), 8000);
    // cache: 'no-cache' = luôn hỏi lại máy chủ (GitHub Pages lưu đệm 10 phút) để nhận bản mới ngay
    (e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request, { cache: 'no-cache' })).then(r => {
      clearTimeout(timer);
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      if (!done) { done = true; resolve(r); }
    }).catch(() => { clearTimeout(timer); fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
  }));
});
