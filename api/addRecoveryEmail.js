const { admin } = require('./_lib/admin');
const { handlePreflight, HttpError, sendError, requireAuth } = require('./_lib/http');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const email = ((req.body || {}).email || '').trim().toLowerCase();
        if (!EMAIL_REGEX.test(email)) throw new HttpError(400, 'invalid-argument', 'Email không hợp lệ');

        try {
            await admin.auth().updateUser(uid, { email });
        } catch (e) {
            if (e.code === 'auth/email-already-exists') throw new HttpError(409, 'already-exists', 'Email này đã được dùng cho tài khoản khác');
            console.error('addRecoveryEmail error:', e);
            throw new HttpError(500, 'internal', 'Có lỗi khi cập nhật email');
        }

        res.status(200).json({ status: 'ok', email });
    } catch (e) {
        sendError(res, e);
    }
};
