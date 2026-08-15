# Cloud Functions cho Login + Balance (chỉ Web)

## Đã làm gì

- **Login thật:** Web giờ dùng **Firebase Authentication** (username →
  `username@cayxummo.local` giả làm email). Google tự quản lý mật khẩu —
  không còn lưu password hash trong RTDB cho tài khoản mới, không ai đọc
  trộm được nữa.
- **Balance server-side:** `dailyCheckin`, `claimLinkTask`, `verifyLinkCode`,
  `openChest`, `redeemGiftCode`, `addFriend`, `requestWithdraw` giờ chạy
  trong Cloud Functions (Admin SDK) — client chỉ **gửi yêu cầu**, không tự
  tính/tự ghi số tiền được nữa. Mở Console gõ lệnh JS không còn tác dụng
  với các hành động này.
- **Admin thật:** Dùng **Custom Claims** (`admin: true` trong ID token,
  ký bởi Firebase, không giả được) thay cho field `isAdmin` trong RTDB.
- **Rules mới:** `users/$uid` bị khóa ghi hoàn toàn (`.write: false`) cho
  tài khoản có `authProvider: 'firebase'` (tài khoản web mới/đã nâng cấp).
  Tài khoản Telegram (chưa có field này) **giữ nguyên hành vi cũ** — xem
  phần giới hạn bên dưới.

## Cần làm gì để deploy

### 1. Nâng gói Firebase lên Blaze
Cloud Functions **bắt buộc gói Blaze** (trả theo dùng) kể cả khi traffic
thấp — đây là yêu cầu của Google, không phải Firebase free tier hỗ trợ.
Với quy mô app nhỏ/vừa, chi phí thường rất thấp (có free quota hàng tháng),
nhưng cần thẻ thanh toán để bật.

### 2. Cài Firebase CLI + deploy functions
```bash
npm install -g firebase-tools
firebase login
cd cayxummo/functions
npm install
firebase deploy --only functions
```

### 3. Bật Email/Password sign-in trong Firebase Auth
Firebase Console > Authentication > Sign-in method > bật **Email/Password**.

### 4. Deploy Rules mới
```bash
firebase deploy --only database
```
(hoặc dán `firebase-rules.json` vào Console > Realtime Database > Rules)

### 5. Thêm script SDK vào `index.html`
Cần thêm 2 script mới (giữ nguyên script cũ):
```html
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-database-compat.js"></script>
<!-- THÊM MỚI: -->
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-functions-compat.js"></script>
```
(thay `10.x.x` bằng version bạn đang dùng cho các script Firebase khác —
phải CÙNG version để tránh xung đột)

### 6. Phong admin đầu tiên
```bash
cd cayxummo/scripts
npm install firebase-admin
# tải service-account.json từ Firebase Console > Project Settings >
# Service accounts > Generate new private key, để cùng thư mục
node set-admin.js <username-hoặc-uid-của-bạn>
```

### 7. Logout cần thêm `firebase.auth().signOut()`
Trong hàm `logout()` (trong `app.js`/`main.js`), thêm dòng này trước khi
xóa Storage, để đăng xuất khỏi Firebase Auth luôn:
```javascript
if (firebase.auth().currentUser) {
    await firebase.auth().signOut();
}
```

## ⚠️ Giới hạn còn lại (đã trao đổi rõ, không phải quên)

1. **Telegram Mini App vẫn CHƯA được bảo vệ** — như đã thống nhất. Tài
   khoản Telegram không có `authProvider: 'firebase'` nên rules vẫn cho
   ghi trực tiếp như cũ, ai mở console vẫn tự cộng tiền được. Muốn bảo vệ
   luôn thì cần xác minh Telegram `initData` (đã giải thích ở phần trước),
   để dịp khác.

