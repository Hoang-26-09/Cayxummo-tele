const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, requireAuth, sendError } = require('./_lib/http');
const { requireActiveUser, pushTransaction } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const code = ((req.body || {}).code || '').trim();
        if (!code) throw new HttpError(400, 'invalid-argument', 'Thiếu mã');

        const giftSnap = await db.ref('gift_codes/' + code).once('value');
        if (!giftSnap.exists()) return res.status(200).json({ status: 'invalid' });
        const gift = giftSnap.val();
        if (!gift.active) return res.status(200).json({ status: 'inactive' });
        if (gift.expiry && Date.now() > gift.expiry) return res.status(200).json({ status: 'expired' });
        if ((gift.usedCount || 0) >= gift.maxUses) return res.status(200).json({ status: 'full' });

        const user = await requireActiveUser(uid);
        if ((user.giftCodesUsed || []).includes(code)) return res.status(200).json({ status: 'used' });

        await db.ref('users/' + uid).update({
            balance: admin.database.ServerValue.increment(gift.reward),
            giftCodesUsed: [...(user.giftCodesUsed || []), code]
        });
        await db.ref('gift_codes/' + code + '/usedCount').set((gift.usedCount || 0) + 1);
        await pushTransaction(uid, 'gift', gift.reward, `Nhận Gift Code: ${code}`);
        res.status(200).json({ status: 'ok', reward: gift.reward });
    } catch (e) {
        sendError(res, e);
    }
};
