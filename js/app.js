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
    codeResetDays: 30,
};

let CONFIG = { ...DEFAULT_CONFIG };
// ==================== STORAGE WRAPPER ====================
const Storage = {
    _memory: {},
    
    getItem(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem(key);
            }
        } catch (e) {
            console.warn('localStorage không khả dụng, dùng memory storage');
        }
        return this._memory[key] || null;
    },
    
    setItem(key, value) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, value);
                return;
            }
        } catch (e) {
            console.warn('localStorage không khả dụng, dùng memory storage');
        }
        this._memory[key] = value;
    },
    
    removeItem(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
                return;
            }
        } catch (e) {
            console.warn('localStorage không khả dụng, dùng memory storage');
        }
        delete this._memory[key];
    }
};

// ==================== TẠO ID DUY NHẤT ====================
function generateUniqueId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    return 'UidWEB_' + timestamp;
}

// ==================== MÃ HÓA MẬT KHẨU ====================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'cayxummo_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(inputPassword, hashedPassword) {
    const inputHash = await hashPassword(inputPassword);
    return inputHash === hashedPassword;
}

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

// ==================== FIREBASE MANAGER ====================
class FirebaseManager {
    constructor() {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        this.db = firebase.database();
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
            codeResetDays: saved.codeResetDays || DEFAULT_CONFIG.codeResetDays,
            linkTypes: saved.linkTypes || DEFAULT_CONFIG.linkTypes
        };
        if (!CONFIG.linkTypes) CONFIG.linkTypes = DEFAULT_CONFIG.linkTypes;
        for (let key in DEFAULT_CONFIG.linkTypes) {
            if (!CONFIG.linkTypes[key]) CONFIG.linkTypes[key] = DEFAULT_CONFIG.linkTypes[key];
        }
    }

    // ===== THÊM MỚI: Lưu lịch sử giao dịch =====
    async addTransactionHistory(uid, type, amount, detail = '') {
        const ref = this.db.ref('transactions/' + uid).push();
        await ref.set({
            type: type,
            amount: amount,
            detail: detail,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
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

    // ===== SỬA: Thêm log =====
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
// ===== THÊM MỚI: Pool Mã =====
async getCodeFromPool(linkTypeId) {
    const poolRef = this.db.ref(`code_pools/${linkTypeId}`);
    const snap = await poolRef.once('value');
    const pool = snap.val() || {};
    const now = Date.now();
    const resetMs = CONFIG.codeResetDays * 86400000;
    const availableCodes = [];
    for (let code in pool) {
        if (!pool[code].usedAt || (now - pool[code].usedAt > resetMs)) availableCodes.push(code);
    }
    if (availableCodes.length === 0) return null;
    const randomCode = availableCodes[Math.floor(Math.random() * availableCodes.length)];
    await poolRef.child(randomCode).set({ used: true, usedAt: now, usedCount: (pool[randomCode]?.usedCount || 0) + 1 });
    return randomCode;
}

async getCodePoolStats(linkTypeId) {
    const poolRef = this.db.ref(`code_pools/${linkTypeId}`);
    const snap = await poolRef.once('value');
    const pool = snap.val() || {};
    const now = Date.now();
    const resetMs = CONFIG.codeResetDays * 86400000;
    let total = 0, available = 0, used = 0, expired = 0, codes = [];
    for (let code in pool) {
        total++;
        const cd = pool[code];
        const isExpired = cd.usedAt && (now - cd.usedAt > resetMs);
        const isAvailable = !cd.usedAt || isExpired;
        if (isAvailable) { available++; if (isExpired) expired++; } else used++;
        codes.push({ code, usedAt: cd.usedAt || null, usedCount: cd.usedCount || 0, available: isAvailable, expired: isExpired });
    }
    codes.sort((a, b) => { if (a.available && !b.available) return -1; if (!a.available && b.available) return 1; if (a.usedAt && b.usedAt) return b.usedAt - a.usedAt; return 0; });
    return { total, available, used, expired, codes };
}

async importCodes(linkTypeId, codesArray) {
    const poolRef = this.db.ref(`code_pools/${linkTypeId}`);
    const updates = {};
    for (let code of codesArray) { const c = code.trim(); if (c) updates[c] = { used: false, usedAt: null, usedCount: 0, addedAt: Date.now() }; }
    if (Object.keys(updates).length > 0) await poolRef.update(updates);
    return Object.keys(updates).length;
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

    // ===== SỬA: Thêm log =====
    async verifyCode(uid, code) {
        if (!rateLimiter.check(`verify_${uid}`, 5, 60000)) {
            return { status: 'error', message: 'Bạn đã gửi quá nhiều yêu cầu, vui lòng đợi!' };
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
        await this.addTransactionHistory(uid, 'task', reward, `Vượt link: ${code}`);
        await this.updateLeaderboard(uid, 1);

        if (isTool) {
            return { status: 'ok', reward, warning: 'Cảnh báo: Bạn đã nhập mã quá nhanh!' };
        }
        return { status: 'ok', reward };
    }

    // ===== SỬA: Thêm log =====
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

    // ===== SỬA: Thêm log =====
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

    // ===== SỬA: Thêm log =====
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

    // ===== SỬA: Thêm log =====
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

    // ===== THÊM MỚI: Lấy lịch sử giao dịch của 1 user =====
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
    const ref = this.db.ref('leaderboard/' + uid);
    await ref.transaction(currentData => {
        if (currentData === null) {
            return { userId: uid, username: user?.username || 'Unknown', links: links, updatedAt: Date.now() };
        }
        return { 
            ...currentData, 
            links: (currentData.links || 0) + links, 
            username: user?.username || currentData.username, 
            updatedAt: Date.now() 
        };
    });
}

    async getTopLinks(limit = 10) {
    const snap = await this.db.ref('leaderboard').once('value');
    const arr = []; 
    snap.forEach(c => arr.push({ id: c.key, ...c.val() })); 
    arr.sort((a, b) => (b.links || 0) - (a.links || 0));
    return arr.slice(0, limit);
}

    async getTopFriends(limit = 10) {
    const snap = await this.db.ref('users').once('value');
    const arr = []; 
    snap.forEach(c => { 
        const u = c.val(); 
        arr.push({ userId: c.key, username: u.username, friends: (u.friends || []).length }); 
    });
    arr.sort((a, b) => b.friends - a.friends);
    return arr.slice(0, limit);
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
class TasksPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }

    async render() {
        const completedLinks = this.userData.completedLinks || 0;
        const progress = completedLinks % CONFIG.linksForChest;
        const isReady = completedLinks >= CONFIG.linksForChest && progress === 0;
        const activeLinkTypes = Object.entries(CONFIG.linkTypes || {}).filter(([id, cfg]) => cfg.active);
        const cooldown = this.userData.lastCodeTime ? Math.max(0, CONFIG.linkCooldown - (Date.now() - this.userData.lastCodeTime)) : 0;
        const isCooldown = cooldown > 0;
        let linkTypeCardsHTML = '';

        // ===== Hàm kiểm tra khóa đến 3h sáng =====
        const isLockedUntil3AM = (dailyCountDateKey, dailyCountKey, maxPerDay) => {
            const today = new Date().toDateString();
            const now = new Date();
            const threeAM = new Date();
            threeAM.setHours(3, 0, 0, 0);
            
            // Nếu đã qua 3h sáng mà chưa reset → mở khóa
            if (now >= threeAM && this.userData[dailyCountDateKey] !== today) {
                return false; // Mở khóa
            }
            
            // Nếu hôm nay đã đủ lượt → khóa
            const countToday = (this.userData[dailyCountDateKey] === today) ? (this.userData[dailyCountKey] || 0) : 0;
            if (countToday >= maxPerDay) {
                // Nếu đã qua 3h sáng hôm nay → vẫn khóa đến mai 3h
                if (now >= threeAM) {
                    const tomorrow3AM = new Date();
                    tomorrow3AM.setDate(tomorrow3AM.getDate() + 1);
                    tomorrow3AM.setHours(3, 0, 0, 0);
                    const timeLeft = Math.ceil((tomorrow3AM - now) / 3600000);
                    return { locked: true, timeLeft: timeLeft };
                }
                return { locked: true, timeLeft: Math.ceil((threeAM - now) / 3600000) + 24 };
            }
            return false;
        };

        for (let [typeId, typeCfg] of activeLinkTypes) {
            const dailyCountKey = `linkDaily_${typeId}`;
            const dailyCountDateKey = `linkDailyDate_${typeId}`;
            const today = new Date().toDateString();
            const countToday = (this.userData[dailyCountDateKey] === today) ? (this.userData[dailyCountKey] || 0) : 0;
            const maxPerDay = typeCfg.maxPerDay || 1;
            const lockStatus = isLockedUntil3AM(dailyCountDateKey, dailyCountKey, maxPerDay);
            const isLocked = lockStatus.locked || false;
            const isFull = countToday >= maxPerDay;
            
            linkTypeCardsHTML += `
                <div class="link-type-card" style="border-left: 4px solid ${typeCfg.color}; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 15px; ${isLocked ? 'opacity: 0.6;' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div><span style="font-size: 20px;">${typeCfg.icon || '🔗'}</span><span style="font-weight: bold; margin-left: 8px;">${typeCfg.name}</span><span style="font-size: 12px; color: var(--text2); margin-left: 8px;">(${countToday}/${maxPerDay} hôm nay)</span></div>
                        <span style="font-size: 12px; padding: 4px 10px; border-radius: 20px; background: ${isLocked ? 'rgba(255,165,0,0.2)' : isFull ? 'rgba(255,71,87,0.2)' : 'rgba(46,213,115,0.2)'}; color: ${isLocked ? '#ffa500' : isFull ? '#ff4757' : '#2ed573'};">
                            ${isLocked ? `🔒 Mở lúc 3h sáng` : isFull ? '⛔ Hết lượt' : `✅ Còn ${maxPerDay - countToday} lượt`}
                        </span>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-primary get-link-btn" data-type="${typeId}" style="flex: 1;" ${isFull || isCooldown || isLocked ? 'disabled' : ''}>
                            ${isLocked ? '🔒 KHÓA ĐẾN 3H SÁNG' : isFull ? '⛔ ĐÃ HẾT LƯỢT' : isCooldown ? `⏳ Đợi ${Math.ceil(cooldown/60000)}p` : '🔗 LẤY LINK'}
                        </button>
                        <span style="font-size: 12px; color: var(--text2);">🪙 +${typeCfg.reward || 100}</span>
                    </div>
                </div>`;
        }
        if (linkTypeCardsHTML === '') linkTypeCardsHTML = '<p style="text-align: center; color: var(--text2); padding: 30px;">⚠️ Chưa có loại link nào được kích hoạt.</p>';

        this.container.innerHTML = `
            <div class="card"><div class="card-title">📋 Nhiệm vụ</div><p style="font-size:12px;color:var(--text2);margin-bottom:10px;">Mỗi loại link có giới hạn lượt/ngày. Hết lượt sẽ khóa đến 3h sáng hôm sau.</p>${linkTypeCardsHTML}</div>
            <div class="card">
                <div class="card-title">🔑 Nhập mã xác nhận</div>
                <input class="input" id="codeInput" placeholder="Nhập mã...">
                <button class="btn btn-success" id="btnVerify">✅ Xác nhận</button>
                ${isCooldown ? `<p style="font-size:12px;color:var(--text2);text-align:center;margin-top:8px;">⏱️ Đợi ${Math.ceil(cooldown/60000)} phút để làm nhiệm vụ tiếp</p>` : ''}
            </div>
            <div class="card"><div class="card-title">🎁 Rương thưởng</div><div class="progress-bar"><div class="progress-fill" style="width:${(isReady ? CONFIG.linksForChest : progress) / CONFIG.linksForChest * 100}%"></div></div><p style="text-align:center;">${isReady ? CONFIG.linksForChest : progress}/${CONFIG.linksForChest}</p><button class="btn btn-gold" id="btnChest" ${isReady ? '' : 'disabled'}>🎁 Mở rương</button></div>
        `;

        this.container.querySelectorAll('.get-link-btn').forEach(btn => {
            btn.onclick = async () => {
                const typeId = btn.dataset.type;
                const typeCfg = CONFIG.linkTypes[typeId];
                btn.disabled = true;
                const orig = btn.innerHTML;
                btn.innerHTML = '⏳...';
                try {
                    const code = await FB.getCodeFromPool(typeId);
                    if (!code) { this.app.toast(`Hết mã cho ${typeCfg.name}!`, 'warning'); btn.innerHTML = orig; btn.disabled = false; return; }
                    const user = await FB.getUser(this.app.user.id);
                    const today = new Date().toDateString();
                    const dck = `linkDaily_${typeId}`;
                    const dcdk = `linkDailyDate_${typeId}`;
                    const ct = (user[dcdk] === today) ? (user[dck] || 0) : 0;
                    if (ct >= typeCfg.maxPerDay) { this.app.toast(`Hết lượt ${typeCfg.name}!`, 'warning'); btn.innerHTML = orig; btn.disabled = false; return; }
                    let finalUrl = typeCfg.url.replace('{code}', code);
                    await FB.updateUser(this.app.user.id, { lastLinkTime: Date.now(), currentTaskCode: code, currentTaskType: typeId });
                    if (this.app.tg) this.app.tg.openLink(finalUrl);
                    else window.open(finalUrl, '_blank');
                    this.app.toast('Đã mở link! Tìm mã và nhập vào bên dưới.', 'info');
                } catch (e) { this.app.toast('Có lỗi!', 'error'); }
                finally { btn.innerHTML = orig; btn.disabled = false; }
            };
        });

        this.container.querySelector('#btnVerify').onclick = async () => {
            const code = this.container.querySelector('#codeInput').value.trim();
            if (!code) return this.app.toast('Nhập mã!', 'warning');
            const btn = this.container.querySelector('#btnVerify');
            const orig = btn.textContent; btn.textContent = '⏳...'; btn.disabled = true;
            try {
                const user = await FB.getUser(this.app.user.id);
                if (!user.currentTaskCode || !user.currentTaskType) { this.app.toast('Nhấn LẤY LINK trước!', 'warning'); btn.textContent = orig; btn.disabled = false; return; }
                if (user.currentTaskCode !== code) { this.app.toast('Mã không đúng!', 'error'); btn.textContent = orig; btn.disabled = false; return; }
                if (user.lastCodeTime && Date.now() - user.lastCodeTime < CONFIG.linkCooldown) {
                    const left = Math.ceil((CONFIG.linkCooldown - (Date.now() - user.lastCodeTime)) / 60000);
                    this.app.toast(`Đợi ${left} phút!`, 'warning'); btn.textContent = orig; btn.disabled = false; return;
                }
                const today = new Date().toDateString();
                const ltId = user.currentTaskType;
                const ltCfg = CONFIG.linkTypes[ltId];
                const reward = ltCfg?.reward || 100;
                const dck = `linkDaily_${ltId}`;
                const dcdk = `linkDailyDate_${ltId}`;
                const ct = (user[dcdk] === today) ? (user[dck] || 0) : 0;
                await FB.updateUser(this.app.user.id, {
                    balance: (user.balance || 0) + reward,
                    completedLinks: (user.completedLinks || 0) + 1,
                    totalLinksWeekly: (user.totalLinksWeekly || 0) + 1,
                    totalLinksAllTime: (user.totalLinksAllTime || 0) + 1,
                    lastCodeTime: Date.now(),
                    codesUsed: [...(user.codesUsed || []), code],
                    [dck]: ct + 1,
                    [dcdk]: today,
                    currentTaskCode: null,
                    currentTaskType: null
                });
                await FB.addTransactionHistory(this.app.user.id, 'task', reward, `Vượt link [${ltCfg?.name || 'Mặc định'}]: ${code}`);
                await FB.updateLeaderboard(this.app.user.id, 1);
                this.app.toast(`+${reward} 🪙!`, 'success');
                this.app.refreshUserBar();
                document.getElementById('codeInput').value = '';
                this.render();
            } catch (e) { this.app.toast('Có lỗi!', 'error'); }
            finally { btn.textContent = orig; btn.disabled = false; }
        };

        this.container.querySelector('#btnChest').onclick = async () => {
            const btn = this.container.querySelector('#btnChest');
            const orig = btn.textContent; btn.textContent = '⏳...'; btn.disabled = true;
            try {
                const res = await FB.openChest(this.app.user.id);
                if (res.status === 'ok') { this.app.toast(`Nhận ${res.reward} 🪙!`, 'success'); this.app.refreshUserBar(); this.render(); }
                else this.app.toast(res.message, 'error');
            } catch (e) { this.app.toast('Có lỗi!', 'error'); }
            finally { btn.textContent = orig; btn.disabled = false; }
        };
    }
}

class FriendsPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData; let refLink;
if (this.app.tg) {
    // Nếu đang chạy trong Telegram
    const botName = this.app.tg.botUsername || 'cayxummo_bot';
    refLink = `https://t.me/${botName}/app?startapp=${u.id}`;
} else {
    // Nếu đang chạy trên Web
    const baseUrl = window.location.origin + window.location.pathname;
    refLink = https://cayxummo-tele.vercel.app + '?ref=' + u.id;
}
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

class PvPPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData;
        this.container.innerHTML = `<div class="card"><div class="card-title">🎮 PvP Oẳn Tù Tì</div><p style="text-align:center;">🪙 ${(u.balance||0).toLocaleString()}</p><p style="margin-top:12px;">Chọn phòng:</p><div style="display:flex;flex-direction:column;gap:10px;">${[{bet:1000,icon:'🥉',label:'Phổ thông'},{bet:3000,icon:'🥈',label:'Trung cấp'},{bet:5000,icon:'🥇',label:'Cao cấp'}].map(r => `<button class="btn btn-primary room-btn" data-bet="${r.bet}" ${(u.balance||0) < r.bet ? 'disabled' : ''}>${r.icon} ${r.label} - ${r.bet.toLocaleString()} 🪙</button>`).join('')}</div></div>`;
        this.container.querySelectorAll('.room-btn').forEach(btn => btn.onclick = () => this.joinRoom(parseInt(btn.dataset.bet)));
    }
    async joinRoom(bet) { this.app.toast(`Vào phòng ${bet.toLocaleString()} 🪙. Đang tìm đối thủ...`, 'info'); }
}

class AccountPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        const u = this.userData; const rate = CONFIG.exchange_rate;
        this.container.innerHTML = `
            <div class="card"><div class="card-title">👤 Tài khoản</div><p>👤 ${u.username}</p><p>🆔 ${u.id}</p><p>🪙 ${(u.balance||0).toLocaleString()}</p><button class="btn btn-danger" id="btnLogout" style="margin-top:15px;width:100%;padding:12px;">🚪 Đăng xuất</button></div>
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
        document.getElementById('btnLogout').onclick = () => {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        this.app.logout();
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

// ==================== ADMIN PAGE (ĐÃ SỬA) ====================
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
               <!-- Thêm 3 dòng này vào trong admin-tabs, trước tab giftcodes -->
<button class="admin-tab" data-tab="linktypes">🔗 Loại Link</button>
<button class="admin-tab" data-tab="import">📥 Import Mã</button>
<button class="admin-tab" data-tab="codestats">📊 Thống kê Mã</button>
                <button class="admin-tab" data-tab="giftcodes">🎁 Gift Code</button>
                <button class="admin-tab" data-tab="withdraws">💸 Rút 🪙</button>
                <button class="admin-tab" data-tab="users">👥 Users</button>
                <button class="admin-tab" data-tab="fund">💰 Quỹ BXH</button>
                <button class="admin-tab" data-tab="leaderboard">🏆 BXH</button>
                <button class="admin-tab" data-tab="notify">📢 Thông báo</button>
                <button class="admin-tab" data-tab="logs">📝 Log</button>
                <button class="admin-tab" data-tab="security">🛡️ Bảo mật</button>
                <button class="admin-tab" data-tab="theme">🎨 Giao diện</button>
                <button class="admin-tab" data-tab="history">📊 Lịch sử</button> <!-- THÊM MỚI -->
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
        
        // ===== TAB LỊCH SỬ (THÊM MỚI) =====
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
                    // Kiểm tra user tồn tại
                    const user = await FB.getUser(uid);
                    if (!user) {
                        document.getElementById('historyResult').innerHTML = `
                            <div class="card" style="border-color:#ff4757;">
                                <p style="color:#ff4757;">❌ Không tìm thấy user với ID: <b>${uid}</b></p>
                                <p style="font-size:13px;color:var(--text2);">Vui lòng kiểm tra lại User ID</p>
                            </div>
                        `;
                        return;
                    }

                    const history = await FB.getTransactionHistory(uid, 500);
                    
                    if (history.length === 0) {
                        document.getElementById('historyResult').innerHTML = `
                            <div class="card">
                                <p><b>👤 ${user.username}</b> (ID: ${uid})</p>
                                <p>🪙 Số dư hiện tại: <b>${(user.balance || 0).toLocaleString()}</b></p>
                                <p style="color:var(--text2);margin-top:10px;">📭 Chưa có lịch sử giao dịch</p>
                            </div>
                        `;
                        return;
                    }

                    // Tính tổng nhận và chi
                    let totalIn = 0;
                    let totalOut = 0;
                    const typeLabels = {
                        'daily': '📅 Điểm danh',
                        'task': '🔗 Vượt link',
                        'chest': '🎁 Mở rương',
                        'gift': '🎫 Gift Code',
                        'friend': '👥 Mời bạn',
                        'withdraw': '💸 Rút xu'
                    };
                    const typeColors = {
                        'daily': '#2ed573',
                        'task': '#5f91ff',
                        'chest': '#ffd700',
                        'gift': '#ff6b81',
                        'friend': '#a29bfe',
                        'withdraw': '#ff4757'
                    };

                    history.forEach(h => {
                        if (h.amount > 0) totalIn += h.amount;
                        else totalOut += Math.abs(h.amount);
                    });

                    let html = `
                        <div class="card">
                            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div>
                                    <p style="font-size:18px;font-weight:bold;">👤 ${user.username}</p>
                                    <p style="font-size:13px;color:var(--text2);">🆔 ${uid}</p>
                                </div>
                                <div style="text-align:right;">
                                    <p>🪙 Số dư: <b style="color:#ffd700;font-size:20px;">${(user.balance || 0).toLocaleString()}</b></p>
                                </div>
                            </div>
                            <div style="display:flex;gap:20px;margin-top:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
                                <span style="color:#2ed573;">📈 Tổng nhận: <b>+${totalIn.toLocaleString()}</b></span>
                                <span style="color:#ff4757;">📉 Tổng chi: <b>-${totalOut.toLocaleString()}</b></span>
                                <span style="color:#5f91ff;">📊 Giao dịch: <b>${history.length}</b></span>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-title">📋 Chi tiết giao dịch</div>
                            <div style="max-height:500px;overflow-y:auto;">
                    `;

                    history.forEach((h, index) => {
                        const typeLabel = typeLabels[h.type] || h.type;
                        const color = typeColors[h.type] || '#ffffff';
                        const sign = h.amount >= 0 ? '+' : '';
                        const date = h.timestamp ? new Date(h.timestamp).toLocaleString('vi-VN') : 'N/A';
                        const bgColor = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)';
                        
                        html += `
                            <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;background:${bgColor};border-radius:4px;margin-bottom:2px;">
                                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                    <span style="color:${color};font-weight:600;font-size:14px;">${typeLabel}</span>
                                    <span style="font-size:12px;color:var(--text2);">${h.detail || ''}</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                                    <span style="color:${h.amount >= 0 ? '#2ed573' : '#ff4757'};font-weight:bold;font-size:15px;">
                                        ${sign}${h.amount.toLocaleString()} 🪙
                                    </span>
                                    <span style="font-size:11px;color:var(--text2);">${date}</span>
                                </div>
                            </div>
                        `;
                    });

                    html += `
                            </div>
                        </div>
                    `;
                    document.getElementById('historyResult').innerHTML = html;

                } catch (error) {
                    console.error('Load history error:', error);
                    document.getElementById('historyResult').innerHTML = `
                        <div class="card" style="border-color:#ff4757;">
                            <p style="color:#ff4757;">❌ Có lỗi xảy ra khi tải lịch sử</p>
                            <p style="font-size:13px;color:var(--text2);">Vui lòng thử lại sau</p>
                        </div>
                    `;
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };

            // Cho phép bấm Enter để tìm
            document.getElementById('searchHistoryUser').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('searchHistoryBtn').click();
                }
            });
        }
if (tab === 'codestats') {
    const linkTypes = CONFIG.linkTypes || {}; let statsHTML = '';
    for (let [typeId, typeCfg] of Object.entries(linkTypes)) {
        const stats = await FB.getCodePoolStats(typeId);
        const ap = stats.total > 0 ? Math.round(stats.available / stats.total * 100) : 0;
        statsHTML += `<div class="card" style="border-left:4px solid ${typeCfg.color};"><div class="card-title">${typeCfg.icon||'🔗'} ${typeCfg.name} (${typeId})</div>
        <div style="display:flex;gap:15px;flex-wrap:wrap;margin-bottom:10px;">
            <div style="flex:1;background:rgba(46,213,115,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#2ed573;">${stats.available}</div><div style="font-size:11px;">✅ Còn lại</div></div>
            <div style="flex:1;background:rgba(255,71,87,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#ff4757;">${stats.used}</div><div style="font-size:11px;">❌ Đã dùng</div></div>
            <div style="flex:1;background:rgba(255,215,0,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#ffd700;">${stats.total}</div><div style="font-size:11px;">📋 Tổng</div></div>
            ${stats.expired>0?`<div style="flex:1;background:rgba(95,145,255,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#5f91ff;">${stats.expired}</div><div style="font-size:11px;">🔄 Đã reset</div></div>`:''}
        </div>
        <div style="background:rgba(255,255,255,0.05);border-radius:8px;height:8px;overflow:hidden;margin-bottom:5px;"><div style="height:100%;background:linear-gradient(90deg,#2ed573 ${ap}%,#ff4757 ${ap}%);width:100%;"></div></div>
        <details style="margin-top:10px;"><summary style="cursor:pointer;color:var(--accent);font-size:13px;">📋 Xem danh sách mã (${stats.codes.length} mã)</summary>
        <div style="max-height:300px;overflow-y:auto;margin-top:10px;">
        <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <thead><tr style="background:rgba(255,255,255,0.05);"><th style="padding:6px;text-align:left;">Mã</th><th style="padding:6px;text-align:center;">Trạng thái</th><th style="padding:6px;text-align:center;">Số lần dùng</th><th style="padding:6px;text-align:right;">Dùng lúc</th></tr></thead>
        <tbody>${stats.codes.map(c => `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:6px;font-family:monospace;">${c.code}</td><td style="padding:6px;text-align:center;"><span style="padding:2px 6px;border-radius:10px;font-size:10px;background:${c.available?'rgba(46,213,115,0.2)':'rgba(255,71,87,0.2)'};color:${c.available?'#2ed573':'#ff4757'};">${c.expired?'🔄 Reset':c.available?'✅ Sẵn sàng':'❌ Đã dùng'}</span></td><td style="padding:6px;text-align:center;">${c.usedCount}</td><td style="padding:6px;text-align:right;font-size:10px;color:var(--text2);">${c.usedAt?new Date(c.usedAt).toLocaleString('vi-VN'):'-'}</td></tr>`).join('')}</tbody></table></div></details></div>`;
    }
    content.innerHTML = `<h3>📊 Thống kê mã</h3><p style="font-size:12px;color:var(--text2);margin-bottom:10px;">⏰ Reset sau ${CONFIG.codeResetDays} ngày</p>${statsHTML||'<p>Chưa có loại link nào</p>'}`;
}

else if (tab === 'import') {
    const linkTypes = CONFIG.linkTypes || {}; let typeOptions = '';
    for (let [id, cfg] of Object.entries(linkTypes)) typeOptions += `<option value="${id}">${cfg.icon||'🔗'} ${cfg.name}</option>`;
    content.innerHTML = `<div class="card"><div class="card-title">📥 Import mã từ file .txt</div><p style="font-size:12px;color:var(--text2);">File .txt mỗi dòng 1 mã.</p><label>Chọn loại link:</label><select class="input" id="importLinkType">${typeOptions}</select><label>Chọn file .txt:</label><input type="file" id="importFile" accept=".txt" class="input"><div style="margin-top:10px;"><p style="font-size:12px;color:var(--text2);">Hoặc dán danh sách mã:</p><textarea class="input" id="importTextarea" rows="5" placeholder="Mã1&#10;Mã2..."></textarea></div><button class="btn btn-success" id="btnImport">📥 Import mã</button><div id="importResult" style="margin-top:10px;"></div></div>`;
    document.getElementById('btnImport').onclick = async () => {
        const ltId = document.getElementById('importLinkType').value;
        let arr = [];
        const ta = document.getElementById('importTextarea').value.trim();
        if (ta) arr = ta.split('\n').map(c => c.trim()).filter(c => c);
        const fi = document.getElementById('importFile');
        if (fi.files.length > 0) { const t = await fi.files[0].text(); arr = t.split('\n').map(c => c.trim()).filter(c => c); }
        if (arr.length === 0) { document.getElementById('importResult').innerHTML = '<p style="color:#ff4757;">⚠️ Vui lòng nhập mã!</p>'; return; }
        const btn = document.getElementById('btnImport'); btn.disabled = true; btn.textContent = '⏳...';
        try {
            const count = await FB.importCodes(ltId, arr);
            document.getElementById('importResult').innerHTML = `<p style="color:#2ed573;">✅ Đã import <b>${count}</b> mã! Tổng: ${arr.length}</p>`;
            document.getElementById('importTextarea').value = ''; document.getElementById('importFile').value = '';
        } catch (e) { document.getElementById('importResult').innerHTML = `<p style="color:#ff4757;">❌ Lỗi: ${e.message}</p>`; }
        finally { btn.disabled = false; btn.textContent = '📥 Import mã'; }
    };
}

else if (tab === 'linktypes') {
    const linkTypes = CONFIG.linkTypes || {}; let listHTML = '';
    for (let [id, cfg] of Object.entries(linkTypes)) {
        const stats = await FB.getCodePoolStats(id);
        listHTML += `<div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:10px;border-left:4px solid ${cfg.color||'#5f91ff'};"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;"><div><span style="font-size:18px;">${cfg.icon||'🔗'}</span><b style="margin-left:6px;">${cfg.name}</b><span style="font-size:12px;color:var(--text2);margin-left:8px;">ID: ${id}</span><span style="margin-left:8px;padding:2px 8px;border-radius:10px;font-size:11px;background:${cfg.active?'rgba(46,213,115,0.2)':'rgba(255,71,87,0.2)'};color:${cfg.active?'#2ed573':'#ff4757'};">${cfg.active?'🟢 Hoạt động':'🔴 Tắt'}</span></div><div style="display:flex;gap:6px;"><button class="btn-sm btn-primary edit-linktype" data-id="${id}">✏️ Sửa</button><button class="btn-sm btn-warning toggle-linktype" data-id="${id}" data-active="${cfg.active}">${cfg.active?'⛔ Tắt':'✅ Bật'}</button><button class="btn-sm btn-danger delete-linktype" data-id="${id}" data-name="${cfg.name}">🗑️ Xóa</button></div></div><div style="margin-top:6px;font-size:12px;color:var(--text2);">🔄 ${cfg.maxPerDay||1} lượt/ngày | 🪙 +${cfg.reward||100} | 📊 Mã: <span style="color:#2ed573;">${stats.available} còn</span> / <span style="color:#ff4757;">${stats.used} đã dùng</span> / ${stats.total} tổng</div><div style="font-size:11px;color:var(--text2);margin-top:4px;">🔗 URL: ${cfg.url||'Chưa cấu hình'}</div></div>`;
    }
    content.innerHTML = `<div class="card"><div class="card-title">📋 Danh sách loại link</div>${listHTML||'<p>Chưa có loại link nào</p>'}</div>
    <div class="card"><div class="card-title">➕ Thêm loại link mới</div>
    <label>Tên:</label><input class="input" id="newLinkName" placeholder="VD: Link5m">
    <label>ID (tự động):</label><input class="input" id="newLinkId" readonly style="background:rgba(255,255,255,0.05);">
    <label>Lượt/ngày:</label><input class="input" id="newLinkMax" type="number" value="3">
    <label>🪙 Thưởng:</label><input class="input" id="newLinkReward" type="number" value="100">
    <div style="display:flex;gap:10px;"><div style="flex:1;"><label>Icon:</label><input class="input" id="newLinkIcon" value="🔗"></div><div style="flex:1;"><label>Màu:</label><div style="display:flex;gap:6px;"><input type="color" id="newLinkColorPicker" value="#ff00ff" style="width:40px;height:40px;"><input class="input" id="newLinkColor" value="#ff00ff"></div></div></div>
    <label>URL ({code} = mã):</label><input class="input" id="newLinkUrl" placeholder="https://...?url={code}">
    <label>Trạng thái:</label><select class="input" id="newLinkActive"><option value="true">🟢 Hoạt động</option><option value="false">🔴 Tắt</option></select>
    <button class="btn btn-success" id="addLinkType">➕ THÊM LOẠI</button></div>`;
    
    document.getElementById('newLinkName').addEventListener('input', function() { document.getElementById('newLinkId').value = this.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); });
    document.getElementById('newLinkColorPicker').addEventListener('input', function() { document.getElementById('newLinkColor').value = this.value; });
    
    document.getElementById('addLinkType').onclick = async () => {
        const name = document.getElementById('newLinkName').value.trim();
        const id = document.getElementById('newLinkId').value.trim();
        if (!name || !id) return this.app.toast('Nhập tên!', 'warning');
        if (CONFIG.linkTypes && CONFIG.linkTypes[id]) return this.app.toast('ID đã tồn tại!', 'error');
        const btn = document.getElementById('addLinkType'); btn.disabled = true; btn.textContent = '⏳...';
        try {
            const ut = { ...(CONFIG.linkTypes || {}), [id]: { name, maxPerDay: parseInt(document.getElementById('newLinkMax').value)||3, reward: parseInt(document.getElementById('newLinkReward').value)||100, icon: document.getElementById('newLinkIcon').value.trim()||'🔗', color: document.getElementById('newLinkColor').value.trim()||'#ff00ff', url: document.getElementById('newLinkUrl').value.trim(), active: document.getElementById('newLinkActive').value === 'true' } };
            await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig();
            this.app.toast(`Đã thêm: ${name}!`, 'success'); this.loadTab('linktypes');
        } catch (e) { this.app.toast('Có lỗi!', 'error'); }
        finally { btn.disabled = false; btn.textContent = '➕ THÊM LOẠI'; }
    };
    
    // Toggle
    this.container.querySelectorAll('.toggle-linktype').forEach(btn => btn.onclick = async () => {
        const id = btn.dataset.id; const ca = btn.dataset.active === 'true';
        try { const ut = { ...CONFIG.linkTypes }; if (ut[id]) ut[id].active = !ca; await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig(); this.app.toast(`Đã ${!ca?'bật':'tắt'}!`, 'success'); this.loadTab('linktypes'); }
        catch (e) { this.app.toast('Có lỗi!', 'error'); }
    });
    
    // Delete
    this.container.querySelectorAll('.delete-linktype').forEach(btn => btn.onclick = async () => {
        if (!confirm(`Xóa "${btn.dataset.name}"?`)) return;
        try { const ut = { ...CONFIG.linkTypes }; delete ut[btn.dataset.id]; await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig(); this.app.toast('Đã xóa!', 'success'); this.loadTab('linktypes'); }
        catch (e) { this.app.toast('Có lỗi!', 'error'); }
    });
    
    // EDIT - THÊM MỚI
    this.container.querySelectorAll('.edit-linktype').forEach(btn => btn.onclick = () => {
        const id = btn.dataset.id; const cfg = CONFIG.linkTypes[id]; if (!cfg) return;
        content.innerHTML = `<div class="card"><div class="card-title">✏️ Sửa: ${cfg.name}</div>
        <label>Tên:</label><input class="input" id="editLinkName" value="${cfg.name}">
        <label>ID: <b>${id}</b> (không đổi)</label>
        <label>Lượt/ngày:</label><input class="input" id="editLinkMax" type="number" value="${cfg.maxPerDay||3}">
        <label>🪙 Thưởng:</label><input class="input" id="editLinkReward" type="number" value="${cfg.reward||100}">
        <label>Icon:</label><input class="input" id="editLinkIcon" value="${cfg.icon||'🔗'}">
        <label>Màu:</label><div style="display:flex;gap:6px;"><input type="color" id="editLinkColorPicker" value="${cfg.color||'#ff00ff'}" style="width:40px;height:40px;"><input class="input" id="editLinkColor" value="${cfg.color||'#ff00ff'}"></div>
        <label>URL:</label><input class="input" id="editLinkUrl" value="${cfg.url||''}">
        <div style="display:flex;gap:10px;margin-top:15px;"><button class="btn btn-primary" id="saveEditLinkType">💾 Lưu</button><button class="btn btn-warning" id="cancelEditLinkType">↩️ Quay lại</button></div></div>`;
        const picker = document.getElementById('editLinkColorPicker'), input = document.getElementById('editLinkColor');
        picker.addEventListener('input', () => input.value = picker.value);
        input.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(input.value)) picker.value = input.value; });
        document.getElementById('cancelEditLinkType').onclick = () => this.loadTab('linktypes');
        document.getElementById('saveEditLinkType').onclick = async () => {
            const name = document.getElementById('editLinkName').value.trim();
            const maxPerDay = parseInt(document.getElementById('editLinkMax').value) || 3;
            const reward = parseInt(document.getElementById('editLinkReward').value) || 100;
            const icon = document.getElementById('editLinkIcon').value.trim() || '🔗';
            const color = document.getElementById('editLinkColor').value.trim() || '#ff00ff';
            const url = document.getElementById('editLinkUrl').value.trim();
            if (!name || !url) return this.app.toast('Nhập đủ!', 'warning');
            try { const ut = { ...CONFIG.linkTypes }; ut[id] = { name, maxPerDay, reward, icon, color, url, active: ut[id]?.active !== false }; await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig(); this.app.toast('Đã cập nhật!', 'success'); this.loadTab('linktypes'); }
            catch (e) { this.app.toast('Có lỗi!', 'error'); }
        };
    });
}
        // ===== CÁC TAB CŨ GIỮ NGUYÊN =====
        else if (tab === 'config') {
            // ... giữ nguyên code config ...
            const configSnap = await FB.db.ref('admin_config').once('value');
            const config = configSnap.val() || {};
            const rate = config.exchange_rate || CONFIG.exchange_rate;
            const dailyRewards = config.dailyRewards || CONFIG.dailyRewards;
            const linksForChest = config.linksForChest || CONFIG.linksForChest;
            const linkCooldown = config.linkCooldown ? config.linkCooldown / 60000 : CONFIG.linkCooldown / 60000;
            const maxCodesPerDay = config.maxCodesPerDay || CONFIG.maxCodesPerDay;
            const chestRewards = config.chestRewards || CONFIG.chestRewards;
            const friendRewards = config.friendRewards || CONFIG.friendRewards;
            const maxFriendsPerDay = config.maxFriendsPerDay || CONFIG.maxFriendsPerDay;
            const minBet = config.minBet || CONFIG.minBet;
            const maxBet = config.maxBet || CONFIG.maxBet;
            const pvpFee = ((config.pvpFee !== undefined ? config.pvpFee : CONFIG.pvpFee) * 100).toFixed(1);
            const pvpTimeout = config.pvpTimeout || CONFIG.pvpTimeout;
            const minWithdraw = config.minWithdraw || CONFIG.minWithdraw;
            const maxWithdraw = config.maxWithdraw || CONFIG.maxWithdraw;
            const maxWithdrawPerDay = config.maxWithdrawPerDay || CONFIG.maxWithdrawPerDay;
            content.innerHTML = `
                <div class="card"><div class="card-title">📅 Điểm danh 7 ngày</div><label class="input-label">🪙 thưởng 7 ngày (cách nhau dấu phẩy)</label><input class="input" id="cfgDailyRewards" value="${dailyRewards.join(',')}"></div>
                <div class="card"><div class="card-title">🎁 Rương & Link</div>
                    <label class="input-label">Số link mở rương</label><input class="input" id="cfgLinksForChest" type="number" value="${linksForChest}">
                    <label class="input-label">Thời gian chờ giữa link (phút)</label><input class="input" id="cfgLinkCooldown" type="number" value="${linkCooldown}">
                    <label class="input-label">🔢 Giới hạn mã/ngày</label><input class="input" id="cfgMaxCodesPerDay" type="number" value="${maxCodesPerDay}">
                    <label class="input-label">🪙 thưởng rương (cách nhau dấu phẩy)</label><input class="input" id="cfgChestRewards" value="${chestRewards.join(',')}">
                </div>
                <div class="card"><div class="card-title">👥 Bạn bè</div><label class="input-label">Thưởng mời bạn (số_bạn:🪙)</label><input class="input" id="cfgFriendRewards" value="${Object.entries(friendRewards).map(([k,v])=>`${k}:${v}`).join(',')}"><label class="input-label">Giới hạn mời/ngày</label><input class="input" id="cfgMaxFriendsPerDay" type="number" value="${maxFriendsPerDay}"></div>
                <div class="card"><div class="card-title">🎮 PvP</div><label class="input-label">Cược tối thiểu</label><input class="input" id="cfgMinBet" type="number" value="${minBet}"><label class="input-label">Cược tối đa</label><input class="input" id="cfgMaxBet" type="number" value="${maxBet}"><label class="input-label">Phí PvP (%)</label><input class="input" id="cfgPvpFee" type="number" value="${pvpFee}" step="0.1"><label class="input-label">Đếm ngược PvP (giây)</label><input class="input" id="cfgPvpTimeout" type="number" value="${pvpTimeout}"></div>
                <div class="card"><div class="card-title">💸 Rút 🪙</div><label class="input-label">Rút tối thiểu</label><input class="input" id="cfgMinWithdraw" type="number" value="${minWithdraw}"><label class="input-label">Rút tối đa/lần</label><input class="input" id="cfgMaxWithdraw" type="number" value="${maxWithdraw}"><label class="input-label">Số lần rút/ngày</label><input class="input" id="cfgMaxWithdrawPerDay" type="number" value="${maxWithdrawPerDay}"><label class="input-label">💱 Tỷ giá (3🪙 = ? VND)</label><input class="input" id="cfgRate" type="number" value="${rate}"></div>
                <button class="btn btn-primary" id="saveConfig">💾 Lưu cấu hình</button>
            `;
            document.getElementById('saveConfig').onclick = async () => {
                const btn = document.getElementById('saveConfig');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang lưu...';
                btn.disabled = true;
                try {
                    const newConfig = {
                        dailyRewards: document.getElementById('cfgDailyRewards').value.split(',').map(Number),
                        linksForChest: parseInt(document.getElementById('cfgLinksForChest').value) || 5,
                        linkCooldown: (parseInt(document.getElementById('cfgLinkCooldown').value) || 5) * 60000,
                        maxCodesPerDay: parseInt(document.getElementById('cfgMaxCodesPerDay').value) || 20,
                        chestRewards: document.getElementById('cfgChestRewards').value.split(',').map(Number),
                        friendRewards: Object.fromEntries(document.getElementById('cfgFriendRewards').value.split(',').map(s => s.split(':').map(Number))),
                        maxFriendsPerDay: parseInt(document.getElementById('cfgMaxFriendsPerDay').value) || 50,
                        minBet: parseInt(document.getElementById('cfgMinBet').value) || 100,
                        maxBet: parseInt(document.getElementById('cfgMaxBet').value) || 100000,
                        pvpFee: (parseFloat(document.getElementById('cfgPvpFee').value) || 10) / 100,
                        pvpTimeout: parseInt(document.getElementById('cfgPvpTimeout').value) || 30,
                        minWithdraw: parseInt(document.getElementById('cfgMinWithdraw').value) || 20000,
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
        else if (tab === 'tasks') {
            const tasks = await FB.getTasks();
            content.innerHTML = `<h3>📋 Nhiệm vụ</h3><input class="input" id="taskLink" placeholder="Link"><input class="input" id="taskCode" placeholder="Mã"><input class="input" id="taskReward" type="number" value="100" placeholder="🪙 thưởng"><input class="input" id="taskMaxUses" type="number" value="3" placeholder="Lượt dùng tối đa"><button class="btn btn-success" id="addTask">Thêm</button><div style="margin-top:10px;">${Object.entries(tasks).map(([id,t]) => `<div style="display:flex;justify-content:space-between;padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><span>${t.link?.substring(0,20)}... | ${t.code} | ${t.reward}🪙 | ${t.usedCount||0}/${t.maxUses||3} lượt</span><button class="btn-sm btn-danger" data-id="${id}">Xóa</button></div>`).join('')}</div>`;
            document.getElementById('addTask').onclick = async () => {
                const link = document.getElementById('taskLink').value.trim();
                const code = document.getElementById('taskCode').value.trim();
                const reward = parseInt(document.getElementById('taskReward').value) || 100;
                const maxUses = parseInt(document.getElementById('taskMaxUses').value) || 3;
                if (!link || !code) return this.app.toast('Nhập đủ!', 'warning');
                const btn = document.getElementById('addTask');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang thêm...';
                btn.disabled = true;
                try {
                    await FB.db.ref('tasks').push({ link, code, reward, active: true, maxUses: maxUses, usedCount: 0 });
                    await FB.db.ref('admin_logs').push({
                        adminId: this.app.user.id,
                        action: 'add_task',
                        task: { link, code, reward, maxUses },
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                    this.app.toast('Đã thêm!', 'success');
                    this.loadTab('tasks');
                } catch (error) {
                    this.app.toast('Có lỗi xảy ra!', 'error');
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
            document.querySelectorAll('.btn-danger').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Xóa nhiệm vụ này?')) return;
                    const taskId = btn.dataset.id;
                    try {
                        await FB.db.ref(`tasks/${taskId}`).remove();
                        await FB.db.ref('admin_logs').push({
                            adminId: this.app.user.id,
                            action: 'delete_task',
                            taskId: taskId,
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        });
                        this.app.toast('Đã xóa!', 'success');
                        this.loadTab('tasks');
                    } catch (error) {
                        this.app.toast('Có lỗi xảy ra!', 'error');
                    }
                };
            });
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
        
        // Kiểm tra đăng nhập web trước
        const savedId = Storage.getItem('cayxummo_uid');
        const savedUsername = Storage.getItem('cayxummo_user');
        
        if (savedId) {
            this.user = { 
                id: savedId, 
                username: savedUsername || 'User' 
            };
        } else if (this.tg?.initDataUnsafe?.user) {
            const user = this.tg.initDataUnsafe.user;
            this.user = { 
                id: user.id.toString(), 
                username: user.username || 'User' 
            };
        } else {
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'flex';
            return;
        }
        
        const userData = await FB.getUser(this.user.id);
        if (!userData) {
            if (this.tg?.initDataUnsafe?.user) {
                await FB.createUser(this.user.id, this.user);
            } else {
                this.logout();
                return;
            }
        }
        
        if (userData?.isBanned) {
            this.toast('🚫 Tài khoản của bạn đã bị khóa!', 'error');
            this.logout();
            return;
        }
        
        this.isAdmin = await FB.isAdmin(this.user.id);
        // Xử lý link mời (chỉ cho web)
if (!this.tg) {
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');
    if (refId && refId !== this.user.id) {
        // Kiểm tra user được mời có tồn tại không
        const refUser = await FB.getUser(refId);
        if (refUser) {
            try {
                const result = await FB.addFriend(this.user.id, refId);
                if (result.status === 'ok' || result.status === 'reward') {
                    this.toast(`🎉 Bạn được mời bởi @${refUser.username || refId}!`, 'success');
                } else if (result.status === 'already') {
                    console.log('Đã là bạn bè');
                }
            } catch (e) {
                console.warn('Không thể xử lý lời mời:', e);
            }
        } else {
            console.warn('Người mời không tồn tại:', refId);
        }
    }
}
        
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        
        this.setupNav();
        this.loadPage('home');
        this.refreshUserBar();
        this.applyTheme();
        
        // Lắng nghe thông báo
        FB.db.ref("notifications").orderByChild("timestamp").limitToLast(20).on("value", snap => {
            const arr = [];
            snap.forEach(c => { arr.push(c.val()); });
            arr.reverse();
            this._notifications = arr;
            const lastSeen = Number(Storage.getItem("lastSeenNotify") || 0);
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
        
        // Auto refresh mỗi 30s
        setInterval(() => {
            if (this.user) {
                this.refreshUserBar();
            }
        }, 30000);
        
        // Xử lý khi tab bị ẩn
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.currentPage && this.currentPage.destroy) {
                this.currentPage.destroy();
            }
        });
        
    } catch (e) {
        document.getElementById('loadingScreen').innerHTML = 
            `<div style="color:red;padding:20px;">
                <h3>❌ Lỗi khởi tạo:</h3>
                <p>${e.message}</p>
                <button onclick="location.reload()" style="margin-top:10px;padding:8px 20px;">🔄 Tải lại</button>
            </div>`;
        console.error(e);
    }
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

logout() {
    Storage.removeItem('cayxummo_uid');
    Storage.removeItem('cayxummo_user');
    
    this.user = null;
    this.isAdmin = false;
    
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    
    this.toast('👋 Đã đăng xuất!', 'info');
}

    showNotifications() {
        Storage.setItem('lastSeenNotify', Date.now());
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
// ===== KHỞI TẠO APP (TELEGRAM + WEB) =====
window.addEventListener('DOMContentLoaded', () => {
    window.app = new CayXumMo();
    
    // Nếu là Telegram → chạy như cũ
    if (window.app.tg?.initDataUnsafe?.user) {
        window.app.init();
        return;
    }
    
    // Nếu là Web → kiểm tra đã lưu đăng nhập chưa
    const savedId = Storage.getItem('cayxummo_uid');
if (savedId) {
    window.app.user = { 
        id: savedId, 
        username: Storage.getItem('cayxummo_user') || 'User' 
    };
    window.app.init();
    return;
}
    
    // Chưa đăng nhập → hiện form login
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    setupWebLogin();
});

// ===== HÀM ĐĂNG NHẬP/ĐĂNG KÝ CHO WEB =====
function setupWebLogin() {
    // Chuyển đổi form
    document.getElementById('showRegister').onclick = (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    };
    document.getElementById('showLogin').onclick = (e) => {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    };
    
    // ===== ĐĂNG NHẬP =====
    document.getElementById('btnLogin').onclick = async () => {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        
        if (!username || !password) {
            alert('⚠️ Vui lòng nhập đầy đủ thông tin!');
            return;
        }
        
        const btn = document.getElementById('btnLogin');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Đang đăng nhập...';
        btn.disabled = true;
        
        try {
            const snap = await FB.db.ref('users').once('value');
            const users = snap.val() || {};
            
            let foundUser = null;
            let foundId = null;
            
            for (let id in users) {
                if (users[id].username === username) {
                    foundUser = users[id];
                    foundId = id;
                    break;
                }
            }
            
            if (!foundUser) {
                alert('❌ Tên đăng nhập không tồn tại!');
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }
            
            if (foundUser.isBanned) {
                alert('🚫 Tài khoản của bạn đã bị khóa!');
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }
            
            const isValid = await verifyPassword(password, foundUser.password);
            
            if (!isValid) {
                alert('❌ Sai mật khẩu!');
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }
            
            Storage.setItem('cayxummo_uid', foundId);
            Storage.setItem('cayxummo_user', username);
            
            window.app.user = { 
                id: foundId, 
                username: username 
            };
            
            document.getElementById('loginScreen').style.display = 'none';
            window.app.init();
            
        } catch (error) {
            alert('❌ Có lỗi xảy ra, vui lòng thử lại!');
            console.error(error);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };
    
    // ===== ĐĂNG KÝ =====
    document.getElementById('btnRegister').onclick = async () => {
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const confirmPassword = document.getElementById('regConfirmPassword').value.trim();
        
        if (!username || !password || !confirmPassword) {
            alert('⚠️ Vui lòng nhập đầy đủ thông tin!');
            return;
        }
        
        if (username.length < 3) {
            alert('⚠️ Tên đăng nhập phải có ít nhất 3 ký tự!');
            return;
        }
        
        if (password.length < 4) {
            alert('⚠️ Mật khẩu phải có ít nhất 4 ký tự!');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('⚠️ Mật khẩu xác nhận không khớp!');
            return;
        }
        
        const btn = document.getElementById('btnRegister');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Đang đăng ký...';
        btn.disabled = true;
        
        try {
            const snap = await FB.db.ref('users').once('value');
            const users = snap.val() || {};
            
            const exists = Object.values(users).some(u => 
                u.username.toLowerCase() === username.toLowerCase()
            );
            
            if (exists) {
                alert('❌ Tên đăng nhập đã tồn tại!');
                btn.textContent = originalText;
                btn.disabled = false;
                return;
            }
            
            const userId = generateUniqueId();
            const hashedPassword = await hashPassword(password);
            
            await FB.db.ref('users/' + userId).set({
                id: userId,
                username: username,
                password: hashedPassword,
                displayName: username,
                balance: 0,
                dailyStreak: 0,
                lastDaily: '',
                completedLinks: 0,
                totalLinksWeekly: 0,
                totalLinksAllTime: 0,
                friends: [],
                invitedBy: '',
                codesUsed: [],
                giftCodesUsed: [],
                lastLinkTime: 0,
                chestsOpened: 0,
                isBanned: false,
                createdAt: Date.now(),
                friendsCount: 0
            });
            
            Storage.setItem('cayxummo_uid', userId);
            Storage.setItem('cayxummo_user', username);
            
            window.app.user = { 
                id: userId, 
                username: username 
            };
            
            document.getElementById('loginScreen').style.display = 'none';
            window.app.init();
            
            alert('✅ Đăng ký thành công! Chào mừng bạn đến với CayXuMMO!');
            
        } catch (error) {
            alert('❌ Có lỗi xảy ra, vui lòng thử lại!');
            console.error(error);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };
}