2. **Admin Panel vẫn CHƯA migrate sang Cloud Functions** — các hành động
   admin (tạo gift code, sửa quỹ thưởng, duyệt rút tiền, sửa balance user
   trong tab Users...) vẫn ghi trực tiếp từ client như cũ. Rules cho các
   path này (`admin_config`, `gift_codes`, `prize_fund`, `withdraw_requests`
   status, v.v.) vẫn để mở (`true`) để không phá chức năng admin hiện có —
   **về lý thuyết ai cũng gọi được các path này qua console**, y hệt rủi
   ro đã có từ trước, không tệ hơn nhưng cũng chưa tốt hơn. Nếu muốn, đợt
   sau mình sẽ chuyển các hành động admin này sang Cloud Functions +
   check `context.auth.token.admin === true`.

3. **`getTopFriends()` (BXH mời bạn) và Admin Dashboard sẽ thấy dữ liệu
   THIẾU cho tài khoản web mới** — vì rules mới chỉ cho chủ tài khoản đọc
   `users/{uid}` của chính họ (`authProvider: 'firebase'` → owner-only
   read), nên các hàm đọc gộp `users/` từ client (đếm tổng users, top bạn
   bè) sẽ không đọc được data của các tài khoản web. Tài khoản Telegram
   không bị ảnh hưởng (vẫn đọc được như cũ). Cách fix đúng: thêm 1
   Cloud Function ghi ra 1 node "public" riêng (VD: `public_profiles/{uid}:
   {username, friendsCount}`) mà admin/leaderboard đọc từ đó thay vì đọc
   thẳng `users/`. Chưa làm trong đợt này — để tránh phình phạm vi thêm.
   `getTopLinks()` (BXH vượt link) KHÔNG bị ảnh hưởng vì nó đọc từ
   `leaderboard/` (node riêng, vẫn public).

4. **Cơ chế `tasks/` (nhiệm vụ) trong code gốc là DEAD CODE** — phát hiện
   khi viết `verifyLinkCode`: nút "Xác nhận" trong `TasksPage` gốc không
   hề gọi `FB.verifyCode()` (cơ chế `tasks/`), mà tự làm logic riêng dựa
   trên `linkTypes` + `currentTaskCode`/`currentTaskType`. Cloud Function
   mới (`verifyLinkCode`/`claimLinkTask`) viết theo đúng cơ chế `linkTypes`
   đang thực sự chạy, KHÔNG viết lại cơ chế `tasks/` cũ (không dùng tới).
   Tab "Nhiệm vụ" trong Admin Panel (tạo/xóa `tasks/`) vẫn còn trong code
   nhưng không ảnh hưởng gì tới người dùng thực tế.

5. **Cần migrate `pages/tasks.js`, `pages/account.js`, `pages/friends.js`**
   sang gọi các hàm `FB.claimLinkTask()`/`FB.verifyLinkCode()` mới (thay vì
   code gốc tự ghi DB trực tiếp trong nút "LẤY LINK"/"Xác nhận") — mình
   chưa viết các file page này, chỉ mới có `home.js`. Nếu bạn deploy rules
   mới mà CHƯA cập nhật `TasksPage`, nút "LẤY LINK"/"Xác nhận" trên web sẽ
   báo lỗi "permission denied" vì code cũ ghi DB trực tiếp bị rules chặn.
   → Báo mình khi cần, mình viết tiếp `pages/tasks.js` bản web.

## Test trước khi deploy thật

1. Dùng Firebase Emulator Suite (`firebase emulators:start`) để test
   Cloud Functions + Rules mà không đụng dữ liệu thật.
2. Test đăng ký tài khoản mới → xác nhận Firebase Auth có user, RTDB có
   `authProvider: 'firebase'`.
3. Test đăng nhập tài khoản CŨ (trước migration) → xác nhận `legacyLogin`
   chạy, tài khoản được nâng cấp, field `password`/`passwordSalt` bị xóa.
4. Mở Console, thử `firebase.database().ref('users/UID/balance').set(999999999)`
   trên tài khoản web → phải bị **PERMISSION_DENIED**.
5. Thử gọi `dailyCheckin` 2 lần liên tiếp trong ngày → lần 2 phải trả về
   `{status: 'already'}`.
