# CayXuMMO - Cải tiến & Sửa lỗi

## 🐛 LỖI NGHIÊM TRỌNG ĐÃ SỬA

### 1. Lỗi DOM Fatal: Config không bao giờ tải ("Lưu cấu hình" gây crash)
**Vấn đề:** Nút "Lưu cấu hình" trong Admin tab đọc `cfgMinBet`, `cfgMaxBet`, `cfgPvpFee`, `cfgPvpTimeout` từ DOM, nhưng form không bao giờ render những input này → TypeError ngay khi bấm Save.

**Sửa:** `firebase-manager.js` bỏ các trường không tồn tại, chỉ lưu những gì đã được hiển thị.

---

### 2. Lỗi Bảo mật: Admin hardcoded trong client code
**Vấn đề:** 
```javascript
async isAdmin(uid) {
    return uid === '5852621653' || uid === ' ';  // ← UID cứng + bug: dấu cách trống?
}
```
- Bất kỳ ai xem source code đều biết UID này
- `uid === ' '` là dead code nhưng nếu Firebase nào đó chuẩn hóa string thành whitespace → cửa hậu!
- Client-side check không thực sự bảo vệ gì (có thể bỏ qua bằng DevTools)

**Sửa:**
- Admin status lưu trong user record: `{ ..., isAdmin: true }`
- Thêm **Firebase Realtime Database Security Rules** (`firebase-rules.json`) để thực sự chặn ghi non-admin:
  ```json
  "admin_config": {
    ".write": "root.child('users').child(auth.uid).child('isAdmin').val() === true"
  }
  ```
- Client-side check (`isAdmin()`) chỉ để hiển thị/ẩn Admin tab; bảo vệ thực tế ở server rules

---

### 3. Lỗi Mã hóa: Salt cứng chung toàn bộ tài khoản
**Vấn đề:**
```javascript
async hashPassword(password) {
    const data = encoder.encode(password + 'cayxummo_salt_2024');  // ← SALT CỨNG = RAINBOW TABLE!
}
```
- Mỗi tài khoản dùng cùng 1 salt
- Nếu bảng hash bị lộ → 1 rainbow table có thể crack hết mọi mật khẩu

**Sửa:** `crypto.js`
- Mỗi tài khoản nhận `passwordSalt` ngẫu nhiên 16 bytes khi đăng ký
- Lưu salt cùng hash: `{ password, passwordSalt }`
- Khi verify: đọc salt riêng của tài khoản
- Backward compatible: tài khoản cũ (không có `passwordSalt`) dùng `LEGACY_SALT`, nhưng được nâng cấp lên salt mới lần đăng nhập tiếp theo

---

### 4. Lỗi ID Collision: generateUniqueId() chỉ dùng timestamp
**Vấn đề:**
```javascript
function generateUniqueId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);  // ← Tính toán nhưng không dùng!
    return 'UidWEB_' + timestamp;  // ← Chỉ dùng timestamp
}
```
- Double-click button (hoặc 2 tab đăng ký cùng lúc) → 2 tài khoản với cùng ID
- Cả ID được dùng làm khóa dữ liệu → collision → mất dữ liệu hoặc bảo mật

**Sửa:** `storage.js`
```javascript
return `UidWEB_${timestamp}_${random}`;  // ← Dùng cả timestamp + random
```

---

### 5. Lỗi Race Condition: Phát thưởng BXH có thể chạy 2 lần
**Vấn đề:** `checkAndDistributeRewards()` đọc `lastReset`, kiểm tra, rồi lưu. Nếu 2 user mở BXH tab cùng lúc → cả 2 thấy `lastReset` cũ → cả 2 phát thưởng → tiền bị phát 2 lần.

**Sửa:** `firebase-manager.js`
```javascript
const claim = await this.db.ref('leaderboard_config/lastReset').transaction(current => {
    if (current === thisWeek) return;  // abort: thua race
    return thisWeek;  // set nếu thắng race
});
if (!claim.committed) return;  // dừng nếu thua
// tiếp tục phát thưởng...
```
Giờ chỉ cái nào thắng transaction mới phát.

---

### 6. Balance writes không atomic (không quan trọng nhưng tốt hơn)
**Vấn đề:** 
```javascript
async addBalance(uid, amount) {
    const ref = this.db.ref('users/' + uid + '/balance');
    const snap = await ref.once('value');
    await ref.set(Math.max(0, (snap.val() || 0) + amount));
}
```
Read-then-set: nếu 2 request gửi cùng lúc, cái thứ 2 có thể ghi đè cái thứ 1 → mất tiền.

