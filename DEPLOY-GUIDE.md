# Đưa lên web — Hướng dẫn tổng hợp theo đúng thứ tự

Đây là bước cuối, gộp lại toàn bộ những gì đã làm (Cloud Functions, Rules,
Telegram Auth, Email) thành 1 quy trình duy nhất. Làm ĐÚNG THỨ TỰ để
tránh app bị gãy giữa chừng.

## 0. Chuẩn bị

```bash
npm install -g firebase-tools
firebase login
cd cayxummo
firebase use --add        # chọn đúng project cay-xu-mmo
```
Đảm bảo project đã ở gói **Blaze** (Console > nâng cấp, cần thẻ thanh toán
— Cloud Functions bắt buộc, đã nói ở phần trước).

## 1. Deploy Cloud Functions

```bash
cd functions
npm install
cp .env.example .env
# Mở .env, điền TELEGRAM_BOT_TOKEN thật (lấy từ @BotFather)
cd ..
firebase deploy --only functions
```
Đợi vài phút, xong sẽ thấy danh sách function trong Firebase Console >
Functions: `registerUser`, `legacyLogin`, `resolveLoginEmail`,
`addRecoveryEmail`, `telegramLogin`, `dailyCheckin`, `claimLinkTask`,
`verifyLinkCode`, `openChest`, `redeemGiftCode`, `addFriend`,
`requestWithdraw`.

## 2. Bật Email/Password trong Firebase Auth

Console > Authentication > Sign-in method > bật **Email/Password**.

## 3. Deploy Database Rules

Nếu đang trong tình huống khẩn cấp (đã dùng `EMERGENCY-LOCKDOWN-rules.json`)
thì **giữ nguyên lockdown cho tới khi xong bước 5** (cập nhật code
frontend) — đừng mở khóa sớm, vì code cũ (chưa cập nhật) sẽ vẫn cố ghi
DB trực tiếp và bị chặn (đúng ý, nhưng đừng nhầm tưởng là lỗi).

Khi code frontend đã cập nhật xong và test kỹ ở bước 6:
```bash
firebase deploy --only database
```
(rules lấy từ file `firebase-rules.json` — cấu hình sẵn trong `firebase.json`,
xem bước dưới)

## 4. Cập nhật code frontend

### 4a. Copy các file module vào project
Copy toàn bộ các file `.js` ở thư mục gốc (`config.js`, `storage.js`,
`crypto.js`, `rate-limiter.js`, `firebase-manager.js`, `ui.js`,
`device-fingerprint.js`, `anti-devtools.js`) và thư mục `pages/` vào đúng
vị trí trong project frontend hiện tại của bạn.

### 4b. Thêm script SDK vào `index.html`
```html
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.x.x/firebase-functions-compat.js"></script>
<script type="module" src="./main.js"></script>
```
(thay `10.x.x` bằng version bạn đang dùng cho các script Firebase cũ,
phải cùng version)

### 4c. Thêm ô email + link quên mật khẩu (xem `EMAIL-RECOVERY.md`)
- `<input id="regEmail" type="email">` trong form đăng ký
- `<a id="forgotPasswordLink">Quên mật khẩu?</a>` trong form đăng nhập

### 4d. Sửa `main.js`/`app.js` theo `TELEGRAM-AUTH.md`
- Thay đoạn tin `initDataUnsafe` bằng `signInTelegram(this.tg)`
- Import `TasksPage` từ `pages/tasks.js` (bản mới, thay bản cũ trong file gốc)
- Thêm `firebase.auth().signOut()` vào `logout()`

### 4e. (Tùy chọn) Bật cản trở copy code
```javascript
import { initAntiDevtools } from './anti-devtools.js';
initAntiDevtools({ onDevtoolsDetected: () => app.toast('⚠️ Vui lòng không can thiệp vào code!', 'warning') });
```

## 5. Test bằng Firebase Emulator TRƯỚC khi deploy thật (khuyến khích)

```bash
firebase emulators:start
```
Trỏ tạm `firebaseConfig` trong `config.js` sang emulator để test không
đụng dữ liệu thật — xem hướng dẫn Firebase Emulator Suite nếu cần.

## 6. Deploy frontend lên Vercel

```bash
# Trong thư mục project frontend (nơi có index.html)
npx vercel --prod
```
Hoặc nếu đã kết nối Git với Vercel từ trước, chỉ cần `git push` — Vercel
tự deploy theo cấu hình đã thiết lập sẵn.

**Kiểm tra sau deploy:** mở `https://cayxummo-tele.vercel.app` (hoặc domain
của bạn), thử đăng ký/đăng nhập/lấy link/xác nhận mã — mọi thao tác balance
phải KHÔNG lỗi, và không sửa được qua Console (test lại bước 4 trong
`CLOUD-FUNCTIONS-MIGRATION.md`).

## 7. Trỏ Telegram Bot vào URL mới

Chat với **@BotFather** > `/mybots` > chọn bot > **Bot Settings > Menu
Button** (hoặc **Configure Mini App**) > cập nhật URL trỏ đúng domain
Vercel của bạn (nếu domain không đổi thì bỏ qua bước này).

## 8. Mở khóa Rules đầy đủ (nếu đang ở EMERGENCY-LOCKDOWN)

Sau khi bước 6-7 test ổn:
```bash
firebase deploy --only database
```
(đảm bảo `firebase.json` trỏ đúng `firebase-rules.json`, không phải
`EMERGENCY-LOCKDOWN-rules.json` nữa)

## 9. Phong admin

```bash
cd scripts
npm install firebase-admin
node set-admin.js <uid-hoặc-username-của-bạn>
```

## `firebase.json` mẫu (nếu chưa có)

```json
{
  "database": {
    "rules": "firebase-rules.json"
  },
  "functions": {
    "source": "functions"
  }
}
```
(không cần khai báo `hosting` nếu bạn tiếp tục dùng Vercel cho frontend —
Firebase Hosting và Vercel là 2 lựa chọn độc lập, dùng 1 trong 2 cũng được)

## Checklist cuối cùng trước khi báo "xong"

- [ ] `firebase deploy --only functions` chạy không lỗi
- [ ] Email/Password bật trong Firebase Auth
- [ ] Đăng ký tài khoản mới trên web thật → nhận được, kiểm tra Console
      Auth có email thật
- [ ] Đăng nhập lại bằng username + mật khẩu vừa tạo → vào được
- [ ] "Quên mật khẩu?" → nhận được mail
- [ ] Mở Console trình duyệt, thử `firebase.database().ref('users/UID/balance').set(999999)`
      trên tài khoản web → phải báo `PERMISSION_DENIED`
- [ ] Telegram Mini App mở được, đăng nhập tự động qua `signInTelegram`
- [ ] Admin Panel hiện đúng cho tài khoản đã `set-admin.js`, ẩn với tài
      khoản thường
- [ ] Rules đã chuyển từ `EMERGENCY-LOCKDOWN-rules.json` sang
      `firebase-rules.json` đầy đủ
