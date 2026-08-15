const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, requireAuth, sendError } = require('./_lib/http');
const { getConfig, requireActiveUser, pushTransaction } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const friendId = ((req.body || {}).friendId || '').trim();
        if (!friendId || friendId === uid) throw new HttpError(400, 'invalid-argument', 'Không thể tự mời chính mình!');

        const friendSnap = await db.ref('users/' + friendId).once('value');
        if (!friendSnap.exists()) return res.status(200).json({ status: 'error', message: 'Người dùng không tồn tại!' });

        const user = await requireActiveUser(uid);
        const friends = user.friends || [];
        if (friends.includes(friendId)) return res.status(200).json({ status: 'already' });
        friends.push(friendId);

        const config = await getConfig();
        const friendRewards = config.friendRewards || { 2: 100, 5: 300, 10: 1000 };
        let bonus = 0;
        for (const [k, v] of Object.entries(friendRewards)) {
            if (friends.length === parseInt(k, 10)) { bonus = v; break; }
        }

        const updates = { friends, friendsCount: friends.length };
        if (bonus > 0) updates.balance = admin.database.ServerValue.increment(bonus);
        await db.ref('users/' + uid).update(updates);

        if (bonus > 0) {
            await pushTransaction(uid, 'friend', bonus, `Thưởng mời bạn (${friends.length} bạn)`);
            return res.status(200).json({ status: 'reward', count: friends.length, bonus });
        }
        res.status(200).json({ status: 'ok', count: friends.length });
    } catch (e) {
        sendError(res, e);
    }
};
