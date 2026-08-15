# Xác thực Telegram thật (đúng lỗ hổng vừa bị khai thác)

## Vấn đề đã có

Code gốc tin thẳng `this.tg.initDataUnsafe.user.id` để xác định "đây là
ai" — dữ liệu này nằm trong `initDataUnsafe`, đúng như tên gọi, **không
được xác minh chữ ký**, và **client (JS chạy trong máy người dùng) hoàn
toàn sửa được qua console** trước khi app đọc nó. Đây rất có thể là đường
kẻ tấn công vừa dùng để tự nhận mình là admin (Telegram UID của bạn).

## Đã sửa

`functions/telegram-auth.js` xác minh `tg.initData` (không phải
`initDataUnsafe`) bằng thuật toán HMAC-SHA256 chính thức của Telegram, ký
bằng **bot token** — chỉ Telegram + bạn (chủ bot) biết token này, nên nếu
chữ ký khớp thì chắc chắn dữ liệu đến từ Telegram thật. Sau khi xác minh,
cấp Firebase Auth thật (custom token) cho Telegram UID đó — từ đây,
Telegram cũng có `auth.uid` thật như web, được các Cloud Functions +
Rules đã xây dựng bảo vệ y hệt.

## Cần làm gì để deploy

### 1. Lấy Bot Token
Trong Telegram, chat với **@BotFather** → `/mybots` → chọn bot → **API Token**.

### 2. Cấu hình secret cho Cloud Functions
```bash
cd cayxummo/functions
cp .env.example .env
# Mở .env, điền TELEGRAM_BOT_TOKEN=<token thật>
```
**Thêm `.env` vào `.gitignore`** — tuyệt đối không commit file này lên Git,
lộ token là mất quyền kiểm soát bot Telegram.

### 3. Deploy lại functions (đã có telegramLogin)
```bash
firebase deploy --only functions
```

### 4. Sửa `init()` trong `app.js`/`main.js`

Trước đây (KHÔNG an toàn — giữ lại để bạn thấy chỗ cần thay):
```javascript
} else if (this.tg?.initDataUnsafe?.user) {
    const user = this.tg.initDataUnsafe.user;
    this.user = { id: user.id.toString(), username: user.username || 'User' };
}
```

Thay bằng (import `signInTelegram` từ `pages/telegram-auth.js`):
```javascript
import { signInTelegram } from './pages/telegram-auth.js';

// ... trong init(), TRƯỚC đoạn kiểm tra savedId/this.tg cũ:
if (this.tg?.initData) {
    try {
        const firebaseUser = await signInTelegram(this.tg);
        this.user = { id: firebaseUser.uid, username: firebaseUser.displayName || 'User' };
    } catch (e) {
        document.getElementById('loadingScreen').innerHTML =
            `<div style="color:red;padding:20px;">
                <h3>❌ Không xác thực được Telegram</h3>
                <p>${e.message}</p>
                <button onclick="location.reload()">🔄 Tải lại</button>
            </div>`;
        return;
    }
}
```

Sau bước này, `this.user.id` là **uid Firebase Auth thật** (trùng
Telegram UID cho tài khoản có sẵn, giữ nguyên balance/lịch sử) — mọi thứ
còn lại (`FB.dailyCheckin`, `FB.isAdmin`, TasksPage mới...) tự động nhận
ra qua `firebase.auth().currentUser` và đi qua Cloud Functions, không cần
sửa gì thêm ở các page khác.

### 5. Dùng TasksPage mới
Đổi import trong `main.js`:
```javascript
import { TasksPage } from './pages/tasks.js';  // thay cho bản cũ trong monolith
```
Bản mới gọi `FB.claimLinkTask()`/`FB.verifyLinkCode()` (qua Cloud
Functions) thay vì tự ghi DB — vá đúng lỗ hổng đã phát hiện.

### 6. Phong lại admin bằng Custom Claims
Vì giờ Telegram cũng có Firebase Auth thật, dùng lại
`scripts/set-admin.js` với UID Telegram của bạn (chính là uid Firebase
Auth mới, cùng giá trị):
```bash
cd cayxummo/scripts
node set-admin.js <telegram-uid-của-bạn>
```
Từ giờ, `isAdmin()` sẽ đọc Custom Claims cho cả web lẫn Telegram — field
`isAdmin` cũ trong RTDB không còn ý nghĩa an ninh nữa (nhưng cũng không
cần xóa, không ai còn tin vào nó để cấp quyền).

### 7. Mở khóa dần từ EMERGENCY-LOCKDOWN
Sau khi hoàn tất bước 1–6 và test kỹ (đăng nhập Telegram, lấy link, xác
nhận mã, mở rương, admin login...), chuyển từ
`EMERGENCY-LOCKDOWN-rules.json` sang `firebase-rules.json` (bản đầy đủ,
đã có cả phần khóa 6 path admin-only bằng custom claims).

## Lưu ý

- `auth_date` trong initData hết hạn sau **24 giờ** — nếu Telegram Mini
  App bị treo/mở lại sau thời gian dài, `signInTelegram()` cần được gọi
  lại (Telegram tự cấp `initData` mới mỗi lần mở app, nên bình thường
  không phải lo, chỉ cần đảm bảo `init()` luôn gọi hàm này thay vì cache
  session cũ).
- `code_pools`, `gift_codes`, `withdraw_requests` **vẫn còn mở** (như đã
  báo) — đây là việc tiếp theo nếu muốn khóa chặt hoàn toàn.
