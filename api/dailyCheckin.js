const { admin, db } = require('./_lib/admin');
const { handlePreflight, requireAuth, sendError } = require('./_lib/http');
const { getConfig, requireActiveUser, pushTransaction } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const user = await requireActiveUser(uid);
        const config = await getConfig();
        const dailyRewards = config.dailyRewards || [50, 50, 50, 50, 100, 150, 300];

        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (user.lastDaily === today) return res.status(200).json({ status: 'already' });

        const streak = user.lastDaily === yesterday ? (user.dailyStreak >= 7 ? 1 : user.dailyStreak + 1) : 1;
        const reward = dailyRewards[streak - 1] || 0;

        await db.ref('users/' + uid).update({
            dailyStreak: streak,
            lastDaily: today,
            balance: admin.database.ServerValue.increment(reward)
        });
        await pushTransaction(uid, 'daily', reward, `Điểm danh ngày ${streak}`);
        res.status(200).json({ status: 'ok', streak, reward });
    } catch (e) {
        sendError(res, e);
    }
};
