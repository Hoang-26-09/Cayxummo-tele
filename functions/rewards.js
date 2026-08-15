const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.database();

function requireAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vui lòng đăng nhập lại');
    }
    return context.auth.uid;
}

async function getConfig() {
    const snap = await db.ref('admin_config').once('value');
    return snap.val() || {};
}

async function requireActiveUser(uid) {
    const snap = await db.ref('users/' + uid).once('value');
    const user = snap.val();
    if (!user) throw new functions.https.HttpsError('not-found', 'Không tìm thấy tài khoản');
    if (user.isBanned) throw new functions.https.HttpsError('permission-denied', 'Tài khoản đã bị khóa');
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

// ==================== ĐIỂM DANH ====================
exports.dailyCheckin = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const user = await requireActiveUser(uid);
    const config = await getConfig();
    const dailyRewards = config.dailyRewards || [50, 50, 50, 50, 100, 150, 300];

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (user.lastDaily === today) return { status: 'already' };

    const streak = user.lastDaily === yesterday ? (user.dailyStreak >= 7 ? 1 : user.dailyStreak + 1) : 1;
    const reward = dailyRewards[streak - 1] || 0;

    await db.ref('users/' + uid).update({
        dailyStreak: streak,
        lastDaily: today,
        balance: admin.database.ServerValue.increment(reward)
    });
    await pushTransaction(uid, 'daily', reward, `Điểm danh ngày ${streak}`);
    return { status: 'ok', streak, reward };
});

// ==================== LẤY LINK (bước 1: nhận mã + mở URL) ====================
exports.claimLinkTask = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const typeId = (data.typeId || '').trim();
    if (!typeId) throw new functions.https.HttpsError('invalid-argument', 'Thiếu loại link');

    const user = await requireActiveUser(uid);
    const config = await getConfig();
    const linkTypes = config.linkTypes || {};
    const ltCfg = linkTypes[typeId];
    if (!ltCfg || ltCfg.active === false) {
        throw new functions.https.HttpsError('failed-precondition', 'Loại link không khả dụng');
    }

    const linkCooldown = config.linkCooldown || 300000;
    if (user.lastCodeTime && Date.now() - user.lastCodeTime < linkCooldown) {
        throw new functions.https.HttpsError('failed-precondition', 'Đang trong thời gian chờ giữa các link');
    }

    const today = new Date().toDateString();
    const dck = `linkDaily_${typeId}`;
    const dcdk = `linkDailyDate_${typeId}`;
    const countToday = (user[dcdk] === today) ? (user[dck] || 0) : 0;
    const maxPerDay = ltCfg.maxPerDay || 1;
    if (countToday >= maxPerDay) {
        throw new functions.https.HttpsError('failed-precondition', `Hết lượt ${ltCfg.name} hôm nay!`);
    }

    const poolSnap = await db.ref(`code_pools/${typeId}`).once('value');
    const pool = poolSnap.val() || {};
    const resetMs = (config.codeResetDays || 30) * 86400000;
    const now = Date.now();
    const available = Object.keys(pool).filter(c => !pool[c].usedAt || (now - pool[c].usedAt > resetMs));
    if (available.length === 0) {
        throw new functions.https.HttpsError('resource-exhausted', `Hết mã cho ${ltCfg.name}!`);
    }
    const code = available[Math.floor(Math.random() * available.length)];

    await db.ref(`code_pools/${typeId}/${code}`).update({
        used: true, usedAt: now, usedCount: (pool[code].usedCount || 0) + 1
    });
    await db.ref('users/' + uid).update({
        lastLinkTime: now,
        currentTaskCode: code,
        currentTaskType: typeId
    });

    return { url: (ltCfg.url || '').replace('{code}', code), typeId };
});

// ==================== XÁC NHẬN MÃ (bước 2: nhận thưởng) ====================
exports.verifyLinkCode = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const code = (data.code || '').trim();
    if (!code) throw new functions.https.HttpsError('invalid-argument', 'Thiếu mã');

    const user = await requireActiveUser(uid);

    if (!user.currentTaskCode || !user.currentTaskType) {
        return { status: 'no_task', message: 'Nhấn LẤY LINK trước!' };
    }
    if (user.currentTaskCode !== code) {
        return { status: 'wrong_code', message: 'Mã không đúng!' };
    }

    const config = await getConfig();
    const linkCooldown = config.linkCooldown || 300000;
    if (user.lastCodeTime && Date.now() - user.lastCodeTime < linkCooldown) {
        const left = Math.ceil((linkCooldown - (Date.now() - user.lastCodeTime)) / 60000);
        return { status: 'cooldown', message: `Đợi ${left} phút nữa!` };
    }

    const ltId = user.currentTaskType;
    const ltCfg = (config.linkTypes || {})[ltId];
    if (!ltCfg) return { status: 'invalid_type', message: 'Loại link không còn tồn tại' };

    const reward = ltCfg.reward || 100;
    const today = new Date().toDateString();
    const dck = `linkDaily_${ltId}`;
    const dcdk = `linkDailyDate_${ltId}`;
    const countToday = (user[dcdk] === today) ? (user[dck] || 0) : 0;
    const maxPerDay = ltCfg.maxPerDay || 1;
    if (countToday >= maxPerDay) return { status: 'limit', message: `Hết lượt ${ltCfg.name}!` };

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

    return { status: 'ok', reward };
});