**Sửa:** Dùng Firebase `.increment()` (atomic):
```javascript
await this.db.ref('users/' + uid + '/balance').transaction(
    current => Math.max(0, (current || 0) + amount)
);
```

---

## ♻️ CẢI TIẾN STRUCTURE

### 7. Code được split thành modules
**Trước:** 1500 dòng trong 1 file, khó bảo trì

**Sau:** 
- `config.js` - cấu hình
- `storage.js` - localStorage wrapper + ID generator
- `crypto.js` - hash/verify (với per-user salt)
- `rate-limiter.js` - rate limiting
- `firebase-manager.js` - tất cả logic Firebase (~500 dòng, sạch hơn)
- `ui.js` - helpers UI chung (`withLoading()`)
- `pages/home.js`, `pages/web-auth.js` - page components
- `firebase-rules.json` - quy tắc bảo mật (NEW)

**Lợi ích:**
- Dễ test từng phần
- Dễ tái sử dụng
- Dễ bảo trì

---

### 8. `withLoading()` helper loại bỏ boilerplate
**Trước:** Mỗi button có ~7 dòng:
```javascript
const btn = document.getElementById('btnDaily');
const orig = btn.textContent;
btn.textContent = '⏳...';
btn.disabled = true;
try { /* 20 dòng code */ } 
catch (e) { toast('error') } 
finally { btn.textContent = orig; btn.disabled = false; }
```

**Sau:**
```javascript
await withLoading(btn, '⏳...', async () => {
    // 20 dòng code
}, { onError: (e) => toast('error') });
```

---

### 9. CONFIG object giữ nguyên reference
**Trước:**
```javascript
CONFIG = { ...DEFAULT_CONFIG };  // mỗi lần reassign là tách biệt
await FB.loadConfig();  // gán `CONFIG = {...}`
// Nhưng modules khác đã import CONFIG rồi → vẫn thấy cái cũ
```

**Sau:**
```javascript
export const CONFIG = { ...DEFAULT_CONFIG };
async loadConfig() {
    Object.assign(CONFIG, merged);  // mutate object đã import
    // Mọi module thấy cập nhật ngay lập tức
}
```

---

### 10. Firebase Rules là phòng tuyến thứ 2
**NEW:** `firebase-rules.json` định nghĩa:
- Chỉ admin được ghi `admin_config`, `admin_alerts`, `prize_fund`
- User chỉ được sửa balance của chính họ
- `isAdmin` field không bao giờ được ghi (chỉ Firebase admin SDK)
- Withdraw requests chỉ admin được sửa status

**Tác dụng:** Ngay cả nếu ai đó cố gắng gọi Firebase API trực tiếp (vượt qua client code), server rules vẫn chặn.

---

## 📝 HƯỚNG DẪN TỪ ĐÂY

### Bước 1: Deploy Firebase Rules
Trong Firebase Console > Realtime Database > Rules, dán nội dung `firebase-rules.json`

### Bước 2: Promote một admin
Đăng nhập vào Firebase Console, chỉnh trực tiếp user record:
```json
{
  "isAdmin": true,
  ...
}
```

### Bước 3: Nâng cấp tài khoản cũ (tùy chọn)
Tài khoản đăng ký trước khi có `passwordSalt` sẽ được tự động nâng cấp lần đăng nhập tiếp theo.

### Bước 4: Giữ Firebase config key an toàn
API key được embed trong client code (bình thường cho Firebase), nhưng **bảo vệ thực tế ở Security Rules**, không phải client-side check.

---

## 🔒 SECURITY CHECKLIST

- [x] Admin status lưu trong database, không hardcode
- [x] Firebase Rules chặn ghi non-admin trên admin paths
- [x] Mỗi tài khoản có salt riêng cho mật khẩu
- [x] Tương thích ngược với tài khoản cũ (legacy salt)
- [x] ID generator dùng timestamp + random (collision-proof)
- [x] Phát thưởng BXH không double-fire (transaction)
- [x] Balance writes atomic (không race condition)

---

## 🚀 CÓ THỂ MỞ RỘNG (Chưa làm)

1. **Backend password hashing** (Cloud Functions): Move SHA-256 lên server, dùng bcrypt/argon2
2. **2FA/Email verification** khi đăng ký hoặc rút tiền
3. **Audit logs** chi tiết cho tất cả giao dịch (có sơ khai rồi, cần expand)
4. **Rate limit** trên withdraw requests
5. **Rate limit** trên balance read (phòng DDoS leak data)
6. **Session timeout** sau X phút non-activity (logout tự động)
