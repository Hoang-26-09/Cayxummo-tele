# Đưa code lên GitHub → Deploy Vercel

## ⚠️ Trước khi bắt đầu — kiểm tra `.gitignore`
File `.gitignore` đã có sẵn trong gói này, đảm bảo nó nằm ở **thư mục gốc
project** (cùng cấp `index.html`) trước khi làm bước nào bên dưới. Nếu
project của bạn ĐÃ có `.gitignore` từ trước, mở ra thêm các dòng này vào
(không ghi đè):
```
functions/.env
scripts/service-account.json
node_modules/
functions/node_modules/
.vercel
```
**Nếu lỡ commit `functions/.env` hoặc `service-account.json` rồi** — đổi
ngay bot token (BotFather > `/revoke`) và tạo lại service account key mới
trong Firebase Console, vì coi như đã lộ.

## 1. Đẩy lên GitHub

### Nếu project CHƯA có Git:
```bash
cd đường-dẫn-tới-project-của-bạn
git init
git add .
git commit -m "Cập nhật bảo mật: Cloud Functions, Firebase Auth, chống gian lận"
```

Tạo repo mới trên GitHub (https://github.com/new — đặt Private nếu muốn
giữ kín code), rồi:
```bash
git remote add origin https://github.com/<username>/<ten-repo>.git
git branch -M main
git push -u origin main
```

### Nếu project ĐÃ có Git + đã kết nối GitHub từ trước:
```bash
cd đường-dẫn-tới-project-của-bạn
git add .
git status   # kiểm tra danh sách file trước khi commit - đảm bảo KHÔNG thấy .env hay service-account.json trong này
git commit -m "Cập nhật bảo mật: Cloud Functions, Firebase Auth, chống gian lận"
git push
```

## 2. Deploy Vercel

### Nếu project ĐÃ kết nối Vercel với repo GitHub này từ trước
Không cần làm gì thêm — Vercel tự động deploy mỗi khi bạn `git push` lên
nhánh chính (thường là `main`). Vào https://vercel.com/dashboard xem tiến
trình build.

### Nếu chưa kết nối, làm 1 lần duy nhất:
1. Vào https://vercel.com/new
2. Chọn **Import Git Repository** → chọn đúng repo vừa push
3. Vercel tự nhận đây là static site (không cần Framework Preset, để
   **Other**) vì project chỉ có HTML/CSS/JS thuần
4. Bấm **Deploy**

Hoặc bằng CLI:
```bash
npm install -g vercel
cd đường-dẫn-tới-project-của-bạn
vercel login
vercel --prod
```

## 3. Vercel có build nhầm thư mục `functions/`/`scripts/` không?

**Không** — đó là code Node.js chạy trên Cloud Functions (Firebase), tách
biệt hoàn toàn khỏi Vercel. Vercel chỉ serve file tĩnh (`index.html`,
`.js`, `.css`...), không đụng tới `functions/`/`scripts/` dù chúng nằm
chung repo. Không cần xóa hay tách repo riêng.

## 4. Domain

- Domain mặc định Vercel cấp (`<ten-project>.vercel.app`) dùng được ngay.
- Nếu bạn giữ domain `cayxummo-tele.vercel.app` cũ, đảm bảo project Vercel
  bạn đang deploy **chính là project cũ** (không tạo project mới) để giữ
  nguyên domain — nếu tạo project mới, domain sẽ khác, cần cập nhật lại
  URL trong BotFather (mục 7, `DEPLOY-GUIDE.md`).

## 5. Sau khi deploy xong

Quay lại checklist trong `DEPLOY-GUIDE.md` (mục "Checklist cuối cùng") để
test toàn bộ: đăng ký, đăng nhập, quên mật khẩu, thử hack qua Console
(phải bị chặn), Telegram Mini App, Admin Panel.

## Nếu gặp lỗi lúc build trên Vercel

Copy nguyên message lỗi từ Vercel dashboard (tab **Deployments** > click
vào bản build lỗi > xem log) rồi gửi mình — 90% các site tĩnh thuần
HTML/JS không có gì để "build" nên hiếm khi lỗi, nếu có thường là do
đường dẫn file sai (VD: `<script src="./pages/home.js">` nhưng file thật
nằm ở `/pages/home.js` không có `./`).
