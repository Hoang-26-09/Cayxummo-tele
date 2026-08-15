const { admin, db } = require('./admin');
const { HttpError } = require('./http');

async function getConfig() {
    const snap = await db.ref('admin_config').once('value');
    return snap.val() || {};
}

async function requireActiveUser(uid) {
    const snap = await db.ref('users/' + uid).once('value');
    const user = snap.val();
    if (!user) throw new HttpError(404, 'not-found', 'Không tìm thấy tài khoản');
    if (user.isBanned) throw new HttpError(403, 'permission-denied', 'Tài khoản đã bị khóa');
    return user;
}

async function pushTransaction(uid, type, amount, detail) {
    await db.ref('transactions/' + uid).push({
        type, amount, detail, timestamp: admin.database.ServerValue.TIMESTAMP
    });
}

async function bumpLeaderboard(uid, username, delta) {
    await db.ref('leaderboard/' + uid).transaction(current => {
        if (current === null) return { userId: uid, username, links: delta, updatedAt: Date.now() };
        return { ...current, links: (current.links || 0) + delta, username, updatedAt: Date.now() };
    });
}

module.exports = { getConfig, requireActiveUser, pushTransaction, bumpLeaderboard };
