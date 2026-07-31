// ==================== CẤU HÌNH FIREBASE ====================
const CONFIG = {
    firebase: {
        apiKey: "AIzaSyCbevkIQrQ7vw7RegFrYfTL86z-8feHtUM",
        authDomain: "cay-xu-mmo.firebaseapp.com",
        databaseURL: "https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "cay-xu-mmo",
        storageBucket: "cay-xu-mmo.firebasestorage.app",
        messagingSenderId: "186442076157",
        appId: "1:186442076157:web:52d64c0239b0ae2d35d394",
        measurementId: "G-KLCC12WSG5"
    },
    DAILY_REWARDS: [50, 50, 50, 50, 100, 150, 300],
    PVP_TIMEOUT: 30,
    PVP_FEE: 0.1,
    MIN_WITHDRAW: 20000,
    MAX_WITHDRAW: 100000,
    LINKS_FOR_CHEST: 5,
    LINK_COOLDOWN: 300000,
    FRIEND_REWARDS: { 2: 100, 5: 300, 10: 1000 },
    DEFAULT_EXCHANGE_RATE: 10
};

// ==================== BẮT LỖI HIỂN THỊ ====================
window.onerror = function(msg, url, line) {
    document.getElementById('loadingScreen').innerHTML = 
        '<div style="color:red;padding:20px;"><h3>❌ Lỗi JavaScript:</h3><p>' + msg + '</p><p>Dòng: ' + line + '</p></div>';
};

// ==================== FIREBASE MANAGER ====================
class FirebaseManager {
    constructor() {
        if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
        this.db = firebase.database();
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
                lastLinkTime: 0, chestsOpened: 0, isBanned: false, createdAt: Date.now()
            });
        }
        return (await ref.once('value')).val();
    }

    async getUser(uid) { return (await this.db.ref('users/' + uid).once('value')).val(); }
    async updateUser(uid, data) { await this.db.ref('users/' + uid).update(data); }

    async addBalance(uid, amount) {
        const ref = this.db.ref('users/' + uid + '/balance');
        const snap = await ref.once('value');
        await ref.set(Math.max(0, (snap.val() || 0) + amount));
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

    async getTasks() { return (await this.db.ref('tasks').once('value')).val() || {}; }

    async verifyCode(uid, code) {
        const tasks = await this.getTasks();
        let task = null;
        for (let id in tasks) { if (tasks[id].code === code && tasks[id].active !== false) { task = tasks[id]; break; } }
        if (!task) return { status: 'invalid' };
        const user = await this.getUser(uid);
        if ((user.codesUsed || []).includes(code)) return { status: 'used' };
        if (user.lastLinkTime && Date.now() - user.lastLinkTime < CONFIG.LINK_COOLDOWN) {
            return { status: 'cooldown', message: 'Đợi ' + Math.ceil((CONFIG.LINK_COOLDOWN - (Date.now() - user.lastLinkTime)) / 60000) + ' phút' };
        }
        const reward = task.reward || 100;
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            completedLinks: (user.completedLinks || 0) + 1,
            totalLinksWeekly: (user.totalLinksWeekly || 0) + 1,
            totalLinksAllTime: (user.totalLinksAllTime || 0) + 1,
            lastLinkTime: Date.now(),
            codesUsed: [...(user.codesUsed || []), code]
        });
        await this.updateLeaderboard(uid, (user.totalLinksWeekly || 0) + 1);
        const canOpenChest = ((user.completedLinks || 0) + 1) % CONFIG.LINKS_FOR_CHEST === 0;
        return { status: 'ok', reward, canOpenChest };
    }

    async openChest(uid) {
        const user = await this.getUser(uid);
        if ((user.completedLinks || 0) < CONFIG.LINKS_FOR_CHEST) return { status: 'error', message: 'Chưa đủ link!' };
        const rewards = [50, 80, 100, 150, 200, 300, 500, 1000];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];
        await this.updateUser(uid, { balance: (user.balance || 0) + reward, chestsOpened: (user.chestsOpened || 0) + 1 });
        return { status: 'ok', reward };
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
            userId: uid, username: user.username, bank: data.bank,
            accountName: data.accountName, accountNumber: data.accountNumber,
            amountXu: amount, amountVnd: amount * rate, exchangeRate: rate,
            status: 'pending', createdAt: Date.now()
        });
        await this.addBalance(uid, -amount);
        return { status: 'ok', id: ref.key };
    }

    async getWithdrawHistory(uid) {
        const snap = await this.db.ref('withdraw_requests').orderByChild('userId').equalTo(uid).once('value');
        const arr = []; snap.forEach(c => arr.push({ id: c.key, ...c.val() })); return arr.reverse();
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
        const snap = await this.db.ref('users').once('value');
        const arr = []; snap.forEach(c => { const u = c.val(); arr.push({ userId: c.key, username: u.username, friends: (u.friends || []).length }); });
        arr.sort((a, b) => b.friends - a.friends); return arr.slice(0, limit);
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
}
const FB = new FirebaseManager();

// ==================== APP CHÍNH ====================
class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) { this.tg.ready(); this.tg.expand(); }
        this.user = null;
        this.isAdmin = false;
    }

    async init() {
        try {
            const initData = this.tg?.initDataUnsafe;
            if (initData?.user) {
                this.user = { id: initData.user.id.toString(), username: initData.user.username || 'User' };
            } else {
                this.user = { id: 'test123', username: 'TestUser' };
            }
            await FB.createUser(this.user.id, this.user);
            this.isAdmin = await FB.isAdmin(this.user.id);
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            this.setupNav();
            this.loadPage('home');
            this.refreshUserBar();
        } catch (e) {
            document.getElementById('loadingScreen').innerHTML = '<div style="color:red;padding:20px;"><h3>❌ Lỗi khởi tạo:</h3><p>' + e.message + '</p></div>';
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
        const nav = document.getElementById('bottomNav');
        nav.innerHTML = items.map(item => `<button class="nav-btn" data-page="${item.page}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }

    async loadPage(page) {
        const main = document.getElementById('mainContent');
        main.innerHTML = '<div class="card"><h2>' + {
            home:'🏠 Trang chủ', tasks:'📋 Nhiệm vụ', friends:'👥 Bạn bè',
            leaderboard:'🏆 BXH', pvp:'🎮 PvP', account:'👤 Tài khoản', admin:'👑 Admin'
        }[page] + '</h2><p>Đang phát triển...</p></div>';
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    async refreshUserBar() {
        const userData = await FB.getUser(this.user.id);
        document.getElementById('userBar').innerHTML = `<span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span><span>🪙 ${(userData.balance||0).toLocaleString()} xu</span>`;
    }

    toast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast toast-' + type + ' show';
        setTimeout(() => t.classList.remove('show'), 2500);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new CayXumMo();
    window.app.init();
});
