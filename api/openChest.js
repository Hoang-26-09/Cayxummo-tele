const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, requireAuth, sendError } = require('./_lib/http');
const { getConfig, requireActiveUser, pushTransaction } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const user = await requireActiveUser(uid);
        const config = await getConfig();
        const linksForChest = config.linksForChest || 5;
        const chestRewards = config.chestRewards || [50, 80, 100, 150, 200, 300, 500, 1000];

        const completedLinks = user.completedLinks || 0;
        if (Math.floor(completedLinks / linksForChest) === 0) throw new HttpError(400, 'failed-precondition', 'Chưa đủ link để mở rương!');

        const reward = chestRewards[Math.floor(Math.random() * chestRewards.length)];
        await db.ref('users/' + uid).update({
            balance: admin.database.ServerValue.increment(reward),
            chestsOpened: admin.database.ServerValue.increment(1),
            completedLinks: completedLinks - linksForChest
        });
        await pushTransaction(uid, 'chest', reward, `Mở rương nhận ${reward}🪙`);
        res.status(200).json({ status: 'ok', reward });
    } catch (e) {
        sendError(res, e);
    }
};
