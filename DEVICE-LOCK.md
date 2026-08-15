# Chặn tạo nhiều tài khoản (1 thiết bị = 1 tài khoản, chỉ áp dụng cho web)

Đã thay từ IP → **device fingerprint**, vì IP dùng chung khi đổi WiFi/4G
không đúng ý bạn muốn (muốn khóa theo máy, không theo mạng).

## Cách hoạt động

1. Lúc đăng ký (`web-auth.js`): `device-fingerprint.js` gom các đặc điểm
   trình duyệt/máy — canvas rendering, WebGL renderer, độ phân giải màn
   hình, số nhân CPU, timezone, User-Agent... — hash lại thành 1 mã.
2. Kiểm tra `device_registrations/{hash}` đã tồn tại chưa. Có rồi → chặn.
3. Chưa có → `FB.createUser()` ghi **atomic cùng lúc**: tài khoản mới +
   khóa thiết bị, y hệt cơ chế IP trước đó (không ai bypass được bằng cách
   chỉ ghi `users/` mà bỏ `device_registrations/`, nhờ Firebase Rules).

## ⚠️ Giới hạn thật sự

- **Xóa cache/dữ liệu trình duyệt** → fingerprint gần như giữ nguyên
  (canvas/WebGL/CPU/màn hình không đổi), **vẫn bị chặn** — đây là điểm
  mạnh so với cách dùng localStorage token đơn thuần.
- **Đổi sang trình duyệt khác trên CÙNG máy** (Chrome → Firefox) → User-Agent
  và vài chi tiết render khác → fingerprint đổi → **vượt qua được**.
- **Chế độ ẩn danh (Incognito/Private)** → tùy trình duyệt, nhiều khi vẫn
  cho cùng 1 fingerprint vì canvas/WebGL/CPU không đổi, nhưng không đảm
  bảo 100%.
- **2 máy giống hệt nhau** (cùng model, cùng driver, cài đặt gốc) trên lý
  thuyết có thể trùng fingerprint — hiếm nhưng có thể xảy ra với máy ảo/
  máy công ty cấu hình đồng loạt.
- **Máy dùng chung** (máy tính gia đình, phòng máy net) → người đăng ký
  sau bị chặn oan. Dùng `FB.releaseDeviceLock(deviceHash)` để admin gỡ thủ
  công (chưa có UI, gọi trực tiếp — báo mình nếu muốn build 1 tab admin
  cho việc này).

Tóm lại: đây vẫn là hàng rào chống farm "tiện tay" trên cùng máy/trình
duyệt — không chặn được người chủ động đổi trình duyệt hoặc dùng máy khác.

## Đã xóa

`ip-guard.js` và `IP-LOCK.md` không còn dùng (đã gỡ khỏi flow), thay bằng
`device-fingerprint.js` + `DEVICE-LOCK.md` (file này).

## Test

1. Đăng ký 1 tài khoản → check `device_registrations/{hash}` xuất hiện
   trong Firebase Console.
2. Thử đăng ký tài khoản thứ 2 **cùng trình duyệt, cùng máy** (kể cả đổi
   WiFi/4G) → phải bị chặn.
3. Đổi sang trình duyệt khác trên cùng máy → đăng ký được (giới hạn đã
   biết, không phải bug).
