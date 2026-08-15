import { callApi } from '../api-client.js';

/**
 * Đăng nhập Telegram Mini App bằng Firebase Auth thật (thay vì tin thẳng
 * `initDataUnsafe.user.id` — cái mà ai cũng sửa được qua console). Server
 * (Vercel API `telegramLogin`) xác minh chữ ký `tg.initData` bằng bot
 * token trước khi cấp quyền.
 */
export async function signInTelegram(tg) {
    if (!tg || !tg.initData) {
        throw new Error('Không lấy được dữ liệu xác thực từ Telegram (initData rỗng — có thể app đang mở ngoài Telegram)');
    }
    const result = await callApi('telegramLogin', { initData: tg.initData }, { requireAuth: false });
    const cred = await firebase.auth().signInWithCustomToken(result.customToken);
    return cred.user;
}
