/**
 * Đăng nhập Telegram Mini App bằng Firebase Auth thật (thay vì tin thẳng
 * `initDataUnsafe.user.id` — cái mà ai cũng sửa được qua console). Server
 * (Cloud Function `telegramLogin`) xác minh chữ ký `tg.initData` bằng bot
 * token trước khi cấp quyền.
 *
 * Gọi hàm này SỚM trong init(), trước khi hiện Admin tab hay cho phép các
 * thao tác balance — vì FB.isAdmin()/dailyCheckin()/v.v. đều dựa vào
 * firebase.auth().currentUser để biết có nên đi qua Cloud Functions hay
 * không.
 */
export async function signInTelegram(tg) {
    if (!tg || !tg.initData) {
        throw new Error('Không lấy được dữ liệu xác thực từ Telegram (initData rỗng — có thể app đang mở ngoài Telegram)');
    }
    const telegramLogin = firebase.functions().httpsCallable('telegramLogin');
    const result = await telegramLogin({ initData: tg.initData });
    const cred = await firebase.auth().signInWithCustomToken(result.data.customToken);
    return cred.user;
}
