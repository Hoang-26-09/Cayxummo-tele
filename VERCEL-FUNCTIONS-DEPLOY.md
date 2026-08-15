# Deploy bằng Vercel Functions (miễn phí, không cần thẻ)

Thay cho Firebase Cloud Functions (cần Blaze/thẻ), giờ "server" chạy trên
Vercel — miễn phí, không cần thẻ. Firebase chỉ còn giữ vai trò Database +
Auth (đều miễn phí ở gói Spark mặc định, không cần đổi gì).

## Bước 1 — Lấy Service Account Key (chìa khóa cho Vercel nói chuyện với Firebase)

1. Vào **Firebase Console** > ⚙️ **Project Settings** > tab **Service accounts**
2. Bấm **Generate new private key** → tải về file `.json`
3. **Giữ kín file này** — ai có file này coi như có toàn quyền admin trên
   Firebase project của bạn.

## Bước 2 — Encode file đó thành base64

Trong Termux (đứng ở thư mục chứa file vừa tải, thường là `~/storage/downloads`):
```
base64 -w 0 ten-file-service-account.json > sa-base64.txt
cat sa-base64.txt
```
→ Copy toàn bộ đoạn chữ dài hiện ra (không xuống dòng) — đây là giá trị
sẽ dán vào Vercel ở bước sau.

## Bước 3 — Lấy Bot Token (nếu chưa có)
Chat **@BotFather** > `/mybots` > chọn bot > **API Token**.

## Bước 4 — Đẩy code lên GitHub (như đã hướng dẫn trước)
```
cd ~/cayxummo
git add .
git commit -m "Chuyển sang Vercel Functions"
git push
```

## Bước 5 — Deploy lên Vercel + khai báo biến môi trường

### Nếu CHƯA từng deploy project này lên Vercel:
1. Vào https://vercel.com/new
2. **Import** đúng repo GitHub vừa push
3. **ĐỪNG bấm Deploy vội** — cuộn xuống mục **Environment Variables**, thêm:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | (dán toàn bộ chuỗi base64 từ Bước 2) |
| `TELEGRAM_BOT_TOKEN` | (token thật từ BotFather) |
| `FIREBASE_DATABASE_URL` | `https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app` |

4. Bấm **Deploy**

### Nếu ĐÃ deploy project này từ trước (chỉ push code mới):
Vào Vercel Dashboard > chọn project > **Settings > Environment Variables**
> thêm 3 biến y hệt bảng trên > **Save** > vào tab **Deployments** > bấm
**Redeploy** ở bản mới nhất (biến môi trường chỉ áp dụng cho lần deploy
SAU KHI thêm, không tự áp dụng ngược cho bản cũ).

## Bước 6 — Deploy Database Rules (vẫn qua Firebase CLI, không cần Blaze)
```
cd ~/cayxummo
firebase deploy --only database
```
(Rules không cần Blaze — chỉ Cloud Functions mới cần, phần này vẫn miễn phí)

## Bước 7 — Bật Email/Password trong Firebase Auth
Console > Authentication > Sign-in method > bật **Email/Password**.

## Bước 8 — Phong admin
Cách cũ (`scripts/set-admin.js`) vẫn dùng được y nguyên, chỉ cần chạy trên
máy có Node.js (Termux vẫn được):
```
cd ~/cayxummo/scripts
npm install firebase-admin
# copy file service-account.json (Bước 1) vào chung thư mục này
node set-admin.js <uid-hoặc-username-của-bạn>
```

## Test sau khi deploy

1. Mở domain Vercel của bạn → thử đăng ký tài khoản mới
2. Mở DevTools (F12) > tab **Network** > thử đăng ký lại → phải thấy
   request tới `/api/registerUser` (không phải gọi Firebase Functions nữa)
3. Mở Console, thử:
   ```javascript
   firebase.database().ref('users/UID/balance').set(999999)
   ```
   → phải báo `PERMISSION_DENIED` (rules vẫn bảo vệ y hệt trước)
4. Test Telegram Mini App → mở app → phải tự đăng nhập được (gọi
   `/api/telegramLogin` phía sau)

## Nếu API báo lỗi 500/"internal"

Vào Vercel Dashboard > project > tab **Deployments** > bản mới nhất >
**Functions** (hoặc **Logs**) → xem log lỗi thật của từng function —
thường là do:
- Thiếu/sai `FIREBASE_SERVICE_ACCOUNT_BASE64` (kiểm tra lại đã copy đủ
  chuỗi base64, không bị ngắt dòng)
- Chưa **Redeploy** sau khi thêm biến môi trường mới
