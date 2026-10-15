// =====================================================================
//  LOGIC PHÂN QUYỀN — dùng chung cho app (demo) và Apps Script.
//  Nếu sửa ROW_SCOPE / rowLevel ở đây thì chép y hệt sang gas/Code.gs.
//
//  user = { email, admin, goi: ['T12', ...] (rỗng = mọi gói), quyen: { <khoá>: 'view' | 'edit' } }
//  Khoá quyền = tên bảng (vd 'KIEN'), dashboard là 'DASH_...'.
// =====================================================================
var PERM_ROW_SCOPE = {
  // Vật tư: giới hạn theo gói thầu được gán (cột Goi_thau của người dùng)
  GOI_THAU: { col: 'MaGoi', goi: true },
  KIEN: { col: 'Goi_thau', goi: true },
  MGMER: { col: 'Goi_thau', goi: true },
  GIR: { col: 'Goi_thau', goi: true },
  OSD: { col: 'Goi_thau', goi: true },
  // Vị trí & tình trạng: theo gói thầu của kiện
  KIEM_TRA: { col: 'Kien', parent: 'KIEN', parentKey: 'id' },
  // Nhật ký nhập Excel: quyền theo mục "Nhập / xuất Excel" (khoá EXCEL), giới hạn theo gói
  NHAP_EXCEL: { col: 'Goi_thau', goi: true, permKey: 'EXCEL' }
};

function permRank(level) { return level === 'edit' ? 2 : level === 'view' ? 1 : 0; }

function permGoiOk(user, table, row) {
  var sc = PERM_ROW_SCOPE[table];
  if (!sc || !sc.goi || !user.goi || !user.goi.length) return true;
  return user.goi.indexOf(String(row[sc.col] == null ? '' : row[sc.col])) >= 0;
}

// Mức quyền (0 không, 1 xem, 2 sửa) của user trên MỘT dòng.
// getParent(table, key) trả về dòng cha (dùng cho Vị trí & tình trạng → Kiện).
function permRowLevel(user, table, row, getParent) {
  if (user.admin) return 2;
  var q = user.quyen || {};
  var sc = PERM_ROW_SCOPE[table] || {};
  var lv;
  if (sc.prefix) {
    lv = permRank(q[sc.prefix + String(row[sc.col] == null ? '' : row[sc.col])]);
    if (sc.readOnly) lv = Math.min(lv, 1);
    return lv;
  }
  lv = permRank(q[sc.permKey || table]);
  if (!lv) return 0;
  if (!permGoiOk(user, table, row)) return 0;
  if (sc.parent) {
    var p = getParent ? getParent(sc.parent, row[sc.col]) : null;
    if (user.goi && user.goi.length && (!p || !permGoiOk(user, sc.parent, p))) return 0;
  }
  return lv;
}

// Mức quyền cao nhất trên cả bảng (để hiện menu / nút "Thêm")
function permTableLevel(user, table) {
  if (user.admin) return 2;
  var q = user.quyen || {}, sc = PERM_ROW_SCOPE[table] || {}, best = 0;
  if (sc.prefix) {
    Object.keys(q).forEach(function (k) { if (k.indexOf(sc.prefix) === 0) best = Math.max(best, permRank(q[k])); });
    return sc.readOnly ? Math.min(best, 1) : best;
  }
  return permRank(q[sc.permKey || table]);
}

if (typeof window !== 'undefined') {
  window.Perm = { ROW_SCOPE: PERM_ROW_SCOPE, rank: permRank, rowLevel: permRowLevel, tableLevel: permTableLevel, goiOk: permGoiOk };
}
