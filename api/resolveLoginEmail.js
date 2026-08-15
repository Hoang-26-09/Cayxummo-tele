const { db } = require('./_lib/admin');
const { admin } = require('./_lib/admin');
const { handlePreflight, HttpError, sendError } = require('./_lib/http');
const { isFakeEmail } = require('./_lib/legacy-auth-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const username = ((req.body || {}).username || '').trim();
        if (!username) throw new HttpError(400, 'invalid-argument', 'Thiếu tên đăng nhập');

        const snap = await db.ref('users').orderByChild('username').equalTo(username).once('value');
        if (!snap.exists()) throw new HttpError(404, 'not-found', 'Tên đăng nhập không tồn tại');

        let uid = null, user = null;
        snap.forEach(c => { uid = c.key; user = c.val(); });

        if (user.password) {
            return res.status(200).json({ mode: 'legacy' });
        }

        const authUser = await admin.auth().getUser(uid);
        res.status(200).json({ mode: 'firebase', email: authUser.email, hasRealEmail: !isFakeEmail(authUser.email) });
    } catch (e) {
        sendError(res, e);
    }
};
