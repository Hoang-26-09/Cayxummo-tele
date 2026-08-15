const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, sendError } = require('./_lib/http');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const { username = '', email = '', password = '', deviceHash = null } = req.body || {};
        const u = username.trim();
        const em = email.trim().toLowerCase();
        const pw = password.trim();
        const dh = (deviceHash || '').trim() || null;

        if (u.length < 3) throw new HttpError(400, 'invalid-argument', 'Tên đăng nhập phải có ít nhất 3 ký tự');
        if (!EMAIL_REGEX.test(em)) throw new HttpError(400, 'invalid-argument', 'Email không hợp lệ');
        if (pw.length < 7) throw new HttpError(400, 'invalid-argument', 'Mật khẩu phải có ít nhất 7 ký tự');

        if (dh) {
            const deviceSnap = await db.ref('device_registrations/' + dh).once('value');
            if (deviceSnap.exists()) throw new HttpError(409, 'already-exists', 'Thiết bị này đã được dùng để tạo 1 tài khoản rồi!');
        }

        const usernameSnap = await db.ref('users').orderByChild('username').equalTo(u).once('value');
        if (usernameSnap.exists()) throw new HttpError(409, 'already-exists', 'Tên đăng nhập đã tồn tại!');

        let userRecord;
        try {
            userRecord = await admin.auth().createUser({ email: em, password: pw, displayName: u });
        } catch (e) {
            if (e.code === 'auth/email-already-exists') throw new HttpError(409, 'already-exists', 'Email này đã được dùng cho tài khoản khác!');
            console.error('registerUser error:', e);
            throw new HttpError(500, 'internal', 'Có lỗi khi tạo tài khoản, thử lại sau');
        }

        const uid = userRecord.uid;
        const now = Date.now();
        const updates = {};
        updates['users/' + uid] = {
            id: uid, username: u, balance: 0,
            dailyStreak: 0, lastDaily: '', completedLinks: 0,
            totalLinksWeekly: 0, totalLinksAllTime: 0,
            friends: [], invitedBy: '', codesUsed: [], giftCodesUsed: [],
            lastLinkTime: 0, chestsOpened: 0, isBanned: false,
            createdAt: now, friendsCount: 0,
            registrationDeviceHash: dh,
            authProvider: 'firebase'
        };
        if (dh) updates['device_registrations/' + dh] = { uid, username: u, createdAt: now };
        await db.ref().update(updates);

        res.status(200).json({ uid, email: em });
    } catch (e) {
        sendError(res, e);
    }
};
