// =====================================================================
//  CẤU HÌNH APP — sửa file này để đổi tên, màu, chế độ chạy.
//  (Logo: thay các file trong thư mục icons/ — xem README.md)
// =====================================================================
window.APP_CONFIG = {
  appName: 'Phòng TCXL · LP1',      // tên hiển thị trên đầu app
  primaryColor: '#0e8a6b',          // màu chủ đạo (đổi cả theme-color trong manifest.webmanifest nếu muốn)
  primaryColor2: '#0b6b9a',         // màu thứ 2 của dải màu thanh trên
  font: 'K2D',                      // tên font trên Google Fonts (phải hỗ trợ tiếng Việt); '' = font mặc định của máy
  copyright: 'Phòng Thi công Xây lắp – Ban QLDA ĐLDK Long Phú 1', // chủ bản quyền hiện ở chân trang
  designer: 'Đinh Thanh Hải',       // người phát triển app — chân trang + màn hình đăng nhập hiện "Developed by …" ('' = ẩn)
  copyrightSince: 2026,             // năm bắt đầu — chân trang tự hiện "2026–<năm nay>" khi sang năm mới

  // 'live' = dữ liệu thật trên Google Sheets qua Apps Script
  // 'demo' = chạy thử với dữ liệu giả (lưu trong trình duyệt) — mở app kèm ?demo ở cuối địa chỉ
  mode: /[?&]demo\b/.test(location.search) ? 'demo' : 'live',

  // Dùng khi mode = 'live' — Apps Script "TCXL App Backend" của Google Sheet "TCXL App - Data" (triển khai 15/10/2026)
  apiUrl: 'https://script.google.com/macros/s/AKfycbzTXfwvUu-kLp5BzvIvodbYMNCPJg4Tc0R7uJ050T5HJj2Bc7GVNuC8nr8xDxC1iLh32g/exec',
  googleClientId: '1062531895029-959l1ua2ph5ld003fm7n0mr8crcvo5r1.apps.googleusercontent.com',  // dùng chung OAuth Client với app DTH (cùng địa chỉ github.io)

  // Cảnh báo vật tư (trang Thống kê tổng)
  waitOpenDays: 180,         // kiện đã kiểm đếm quá N ngày mà chưa mở kiện
  listPage: 100,             // danh sách dài (vd danh sách kiện) hiện từng trang N dòng
  version: '0.4.3'
};
