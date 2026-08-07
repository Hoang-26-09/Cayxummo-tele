// ==================== CẤU HÌNH MẶC ĐỊNH ====================
const DEFAULT_CONFIG = {
    dailyRewards: [50, 50, 50, 50, 100, 150, 300],
    linksForChest: 5,
    linkCooldown: 300000,
    maxCodesPerDay: 20,
    chestRewards: [50, 80, 100, 150, 200, 300, 500, 1000],
    friendRewards: { 2: 100, 5: 300, 10: 1000 },
    maxFriendsPerDay: 50,
    minBet: 100,
    maxBet: 100000,
    pvpFee: 0.1,
    pvpTimeout: 30,
    minWithdraw: 20000,
    maxWithdraw: 100000,
    maxWithdrawPerDay: 3,
    exchange_rate: 10,
    starColor: '#5f91ff',
    bgColor1: '#1b2735',
    bgColor2: '#090a0f',
    linkTypes: {
        'link4m': {
            name: 'Link4m',
            maxPerDay: 2,
            icon: '🔗',
            color: '#5f91ff',
            active: true,
            url: 'https://link4m.co/st?api=6a6dd555d01b2011a600d9e6&url=https://cayxugiftcode.vercel.app/?code={code}'
        },
        'layma': {
            name: 'Layma.net',
            maxPerDay: 2,
            icon: '🔗',
            color: '#ffd700',
            active: true,
            url: 'https://layma.net/st?api=xxx&url=https://cayxugiftcode.vercel.app/?code={code}'
        },
        'link4sub': {
            name: 'Link4sub',
            maxPerDay: 1,
            icon: '🔗',
            color: '#2ed573',
            active: true,
            url: 'https://link4sub.co/st?api=xxx&url=https://cayxugiftcode.vercel.app/?code={code}'
        },
        'traffic': {
            name: 'Traffic',
            maxPerDay: 3,
            icon: '🔗',
            color: '#ff6b81',
            active: true,
            url: 'https://traffic.com/st?api=xxx&url=https://cayxugiftcode.vercel.app/?code={code}'
        }
    },
    autoResetHour: 3
};

let CONFIG = { ...DEFAULT_CONFIG };

// ==================== FIREBASE ====================
const firebaseConfig = {
    apiKey: "AIzaSyCbevkIQrQ7vw7RegFrYfTL86z-8feHtUM",
    authDomain: "cay-xu-mmo.firebaseapp.com",
    databaseURL: "https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cay-xu-mmo",
    storageBucket: "cay-xu-mmo.firebasestorage.app",
    messagingSenderId: "186442076157",
    appId: "1:186442076157:web:52d64c0239b0ae2d35d394",
    measurementId: "G-KLCC12WSG5"
};

// ==================== BẮT LỖI ====================
window.onerror = function(msg, url, line) {
    document.getElementById('loadingScreen').innerHTML =
        `<div style="color:red;padding:20px;"><h3>❌ Lỗi JavaScript:</h3><p>${msg}</p><p>Dòng: ${line}</p></div>`;
};

// ==================== RATE LIMITER ====================
class RateLimiter {
    constructor() {
        this.requests = new Map();
    }

    check(key, maxRequests = 10, timeWindow = 60000) {
        const now = Date.now();
        if (!this.requests.has(key)) {
            this.requests.set(key, []);
        }
        const timestamps = this.requests.get(key);
        const valid = timestamps.filter(t => now - t < timeWindow);
        if (valid.length >= maxRequests) {
            return false;
        }
        valid.push(now);
        this.requests.set(key, valid);
        return true;
    }
}
const rateLimiter = new RateLimiter();

// ==================== CODE MANAGER ====================
class CodeManager {
    constructor() {
        this.db = firebase.database();
    }

    async checkCode(uid, code) {
        const snap = await this.db.ref('code_usage/' + code).once('value');
        const codeData = snap.val();

        if (!codeData) {
            return { valid: true, isNew: true };
        }

        if (codeData.users && codeData.users[uid]) {
            const usedDate = codeData.users[uid];
            const now = Date.now();
            const oneMonth = 30 * 24 * 60 * 60 * 1000;

            if (now - usedDate >= oneMonth) {
                return { valid: true, isNew: false, canReuse: true };
            }

            return { valid: false, reason: 'used' };
        }

        return { valid: true, isNew: true };
    }

    async markCodeUsed(uid, code) {
        const ref = this.db.ref('code_usage/' + code);
        const snap = await ref.once('value');
        const data = snap.val() || {};

        if (!data.users) data.users = {};
        data.users[uid] = Date.now();
        data.totalUses = (data.totalUses || 0) + 1;
        data.lastUsed = Date.now();

        await ref.set(data);
        return true;
    }

    async getCodeByType(typeId) {
        const snap = await this.db.ref('code_file/codes').once('value');
        const codes = snap.val() || {};
        
        const available = Object.keys(codes).filter(key => {
            const c = codes[key];
            return c.type === typeId && c.usedCount < c.maxUses && c.active !== false;
        });

        if (available.length === 0) return null;
        
        const randomCode = available[Math.floor(Math.random() * available.length)];
        return { code: randomCode, data: codes[randomCode] };
    }

    async markCodeFileUsed(code) {
        await this.db.ref('code_file/codes/' + code + '/usedCount').transaction(current => {
            return (current || 0) + 1;
        });
    }

    async importMaFile(fileContent, typeId = 'link4m') {
        const lines = fileContent.split('\n');
        const codes = {};
        let totalCodes = 0;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            if (line.startsWith('#')) continue;

            const code = line.trim();
            if (code) {
                codes[code] = {
                    type: typeId,
                    usedCount: 0,
                    maxUses: 1,
                    active: true,
                    importedAt: Date.now()
                };
                totalCodes++;
            }
        }

        return { codes, totalCodes };
    }

    async getCodeStats() {
        const snap = await this.db.ref('code_file/codes').once('value');
        const codes = snap.val() || {};
        const stats = {
            total: 0,
            used: 0,
            available: 0,
            byType: {}
        };

        for (let [key, c] of Object.entries(codes)) {
            stats.total++;
            if (c.usedCount > 0) stats.used++;
            else stats.available++;
            
            if (!stats.byType[c.type]) {
                stats.byType[c.type] = { total: 0, used: 0, available: 0 };
            }
            stats.byType[c.type].total++;
            if (c.usedCount > 0) stats.byType[c.type].used++;
            else stats.byType[c.type].available++;
        }

        return stats;
    }
}

const codeManager = new CodeManager();

// ==================== FIREBASE MANAGER ====================
class FirebaseManager {
    constructor() {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        this.db = firebase.database();
        this.initAutoReset();
    }

    async loadConfig() {
        const snap = await this.db.ref('admin_config').once('value');
        const saved = snap.val() || {};
        CONFIG = {
            dailyRewards: saved.dailyRewards || DEFAULT_CONFIG.dailyRewards,
            linksForChest: saved.linksForChest || DEFAULT_CONFIG.linksForChest,
            linkCooldown: saved.linkCooldown || DEFAULT_CONFIG.linkCooldown,
            maxCodesPerDay: saved.maxCodesPerDay || DEFAULT_CONFIG.maxCodesPerDay,
            chestRewards: saved.chestRewards || DEFAULT_CONFIG.chestRewards,
            friendRewards: saved.friendRewards || DEFAULT_CONFIG.friendRewards,
            maxFriendsPerDay: saved.maxFriendsPerDay || DEFAULT_CONFIG.maxFriendsPerDay,
            minBet: saved.minBet || DEFAULT_CONFIG.minBet,
            maxBet: saved.maxBet || DEFAULT_CONFIG.maxBet,
            pvpFee: saved.pvpFee !== undefined ? saved.pvpFee : DEFAULT_CONFIG.pvpFee,
            pvpTimeout: saved.pvpTimeout || DEFAULT_CONFIG.pvpTimeout,
            minWithdraw: saved.minWithdraw || DEFAULT_CONFIG.minWithdraw,
            maxWithdraw: saved.maxWithdraw || DEFAULT_CONFIG.maxWithdraw,
            maxWithdrawPerDay: saved.maxWithdrawPerDay || DEFAULT_CONFIG.maxWithdrawPerDay,
            exchange_rate: saved.exchange_rate || DEFAULT_CONFIG.exchange_rate,
            starColor: saved.starColor || DEFAULT_CONFIG.starColor,
            bgColor1: saved.bgColor1 || DEFAULT_CONFIG.bgColor1,
            bgColor2: saved.bgColor2 || DEFAULT_CONFIG.bgColor2,
            linkTypes: saved.linkTypes || DEFAULT_CONFIG.linkTypes,
            autoResetHour: saved.autoResetHour || DEFAULT_CONFIG.autoResetHour
        };
    }

    initAutoReset() {
        setInterval(() => {
            this.checkAndReset();
        }, 60000);
    }

    async checkAndReset() {
        const now = new Date();
        const hour = now.getHours();
        const resetHour = CONFIG.autoResetHour || 3;

        const lastResetSnap = await this.db.ref('system/lastReset').once('value');
        const lastReset = lastResetSnap.val() || '';
        const today = now.toDateString();

        if (hour === resetHour && lastReset !== today) {
            await this.resetDaily();
            await this.db.ref('system/lastReset').set(today);
            console.log('✅ Auto reset completed at 3 AM');
        }
    }

    async resetDaily() {
        const usersSnap = await this.db.ref('users').once('value');
        const users = usersSnap.val() || {};
        const today = new Date().toDateString();
        
        const updates = {};
        for (let uid of Object.keys(users)) {
            updates[`user_links/${uid}/${today}`] = {};
        }
        await this.db.ref().update(updates);

        const snap = await this.db.ref('code_file/codes').once('value');
        const codes = snap.val() || {};
        const resetUpdates = {};
        for (let code of Object.keys(codes)) {
            resetUpdates[`code_file/codes/${code}/usedCount`] = 0;
        }
        await this.db.ref().update(resetUpdates);

        await this.db.ref('import_logs').push({
            type: 'auto_reset',
            importedAt: Date.now(),
            status: 'success',
            message: 'Tự động reset lúc 3h sáng'
        });
    }

