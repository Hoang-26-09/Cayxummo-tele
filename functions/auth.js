const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.database();

// Fallback khi không có email thật (VD: nâng cấp tài khoản cũ mà chưa kịp
// hỏi email). Tài khoản dùng email này KHÔNG dùng được "Quên mật khẩu".
const FAKE_EMAIL_DOMAIN = 'cayxummo.local';
const LEGACY_SALT = 'cayxummo_salt_2024'; // salt cũ, chỉ dùng cho tài khoản tạo trước khi có Cloud Functions

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toFakeEmail(username) {
    return `${username.toLowerCase()}@${FAKE_EMAIL_DOMAIN}`;
}

function isFakeEmail(email) {
    return !!email && email.endsWith('@' + FAKE_EMAIL_DOMAIN);
}

function sha256Hex(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function requireAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vui lòng đăng nhập lại');
    }
    return context.auth.uid;
}

/**
 * Đăng ký tài khoản MỚI — giờ bắt buộc email THẬT (không phải username
 * giả làm email nữa), để "Quên mật khẩu" dùng được ngay từ đầu. Firebase
 * tự gửi mail đặt lại mật khẩu qua hạ tầng của Google, không cần tự dựng
 * SMTP/gửi mail thủ công.
 */
exports.registerUser = functions.https.onCall(async (data) => {
    const username = (data.username || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const password = (data.password || '').trim();
    const deviceHash = (data.deviceHash || '').trim() || null;

    if (username.length < 3) {
        throw new functions.https.HttpsError('invalid-argument', 'Tên đăng nhập phải có ít nhất 3 ký tự');
    }
    if (!EMAIL_REGEX.test(email)) {
        throw new functions.https.HttpsError('invalid-argument', 'Email không hợp lệ');
    }
    if (password.length < 7) {
        throw new functions.https.HttpsError('invalid-argument', 'Mật khẩu phải có ít nhất 7 ký tự');
    }

    if (deviceHash) {
        const deviceSnap = await db.ref('device_registrations/' + deviceHash).once('value');
        if (deviceSnap.exists()) {
            throw new functions.https.HttpsError('already-exists', 'Thiết bị này đã được dùng để tạo 1 tài khoản rồi!');
        }
    }

    // Username không còn gắn với email nên phải tự kiểm tra trùng riêng.
    const usernameSnap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
    if (usernameSnap.exists()) {
        throw new functions.https.HttpsError('already-exists', 'Tên đăng nhập đã tồn tại!');
    }

    let userRecord;
    try {
        userRecord = await admin.auth().createUser({ email, password, displayName: username });
    } catch (e) {
        if (e.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Email này đã được dùng cho tài khoản khác!');
        }
        console.error('registerUser error:', e);
        throw new functions.https.HttpsError('internal', 'Có lỗi khi tạo tài khoản, thử lại sau');
    }

    const uid = userRecord.uid;
    const now = Date.now();
    const updates = {};
    updates['users/' + uid] = {
        id: uid, username, balance: 0,
        dailyStreak: 0, lastDaily: '', completedLinks: 0,
        totalLinksWeekly: 0, totalLinksAllTime: 0,
        friends: [], invitedBy: '', codesUsed: [], giftCodesUsed: [],
        lastLinkTime: 0, chestsOpened: 0, isBanned: false,
        createdAt: now, friendsCount: 0,
        registrationDeviceHash: deviceHash,
        authProvider: 'firebase'
    };
    if (deviceHash) {
        updates['device_registrations/' + deviceHash] = { uid, username, createdAt: now };
    }
    await db.ref().update(updates);

    return { uid, email };
});

/**
 * Client gọi hàm này TRƯỚC khi đăng nhập, để biết:
 * - Tài khoản CŨ (chưa nâng cấp, mật khẩu còn kiểu SHA256+salt) -> client
 *   gọi legacyLogin() như cũ.
 * - Tài khoản đã ở Firebase Auth -> trả về email thật để client tự gọi
 *   signInWithEmailAndPassword(email, password) trực tiếp (không cần qua
 *   Cloud Function nữa, nhanh hơn).
 * Nhờ vậy người dùng vẫn gõ USERNAME để đăng nhập như trước giờ, không
 * cần nhớ email.
 */
exports.resolveLoginEmail = functions.https.onCall(async (data) => {
    const username = (data.username || '').trim();
    if (!username) throw new functions.https.HttpsError('invalid-argument', 'Thiếu tên đăng nhập');

    const snap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
    if (!snap.exists()) {
        throw new functions.https.HttpsError('not-found', 'Tên đăng nhập không tồn tại');
    }
    let uid = null, user = null;
    snap.forEach(c => { uid = c.key; user = c.val(); });

    if (user.password) {
        return { mode: 'legacy' };
    }

    let authUser;
    try {
        authUser = await admin.auth().getUser(uid);
    } catch (e) {
        throw new functions.https.HttpsError('internal', 'Có lỗi khi tra cứu tài khoản');
    }
    return { mode: 'firebase', email: authUser.email, hasRealEmail: !isFakeEmail(authUser.email) };
});

/**
 * Đăng nhập cho tài khoản CŨ — tạo trước khi có Cloud Functions. Verify
 * HOÀN TOÀN ở server rồi "nâng cấp" sang Firebase Auth thật, giữ nguyên uid
 * (giữ nguyên balance/lịch sử). `email` là tùy chọn — nếu người dùng nhập,
 * gắn luôn làm email thật để "Quên mật khẩu" dùng được; nếu không, dùng
 * email giả tạm (nhắc họ thêm email thật sau qua addRecoveryEmail).
 */
exports.legacyLogin = functions.https.onCall(async (data) => {
    const username = (data.username || '').trim();
    const password = (data.password || '').trim();
    const email = (data.email || '').trim().toLowerCase();

    const snap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
    if (!snap.exists()) {
        throw new functions.https.HttpsError('not-found', 'Tên đăng nhập không tồn tại');
    }
    let uid = null, user = null;
    snap.forEach(c => { uid = c.key; user = c.val(); });

    if (!user.password) {
        throw new functions.https.HttpsError('failed-precondition', 'Tài khoản này đã được nâng cấp, hãy đăng nhập bình thường');
    }
    if (user.isBanned) {
        throw new functions.https.HttpsError('permission-denied', 'Tài khoản đã bị khóa');
    }

    const salt = user.passwordSalt || LEGACY_SALT;
    const expectedHash = sha256Hex(password + salt);
    if (expectedHash !== user.password) {
        throw new functions.https.HttpsError('unauthenticated', 'Sai mật khẩu');
    }

    const finalEmail = EMAIL_REGEX.test(email) ? email : toFakeEmail(username);

    try {
        await admin.auth().createUser({ uid, email: finalEmail, password, displayName: username });
    } catch (e) {
        if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') {
            console.error('legacyLogin migrate error:', e);
            throw new functions.https.HttpsError('internal', 'Có lỗi khi nâng cấp tài khoản, thử lại sau');
        }
        // Đã có Auth account rồi (VD: bấm 2 lần gần nhau) -> bỏ qua, tiếp tục
    }

    await db.ref('users/' + uid).update({ password: null, passwordSalt: null, authProvider: 'firebase' });

    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken, usedRealEmail: finalEmail === email };
});

/**
 * Cho tài khoản đang dùng email GIẢ (đăng ký trước khi có bước hỏi email,
 * hoặc nâng cấp qua legacyLogin mà không nhập email) tự thêm email thật
 * sau — để "Quên mật khẩu" dùng được. Gọi khi đã đăng nhập.
 */
exports.addRecoveryEmail = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const email = (data.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
        throw new functions.https.HttpsError('invalid-argument', 'Email không hợp lệ');
    }
    try {
        await admin.auth().updateUser(uid, { email });
    } catch (e) {
        if (e.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Email này đã được dùng cho tài khoản khác');
        }
        console.error('addRecoveryEmail error:', e);
        throw new functions.https.HttpsError('internal', 'Có lỗi khi cập nhật email');
    }
    return { status: 'ok', email };
});
