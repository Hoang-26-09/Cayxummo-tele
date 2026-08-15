const { db } = require('./_lib/admin');
const { handlePreflight, HttpError, requireAuth, sendError } = require('./_lib/http');
const { getConfig, requireActiveUser } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const typeId = ((req.body || {}).typeId || '').trim();
        if (!typeId) throw new HttpError(400, 'invalid-argument', 'Thiếu loại link');

        const user = await requireActiveUser(uid);
        const config = await getConfig();
        const linkTypes = config.linkTypes || {};
        const ltCfg = linkTypes[typeId];
        if (!ltCfg || ltCfg.active === false) throw new HttpError(400, 'failed-precondition', 'Loại link không khả dụng');

        const linkCooldown = config.linkCooldown || 300000;
        if (user.lastCodeTime && Date.now() - user.lastCodeTime < linkCooldown) {
            throw new HttpError(400, 'failed-precondition', 'Đang trong thời gian chờ giữa các link');
        }

        const today = new Date().toDateString();
        const dck = `linkDaily_${typeId}`;
        const dcdk = `linkDailyDate_${typeId}`;
        const countToday = (user[dcdk] === today) ? (user[dck] || 0) : 0;
        const maxPerDay = ltCfg.maxPerDay || 1;
        if (countToday >= maxPerDay) throw new HttpError(400, 'failed-precondition', `Hết lượt ${ltCfg.name} hôm nay!`);

        const poolSnap = await db.ref(`code_pools/${typeId}`).once('value');
        const pool = poolSnap.val() || {};
        const resetMs = (config.codeResetDays || 30) * 86400000;
        const now = Date.now();
        const available = Object.keys(pool).filter(c => !pool[c].usedAt || (now - pool[c].usedAt > resetMs));
        if (available.length === 0) throw new HttpError(409, 'resource-exhausted', `Hết mã cho ${ltCfg.name}!`);
        const code = available[Math.floor(Math.random() * available.length)];

        await db.ref(`code_pools/${typeId}/${code}`).update({
            used: true, usedAt: now, usedCount: (pool[code].usedCount || 0) + 1
        });
        await db.ref('users/' + uid).update({ lastLinkTime: now, currentTaskCode: code, currentTaskType: typeId });

        res.status(200).json({ url: (ltCfg.url || '').replace('{code}', code), typeId });
    } catch (e) {
        sendError(res, e);
    }
};