    async addTransactionHistory(uid, type, amount, detail = '') {
        const ref = this.db.ref('transactions/' + uid).push();
        await ref.set({
            type: type,
            amount: amount,
            detail: detail,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    async getLinkTypes() {
        const snap = await this.db.ref('admin_config/linkTypes').once('value');
        return snap.val() || CONFIG.linkTypes || {};
    }

    async getLinkByType(uid, typeId) {
        const user = await this.getUser(uid);
        if (!user) return { error: 'Không tìm thấy user!' };

        const linkTypes = await this.getLinkTypes();
        const linkType = linkTypes[typeId];
        if (!linkType || !linkType.active) {
            return { error: 'Loại link không tồn tại hoặc đã bị vô hiệu hóa!' };
        }

        if (user.lastCodeTime && Date.now() - user.lastCodeTime < CONFIG.linkCooldown) {
            const left = Math.ceil((CONFIG.linkCooldown - (Date.now() - user.lastCodeTime)) / 60000);
            return { error: `⏳ Vui lòng đợi ${left} phút nữa để lấy link tiếp!` };
        }

        const today = new Date().toDateString();
        const progressSnap = await this.db.ref('user_links/' + uid + '/' + today + '/' + typeId).once('value');
        const used = progressSnap.val() || 0;
        const max = linkType.maxPerDay;

        if (used >= max) {
            return { 
                error: `Bạn đã hết lượt ${linkType.name} hôm nay! (${used}/${max})`,
                progress: used,
                max: max
            };
        }

        const codeData = await codeManager.getCodeByType(typeId);
        if (!codeData) {
            return { 
                error: `Hết mã cho ${linkType.name}! Vui lòng đợi Admin thêm mã mới.`,
                progress: used,
                max: max
            };
        }

        await codeManager.markCodeFileUsed(codeData.code);
        const finalLink = linkType.url.replace(/{code}/g, codeData.code);
        await this.db.ref('user_links/' + uid + '/' + today + '/' + typeId).set(used + 1);
        await this.updateUser(uid, { lastCodeTime: Date.now() });
        await this.addTransactionHistory(uid, 'task', 100, `Vượt link ${linkType.name}: ${codeData.code}`);

        return {
            success: true,
            link: finalLink,
            code: codeData.code,
            type: linkType.name,
            progress: used + 1,
            max: max,
            remaining: max - (used + 1),
            icon: linkType.icon || '🔗',
            color: linkType.color || '#5f91ff'
        };
    }

    async getUserLinkProgress(uid) {
        const today = new Date().toDateString();
        const snap = await this.db.ref('user_links/' + uid + '/' + today).once('value');
        return snap.val() || {};
    }

    async addLinkType(id, data) {
        await this.db.ref('admin_config/linkTypes/' + id).set(data);
        CONFIG.linkTypes[id] = data;
        return true;
    }

    async deleteLinkType(id) {
        await this.db.ref('admin_config/linkTypes/' + id).remove();
        delete CONFIG.linkTypes[id];
        return true;
    }

    async updateLinkType(id, data) {
        await this.db.ref('admin_config/linkTypes/' + id).update(data);
        CONFIG.linkTypes[id] = { ...CONFIG.linkTypes[id], ...data };
        return true;
    }

    generateId(name) {
        return name.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
    }

    async createUser(uid, data) {
        const ref = this.db.ref('users/' + uid);
        const snap = await ref.once('value');
        if (!snap.exists()) {
            await ref.set({
                id: uid, username: data.username || 'Unknown', balance: 0,
                dailyStreak: 0, lastDaily: '', completedLinks: 0,
                totalLinksWeekly: 0, totalLinksAllTime: 0,
                friends: [], invitedBy: '', codesUsed: [], giftCodesUsed: [],
                lastLinkTime: 0, chestsOpened: 0, isBanned: false, createdAt: Date.now(),
                friendsCount: 0
            });
        }
        return (await ref.once('value')).val();
    }

    async getUser(uid) { return (await this.db.ref('users/' + uid).once('value')).val(); }
    
    async updateUser(uid, data) { 
        await this.db.ref('users/' + uid).update(data); 
    }

    async addBalance(uid, amount) {
        const ref = this.db.ref('users/' + uid + '/balance');
        const snap = await ref.once('value');
        await ref.set(Math.max(0, (snap.val() || 0) + amount));
    }

    async isAdmin(uid) {
        return uid === '5852621653' || uid === ' ';
    }

    async dailyCheckin(uid) {
        const user = await this.getUser(uid);
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (user.lastDaily === today) return { status: 'already' };
        let streak = user.lastDaily === yesterday ? (user.dailyStreak >= 7 ? 1 : user.dailyStreak + 1) : 1;
        const reward = CONFIG.dailyRewards[streak - 1];
        await this.updateUser(uid, { dailyStreak: streak, lastDaily: today, balance: (user.balance || 0) + reward });
        await this.addTransactionHistory(uid, 'daily', reward, `Điểm danh ngày ${streak}`);
        return { status: 'ok', streak, reward };
    }

    async getTasks() { return (await this.db.ref('tasks').once('value')).val() || {}; }

    async getRandomTask(uid) {
        const tasks = await this.getTasks();
        const user = await this.getUser(uid);
        const usedCodes = user.codesUsed || [];

        const available = Object.entries(tasks).filter(([id, t]) => {
            if (t.active === false) return false;
            if ((t.usedCount || 0) >= (t.maxUses || 3)) return false;
            if (usedCodes.includes(t.code)) return false;
            return true;
        });

        if (available.length === 0) return null;

        const [taskId, task] = available[Math.floor(Math.random() * available.length)];
        await this.updateUser(uid, { lastLinkTime: Date.now() });
        return { id: taskId, ...task };
    }

    async verifyCode(uid, code) {
        if (!rateLimiter.check(`verify_${uid}`, 5, 60000)) {
            return { status: 'error', message: 'Bạn đã gửi quá nhiều yêu cầu, vui lòng đợi!' };
        }

        const codeCheck = await codeManager.checkCode(uid, code);
        if (!codeCheck.valid) {
            return { 
                status: 'used', 
                message: `⚠️ Mã "${code}" đã được sử dụng. Vui lòng thử mã khác!`
            };
        }

        const tasks = await this.getTasks();
        let task = null;
        let taskId = null;
        for (let id in tasks) {
            if (tasks[id].code === code && tasks[id].active !== false) {
                task = tasks[id];
                taskId = id;
                break;
            }
        }
        if (!task) return { status: 'invalid' };

        const user = await this.getUser(uid);
        if ((user.codesUsed || []).includes(code)) return { status: 'used', message: 'Bạn đã vượt link này rồi!' };

        if (user.lastCodeTime && Date.now() - user.lastCodeTime < CONFIG.linkCooldown) {
            const left = Math.ceil((CONFIG.linkCooldown - (Date.now() - user.lastCodeTime)) / 60000);
            return { status: 'cooldown', message: `Vui lòng đợi ${left} phút nữa` };
        }

        const today = new Date().toDateString();
        const codesToday = user.codesToday === today ? (user.codesCountToday || 0) : 0;
        if (codesToday >= CONFIG.maxCodesPerDay) {
            return { status: 'limit', message: 'Bạn đã đạt giới hạn mã hôm nay!' };
        }

        const timeSinceLink = Date.now() - (user.lastLinkTime || 0);
        let isTool = false;
        if (user.lastLinkTime && timeSinceLink < 120000 && timeSinceLink > 0) {
            isTool = true;
            await this.db.ref('admin_alerts').push({
                type: 'suspicious_speed',
                userId: uid,
                username: user.username,
                code: code,
                timeMs: timeSinceLink,
                timestamp: Date.now(),
                status: 'unread'
            });
        }

        if (taskId) {
            await this.db.ref(`tasks/${taskId}/usedCount`).set((task.usedCount || 0) + 1);
        }

        const reward = task.reward || 100;
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            completedLinks: (user.completedLinks || 0) + 1,
            totalLinksWeekly: (user.totalLinksWeekly || 0) + 1,
            totalLinksAllTime: (user.totalLinksAllTime || 0) + 1,
            lastCodeTime: Date.now(),
            codesUsed: [...(user.codesUsed || []), code],
            codesToday: today,
            codesCountToday: codesToday + 1
        });
        
        await codeManager.markCodeUsed(uid, code);
        await this.addTransactionHistory(uid, 'task', reward, `Vượt link: ${code}`);
        await this.updateLeaderboard(uid, (user.totalLinksWeekly || 0) + 1);

        let message = `+${reward} 🪙! Mã "${code}" hợp lệ!`;
        if (!codeCheck.isNew && codeCheck.canReuse) {
            message = `+${reward} 🪙! 🔄 Chúc mừng! Bạn đã nhận thưởng từ mã "${code}"!`;
        }

        if (isTool) {
            return { status: 'ok', reward, warning: 'Cảnh báo: Bạn đã nhập mã quá nhanh!', message };
        }
        return { status: 'ok', reward, message };
    }

    async openChest(uid) {
        const user = await this.getUser(uid);
        const completedLinks = user.completedLinks || 0;
        const chestsCanOpen = Math.floor(completedLinks / CONFIG.linksForChest);
        
        if (chestsCanOpen === 0) {
            return { status: 'error', message: 'Chưa đủ link để mở rương!' };
        }
        
        const reward = CONFIG.chestRewards[Math.floor(Math.random() * CONFIG.chestRewards.length)];
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            chestsOpened: (user.chestsOpened || 0) + 1,
            completedLinks: completedLinks - CONFIG.linksForChest
        });
        await this.addTransactionHistory(uid, 'chest', reward, `Mở rương nhận ${reward}🪙`);
        return { status: 'ok', reward };
    }

    async addFriend(uid, friendId) {
        if (uid === friendId) return { status: 'error', message: 'Không thể tự mời chính mình!' };
        
        const friendData = await this.getUser(friendId);
        if (!friendData) return { status: 'error', message: 'Người dùng không tồn tại!' };
        
        const user = await this.getUser(uid);
        const friends = user.friends || [];
        if (friends.includes(friendId)) return { status: 'already' };
        friends.push(friendId);
        await this.updateUser(uid, { friends, friendsCount: friends.length });
        let bonus = 0;
        for (let [k, v] of Object.entries(CONFIG.friendRewards)) {
            if (friends.length === parseInt(k)) { bonus = v; break; }
        }
        if (bonus > 0) { 
            await this.addBalance(uid, bonus);
            await this.addTransactionHistory(uid, 'friend', bonus, `Thưởng mời bạn (${friends.length} bạn)`);
            return { status: 'reward', count: friends.length, bonus }; 
        }
        return { status: 'ok', count: friends.length };
    }

    async redeemGiftCode(uid, code) {
        const snap = await this.db.ref('gift_codes/' + code).once('value');
        if (!snap.exists()) return { status: 'invalid' };
        const gift = snap.val();
        if (!gift.active) return { status: 'inactive' };
        if (gift.expiry && Date.now() > gift.expiry) return { status: 'expired' };
        if ((gift.usedCount || 0) >= gift.maxUses) return { status: 'full' };
        const user = await this.getUser(uid);
        if ((user.giftCodesUsed || []).includes(code)) return { status: 'used' };
        await this.addBalance(uid, gift.reward);
        await this.updateUser(uid, { giftCodesUsed: [...(user.giftCodesUsed || []), code] });
        await this.db.ref('gift_codes/' + code + '/usedCount').set((gift.usedCount || 0) + 1);
        await this.addTransactionHistory(uid, 'gift', gift.reward, `Nhận Gift Code: ${code}`);
        return { status: 'ok', reward: gift.reward };
    }

    async requestWithdraw(uid, data) {
        const user = await this.getUser(uid);
        const amount = parseInt(data.amount);
        if (amount < CONFIG.minWithdraw || amount > CONFIG.maxWithdraw) return { status: 'error', message: 'Số 🪙 không hợp lệ' };
        if (user.balance < amount) return { status: 'error', message: 'Không đủ số dư' };
        const rate = CONFIG.exchange_rate;
        const ref = this.db.ref('withdraw_requests').push();
        await ref.set({
            userId: uid, username: user.username, bank: data.bank,
            accountName: data.accountName, accountNumber: data.accountNumber,
            amountXu: amount, amountVnd: amount * rate, exchangeRate: rate,
            status: 'pending', createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        await this.addBalance(uid, -amount);
        await this.addTransactionHistory(uid, 'withdraw', -amount, `Rút ${amount}🪙`);
        return { status: 'ok', id: ref.key };
    }

    async getWithdrawHistory(uid) {
        const snap = await this.db.ref('withdraw_requests').once('value');
        const all = snap.val() || {};
        const arr = [];
        for (let key in all) {
            if (all[key].userId === uid) {
                arr.push({ id: key, ...all[key] });
            }
        }
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return arr;
    }

    async getTransactionHistory(uid, limit = 200) {
        const snap = await this.db.ref('transactions/' + uid)
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');
        const arr = [];
        snap.forEach(c => {
            arr.push({ id: c.key, ...c.val() });
        });
        return arr.reverse();
    }

    async updateLeaderboard(uid, links) {
        const user = await this.getUser(uid);
        await this.db.ref('leaderboard/' + uid).set({ userId: uid, username: user?.username || 'Unknown', links, updatedAt: Date.now() });
    }

    async getTopLinks(limit = 10) {
        const snap = await this.db.ref('leaderboard').orderByChild('links').limitToLast(limit).once('value');
        const arr = []; snap.forEach(c => arr.push({ id: c.key, ...c.val() })); return arr.reverse();
    }

    async getTopFriends(limit = 10) {
        const snap = await this.db.ref('users').orderByChild('friendsCount').limitToLast(limit).once('value');
        const arr = []; 
        snap.forEach(c => { 
            const u = c.val(); 
            arr.push({ 
                userId: c.key, 
                username: u.username, 
                friends: (u.friends || []).length 
            }); 
        });
        return arr.reverse();
    }

    async getDashboard() {
        const usersSnap = await this.db.ref('users').once('value');
        const users = usersSnap.val() || {};
        let totalUsers = Object.keys(users).length, totalBalance = 0, totalLinks = 0;
        Object.values(users).forEach(u => { totalBalance += u.balance || 0; totalLinks += u.totalLinksAllTime || 0; });
        const fundSnap = await this.db.ref('prize_fund').once('value'); const fund = fundSnap.val() || 0;
        let pending = 0; const wSnap = await this.db.ref('withdraw_requests').orderByChild('status').equalTo('pending').once('value');
        wSnap.forEach(() => pending++);
        return { totalUsers, totalBalance, totalLinks, prizeFund: fund, pendingWithdraws: pending };
    }

    getTimeUntilSunday8AM() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        let daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const nextSunday = new Date(now);
        nextSunday.setDate(now.getDate() + daysUntilSunday);
        nextSunday.setHours(8, 0, 0, 0);
        if (dayOfWeek === 0 && now >= nextSunday) {
            nextSunday.setDate(nextSunday.getDate() + 7);
        }
        return nextSunday.getTime() - now.getTime();
    }

    async checkAndDistributeRewards() {
        const timeUntil = this.getTimeUntilSunday8AM();
        if (timeUntil > 60000) return;
        const lastResetSnap = await this.db.ref('leaderboard_config/lastReset').once('value');
        const lastReset = lastResetSnap.val() || '';
        const thisWeek = this.getWeekNumber();
        if (lastReset === thisWeek) return;
        const top10 = await this.getTopLinks(10);
        if (top10.length === 0) return;
        const fundSnap = await this.db.ref('prize_fund').once('value');
        let fund = fundSnap.val() || 0;
        if (fund <= 0) return;
        const ratios = [0.40, 0.25, 0.15, 0.10, 0.05, 0.03, 0.02, 0, 0, 0];
        const updates = {};
        let totalDistributed = 0;
        top10.forEach((user, i) => {
            if (i < ratios.length && ratios[i] > 0) {
                const reward = Math.floor(fund * ratios[i]);
                if (reward > 0) {
                    updates[`users/${user.userId}/balance`] = firebase.database.ServerValue.increment(reward);
                    totalDistributed += reward;
                }
            }
        });
        if (totalDistributed > 0) {
            await this.db.ref().update(updates);
            await this.db.ref('prize_fund').set(Math.max(0, fund - totalDistributed));
            await this.db.ref('leaderboard_config/lastReset').set(thisWeek);
            await this.db.ref('leaderboard').remove();
            const usersSnap = await this.db.ref('users').once('value');
            const userUpdates = {};
            usersSnap.forEach(child => {
                userUpdates[`${child.key}/totalLinksWeekly`] = 0;
            });
            await this.db.ref().update(userUpdates);
        }
    }

    getWeekNumber() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const diff = now - start;
        return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
    }
}