// ==================== MỞ RƯƠNG ====================
exports.openChest = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const user = await requireActiveUser(uid);
    const config = await getConfig();
    const linksForChest = config.linksForChest || 5;
    const chestRewards = config.chestRewards || [50, 80, 100, 150, 200, 300, 500, 1000];

    const completedLinks = user.completedLinks || 0;
    if (Math.floor(completedLinks / linksForChest) === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Chưa đủ link để mở rương!');
    }
    const reward = chestRewards[Math.floor(Math.random() * chestRewards.length)];
    await db.ref('users/' + uid).update({
        balance: admin.database.ServerValue.increment(reward),
        chestsOpened: admin.database.ServerValue.increment(1),
        completedLinks: completedLinks - linksForChest
    });
    await pushTransaction(uid, 'chest', reward, `Mở rương nhận ${reward}🪙`);
    return { status: 'ok', reward };
});

// ==================== GIFT CODE ====================
exports.redeemGiftCode = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const code = (data.code || '').trim();
    if (!code) throw new functions.https.HttpsError('invalid-argument', 'Thiếu mã');

    const giftSnap = await db.ref('gift_codes/' + code).once('value');
    if (!giftSnap.exists()) return { status: 'invalid' };
    const gift = giftSnap.val();
    if (!gift.active) return { status: 'inactive' };
    if (gift.expiry && Date.now() > gift.expiry) return { status: 'expired' };
    if ((gift.usedCount || 0) >= gift.maxUses) return { status: 'full' };

    const user = await requireActiveUser(uid);
    if ((user.giftCodesUsed || []).includes(code)) return { status: 'used' };

    await db.ref('users/' + uid).update({
        balance: admin.database.ServerValue.increment(gift.reward),
        giftCodesUsed: [...(user.giftCodesUsed || []), code]
    });
    await db.ref('gift_codes/' + code + '/usedCount').set((gift.usedCount || 0) + 1);
    await pushTransaction(uid, 'gift', gift.reward, `Nhận Gift Code: ${code}`);
    return { status: 'ok', reward: gift.reward };
});

// ==================== MỜI BẠN ====================
exports.addFriend = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const friendId = (data.friendId || '').trim();
    if (!friendId || friendId === uid) {
        throw new functions.https.HttpsError('invalid-argument', 'Không thể tự mời chính mình!');
    }
    const friendSnap = await db.ref('users/' + friendId).once('value');
    if (!friendSnap.exists()) return { status: 'error', message: 'Người dùng không tồn tại!' };

    const user = await requireActiveUser(uid);
    const friends = user.friends || [];
    if (friends.includes(friendId)) return { status: 'already' };
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
        return { status: 'reward', count: friends.length, bonus };
    }
    return { status: 'ok', count: friends.length };
});

// ==================== RÚT 🪙 ====================
exports.requestWithdraw = functions.https.onCall(async (data, context) => {
    const uid = requireAuth(context);
    const amount = parseInt(data.amount, 10);
    const { bank, accountName, accountNumber } = data;
    if (!bank || !accountName || !accountNumber || !amount) {
        throw new functions.https.HttpsError('invalid-argument', 'Điền đầy đủ thông tin!');
    }

    const config = await getConfig();
    const minWithdraw = config.minWithdraw || 20000;
    const maxWithdraw = config.maxWithdraw || 100000;
    const rate = config.exchange_rate || 10;
    if (amount < minWithdraw || amount > maxWithdraw) {
        throw new functions.https.HttpsError('invalid-argument', 'Số 🪙 không hợp lệ');
    }

    const user = await requireActiveUser(uid);
    if ((user.balance || 0) < amount) {
        throw new functions.https.HttpsError('failed-precondition', 'Không đủ số dư');
    }

    const ref = db.ref('withdraw_requests').push();
    await ref.set({
        userId: uid, username: user.username, bank, accountName, accountNumber,
        amountXu: amount, amountVnd: amount * rate, exchangeRate: rate,
        status: 'pending', createdAt: admin.database.ServerValue.TIMESTAMP
    });
    await db.ref('users/' + uid + '/balance').set(admin.database.ServerValue.increment(-amount));
    await pushTransaction(uid, 'withdraw', -amount, `Rút ${amount}🪙`);
    return { status: 'ok', id: ref.key };
});
