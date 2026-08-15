const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.database();

/**
 * Xác minh Telegram WebApp initData theo đúng thuật toán Telegram công bố:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Chữ ký (hash) được Telegram ký bằng bot token — CHỈ Telegram + chủ bot
 * biết token này, nên nếu hash khớp thì chắc chắn dữ liệu đến từ Telegram
 * thật, không giả được (khác hẳn việc chỉ tin `initDataUnsafe.user.id` ở
 * client như code gốc đang làm — cái đó ai cũng sửa được qua console).
 */
function verifyTelegramInitData(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // So sánh an toàn (tránh timing attack)
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const authDate = parseInt(params.get('auth_date'), 10);
    if (!authDate || (Date.now() / 1000 - authDate) > 86400) return null; // initData > 24h -> hết hạn, chặn replay

    const userJson = params.get('user');
    if (!userJson) return null;
    try {
        return JSON.parse(userJson);
    } catch (e) {
        return null;
    }
}

/**
 * Đăng nhập Telegram Mini App bằng Firebase Auth thật.
 * Gọi lúc app khởi động (thay cho việc tự tin initDataUnsafe.user.id).
 * uid Firebase = uid Telegram (giữ nguyên toàn bộ dữ liệu users/{uid} cũ).
 */
exports.telegramLogin = functions.https.onCall(async (data) => {
    const initData = data.initData;
    if (!initData) throw new functions.https.HttpsError('invalid-argument', 'Thiếu initData');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN chưa được cấu hình trong functions/.env');
        throw new functions.https.HttpsError('internal', 'Server chưa cấu hình xong, báo admin');
    }

    const tgUser = verifyTelegramInitData(initData, botToken);
    if (!tgUser || !tgUser.id) {
        throw new functions.https.HttpsError('unauthenticated', 'Dữ liệu Telegram không hợp lệ hoặc đã hết hạn, mở lại app');
    }

    const uid = String(tgUser.id);
    const displayName = tgUser.username || tgUser.first_name || 'User';

    try {
        await admin.auth().getUser(uid);
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            await admin.auth().createUser({ uid, displayName });
        } else {
            console.error('telegramLogin createUser error:', e);
            throw new functions.https.HttpsError('internal', 'Có lỗi khi tạo tài khoản');
        }
    }

    const userSnap = await db.ref('users/' + uid).once('value');
    if (!userSnap.exists()) {
        await db.ref('users/' + uid).set({
            id: uid, username: displayName, balance: 0,
            dailyStreak: 0, lastDaily: '', completedLinks: 0,
            totalLinksWeekly: 0, totalLinksAllTime: 0,
            friends: [], invitedBy: '', codesUsed: [], giftCodesUsed: [],
            lastLinkTime: 0, chestsOpened: 0, isBanned: false,
            createdAt: Date.now(), friendsCount: 0,
            authProvider: 'firebase'
        });
    } else if (userSnap.val().authProvider !== 'firebase') {
        // Tài khoản Telegram CŨ (tạo trước khi có bước xác thực này) ->
        // đánh dấu nâng cấp, giữ nguyên balance/lịch sử. Từ giờ users/{uid}
        // của họ cũng được rules khóa ghi trực tiếp như tài khoản web.
        await db.ref('users/' + uid).update({ authProvider: 'firebase' });
    }

    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken, username: displayName };
});
