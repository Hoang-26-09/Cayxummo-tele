class FirebaseManager {
    constructor() {
        if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
        this.db = firebase.database();
    }
    async createUser(uid, data) {
        const ref = this.db.ref(`users/${uid}`);
        const snap = await ref.once('value');
        if (!snap.exists()) {
            await ref.set({
                id: uid, username: data.username || 'Unknown',
                balance: 0, dailyStreak: 0, lastDaily: '',
                completedLinks: 0, totalLinksWeekly: 0,
                friends: [], invitedBy: '', codesUsed: [],
                lastLinkTime: 0, chestsOpened: 0,
                isBanned: false, createdAt: Date.now()
            });
        }
        return (await ref.once('value')).val();
    }
    async getUser(uid) {
        const snap = await this.db.ref(`users/${uid}`).once('value');
        return snap.val();
    }
    async updateUser(uid, data) {
        await this.db.ref(`users/${uid}`).update(data);
    }
    async addBalance(uid, amount) {
        const ref = this.db.ref(`users/${uid}/balance`);
        const snap = await ref.once('value');
        const newBal = Math.max(0, (snap.val() || 0) + amount);
        await ref.set(newBal);
        return newBal;
    }
    async isAdmin(uid) {
        const snap = await this.db.ref('admin_config/admin_ids').once('value');
        return (snap.val() || []).includes(uid);
    }
    async dailyCheckin(uid) {
        const user = await this.getUser(uid);
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (user.lastDaily === today) return { status: 'already' };
        let streak = user.lastDaily === yesterday ? (user.dailyStreak >= 7 ? 1 : user.dailyStreak + 1) : 1;
        const reward = CONFIG.DAILY_REWARDS[streak - 1];
        await this.updateUser(uid, { dailyStreak: streak, lastDaily: today, balance: (user.balance || 0) + reward });
        return { status: 'ok', streak, reward };
    }
    async getTasks() {
        const snap = await this.db.ref('tasks').once('value');
        return snap.val() || {};
    }
    async verifyCode(uid, code) {
        const tasks = await this.getTasks();
        let task = null;
        for (let id in tasks) { if (tasks[id].code === code && tasks[id].active !== false) { task = tasks[id]; break; } }
        if (!task) return { status: 'invalid' };
        const user = await this.getUser(uid);
        if ((user.codesUsed || []).includes(code)) return { status: 'used' };
        if (user.lastLinkTime && Date.now() - user.lastLinkTime < CONFIG.LINK_COOLDOWN) {
            const left = Math.ceil((CONFIG.LINK_COOLDOWN - (Date.now() - user.lastLinkTime)) / 60000);
            return { status: 'cooldown', message: `Đợi ${left} phút` };
        }
        const reward = task.reward || 100;
        const codesUsed = [...(user.codesUsed || []), code];
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            completedLinks: (user.completedLinks || 0) + 1,
            totalLinksWeekly: (user.totalLinksWeekly || 0) + 1,
            lastLinkTime: Date.now(),
            codesUsed
        });
        await this.updateLeaderboard(uid, (user.totalLinksWeekly || 0) + 1);
        const canOpenChest = ((user.completedLinks || 0) + 1) % CONFIG.LINKS_FOR_CHEST === 0;
        return { status: 'ok', reward, totalLinks: (user.totalLinksWeekly || 0) + 1, canOpenChest };
    }
    async openChest(uid) {
        const user = await this.getUser(uid);
        if ((user.completedLinks || 0) < CONFIG.LINKS_FOR_CHEST) return { status: 'error', message: 'Chưa đủ link!' };
        const rewards = [50, 80, 100, 150, 200, 300, 500, 1000];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];
        await this.updateUser(uid, { balance: (user.balance || 0) + reward, chestsOpened: (user.chestsOpened || 0) + 1 });
        return { status: 'ok', reward };
    }
    async addFriend(uid, friendId) {
        if (uid === friendId) return { status: 'error' };
        const user = await this.getUser(uid);
        const friends = user.friends || [];
        if (friends.includes(friendId)) return { status: 'already' };
        friends.push(friendId);
        await this.updateUser(uid, { friends });
        let bonus = 0;
        for (let [k, v] of Object.entries(CONFIG.FRIEND_REWARDS)) { if (friends.length === parseInt(k)) { bonus = v; break; } }
        if (bonus > 0) { await this.addBalance(uid, bonus); return { status: 'reward', count: friends.length, bonus }; }
        return { status: 'ok', count: friends.length };
    }
    async redeemGiftCode(uid, code) {
        const snap = await this.db.ref(`gift_codes/${code}`).once('value');
        if (!snap.exists()) return { status: 'invalid' };
        const gift = snap.val();
        if (!gift.active) return { status: 'inactive' };
        if (gift.expiry && Date.now() > gift.expiry) return { status: 'expired' };
        if ((gift.usedCount || 0) >= gift.maxUses) return { status: 'full' };
        const user = await this.getUser(uid);
        if ((user.giftCodesUsed || []).includes(code)) return { status: 'used' };
        await this.addBalance(uid, gift.reward);
        await this.updateUser(uid, { giftCodesUsed: [...(user.giftCodesUsed || []), code] });
        await this.db.ref(`gift_codes/${code}/usedCount`).set((gift.usedCount || 0) + 1);
        return { status: 'ok', reward: gift.reward };
    }
    async requestWithdraw(uid, data) {
        const user = await this.getUser(uid);
        const amount = parseInt(data.amount);
        if (amount < CONFIG.MIN_WITHDRAW || amount > CONFIG.MAX_WITHDRAW) return { status: 'error', message: 'Số xu không hợp lệ' };
        if (user.balance < amount) return { status: 'error', message: 'Không đủ số dư' };
        const rateSnap = await this.db.ref('admin_config/exchange_rate').once('value');
        const rate = rateSnap.val() || CONFIG.DEFAULT_EXCHANGE_RATE;
        const ref = this.db.ref('withdraw_requests').push();
        await ref.set({
            userId: uid, username: user.username, bank: data.bank, accountName: data.accountName,
            accountNumber: data.accountNumber, amountXu: amount, amountVnd: amount * rate,
            exchangeRate: rate, status: 'pending', createdAt: Date.now()
        });
        await this.addBalance(uid, -amount);
        return { status: 'ok', id: ref.key };
    }
    async getWithdrawHistory(uid) {
        const snap = await this.db.ref('withdraw_requests').orderByChild('userId').equalTo(uid).once('value');
        const arr = [];
        snap.forEach(c => arr.push({ id: c.key, ...c.val() }));
        return arr.reverse();
    }
    async updateLeaderboard(uid, links) {
        const user = await this.getUser(uid);
        await this.db.ref(`leaderboard/${uid}`).set({ userId: uid, username: user?.username || 'Unknown', links, updatedAt: Date.now() });
    }
    async getTopLinks(limit = 10) {
        const snap = await this.db.ref('leaderboard').orderByChild('links').limitToLast(limit).once('value');
        const arr = [];
        snap.forEach(c => arr.push({ id: c.key, ...c.val() }));
        return arr.reverse();
    }
    async getTopFriends(limit = 10) {
        const snap = await this.db.ref('users').once('value');
        const arr = [];
        snap.forEach(c => { const u = c.val(); arr.push({ userId: c.key, username: u.username, friends: (u.friends || []).length }); });
        arr.sort((a, b) => b.friends - a.friends);
        return arr.slice(0, limit);
    }
    async getDashboard() {
        const usersSnap = await this.db.ref('users').once('value');
        const users = usersSnap.val() || {};
        let totalUsers = Object.keys(users).length, totalBalance = 0, totalLinks = 0;
        Object.values(users).forEach(u => { totalBalance += u.balance || 0; totalLinks += u.totalLinksAllTime || 0; });
        const fundSnap = await this.db.ref('prize_fund').once('value');
        const fund = fundSnap.val() || 0;
        let pending = 0;
        const wSnap = await this.db.ref('withdraw_requests').orderByChild('status').equalTo('pending').once('value');
        wSnap.forEach(() => pending++);
        return { totalUsers, totalBalance, totalLinks, prizeFund: fund, pendingWithdraws: pending };
    }
    async createPvPMatch(data) {
        const ref = this.db.ref('pvp_matches').push();
        await ref.set({ ...data, status: 'waiting', createdAt: Date.now() });
        return ref.key;
    }
    async getPvPMatch(id) { return (await this.db.ref(`pvp_matches/${id}`).once('value')).val(); }
    async updatePvPMatch(id, data) { await this.db.ref(`pvp_matches/${id}`).update(data); }
}
const FB = new FirebaseManager();