const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, sendError } = require('./_lib/http');
const { verifyTelegramInitData } = require('./_lib/telegram');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const initData = (req.body || {}).initData;
        if (!initData) throw new HttpError(400, 'invalid-argument', 'Thiếu initData');

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            console.error('TELEGRAM_BOT_TOKEN chưa được cấu hình trên Vercel');
            throw new HttpError(500, 'internal', 'Server chưa cấu hình xong, báo admin');
        }

        const tgUser = verifyTelegramInitData(initData, botToken);
        if (!tgUser || !tgUser.id) throw new HttpError(401, 'unauthenticated', 'Dữ liệu Telegram không hợp lệ hoặc đã hết hạn, mở lại app');

        const uid = String(tgUser.id);
        const displayName = tgUser.username || tgUser.first_name || 'User';

        try {
            await admin.auth().getUser(uid);
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                await admin.auth().createUser({ uid, displayName });
            } else {
                console.error('telegramLogin createUser error:', e);
                throw new HttpError(500, 'internal', 'Có lỗi khi tạo tài khoản');
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
            await db.ref('users/' + uid).update({ authProvider: 'firebase' });
        }

        const customToken = await admin.auth().createCustomToken(uid);
        res.status(200).json({ customToken, username: displayName });
    } catch (e) {
        sendError(res, e);
    }
};