const FB = new FirebaseManager();

// ==================== CÁC TRANG ====================
// HomePage (Giữ nguyên)
class HomePage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData; const streak = u.dailyStreak || 0;
        let dailyHTML = '<div class="daily-grid">';
        for (let i = 1; i <= 7; i++) {
            let cls = ''; if (i <= streak) cls = 'claimed'; if (i === streak + 1 || (streak === 7 && i === 1)) cls = 'today';
            dailyHTML += `<div class="daily-item ${cls}"><div class="day">Ngày ${i}</div><div class="reward">+${CONFIG.dailyRewards[i-1]} 🪙</div>${i<=streak?'✅':''}</div>`;
        }
        dailyHTML += '</div>';
        const hasChecked = u.lastDaily === new Date().toDateString();
        this.container.innerHTML = `
            <div class="card"><div class="card-title">📅 Điểm danh hàng ngày</div>${dailyHTML}<button class="btn btn-gold" id="btnDaily" ${hasChecked ? 'disabled' : ''}>${hasChecked ? '✅ Đã điểm danh' : '🎁 Điểm danh nhận thưởng'}</button></div>
            <div class="card"><div class="card-title">📊 Thống kê của bạn</div><div class="grid-2"><div class="stat-card"><div class="stat-icon">🔗</div><div class="stat-value">${(u.completedLinks||0).toLocaleString()}</div><div class="stat-label">Link đã vượt</div></div><div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${(u.friends||[]).length}</div><div class="stat-label">Bạn bè</div></div><div class="stat-card"><div class="stat-icon">🎁</div><div class="stat-value">${u.chestsOpened||0}</div><div class="stat-label">Rương đã mở</div></div><div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-value">${(u.totalLinksWeekly||0).toLocaleString()}</div><div class="stat-label">Link tuần này</div></div></div></div>
            <div class="card"><div class="card-title">🎯 Tiến độ mở rương</div><div class="progress-bar"><div class="progress-fill" style="width:${((u.completedLinks||0)%CONFIG.linksForChest)/CONFIG.linksForChest*100}%"></div></div><p style="text-align:center;font-size:13px;color:var(--text2);">${(u.completedLinks||0)%CONFIG.linksForChest}/${CONFIG.linksForChest} link</p></div>
        `;
        document.getElementById('btnDaily').onclick = () => this.doDaily();
    }
    async doDaily() {
        const btn = document.getElementById('btnDaily');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Đang xử lý...';
        btn.disabled = true;
        try {
            const result = await FB.dailyCheckin(this.app.user.id);
            if (result.status === 'already') this.app.toast('Hôm nay bạn đã điểm danh rồi!', 'warning');
            else { this.app.toast(`+${result.reward} 🪙! Ngày ${result.streak}/7`, 'success'); this.app.refreshUserBar(); this.render(); }
        } catch (error) {
            this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}

// ===== TASKS PAGE (SỬA) =====
class TasksPage {
    constructor(app, container, userData) { 
        this.app = app; 
        this.container = container; 
        this.userData = userData; 
    }

    async render() {
        const linkTypes = await FB.getLinkTypes();
        const userProgress = await FB.getUserLinkProgress(this.app.user.id);
        const cooldown = this.userData.lastCodeTime ? Math.max(0, CONFIG.linkCooldown - (Date.now() - this.userData.lastCodeTime)) : 0;
        const isCooldown = cooldown > 0;

        let linkHTML = '';
        let totalProgress = 0;
        let totalMax = 0;

        for (let [id, type] of Object.entries(linkTypes)) {
            if (!type.active) continue;
            const used = userProgress[id] || 0;
            const max = type.maxPerDay || 0;
            const progress = max > 0 ? (used / max) * 100 : 0;
            const isFull = used >= max;
            const remaining = max - used;
            const isActive = !isFull;

            totalProgress += used;
            totalMax += max;

            linkHTML += `
                <div class="card" style="border-left: 4px solid ${type.color || '#5f91ff'};">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:20px;">${type.icon || '🔗'}</span>
                            <span style="font-weight:600;font-size:16px;">${type.name}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="color:${isFull ? '#ff4757' : '#2ed573'};font-weight:bold;">
                                ${used}/${max}
                            </span>
                            <span style="font-size:12px;color:var(--text2);">
                                ${isFull ? '✅ Đã max' : `⏳ Còn ${remaining}`}
                            </span>
                        </div>
                    </div>
                    <div class="progress-bar" style="height:6px;margin-bottom:8px;">
                        <div class="progress-fill" style="width:${progress}%;background:${type.color || '#5f91ff'};"></div>
                    </div>
                    <button class="btn btn-primary get-link-btn" 
                            data-type="${id}" 
                            style="background:${isActive && !isCooldown ? (type.color || '#5f91ff') : '#555'};cursor:${isActive && !isCooldown ? 'pointer' : 'not-allowed'};"
                            ${isActive && !isCooldown ? '' : 'disabled'}>
                        ${isCooldown ? `⏳ Đợi ${Math.ceil(cooldown/60000)}p` : (isActive ? `${type.icon || '🔗'} LẤY LINK` : '⛔ Hết lượt')}
                    </button>
                </div>
            `;
        }

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📋 Nhiệm vụ</div>
                <p style="font-size:13px;color:var(--text2);margin-bottom:12px;">
                    📊 Hôm nay: ${totalProgress}/${totalMax} lượt đã vượt
                    ${isCooldown ? ` ⏳ Đợi ${Math.ceil(cooldown/60000)} phút` : ''}
                </p>
                ${linkHTML || '<p style="text-align:center;color:var(--text2);">Chưa có loại link nào!</p>'}
            </div>
            <div class="card">
                <div class="card-title">🔑 Nhập mã xác nhận</div>
                <input class="input" id="codeInput" placeholder="Nhập mã từ link...">
                <button class="btn btn-success" id="btnVerify">✅ Xác nhận</button>
                <p style="font-size:12px;color:var(--text2);margin-top:8px;">
                    📌 Nhập mã từ link đã mở để nhận thưởng
                </p>
            </div>
            <div class="card">
                <div class="card-title">🎁 Rương thưởng</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${((this.userData.completedLinks||0)%CONFIG.linksForChest)/CONFIG.linksForChest*100}%"></div>
                </div>
                <p style="text-align:center;">${(this.userData.completedLinks||0)%CONFIG.linksForChest}/${CONFIG.linksForChest}</p>
                <button class="btn btn-gold" id="btnChest" ${(this.userData.completedLinks||0) >= CONFIG.linksForChest ? '' : 'disabled'}>🎁 Mở rương</button>
            </div>
        `;

        this.container.querySelectorAll('.get-link-btn').forEach(btn => {
            btn.onclick = async () => {
                const typeId = btn.dataset.type;
                btn.disabled = true;
                btn.innerHTML = '⏳ Đang tải...';
                
                try {
                    const result = await FB.getLinkByType(this.app.user.id, typeId);
                    
                    if (result.error) {
                        this.app.toast(result.error, 'warning');
                        btn.innerHTML = '🔗 LẤY LINK';
                        btn.disabled = false;
                        return;
                    }

                    if (result.success) {
                        if (this.app.tg) {
                            this.app.tg.openLink(result.link);
                        } else {
                            window.open(result.link, '_blank');
                        }
                        
                        this.app.toast(`✅ Đã mở link ${result.type}! (${result.progress}/${result.max})`, 'success');
                        this.app.refreshUserBar();
                        await this.render();
                    }
                } catch (error) {
                    console.error('Get link error:', error);
                    this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
                    btn.innerHTML = '🔗 LẤY LINK';
                    btn.disabled = false;
                }
            };
        });

        this.container.querySelector('#btnVerify').onclick = async () => {
            const code = this.container.querySelector('#codeInput').value.trim();
            if (!code) {
                this.app.toast('Vui lòng nhập mã!', 'warning');
                return;
            }

            const btn = this.container.querySelector('#btnVerify');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Đang xử lý...';
            btn.disabled = true;

            try {
                const result = await FB.verifyCode(this.app.user.id, code);
                
                if (result.status === 'ok') {
                    this.app.toast(result.message || `+${result.reward} 🪙!`, result.warning ? 'warning' : 'success');
                    this.app.refreshUserBar();
                    this.render();
                } else if (result.status === 'cooldown') {
                    this.app.toast(result.message, 'warning');
                    this.render();
                } else {
                    this.app.toast(result.message || 'Mã không đúng!', 'error');
                }
            } catch (error) {
                console.error('Verify code error:', error);
                this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        };

        this.container.querySelector('#btnChest').onclick = async () => {
            const btn = this.container.querySelector('#btnChest');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Đang mở...';
            btn.disabled = true;
            
            try {
                const res = await FB.openChest(this.app.user.id);
                if (res.status === 'ok') {
                    this.app.toast(`Nhận ${res.reward} 🪙!`, 'success');
                    this.app.refreshUserBar();
                    this.render();
                } else {
                    this.app.toast(res.message, 'error');
                }
            } catch (error) {
                this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        };
    }
}

// ===== FRIENDS PAGE (Giữ nguyên) =====
class FriendsPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData; const refLink = `https://t.me/${this.app.tg.botUsername || 'cayxummo_bot'}/app?startapp=${u.id}`;
        this.container.innerHTML = `
            <div class="card"><div class="card-title">👥 Mời bạn bè</div><p style="font-size:13px;color:var(--text2);">Link mời của bạn:</p><div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;word-break:break-all;margin-bottom:10px;">${refLink}</div><button class="btn btn-primary" id="copyLink">📋 Copy link</button><p style="margin-top:12px;">🎁 Thưởng:<br>2 bạn → +100 🪙<br>5 bạn → +300 🪙<br>10 bạn → +1.000 🪙</p></div>
            <div class="card"><div class="card-title">📊 Bạn đã mời: ${(u.friends||[]).length}</div></div>
            <div class="card"><div class="card-title">🏆 Top mời bạn</div><div id="topFriends">Đang tải...</div></div>
        `;
        this.container.querySelector('#copyLink').onclick = () => { navigator.clipboard.writeText(refLink); this.app.toast('Đã copy!', 'success'); };
        this.loadTopFriends();
    }
    async loadTopFriends() { 
        try {
            const top = await FB.getTopFriends(10); 
            const html = top.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">👥 ${u.friends}</span></div>`).join(''); 
            this.container.querySelector('#topFriends').innerHTML = html || '<p>Chưa có dữ liệu</p>';
        } catch (error) {
            this.container.querySelector('#topFriends').innerHTML = '<p>Không thể tải dữ liệu</p>';
        }
    }
}

// ===== LEADERBOARD PAGE (Giữ nguyên) =====
class LeaderboardPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; this.countdownInterval = null; }
    
    destroy() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }
    
    async render() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        await FB.checkAndDistributeRewards();
        
        const top = await FB.getTopLinks(10);
        const fundSnap = await FB.db.ref('prize_fund').once('value');
        const fund = fundSnap.val() || 0;
        const timeUntil = FB.getTimeUntilSunday8AM();
        
        const days = Math.floor(timeUntil / 86400000);
        const hours = Math.floor((timeUntil % 86400000) / 3600000);
        const minutes = Math.floor((timeUntil % 3600000) / 60000);
        const seconds = Math.floor((timeUntil % 60000) / 1000);
        const countdownStr = `${days}ngày ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
        
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">💰 Quỹ thưởng BXH</div>
                <p style="text-align:center;font-size:28px;font-weight:bold;color:var(--gold);">${fund.toLocaleString()} 🪙</p>
                <p style="text-align:center;font-size:12px;color:var(--text2);">Phát thưởng vào 8h Chủ nhật cho Top 10</p>
            </div>
            <div class="card">
                <div class="card-title">🏆 Top vượt link</div>
                <p style="font-size:12px;color:var(--text2);">Reset mỗi Chủ nhật 8h sáng</p>
                <p style="text-align:center;font-size:18px;font-weight:bold;color:var(--accent);margin:8px 0;" class="countdown-timer">⏰ Còn: ${countdownStr}</p>
                <div id="topLinks">
                    ${top.length === 0 ? '<p style="text-align:center;color:var(--text2);">Chưa có dữ liệu</p>' : 
                    top.map((u,i) => `<div class="leaderboard-item">
                        <span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span>
                        <span>${u.username||'Unknown'}</span>
                        <span style="margin-left:auto;">🔗 ${u.links||0}</span>
                        ${i < 7 ? `<span style="font-size:11px;color:var(--gold);margin-left:4px;">(${['40%','25%','15%','10%','5%','3%','2%'][i]})</span>` : ''}
                    </div>`).join('')}
                </div>
            </div>
        `;
        
        this.countdownInterval = setInterval(() => {
            const timeEl = document.querySelector('.countdown-timer');
            if (!timeEl) { 
                clearInterval(this.countdownInterval); 
                this.countdownInterval = null;
                return; 
            }
            const t = FB.getTimeUntilSunday8AM();
            if (t <= 0) {
                timeEl.textContent = '🔄 Đang phát thưởng...';
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                this.render();
                return;
            }
            const d = Math.floor(t / 86400000);
            const h = Math.floor((t % 86400000) / 3600000);
            const m = Math.floor((t % 3600000) / 60000);
            const s = Math.floor((t % 60000) / 1000);
            timeEl.textContent = `${d}ngày ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }, 1000);
    }
}

// ===== PVP PAGE (Giữ nguyên) =====
class PvPPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData;
        this.container.innerHTML = `<div class="card"><div class="card-title">🎮 PvP Oẳn Tù Tì</div><p style="text-align:center;">🪙 ${(u.balance||0).toLocaleString()}</p><p style="margin-top:12px;">Chọn phòng:</p><div style="display:flex;flex-direction:column;gap:10px;">${[{bet:1000,icon:'🥉',label:'Phổ thông'},{bet:3000,icon:'🥈',label:'Trung cấp'},{bet:5000,icon:'🥇',label:'Cao cấp'}].map(r => `<button class="btn btn-primary room-btn" data-bet="${r.bet}" ${(u.balance||0) < r.bet ? 'disabled' : ''}>${r.icon} ${r.label} - ${r.bet.toLocaleString()} 🪙</button>`).join('')}</div></div>`;
        this.container.querySelectorAll('.room-btn').forEach(btn => btn.onclick = () => this.joinRoom(parseInt(btn.dataset.bet)));
    }
    async joinRoom(bet) { this.app.toast(`Vào phòng ${bet.toLocaleString()} 🪙. Đang tìm đối thủ...`, 'info'); }
}

// ===== ACCOUNT PAGE (Giữ nguyên) =====
class AccountPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        const u = this.userData; const rate = CONFIG.exchange_rate;
        this.container.innerHTML = `
            <div class="card"><div class="card-title">👤 Tài khoản</div><p>👤 ${u.username}</p><p>🆔 ${u.id}</p><p>🪙 ${(u.balance||0).toLocaleString()}</p></div>
            <div class="card"><div class="card-title">💱 Tỷ giá</div><p>3.000 🪙 = ${(1000*rate).toLocaleString()}đ</p></div>
            <div class="card">
                <div class="card-title">📢 Tham gia Group</div>
                <button class="btn btn-primary" id="btnJoinCodeGroup" style="margin-bottom:8px;">📋 Group Code</button>
                <button class="btn btn-primary" id="btnJoinNotifyGroup">🔔 Group Thông báo</button>
            </div>
            <div class="card"><div class="card-title">🎁 Gift Code</div><input class="input" id="giftInput" placeholder="Nhập Gift Code"><button class="btn btn-gold" id="btnGift">Nhận</button></div>
            <div class="card"><div class="card-title">💸 Rút 🪙</div><input class="input" id="wdBank" placeholder="Ngân hàng"><input class="input" id="wdName" placeholder="Tên chủ TK"><input class="input" id="wdAccount" placeholder="Số TK"><input class="input" id="wdAmount" type="number" placeholder="Số 🪙(60.000-150.000🪙)"><button class="btn btn-warning" id="btnWithdraw">Gửi yêu cầu</button></div>
            <div class="card"><div class="card-title">📜 Lịch sử rút</div><div id="wdHistory">Đang tải...</div></div>
        `;
        
        document.getElementById('btnJoinCodeGroup').onclick = () => {
            const link = 'https://t.me/CodeXummo';
            if (this.app.tg) {
                this.app.tg.openLink(link);
            } else {
                window.open(link, '_blank');
            }
        };

        document.getElementById('btnJoinNotifyGroup').onclick = () => {
            const link = 'https://t.me/Cayxummo';
            if (this.app.tg) {
                this.app.tg.openLink(link);
            } else {
                window.open(link, '_blank');
            }
        };

        this.container.querySelector('#btnGift').onclick = async () => { 
            const code = this.container.querySelector('#giftInput').value.trim(); 
            if (!code) return this.app.toast('Nhập code!', 'warning'); 
            const btn = this.container.querySelector('#btnGift');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Đang xử lý...';
            btn.disabled = true;
            try {
                const res = await FB.redeemGiftCode(this.app.user.id, code); 
                if (res.status === 'ok') { this.app.toast(`+${res.reward} 🪙!`, 'success'); this.app.refreshUserBar(); } 
                else this.app.toast('Code không hợp lệ!', 'error');
            } catch (error) {
                this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        };
        this.container.querySelector('#btnWithdraw').onclick = async () => { 
            const data = { bank: this.container.querySelector('#wdBank').value.trim(), accountName: this.container.querySelector('#wdName').value.trim(), accountNumber: this.container.querySelector('#wdAccount').value.trim(), amount: this.container.querySelector('#wdAmount').value.trim() }; 
            if (!data.bank || !data.accountName || !data.accountNumber || !data.amount) return this.app.toast('Điền đầy đủ!', 'warning'); 
            const btn = this.container.querySelector('#btnWithdraw');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Đang xử lý...';
            btn.disabled = true;
            try {
                const res = await FB.requestWithdraw(this.app.user.id, data); 
                if (res.status === 'ok') { this.app.toast('Đã gửi yêu cầu!', 'success'); this.app.refreshUserBar(); this.render(); } 
                else this.app.toast(res.message, 'error');
            } catch (error) {
                this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        };
        this.loadHistory();
    }
    async loadHistory() {
        try {
            const history = await FB.getWithdrawHistory(this.app.user.id);
            const container = this.container.querySelector('#wdHistory');
            if (!container) return;
            if (history.length === 0) {
                container.innerHTML = '<p style="color:var(--text2);">Chưa có lịch sử rút</p>';
                return;
            }
            const html = history.map(h => {
                let dateStr = 'N/A';
                if (h.createdAt) {
                    const ts = typeof h.createdAt === 'object' ? Date.now() : h.createdAt;
                    dateStr = new Date(ts).toLocaleString('vi-VN');
                }
                let statusText = '🟡 Chờ';
                let statusClass = 'badge-pending';
                if (h.status === 'approved') { statusText = '🟢 Thành công'; statusClass = 'badge-success'; }
                else if (h.status === 'rejected') { statusText = '🔴 Từ chối'; statusClass = 'badge-rejected'; }
                return `
                    <div style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <p>💰 ${h.amountXu.toLocaleString()} 🪙 = ${h.amountVnd.toLocaleString()}đ</p>
                        <p>🏦 ${h.bank} - ${h.accountNumber}</p>
                        <span class="badge ${statusClass}">${statusText}</span>
                        <p style="font-size:10px;color:var(--text2);">${dateStr}</p>
                    </div>
                `;
            }).join('');
            container.innerHTML = html;
        } catch (error) {
            const container = this.container.querySelector('#wdHistory');
            if (container) container.innerHTML = '<p style="color:var(--text2);">Không thể tải lịch sử</p>';
        }
    }
}

// ==================== ADMIN PAGE ====================
class AdminPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    
    async render() {
        if (!this.app.isAdmin) { this.container.innerHTML = '<p>⛔ Không có quyền!</p>'; return; }
        const stats = await FB.getDashboard();
        this.container.innerHTML = `
            <h2>👑 Admin Panel</h2>
            <div class="grid-2" style="margin-bottom:12px;">
                <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${stats.totalUsers}</div><div class="stat-label">Users</div></div>
                <div class="stat-card"><div class="stat-icon">🪙</div><div class="stat-value">${stats.totalBalance.toLocaleString()}</div><div class="stat-label">Tổng 🪙</div></div>
                <div class="stat-card"><div class="stat-icon">🔗</div><div class="stat-value">${stats.totalLinks.toLocaleString()}</div><div class="stat-label">Links</div></div>
                <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">${stats.prizeFund.toLocaleString()}</div><div class="stat-label">Quỹ</div></div>
            </div>
            <p style="margin:10px 0;">📥 Yêu cầu rút chờ: <b>${stats.pendingWithdraws}</b></p>
            <div class="admin-tabs" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
                <button class="admin-tab active" data-tab="config">⚙️ Cấu hình</button>
                <button class="admin-tab" data-tab="tasks">📋 Nhiệm vụ</button>
                <button class="admin-tab" data-tab="giftcodes">🎁 Gift Code</button>
                <button class="admin-tab" data-tab="withdraws">💸 Rút 🪙</button>
                <button class="admin-tab" data-tab="users">👥 Users</button>
                <button class="admin-tab" data-tab="fund">💰 Quỹ BXH</button>
                <button class="admin-tab" data-tab="leaderboard">🏆 BXH</button>
                <button class="admin-tab" data-tab="notify">📢 Thông báo</button>
                <button class="admin-tab" data-tab="logs">📝 Log</button>
                <button class="admin-tab" data-tab="security">🛡️ Bảo mật</button>
                <button class="admin-tab" data-tab="theme">🎨 Giao diện</button>
                <button class="admin-tab" data-tab="history">📊 Lịch sử</button>
            </div>
            <div id="adminTabContent"></div>
        `;
        this.loadTab('config');
        this.container.querySelectorAll('.admin-tab').forEach(btn => btn.onclick = () => { 
            this.container.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active'); 
            this.loadTab(btn.dataset.tab); 
        });
    }

    async loadTab(tab) {
        const content = document.getElementById('adminTabContent');
        if (!content) return;
        
        // TAB: history
        if (tab === 'history') {
            content.innerHTML = `
                <div class="card">
                    <div class="card-title">📊 Lịch sử giao dịch của User</div>
                    <p style="font-size:13px;color:var(--text2);margin-bottom:8px;">Nhập User ID để xem toàn bộ lịch sử nhận/thưởng 🪙</p>
                    <div style="display:flex;gap:8px;">
                        <input class="input" id="searchHistoryUser" placeholder="Nhập User ID..." style="margin-bottom:0;flex:1;">
                        <button class="btn btn-primary" id="searchHistoryBtn" style="width:auto;padding:10px 20px;">🔍 Tìm</button>
                    </div>
                </div>
                <div id="historyResult">
                    <p style="text-align:center;color:var(--text2);padding:30px 0;">🔍 Nhập User ID và bấm Tìm để xem lịch sử</p>
                </div>
            `;

            document.getElementById('searchHistoryBtn').onclick = async () => {
                const uid = document.getElementById('searchHistoryUser').value.trim();
                if (!uid) {
                    document.getElementById('historyResult').innerHTML = '<p style="text-align:center;color:var(--text2);">⚠️ Vui lòng nhập User ID</p>';
                    return;
                }

                const btn = document.getElementById('searchHistoryBtn');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang tải...';
                btn.disabled = true;

                try {
                    const user = await FB.getUser(uid);
                    if (!user) {
                        document.getElementById('historyResult').innerHTML = `
                            <div class="card" style="border-color:#ff4757;">
                                <p style="color:#ff4757;">❌ Không tìm thấy user với ID: <b>${uid}</b></p>
                            </div>
                        `;
                        return;
                    }

                    const history = await FB.getTransactionHistory(uid, 500);
                    
                    if (history.length === 0) {
                        document.getElementById('historyResult').innerHTML = `
                            <div class="card">
                                <p><b>👤 ${user.username}</b> (ID: ${uid})</p>
                                <p>🪙 Số dư: <b>${(user.balance || 0).toLocaleString()}</b></p>
                                <p style="color:var(--text2);">📭 Chưa có lịch sử giao dịch</p>
                            </div>
                        `;
                        return;
                    }

                    let totalIn = 0, totalOut = 0;
                    const typeLabels = {
                        'daily': '📅 Điểm danh', 'task': '🔗 Vượt link',
                        'chest': '🎁 Mở rương', 'gift': '🎫 Gift Code',
                        'friend': '👥 Mời bạn', 'withdraw': '💸 Rút xu'
                    };
                    const typeColors = {
                        'daily': '#2ed573', 'task': '#5f91ff',
                        'chest': '#ffd700', 'gift': '#ff6b81',
                        'friend': '#a29bfe', 'withdraw': '#ff4757'
                    };

                    history.forEach(h => {
                        if (h.amount > 0) totalIn += h.amount;
                        else totalOut += Math.abs(h.amount);
                    });

                    let html = `
                        <div class="card">
                            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;">
                                <div><p style="font-weight:bold;">👤 ${user.username}</p><p style="font-size:13px;color:var(--text2);">🆔 ${uid}</p></div>
                                <div><p>🪙 Số dư: <b style="color:#ffd700;">${(user.balance || 0).toLocaleString()}</b></p></div>
                            </div>
                            <div style="display:flex;gap:16px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">
                                <span style="color:#2ed573;">📈 Nhận: +${totalIn.toLocaleString()}</span>
                                <span style="color:#ff4757;">📉 Chi: -${totalOut.toLocaleString()}</span>
                                <span style="color:#5f91ff;">📊 ${history.length} giao dịch</span>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-title">📋 Chi tiết</div>
                            <div style="max-height:400px;overflow-y:auto;">
                    `;

                    history.forEach((h, i) => {
                        const bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)';
                        const color = typeColors[h.type] || '#fff';
                        const sign = h.amount >= 0 ? '+' : '';
                        const date = h.timestamp ? new Date(h.timestamp).toLocaleString('vi-VN') : 'N/A';
                        
                        html += `
                            <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;background:${bg};">
                                <div><span style="color:${color};">${typeLabels[h.type] || h.type}</span> <span style="font-size:12px;color:var(--text2);">${h.detail || ''}</span></div>
                                <div><span style="color:${h.amount >= 0 ? '#2ed573' : '#ff4757'};font-weight:bold;">${sign}${h.amount.toLocaleString()}🪙</span> <span style="font-size:10px;color:var(--text2);">${date}</span></div>
                            </div>
                        `;
                    });

                    html += `</div></div>`;
                    document.getElementById('historyResult').innerHTML = html;

                } catch (error) {
                    document.getElementById('historyResult').innerHTML = `<div class="card"><p style="color:#ff4757;">❌ Lỗi tải lịch sử</p></div>`;
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };

            document.getElementById('searchHistoryUser').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') document.getElementById('searchHistoryBtn').click();
            });
        }
        
        // TAB: tasks
        else if (tab === 'tasks') {
            const linkTypes = await FB.getLinkTypes();
            const codeStats = await codeManager.getCodeStats();
            const codeFile = await FB.db.ref('code_file/codes').once('value');
            const codes = codeFile.val() || {};
            const importLogsSnap = await FB.db.ref('import_logs').orderByChild('importedAt').limitToLast(10).once('value');
            const importLogs = [];
            importLogsSnap.forEach(c => importLogs.push({ id: c.key, ...c.val() }));
            importLogs.reverse();

            // Tạo HTML cho tab tasks (đã có trong code trước)
            let taskHTML = `
                <h3>📋 QUẢN LÝ NHIỆM VỤ & LINK</h3>
                <div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
                    <div class="stat-card"><div class="stat-value">${codeStats.total || 0}</div><div class="stat-label">📝 Tổng mã</div></div>
                    <div class="stat-card"><div class="stat-value">${codeStats.used || 0}</div><div class="stat-label">✅ Đã dùng</div></div>
                    <div class="stat-card"><div class="stat-value">${codeStats.available || 0}</div><div class="stat-label">⏳ Còn lại</div></div>
                </div>
                <div class="card">
                    <div class="card-title">📊 Thống kê theo loại</div>
                    ${Object.entries(codeStats.byType || {}).map(([typeId, stats]) => `
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                            <span>${linkTypes[typeId]?.icon || '🔗'} ${linkTypes[typeId]?.name || typeId}</span>
                            <span>Tổng: ${stats.total} | Đã dùng: ${stats.used} | Còn: ${stats.available}</span>
                        </div>
                    `).join('') || '<p style="color:var(--text2);">Chưa có dữ liệu</p>'}
                </div>
            `;

            // IMPORT FILE
            taskHTML += `
                <div class="card" style="border:2px solid #ffd700;">
                    <div class="card-title" style="color:#ffd700;">📥 IMPORT FILE MA.TXT</div>
                    <p style="font-size:13px;color:var(--text2);margin-bottom:8px;">File ma.txt chỉ chứa danh sách mã, mỗi dòng 1 mã.</p>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <input type="file" id="maFileInput" accept=".txt" style="display:none;">
                        <button class="btn btn-primary" id="chooseMaFile" style="width:auto;">📁 Chọn file</button>
                        <button class="btn btn-success" id="importMaFile" style="width:auto;display:none;">📥 Import</button>
                        <button class="btn btn-danger" id="cancelImport" style="width:auto;display:none;">❌ Hủy</button>
                        <select class="input" id="importType" style="width:auto;display:none;margin-bottom:0;">
                            ${Object.entries(linkTypes).map(([id, type]) => `<option value="${id}">${type.icon || '🔗'} ${type.name}</option>`).join('')}
                        </select>
                    </div>
                    <div id="filePreview" style="margin-top:10px;display:none;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;max-height:200px;overflow-y:auto;">
                        <p style="font-size:12px;color:var(--text2);">📋 Xem trước:</p>
                        <pre id="fileContentPreview" style="font-size:11px;color:#fff;white-space:pre-wrap;word-break:break-all;"></pre>
                    </div>
                    <p style="font-size:12px;color:var(--text2);margin-top:8px;">⚠️ Import sẽ xóa tất cả mã cũ!</p>
                </div>
            `;

            // QUẢN LÝ LOẠI LINK
            taskHTML += `
                <div class="card">
                    <div class="card-title">🔗 Quản lý loại link</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                        <input class="input" id="newLinkName" placeholder="Tên loại" style="margin-bottom:0;">
                        <input class="input" id="newLinkId" placeholder="ID (tự động)" style="margin-bottom:0;color:var(--text2);" readonly>
                        <input class="input" id="newLinkMax" type="number" placeholder="Số lượt/ngày" style="margin-bottom:0;">
                        <input class="input" id="newLinkIcon" placeholder="Icon (VD: 🔗)" style="margin-bottom:0;">
                        <input class="input" id="newLinkColor" type="color" value="#5f91ff" style="margin-bottom:0;padding:4px;height:40px;">
                        <input class="input" id="newLinkUrl" placeholder="URL (có {code})" style="margin-bottom:0;">
                        <select class="input" id="newLinkStatus" style="margin-bottom:0;">
                            <option value="true">🟢 Hoạt động</option>
                            <option value="false">🔴 Tạm dừng</option>
                        </select>
                        <button class="btn btn-success" id="addLinkType">➕ Thêm loại</button>
                    </div>
                    ${Object.entries(linkTypes).map(([id, type]) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;border-left:4px solid ${type.color || '#5f91ff'};">
                            <div><span>${type.icon || '🔗'} <b>${type.name}</b></span>
                            <span style="font-size:12px;color:var(--text2);margin-left:8px;">${type.maxPerDay} lượt</span>
                            <span style="font-size:12px;color:${type.active ? '#2ed573' : '#ff4757'};margin-left:8px;">${type.active ? '🟢' : '🔴'}</span></div>
                            <div>
                                <button class="btn-sm btn-primary editLinkType" data-id="${id}">✏️</button>
                                <button class="btn-sm btn-danger deleteLinkType" data-id="${id}">🗑️</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            // DANH SÁCH MÃ
            taskHTML += `
                <div class="card">
                    <div class="card-title">📋 Danh sách mã (${Object.keys(codes).length})</div>
                    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                        <input class="input" id="searchCode" placeholder="Tìm mã..." style="margin-bottom:0;flex:1;min-width:150px;">
                        <select class="input" id="filterCodeType" style="margin-bottom:0;width:auto;">
                            <option value="all">Tất cả</option>
                            ${Object.entries(linkTypes).map(([id, type]) => `<option value="${id}">${type.icon || '🔗'} ${type.name}</option>`).join('')}
                        </select>
                    </div>
                    <div id="codeList" style="max-height:300px;overflow-y:auto;">
                        ${Object.entries(codes).slice(0, 50).map(([code, c]) => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.05);">
                                <div>
                                    <span style="font-weight:bold;">${code}</span>
                                    <span style="font-size:12px;color:var(--text2);margin-left:8px;">${linkTypes[c.type]?.icon || '🔗'} ${linkTypes[c.type]?.name || c.type}</span>
                                    <span style="font-size:12px;color:${c.usedCount < c.maxUses ? '#2ed573' : '#ff4757'};margin-left:8px;">${c.usedCount}/${c.maxUses}</span>
                                </div>
                                <button class="btn-sm btn-danger deleteCode" data-code="${code}">🗑️</button>
                            </div>
                        `).join('')}
                        ${Object.keys(codes).length === 0 ? '<p style="text-align:center;color:var(--text2);">Chưa có mã nào</p>' : ''}
                        ${Object.keys(codes).length > 50 ? `<p style="text-align:center;color:var(--text2);font-size:12px;">Hiển thị 50/${Object.keys(codes).length} mã</p>` : ''}
                    </div>
                </div>
            `;

            // LỊCH SỬ IMPORT
            taskHTML += `
                <div class="card">
                    <div class="card-title">📥 Lịch sử import</div>
                    ${importLogs.map(log => `
                        <div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">
                            ${log.status === 'success' ? '✅' : '❌'} ${new Date(log.importedAt).toLocaleString('vi-VN')} - ${log.totalCodes || 0} mã
                            ${log.message ? `- ${log.message}` : ''}
                        </div>
                    `).join('') || '<p style="color:var(--text2);">Chưa có lịch sử import</p>'}
                </div>
            `;

            content.innerHTML = taskHTML;

            // ===== SỰ KIỆN =====
            // Tự động tạo ID
            document.getElementById('newLinkName').oninput = function() {
                const id = FB.generateId(this.value);
                document.getElementById('newLinkId').value = id;
            };

            // Chọn file
            document.getElementById('chooseMaFile').onclick = () => {
                document.getElementById('maFileInput').click();
            };

            document.getElementById('maFileInput').onchange = function(e) {
                const file = this.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(event) {
                    const content = event.target.result;
                    document.getElementById('fileContentPreview').textContent = content;
                    document.getElementById('filePreview').style.display = 'block';
                    document.getElementById('importMaFile').style.display = 'inline-block';
                    document.getElementById('cancelImport').style.display = 'inline-block';
                    document.getElementById('importType').style.display = 'inline-block';
                    document.getElementById('chooseMaFile').style.display = 'none';
                    document.getElementById('importMaFile').dataset.content = content;
                };
                reader.readAsText(file);
            };

            document.getElementById('cancelImport').onclick = () => {
                document.getElementById('filePreview').style.display = 'none';
                document.getElementById('importMaFile').style.display = 'none';
                document.getElementById('cancelImport').style.display = 'none';
                document.getElementById('importType').style.display = 'none';
                document.getElementById('chooseMaFile').style.display = 'inline-block';
                document.getElementById('maFileInput').value = '';
            };

            // Import file
            document.getElementById('importMaFile').onclick = async () => {
                const content = document.getElementById('importMaFile').dataset.content;
                const typeId = document.getElementById('importType').value || 'link4m';
                if (!content) return;
                if (!confirm('⚠️ Import sẽ XÓA TẤT CẢ mã cũ! Bạn chắc chắn?')) return;

                const btn = document.getElementById('importMaFile');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang import...';
                btn.disabled = true;

                try {
                    const result = await codeManager.importMaFile(content, typeId);
                    await FB.db.ref('code_file/codes').remove();
                    const updates = {};
                    for (let [code, data] of Object.entries(result.codes)) {
                        updates[`code_file/codes/${code}`] = data;
                    }
                    await FB.db.ref().update(updates);
                    await FB.db.ref('import_logs').push({
                        fileName: 'ma.txt',
                        totalCodes: result.totalCodes,
                        importedAt: Date.now(),
                        status: 'success',
                        type: typeId
                    });
                    this.app.toast(`✅ Import thành công! Đã thêm ${result.totalCodes} mã.`, 'success');
                    document.getElementById('filePreview').style.display = 'none';
                    document.getElementById('importMaFile').style.display = 'none';
                    document.getElementById('cancelImport').style.display = 'none';
                    document.getElementById('importType').style.display = 'none';
                    document.getElementById('chooseMaFile').style.display = 'inline-block';
                    document.getElementById('maFileInput').value = '';
                    this.loadTab('tasks');
                } catch (error) {
                    console.error('Import error:', error);
                    this.app.toast('❌ Có lỗi xảy ra khi import!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };

            // Thêm loại link
            document.getElementById('addLinkType').onclick = async () => {
                const name = document.getElementById('newLinkName').value.trim();
                const id = document.getElementById('newLinkId').value.trim() || FB.generateId(name);
                const maxPerDay = parseInt(document.getElementById('newLinkMax').value);
                const icon = document.getElementById('newLinkIcon').value.trim() || '🔗';
                const color = document.getElementById('newLinkColor').value;
                const url = document.getElementById('newLinkUrl').value.trim();
                const active = document.getElementById('newLinkStatus').value === 'true';

                if (!name || !url || !maxPerDay) {
                    this.app.toast('Vui lòng điền đầy đủ!', 'warning');
                    return;
                }

                const existing = await FB.getLinkTypes();
                if (existing[id]) {
                    this.app.toast(`ID "${id}" đã tồn tại!`, 'error');
                    return;
                }

                await FB.addLinkType(id, { name, maxPerDay, icon, color, url, active });
                this.app.toast(`✅ Đã thêm loại link "${name}"!`, 'success');
                this.loadTab('tasks');
            };

            // Xóa loại link
            document.querySelectorAll('.deleteLinkType').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const type = CONFIG.linkTypes[id];
                    if (!confirm(`Xóa loại link "${type?.name || id}"?`)) return;
                    await FB.deleteLinkType(id);
                    this.app.toast('Đã xóa!', 'success');
                    this.loadTab('tasks');
                };
            });

            // Sửa loại link
            document.querySelectorAll('.editLinkType').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.id;
                    const type = CONFIG.linkTypes[id];
                    if (!type) return;
                    document.getElementById('newLinkName').value = type.name;
                    document.getElementById('newLinkId').value = id;
                    document.getElementById('newLinkMax').value = type.maxPerDay;
                    document.getElementById('newLinkIcon').value = type.icon || '🔗';
                    document.getElementById('newLinkColor').value = type.color || '#5f91ff';
                    document.getElementById('newLinkUrl').value = type.url || '';
                    document.getElementById('newLinkStatus').value = type.active ? 'true' : 'false';
                    document.getElementById('addLinkType').textContent = '💾 Cập nhật';
                    document.getElementById('addLinkType').dataset.editId = id;
                    
                    document.getElementById('addLinkType').onclick = async () => {
                        const name = document.getElementById('newLinkName').value.trim();
                        const editId = document.getElementById('addLinkType').dataset.editId;
                        const maxPerDay = parseInt(document.getElementById('newLinkMax').value);
                        const icon = document.getElementById('newLinkIcon').value.trim() || '🔗';
                        const color = document.getElementById('newLinkColor').value;
                        const url = document.getElementById('newLinkUrl').value.trim();
                        const active = document.getElementById('newLinkStatus').value === 'true';
                        if (!name || !url || !maxPerDay) {
                            this.app.toast('Vui lòng điền đầy đủ!', 'warning');
                            return;
                        }
                        await FB.updateLinkType(editId, { name, maxPerDay, icon, color, url, active });
                        this.app.toast(`✅ Đã cập nhật "${name}"!`, 'success');
                        document.getElementById('addLinkType').textContent = '➕ Thêm loại';
                        delete document.getElementById('addLinkType').dataset.editId;
                        this.loadTab('tasks');
                    };
                };
            });

            // Xóa mã
            document.querySelectorAll('.deleteCode').forEach(btn => {
                btn.onclick = async () => {
                    const code = btn.dataset.code;
                    if (!confirm(`Xóa mã "${code}"?`)) return;
                    await FB.db.ref('code_file/codes/' + code).remove();
                    this.app.toast('Đã xóa mã!', 'success');
                    this.loadTab('tasks');
                };
            });

            // Tìm kiếm mã
            document.getElementById('searchCode').oninput = function() {
                const keyword = this.value.toLowerCase();
                const typeFilter = document.getElementById('filterCodeType').value;
                const items = document.querySelectorAll('#codeList > div');
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const show = text.includes(keyword) && (typeFilter === 'all' || text.includes(typeFilter));
                    item.style.display = show ? 'flex' : 'none';
                });
            };

            document.getElementById('filterCodeType').onchange = function() {
                document.getElementById('searchCode').dispatchEvent(new Event('input'));
            };
        }
        
        // Các tab khác (config, fund, giftcodes, withdraws, users, leaderboard, notify, logs, security, theme)
        // Đã có trong code gốc, giữ nguyên
        else if (tab === 'config') {
            // Giữ nguyên code config
        }
        // ... các tab khác giữ nguyên ...
    }
}

// ==================== APP CHÍNH ====================
class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) { this.tg.ready(); this.tg.expand(); }
        this.user = null; this.isAdmin = false;
        this.currentPage = null;
    }
    
    async init() {
        try {
            await FB.loadConfig();
            const initData = this.tg?.initDataUnsafe;
            this.user = initData?.user ? { id: initData.user.id.toString(), username: initData.user.username || 'User' } : { id: 'test123', username: 'TestUser' };
            await FB.createUser(this.user.id, this.user);
            this.isAdmin = await FB.isAdmin(this.user.id);
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            this.setupNav();
            this.loadPage('home');
            this.refreshUserBar();
            
            FB.db.ref("notifications").orderByChild("timestamp").limitToLast(20).on("value", snap => {
                const arr = [];
                snap.forEach(c => { arr.push(c.val()); });
                arr.reverse();
                this._notifications = arr;
                const lastSeen = Number(localStorage.getItem("lastSeenNotify") || 0);
                const newCount = arr.filter(n => n.timestamp > lastSeen).length;
                const badge = document.getElementById("notifyBadge");
                if (badge) {
                    if (newCount > 0) {
                        badge.textContent = newCount;
                        badge.style.display = "block";
                    } else {
                        badge.style.display = "none";
                    }
                }
            });
            document.getElementById('btnNotifications').onclick = () => this.showNotifications();
            this.applyTheme();
            
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.currentPage && this.currentPage.destroy) {
                    this.currentPage.destroy();
                }
            });
        } catch (e) {
            document.getElementById('loadingScreen').innerHTML = `<div style="color:red;padding:20px;"><h3>❌ Lỗi khởi tạo:</h3><p>${e.message}</p></div>`;
            console.error('Init error:', e);
        }
    }
    
    setupNav() {
        const items = [
            { page:'home', icon:'🏠', label:'Trang chủ' },
            { page:'tasks', icon:'📋', label:'Nhiệm vụ' },
            { page:'friends', icon:'👥', label:'Bạn bè' },
            { page:'leaderboard', icon:'🏆', label:'BXH' },
            { page:'pvp', icon:'🎮', label:'PvP' },
            { page:'account', icon:'👤', label:'Tài khoản' }
        ];
        if (this.isAdmin) items.push({ page:'admin', icon:'👑', label:'Admin' });
        document.getElementById('bottomNav').innerHTML = items.map(item => 
            `<button class="nav-btn" data-page="${item.page}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`
        ).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }
    
    async loadPage(page) {
        if (this.currentPage && this.currentPage.destroy) {
            this.currentPage.destroy();
        }
        const main = document.getElementById('mainContent');
        const userData = await FB.getUser(this.user.id);
        const pages = {
            home: HomePage,
            tasks: TasksPage,
            friends: FriendsPage,
            leaderboard: LeaderboardPage,
            pvp: PvPPage,
            account: AccountPage,
            admin: AdminPage
        };
        if (pages[page]) {
            this.currentPage = new pages[page](this, main, userData);
            this.currentPage.render();
        }
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }
    
    async refreshUserBar() {
        const userData = await FB.getUser(this.user.id);
        if (!userData) return;
        document.getElementById('userBar').innerHTML = `
            <span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span>
            <span>🪙 ${(userData.balance||0).toLocaleString()}</span>
        `;
    }
    
    toast(msg, type = 'info') {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = `toast toast-${type} show`;
        clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
    }
    
    applyTheme() {
        const starColor = CONFIG.starColor || DEFAULT_CONFIG.starColor;
        const bgColor1 = CONFIG.bgColor1 || DEFAULT_CONFIG.bgColor1;
        const bgColor2 = CONFIG.bgColor2 || DEFAULT_CONFIG.bgColor2;
        document.body.style.background = `radial-gradient(ellipse at bottom, ${bgColor1} 0%, ${bgColor2} 100%)`;
        let styleEl = document.getElementById('dynamic-theme');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dynamic-theme';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            .shooting_star {
                background: linear-gradient(-45deg, ${starColor}, rgba(0, 0, 255, 0)) !important;
                filter: drop-shadow(0 0 6px ${starColor}) !important;
            }
            .shooting_star::before,
            .shooting_star::after {
                background: linear-gradient(-45deg, rgba(0, 0, 255, 0), ${starColor}, rgba(0, 0, 255, 0)) !important;
            }
        `;
    }
    
    showNotifications() {
        localStorage.setItem('lastSeenNotify', Date.now());
        document.getElementById('notifyBadge').style.display = 'none';
        const notifies = this._notifications || [];
        const html = notifies.length === 0 ? 
            '<p style="text-align:center;color:var(--text2);">Chưa có thông báo</p>' : 
            notifies.map(n => `<div class="notify-item"><p>${n.message}</p><p class="time">${new Date(n.timestamp).toLocaleString('vi-VN')}</p></div>`).join('');
        let popup = document.getElementById('notifyPopup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'notifyPopup';
            popup.className = 'notifications-popup';
            popup.innerHTML = `<div class="popup-content"><button class="popup-close" id="closeNotifyPopup">✕</button><h3>📢 Thông báo</h3><div id="notifyList"></div></div>`;
            document.body.appendChild(popup);
            document.getElementById('closeNotifyPopup').onclick = () => popup.classList.remove('show');
            popup.addEventListener('click', (e) => {
                if (e.target === popup) popup.classList.remove('show');
            });
        }
        document.getElementById('notifyList').innerHTML = html;
        popup.classList.add('show');
    }
}

// ==================== SAO BĂNG ====================
function createShootingStars() {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:-1;overflow:hidden;';
    document.body.prepend(container);
    for (let i = 0; i < 6; i++) {
        const star = document.createElement('div');
        star.className = 'shooting_star';
        const size = Math.random() * 3 + 1;
        star.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            top: ${Math.random() * 40}%;
            left: ${Math.random() * 100}%;
            animation-delay: ${Math.random() * 6}s;
            animation-duration: ${Math.random() * 3 + 2}s;
        `;
        container.appendChild(star);
    }
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
    createShootingStars();
    window.app = new CayXumMo();
    window.app.init();
});minWithdraw: parseInt(document.getElementById('cfgMinWithdraw').value) || 20000,
                        maxWithdraw: parseInt(document.getElementById('cfgMaxWithdraw').value) || 100000,
                        maxWithdrawPerDay: parseInt(document.getElementById('cfgMaxWithdrawPerDay').value) || 3,
                        exchange_rate: parseInt(document.getElementById('cfgRate').value) || 10
                    };
                    await FB.db.ref('admin_config').set(newConfig);
                    await FB.loadConfig();
                    await FB.db.ref('admin_logs').push({
                        adminId: this.app.user.id,
                        action: 'save_config',
                        details: newConfig,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    this.app.toast('Đã lưu cấu hình!', 'success');
                    this.loadTab('config');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
        }
        else if (tab === 'fund') {
            const fundSnap = await FB.db.ref('prize_fund').once('value');
            const fund = fundSnap.val() || 0;
            content.innerHTML = `
                <div class="card"><div class="card-title">💰 Quỹ hiện tại</div><p style="font-size:32px;font-weight:bold;text-align:center;color:var(--gold);">${fund.toLocaleString()} 🪙</p></div>
                <div class="card"><div class="card-title">➕ Nạp thêm</div><input class="input" id="fundAdd" type="number" placeholder="Số 🪙"><button class="btn btn-primary" id="btnAddFund">💰 Nạp vào quỹ</button></div>
                <p style="font-size:12px;color:var(--text2);">Nguồn: 10% phí PvP + Admin nạp</p>
            `;
            document.getElementById('btnAddFund').onclick = async () => {
                const add = parseInt(document.getElementById('fundAdd').value) || 0;
                if (add <= 0) return this.app.toast('Nhập số 🪙!', 'warning');
                const btn = document.getElementById('btnAddFund');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang xử lý...';
                btn.disabled = true;
                try {
                    await FB.db.ref('prize_fund').set(fund + add);
                    await FB.db.ref('admin_logs').push({
                        adminId: this.app.user.id,
                        action: 'add_fund',
                        amount: add,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    this.app.toast(`Đã nạp ${add.toLocaleString()} 🪙!`, 'success');
                    this.loadTab('fund');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
        }
        else if (tab === 'giftcodes') {
            const giftsSnap = await FB.db.ref('gift_codes').once('value');
            const gifts = giftsSnap.val() || {};
            content.innerHTML = `<h3>🎁 Gift Code</h3><input class="input" id="giftName" placeholder="Tên code"><input class="input" id="giftReward" type="number" value="500" placeholder="🪙"><input class="input" id="giftMax" type="number" value="100" placeholder="Lượt dùng"><input class="input" id="giftExpiry" type="date"><button class="btn btn-success" id="createGift">Tạo</button><div style="margin-top:10px;">${Object.entries(gifts).map(([code,g]) => `<div style="padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><b>${code}</b> | ${g.reward}🪙 | ${g.usedCount||0}/${g.maxUses} | <button class="btn-sm btn-danger" data-code="${code}">Xóa</button></div>`).join('')}</div>`;
            document.getElementById('createGift').onclick = async () => {
                const name = document.getElementById('giftName').value.trim();
                const reward = parseInt(document.getElementById('giftReward').value) || 500;
                const maxUses = parseInt(document.getElementById('giftMax').value) || 100;
                const expiry = document.getElementById('giftExpiry').value;
                if (!name) return this.app.toast('Nhập tên!', 'warning');
                const btn = document.getElementById('createGift');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang tạo...';
                btn.disabled = true;
                try {
                    await FB.db.ref(`gift_codes/${name}`).set({ reward, maxUses, usedCount: 0, expiry: expiry ? new Date(expiry).getTime() : null, active: true });
                    await FB.db.ref('admin_logs').push({
                        adminId: this.app.user.id,
                        action: 'create_gift',
                        code: name,
                        details: { reward, maxUses, expiry },
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    this.app.toast('Đã tạo!', 'success');
                    this.loadTab('giftcodes');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
            document.querySelectorAll('.btn-danger').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm(`Xóa Gift Code ${btn.dataset.code}?`)) return;
                    const code = btn.dataset.code;
                    try {
                        await FB.db.ref(`gift_codes/${code}`).remove();
                        await FB.db.ref('admin_logs').push({
                            adminId: this.app.user.id,
                            action: 'delete_gift',
                            code: code,
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        });
                        this.app.toast('Đã xóa!', 'success');
                        this.loadTab('giftcodes');
                    } catch (error) {
                        this.app.toast('Có lỗi xảy ra!', 'error');
                    }
                };
            });
        }
        else if (tab === 'withdraws') {
            const wSnap = await FB.db.ref('withdraw_requests').once('value');
            const withdraws = [];
            wSnap.forEach(c => {
                withdraws.push({ id: c.key, ...c.val() });
            });
            withdraws.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            content.innerHTML = `<h3>💸 Rút 🪙 (Tất cả: ${withdraws.length})</h3>
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <button class="btn btn-sm btn-primary filter-withdraw active" data-filter="all">Tất cả</button>
                    <button class="btn btn-sm btn-warning filter-withdraw" data-filter="pending">🟡 Chờ duyệt</button>
                    <button class="btn btn-sm btn-success filter-withdraw" data-filter="approved">🟢 Đã duyệt</button>
                    <button class="btn btn-sm btn-danger filter-withdraw" data-filter="rejected">🔴 Từ chối</button>
                </div>
                <div id="withdrawList">
                    ${withdraws.length === 0 ? '<p style="text-align:center;color:var(--text2);">Chưa có yêu cầu rút nào</p>' :
                    withdraws.map(w => `<div class="withdraw-item" data-status="${w.status}" style="padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;">
                        <p>👤 ${w.username} | 🪙 ${w.amountXu.toLocaleString()}</p>
                        <p>🏦 ${w.bank} | 👤 ${w.accountName} | 💳 ${w.accountNumber}</p>
                        <span class="badge badge-${w.status==='pending'?'pending':w.status==='approved'?'success':'rejected'}">${w.status==='pending'?'🟡 Chờ':w.status==='approved'?'🟢 Thành công':'🔴 Từ chối'}</span>
                        ${w.status==='pending' ? `<button class="btn-sm btn-success approve" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Duyệt</button><button class="btn-sm btn-danger reject" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Từ chối</button>` : ''}
                    </div>`).join('')}
                </div>`;
            document.querySelectorAll('.filter-withdraw').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.filter-withdraw').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const filter = btn.dataset.filter;
                    document.querySelectorAll('.withdraw-item').forEach(item => {
                        item.style.display = (filter === 'all' || item.dataset.status === filter) ? 'block' : 'none';
                    });
                };
            });
            document.querySelectorAll('.approve').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Xác nhận duyệt yêu cầu này?')) return;
                    const id = btn.dataset.id;
                    const uid = btn.dataset.uid;
                    const amount = parseInt(btn.dataset.amount);
                    try {
                        await FB.db.ref(`withdraw_requests/${id}`).update({
                            status: 'approved', reviewedBy: this.app.user.username, reviewedAt: firebase.database.ServerValue.TIMESTAMP
                        });
                        await FB.db.ref('admin_logs').push({
                            adminId: this.app.user.id,
                            action: 'approve_withdraw',
                            requestId: id,
                            userId: uid,
                            amount: amount,
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        });
                        this.app.toast('Đã duyệt!', 'success'); this.loadTab('withdraws');
                    } catch (error) {
                        this.app.toast('Có lỗi xảy ra!', 'error');
                    }
                };
            });
            document.querySelectorAll('.reject').forEach(btn => {
                btn.onclick = async () => {
                    const reason = prompt('Lý do từ chối (không bắt buộc):');
                    if (!confirm('Xác nhận từ chối yêu cầu này?')) return;
                    const id = btn.dataset.id;
                    const uid = btn.dataset.uid;
                    const amount = parseInt(btn.dataset.amount);
                    try {
                        await FB.addBalance(uid, amount);
                        await FB.db.ref(`withdraw_requests/${id}`).update({
                            status: 'rejected', reviewedBy: this.app.user.username, reviewedAt: firebase.database.ServerValue.TIMESTAMP, rejectReason: reason || ''
                        });
                        await FB.db.ref('admin_logs').push({
                            adminId: this.app.user.id,
                            action: 'reject_withdraw',
                            requestId: id,
                            userId: uid,
                            amount: amount,
                            reason: reason || '',
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        });
                        this.app.toast('Đã từ chối, hoàn 🪙!', 'warning'); this.loadTab('withdraws');
                    } catch (error) {
                        this.app.toast('Có lỗi xảy ra!', 'error');
                    }
                };
            });
        }
        else if (tab === 'users') {
            content.innerHTML = `
                <h3>👥 Users</h3>
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <input class="input" id="searchUser" placeholder="Tìm ID hoặc username..." style="margin-bottom:0;">
                    <button class="btn btn-sm btn-primary" id="searchBtn">🔍 Tìm</button>
                </div>
                <div id="userResult">Đang tải danh sách...</div>
                <div id="pagination" style="display:flex;gap:4px;margin-top:12px;flex-wrap:wrap;justify-content:center;"></div>
            `;

            const ITEMS_PER_PAGE = 50;
            let allUsers = [];
            let currentPage = 1;
            let filteredUsers = null;

            const renderUsers = (usersArr) => {
                const start = (currentPage - 1) * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE;
                const pageUsers = usersArr.slice(start, end);

                if (pageUsers.length === 0) {
                    document.getElementById('userResult').innerHTML = '<p style="text-align:center;color:var(--text2);">Không có người dùng nào</p>';
                    document.getElementById('pagination').innerHTML = '';
                    return;
                }

                const html = pageUsers.map(([id, u]) => `
                    <div style="padding:8px;background:rgba(255,255,255,0.05);margin-top:5px;border-radius:5px;">
                        <p><b>${u.username || 'Unknown'}</b> (ID: ${id})</p>
                        <p>🪙: ${(u.balance || 0).toLocaleString()} | 🔗 ${u.completedLinks || 0} link | 👥 ${(u.friends || []).length} bạn</p>
                        <div style="display:flex;gap:8px;margin-top:5px;flex-wrap:wrap;">
                            <input class="input" id="editBal_${id}" placeholder="Sửa 🪙" type="number" style="margin-bottom:0;flex:1;min-width:80px;">
                            <button class="btn-sm btn-primary editBal" data-uid="${id}">Lưu</button>
                            ${!u.isBanned ? 
                                `<button class="btn-sm btn-danger banUser" data-uid="${id}" data-username="${u.username}">🚫 Khóa</button>` :
                                `<button class="btn-sm btn-success unbanUser" data-uid="${id}" data-username="${u.username}">✅ Mở khóa</button>`
                            }
                            <button class="btn-sm btn-danger deleteUser" data-uid="${id}" data-username="${u.username}" style="background:#d50000;">🗑️ Xóa</button>
                        </div>
                    </div>
                `).join('');
                document.getElementById('userResult').innerHTML = html;

                document.querySelectorAll('.editBal').forEach(btn => {
                    btn.onclick = async () => {
                        const newBal = parseInt(document.getElementById(`editBal_${btn.dataset.uid}`).value);
                        if (isNaN(newBal)) return;
                        try {
                            await FB.updateUser(btn.dataset.uid, { balance: newBal });
                            this.app.toast('Đã cập nhật!', 'success');
                            this.loadTab('users');
                        } catch (error) {
                            this.app.toast('Có lỗi xảy ra!', 'error');
                        }
                    };
                });
                document.querySelectorAll('.banUser').forEach(btn => {
                    btn.onclick = async () => {
                        if (confirm(`Khóa tài khoản ${btn.dataset.username}?`)) {
                            try {
                                await FB.updateUser(btn.dataset.uid, { isBanned: true });
                                this.app.toast('Đã khóa!', 'success');
                                this.loadTab('users');
                            } catch (error) {
                                this.app.toast('Có lỗi xảy ra!', 'error');
                            }
                        }
                    };
                });
                document.querySelectorAll('.unbanUser').forEach(btn => {
                    btn.onclick = async () => {
                        if (confirm(`Mở khóa tài khoản ${btn.dataset.username}?`)) {
                            try {
                                await FB.updateUser(btn.dataset.uid, { isBanned: false });
                                this.app.toast('Đã mở khóa!', 'success');
                                this.loadTab('users');
                            } catch (error) {
                                this.app.toast('Có lỗi xảy ra!', 'error');
                            }
                        }
                    };
                });
                document.querySelectorAll('.deleteUser').forEach(btn => {
                    btn.onclick = async () => {
                        const confirmMsg = `Bạn có chắc muốn XÓA VĨNH VIỄN tài khoản "${btn.dataset.username}" (ID: ${btn.dataset.uid})?\n\nHành động này sẽ xóa tất cả dữ liệu liên quan và KHÔNG THỂ hoàn tác!`;
                        if (confirm(confirmMsg)) {
                            const uid = btn.dataset.uid;
                            try {
                                await FB.db.ref(`users/${uid}`).remove();
                                await FB.db.ref(`leaderboard/${uid}`).remove();
                                const withdrawSnap = await FB.db.ref('withdraw_requests').orderByChild('userId').equalTo(uid).once('value');
                                const updates = {};
                                withdrawSnap.forEach(c => { updates[`withdraw_requests/${c.key}`] = null; });
                                if (Object.keys(updates).length > 0) {
                                    await FB.db.ref().update(updates);
                                }
                                await FB.db.ref('admin_logs').push({
                                    adminId: this.app.user.id,
                                    action: 'delete_user',
                                    deletedUserId: uid,
                                    deletedUsername: btn.dataset.username,
                                    timestamp: firebase.database.ServerValue.TIMESTAMP
                                });
                                this.app.toast(`Đã xóa tài khoản ${btn.dataset.username}!`, 'success');
                                this.loadTab('users');
                            } catch (error) {
                                this.app.toast('Có lỗi xảy ra!', 'error');
                            }
                        }
                    };
                });

                const totalPages = Math.ceil(usersArr.length / ITEMS_PER_PAGE);
                let pagHTML = '';
                for (let i = 1; i <= totalPages; i++) {
                    pagHTML += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : ''}" style="width:auto;padding:6px 10px;" data-page="${i}">${i}</button>`;
                }
                document.getElementById('pagination').innerHTML = pagHTML;
                document.querySelectorAll('#pagination button').forEach(btn => {
                    btn.onclick = () => {
                        currentPage = parseInt(btn.dataset.page);
                        renderUsers(filteredUsers || allUsers);
                    };
                });
            };

            const snap = await FB.db.ref('users').once('value');
            allUsers = Object.entries(snap.val() || {}).sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0));
            renderUsers(allUsers);

            document.getElementById('searchBtn').onclick = async () => {
                const keyword = document.getElementById('searchUser').value.trim().toLowerCase();
                if (!keyword) {
                    filteredUsers = null;
                    currentPage = 1;
                    renderUsers(allUsers);
                    return;
                }
                const filtered = allUsers.filter(([id, u]) => 
                    id.includes(keyword) || (u.username || '').toLowerCase().includes(keyword)
                );
                filteredUsers = filtered;
                currentPage = 1;
                renderUsers(filtered);
            };
        }
        else if (tab === 'leaderboard') {
            const topLinks = await FB.getTopLinks(10);
            const topFriends = await FB.getTopFriends(10);
            content.innerHTML = `
                <div class="grid-2">
                    <div class="card"><div class="card-title">🏆 Top vượt link</div>${topLinks.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">🔗 ${u.links||0}</span></div>`).join('')}</div>
                    <div class="card"><div class="card-title">👥 Top mời bạn</div>${topFriends.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">👥 ${u.friends}</span></div>`).join('')}</div>
                </div>
            `;
        }
        else if (tab === 'notify') {
            content.innerHTML = `
                <div class="card"><div class="card-title">📢 Gửi thông báo</div><textarea class="input" id="notifyMsg" rows="3" placeholder="Nội dung thông báo..."></textarea><button class="btn btn-warning" id="btnNotify">📢 Gửi cho tất cả</button></div>
                <div class="card"><div class="card-title">📋 Lịch sử</div><div id="notifyHistory">Đang tải...</div></div>
            `;
            document.getElementById('btnNotify').onclick = async () => {
                const msg = document.getElementById('notifyMsg').value.trim();
                if (!msg) return this.app.toast('Nhập nội dung!', 'warning');
                const btn = document.getElementById('btnNotify');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang gửi...';
                btn.disabled = true;
                try {
                    await FB.db.ref('notifications').push({ message: msg, sentBy: this.app.user.username, timestamp: firebase.database.ServerValue.TIMESTAMP });
                    await FB.db.ref('admin_logs').push({
                        adminId: this.app.user.id,
                        action: 'send_notification',
                        message: msg,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    this.app.toast('Đã gửi thông báo!', 'success');
                    document.getElementById('notifyMsg').value = '';
                    this.loadTab('notify');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
            const notifySnap = await FB.db.ref('notifications').orderByChild('timestamp').limitToLast(10).once('value');
            const notifies = []; notifySnap.forEach(c => notifies.push(c.val())); notifies.reverse();
            document.getElementById('notifyHistory').innerHTML = notifies.map(n => `<div style="padding:5px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">• ${new Date(n.timestamp).toLocaleString('vi-VN')} - ${n.message}</div>`).join('') || '<p>Chưa có thông báo</p>';
        }
        else if (tab === 'logs') {
            const logSnap = await FB.db.ref('admin_logs').orderByChild('timestamp').limitToLast(50).once('value');
            const logs = []; logSnap.forEach(c => logs.push({ id: c.key, ...c.val() }));
            logs.reverse();
            content.innerHTML = `<h3>📝 Nhật ký Admin</h3>${logs.map(l => `<div style="padding:5px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">• ${l.adminId || 'N/A'} - ${l.action} - ${new Date(l.timestamp).toLocaleString('vi-VN')}</div>`).join('') || '<p>Chưa có log</p>'}`;
        }
        else if (tab === 'security') {
            const alertSnap = await FB.db.ref('admin_alerts').orderByChild('timestamp').limitToLast(50).once('value');
            const alerts = []; alertSnap.forEach(c => alerts.push({ id: c.key, ...c.val() })); alerts.reverse();
            content.innerHTML = `<h3>🛡️ Cảnh báo bảo mật</h3>${alerts.map(a => `<div style="padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><p><b>${a.type}</b> - ${a.username} (${a.userId})</p><p style="font-size:11px;">${new Date(a.timestamp).toLocaleString('vi-VN')}</p>${a.status==='unread' ? `<button class="btn-sm btn-warning" data-id="${a.id}">Đã xem</button>` : ''}</div>`).join('') || '<p>Không có cảnh báo</p>'}`;
            document.querySelectorAll('.btn-warning').forEach(btn => btn.onclick = async () => { 
                try {
                    await FB.db.ref(`admin_alerts/${btn.dataset.id}/status`).set('reviewed'); 
                    this.loadTab('security');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                }
            });
        }
        else if (tab === 'theme') {
            const configSnap = await FB.db.ref('admin_config').once('value');
            const config = configSnap.val() || {};
            const starColor = config.starColor || CONFIG.starColor;
            const bgColor1 = config.bgColor1 || CONFIG.bgColor1;
            const bgColor2 = config.bgColor2 || CONFIG.bgColor2;

            content.innerHTML = `
                <div class="card">
                    <div class="card-title">🌟 Màu sao băng</div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="color" id="cfgStarColorPicker" value="${starColor}" style="width:50px;height:40px;border:none;cursor:pointer;">
                        <input class="input" id="cfgStarColorHex" placeholder="Nhập mã hex (VD: #ff0000)" value="${starColor}" style="flex:1;">
                    </div>
                </div>
                <div class="card">
                    <div class="card-title">🌌 Màu nền (Gradient)</div>
                    <label class="input-label">Màu trên cùng:</label>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="color" id="cfgBgColor1Picker" value="${bgColor1}" style="width:50px;height:40px;border:none;cursor:pointer;">
                        <input class="input" id="cfgBgColor1Hex" placeholder="Nhập mã hex" value="${bgColor1}" style="flex:1;">
                    </div>
                    <label class="input-label">Màu dưới cùng:</label>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="color" id="cfgBgColor2Picker" value="${bgColor2}" style="width:50px;height:40px;border:none;cursor:pointer;">
                        <input class="input" id="cfgBgColor2Hex" placeholder="Nhập mã hex" value="${bgColor2}" style="flex:1;">
                    </div>
                </div>
                <button class="btn btn-primary" id="saveTheme">💾 Lưu giao diện</button>
                <p style="font-size:12px;color:var(--text2);margin-top:8px;">⚠️ Áp dụng ngay sau khi lưu.</p>
            `;

            const syncColor = (pickerId, hexId) => {
                const picker = document.getElementById(pickerId);
                const hex = document.getElementById(hexId);
                picker.addEventListener('input', () => { hex.value = picker.value; });
                hex.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) picker.value = hex.value; });
            };
            syncColor('cfgStarColorPicker', 'cfgStarColorHex');
            syncColor('cfgBgColor1Picker', 'cfgBgColor1Hex');
            syncColor('cfgBgColor2Picker', 'cfgBgColor2Hex');

            document.getElementById('saveTheme').onclick = async () => {
                const newStarColor = document.getElementById('cfgStarColorHex').value.trim() || document.getElementById('cfgStarColorPicker').value;
                const newBgColor1 = document.getElementById('cfgBgColor1Hex').value.trim() || document.getElementById('cfgBgColor1Picker').value;
                const newBgColor2 = document.getElementById('cfgBgColor2Hex').value.trim() || document.getElementById('cfgBgColor2Picker').value;

                const hexRegex = /^#[0-9A-Fa-f]{6}$/;
                if (!hexRegex.test(newStarColor) || !hexRegex.test(newBgColor1) || !hexRegex.test(newBgColor2)) {
                    this.app.toast('Mã màu không hợp lệ! Hãy nhập đúng định dạng #RRGGBB', 'error');
                    return;
                }

                const btn = document.getElementById('saveTheme');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang lưu...';
                btn.disabled = true;

                try {
                    await FB.db.ref('admin_config').update({
                        starColor: newStarColor,
                        bgColor1: newBgColor1,
                        bgColor2: newBgColor2
                    });
                    await FB.loadConfig();
                    this.app.applyTheme();

                    await FB.db.ref('admin_logs').push({
                        adminId: this.app.user.id,
                        action: 'save_theme',
                        details: { starColor: newStarColor, bgColor1: newBgColor1, bgColor2: newBgColor2 },
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    this.app.toast('Đã lưu giao diện!', 'success');
                    this.loadTab('theme');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
        }
    }
}

// ==================== APP CHÍNH (Giữ nguyên) ====================
class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) { this.tg.ready(); this.tg.expand(); }
        this.user = null; this.isAdmin = false;
        this.currentPage = null;
    }
    async init() {
        try {
            await FB.loadConfig();
            const initData = this.tg?.initDataUnsafe;
            this.user = initData?.user ? { id: initData.user.id.toString(), username: initData.user.username || 'User' } : { id: 'test123', username: 'TestUser' };
            await FB.createUser(this.user.id, this.user); this.isAdmin = await FB.isAdmin(this.user.id);
            document.getElementById('loadingScreen').style.display = 'none'; document.getElementById('app').style.display = 'flex';
            this.setupNav(); this.loadPage('home'); this.refreshUserBar();
            FB.db.ref("notifications").orderByChild("timestamp").limitToLast(20).on("value", snap => {
                const arr = [];
                snap.forEach(c => { arr.push(c.val()); });
                arr.reverse();
                this._notifications = arr;
                const lastSeen = Number(localStorage.getItem("lastSeenNotify") || 0);
                const newCount = arr.filter(n => n.timestamp > lastSeen).length;
                const badge = document.getElementById("notifyBadge");
                if (badge) {
                    if (newCount > 0) {
                        badge.textContent = newCount;
                        badge.style.display = "block";
                    } else {
                        badge.style.display = "none";
                    }
                }
            });
            document.getElementById('btnNotifications').onclick = () => this.showNotifications();
            this.applyTheme();
            
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.currentPage && this.currentPage.destroy) {
                    this.currentPage.destroy();
                }
            });
        } catch (e) { document.getElementById('loadingScreen').innerHTML = `<div style="color:red;padding:20px;"><h3>❌ Lỗi khởi tạo:</h3><p>${e.message}</p></div>`; }
    }
    setupNav() {
        const items = [ { page:'home', icon:'🏠', label:'Trang chủ' }, { page:'tasks', icon:'📋', label:'Nhiệm vụ' }, { page:'friends', icon:'👥', label:'Bạn bè' }, { page:'leaderboard', icon:'🏆', label:'BXH' }, { page:'pvp', icon:'🎮', label:'PvP' }, { page:'account', icon:'👤', label:'Tài khoản' } ];
        if (this.isAdmin) items.push({ page:'admin', icon:'👑', label:'Admin' });
        document.getElementById('bottomNav').innerHTML = items.map(item => `<button class="nav-btn" data-page="${item.page}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }
    async loadPage(page) {
        if (this.currentPage && this.currentPage.destroy) {
            this.currentPage.destroy();
        }
        const main = document.getElementById('mainContent'); const userData = await FB.getUser(this.user.id);
        const pages = { home: HomePage, tasks: TasksPage, friends: FriendsPage, leaderboard: LeaderboardPage, pvp: PvPPage, account: AccountPage, admin: AdminPage };
        if (pages[page]) {
            this.currentPage = new pages[page](this, main, userData);
            this.currentPage.render();
        }
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`); if (activeBtn) activeBtn.classList.add('active');
    }
    async refreshUserBar() { const userData = await FB.getUser(this.user.id); document.getElementById('userBar').innerHTML = `<span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span><span>🪙 ${(userData.balance||0).toLocaleString()}</span>`; }
    toast(msg, type) { const t = document.getElementById('toast'); t.textContent = msg; t.className = `toast toast-${type} show`; setTimeout(() => t.classList.remove('show'), 2500); }

    applyTheme() {
        const starColor = CONFIG.starColor || DEFAULT_CONFIG.starColor;
        const bgColor1 = CONFIG.bgColor1 || DEFAULT_CONFIG.bgColor1;
        const bgColor2 = CONFIG.bgColor2 || DEFAULT_CONFIG.bgColor2;

        document.body.style.background = `radial-gradient(ellipse at bottom, ${bgColor1} 0%, ${bgColor2} 100%)`;

        let styleEl = document.getElementById('dynamic-theme');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dynamic-theme';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            .shooting_star {
                background: linear-gradient(-45deg, ${starColor}, rgba(0, 0, 255, 0)) !important;
                filter: drop-shadow(0 0 6px ${starColor}) !important;
            }
            .shooting_star::before,
            .shooting_star::after {
                background: linear-gradient(-45deg, rgba(0, 0, 255, 0), ${starColor}, rgba(0, 0, 255, 0)) !important;
            }
        `;
    }

    showNotifications() {
        localStorage.setItem('lastSeenNotify', Date.now());
        document.getElementById('notifyBadge').style.display = 'none';
        const notifies = this._notifications || [];
        const html = notifies.length === 0 ? '<p style="text-align:center;color:var(--text2);">Chưa có thông báo</p>' : notifies.map(n => `<div class="notify-item"><p>${n.message}</p><p class="time">${new Date(n.timestamp).toLocaleString('vi-VN')}</p></div>`).join('');
        let popup = document.getElementById('notifyPopup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'notifyPopup';
            popup.className = 'notifications-popup';
            popup.innerHTML = `<div class="popup-content"><button class="popup-close" id="closeNotifyPopup">✕</button><h3>📢 Thông báo</h3><div id="notifyList"></div></div>`;
            document.body.appendChild(popup);
            document.getElementById('closeNotifyPopup').onclick = () => popup.classList.remove('show');
        }
        document.getElementById('notifyList').innerHTML = html;
        popup.classList.add('show');
    }
}
window.addEventListener('DOMContentLoaded', () => { window.app = new CayXumMo(); window.app.init(); });