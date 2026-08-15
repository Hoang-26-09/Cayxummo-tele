# Thêm Email + Quên mật khẩu (web)

## Cách hoạt động

- **Đăng ký:** giờ bắt buộc nhập email thật (không còn "giả" username
  thành email nữa) — Firebase Auth dùng chính email này làm tài khoản
  đăng nhập nội bộ.
- **Đăng nhập:** người dùng **vẫn gõ username như trước giờ**, không cần
  nhớ email — `resolveLoginEmail` (Cloud Function) tự tra email tương ứng
  phía server rồi mới gọi `signInWithEmailAndPassword`. Trải nghiệm không
  đổi, chỉ thêm 1 bước tra cứu nhanh.
- **Quên mật khẩu:** gọi thẳng `firebase.auth().sendPasswordResetEmail()`
  — **Firebase tự gửi mail** qua hạ tầng của Google, không cần bạn tự dựng
  SMTP/Gmail API/SendGrid gì cả. Người dùng bấm link trong mail, tự đặt
  mật khẩu mới, xong.

## Cần sửa trong HTML (index.html)

### 1. Form đăng ký — thêm 1 ô input email
Tìm chỗ có `id="regUsername"`, thêm ngay sau đó:
```html
<input class="input" id="regEmail" type="email" placeholder="Email">
```

### 2. Form đăng nhập — thêm link "Quên mật khẩu?"
Tìm chỗ có `id="loginPassword"` hoặc nút `id="btnLogin"`, thêm gần đó:
```html
<a href="#" id="forgotPasswordLink" style="font-size:13px;color:var(--accent);">Quên mật khẩu?</a>
```
(`web-auth.js` tự tìm phần tử này qua `id`, có thì gắn sự kiện, không có
thì bỏ qua — không lỗi gì nếu bạn chưa kịp thêm ngay)

### 3. Bật Email templates trong Firebase Console (tùy chọn nhưng nên làm)
Authentication > Templates > Password reset — có thể đổi tên hiển thị
người gửi, tiêu đề mail, ngôn ngữ (mặc định tiếng Anh, đổi sang tiếng
Việt hoặc tùy chỉnh nội dung ở đây).

## Thêm "Thêm email khôi phục" trong AccountPage (cho tài khoản cũ)

Tài khoản đăng ký TRƯỚC bản cập nhật này (hoặc nâng cấp qua `legacyLogin`
mà không nhập email) đang dùng email giả `username@cayxummo.local` —
**"Quên mật khẩu" sẽ không hoạt động** cho tới khi họ tự thêm email thật.

Thêm đoạn này vào `AccountPage` (trong card thông tin tài khoản):
```javascript
// HTML:
// <div class="card">
//   <div class="card-title">📧 Email khôi phục</div>
//   <input class="input" id="recoveryEmailInput" type="email" placeholder="Email của bạn">
//   <button class="btn btn-primary" id="btnAddRecoveryEmail">Lưu email</button>
// </div>

document.getElementById('btnAddRecoveryEmail').onclick = async () => {
    const email = document.getElementById('recoveryEmailInput').value.trim();
    if (!email) return this.app.toast('Nhập email!', 'warning');
    const btn = document.getElementById('btnAddRecoveryEmail');
    try {
        await withLoading(btn, '⏳...', async () => {
            await FB.addRecoveryEmail(email);
            this.app.toast('Đã lưu email khôi phục!', 'success');
        }, { onError: (e) => this.app.toast(e.message || 'Có lỗi!', 'error') });
    } catch (e) { /* đã xử lý */ }
};
```

Chỉ hiện phần này nếu tài khoản đang dùng email giả — kiểm tra bằng:
```javascript
const isFakeEmail = firebase.auth().currentUser?.email?.endsWith('@cayxummo.local');
```

## Test

1. Đăng ký tài khoản mới với email thật → check Firebase Console >
   Authentication, tài khoản phải có đúng email đó (không phải
   `...@cayxummo.local`).
2. Đăng nhập bằng username (không phải email) → vẫn vào được bình thường.
3. Bấm "Quên mật khẩu?" → nhập username → check hộp thư (và Spam) có mail
   từ Firebase.
4. Bấm link trong mail, đặt mật khẩu mới → đăng nhập lại bằng mật khẩu
   mới → phải vào được.
5. Tài khoản CŨ (chưa có email thật) → thử "Quên mật khẩu?" → phải báo
   "chưa có email khôi phục", không được gửi mail (vì không biết gửi đi
   đâu — email giả không tồn tại thật).
