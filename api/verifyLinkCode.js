const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, requireAuth, sendError } = require('./_lib/http');
const { getConfig, requireActiveUser, pushTransaction, bumpLeaderboard } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const code = ((req.body || {}).code || '').trim();
        if (!code) throw new HttpError(400, 'invalid-argument', 'Thiếu mã');

        const user = await requireActiveUser(uid);

        if (!user.currentTaskCode || !user.currentTaskType) return res.status(200).json({ status: 'no_task', message: 'Nhấn LẤY LINK trước!' });
        if (user.currentTaskCode !== code) return res.status(200).json({ status: 'wrong_code', message: 'Mã không đúng!' });

        const config = await getConfig();
        const linkCooldown = config.linkCooldown || 300000;
        if (user.lastCodeTime && Date.now() - user.lastCodeTime < linkCooldown) {
            const left = Math.ceil((linkCooldown - (Date.now() - user.lastCodeTime)) / 60000);
            return res.status(200).json({ status: 'cooldown', message: `Đợi ${left} phút nữa!` });
        }

        const ltId = user.currentTaskType;
        const ltCfg = (config.linkTypes || {})[ltId];
        if (!ltCfg) return res.status(200).json({ status: 'invalid_type', message: 'Loại link không còn tồn tại' });

        const reward = ltCfg.reward || 100;
        const today = new Date().toDateString();
        const dck = `linkDaily_${ltId}`;
        const dcdk = `linkDailyDate_${ltId}`;
        const countToday = (user[dcdk] === today) ? (user[dck] || 0) : 0;
        const maxPerDay = ltCfg.maxPerDay || 1;
        if (countToday >= maxPerDay) return res.status(200).json({ status: 'limit', message: `Hết lượt ${ltCfg.name}!` });

        await db.ref('users/' + uid).update({
            balance: admin.database.ServerValue.increment(reward),
            completedLinks: admin.database.ServerValue.increment(1),
            totalLinksWeekly: admin.database.ServerValue.increment(1),
            totalLinksAllTime: admin.database.ServerValue.increment(1),
            lastCodeTime: Date.now(),
            codesUsed: [...(user.codesUsed || []), code],
            [dck]: countToday + 1,
            [dcdk]: today,
            currentTaskCode: null,
            currentTaskType: null
        });
        await pushTransaction(uid, 'task', reward, `Vượt link [${ltCfg.name}]: ${code}`);
        await bumpLeaderboard(uid, user.username, 1);

        res.status(200).json({ status: 'ok', reward });
    } catch (e) {
        sendError(res, e);
    }
};
