const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, sendError } = require('./_lib/http');
const { toFakeEmail, sha256Hex, LEGACY_SALT } = require('./_lib/legacy-auth-helpers');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const { username = '', password = '', email = '' } = req.body || {};
        const u = username.trim();
        const pw = password.trim();
        const em = email.trim().toLowerCase();

        const snap = await db.ref('users').orderByChild('username').equalTo(u).once('value');
        if (!snap.exists()) throw new HttpError(404, 'not-found', 'Tên đăng nhập không tồn tại');

        let uid = null, user = null;
        snap.forEach(c => { uid = c.key; user = c.val(); });

        if (!user.password) throw new HttpError(400, 'failed-precondition', 'Tài khoản này đã được nâng cấp, hãy đăng nhập bình thường');
        if (user.isBanned) throw new HttpError(403, 'permission-denied', 'Tài khoản đã bị khóa');

        const salt = user.passwordSalt || LEGACY_SALT;
        const expectedHash = sha256Hex(pw + salt);
        if (expectedHash !== user.password) throw new HttpError(401, 'unauthenticated', 'Sai mật khẩu');

        const finalEmail = EMAIL_REGEX.test(em) ? em : toFakeEmail(u);

        try {
            await admin.auth().createUser({ uid, email: finalEmail, password: pw, displayName: u });
        } catch (e) {
            if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') {
                console.error('legacyLogin migrate error:', e);
                throw new HttpError(500, 'internal', 'Có lỗi khi nâng cấp tài khoản, thử lại sau');
            }
        }

        await db.ref('users/' + uid).update({ password: null, passwordSalt: null, authProvider: 'firebase' });

        const customToken = await admin.auth().createCustomToken(uid);
        res.status(200).json({ customToken, usedRealEmail: finalEmail === em });
    } catch (e) {
        sendError(res, e);
    }
};
