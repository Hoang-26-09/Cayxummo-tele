import { CONFIG, DEFAULT_CONFIG, firebaseConfig } from './config.js';
import { rateLimiter } from './rate-limiter.js';
import { callApi } from './api-client.js';

export class FirebaseManager {
    constructor() {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        this.db = firebase.database();
    }

    async loadConfig() {
        const snap = await this.db.ref('admin_config').once('value');
        const saved = snap.val() || {};
        const merged = {
            dailyRewards: saved.dailyRewards || DEFAULT_CONFIG.dailyRewards,
            linksForChest: saved.linksForChest || DEFAULT_CONFIG.linksForChest,
            linkCooldown: saved.linkCooldown || DEFAULT_CONFIG.linkCooldown,
            maxCodesPerDay: saved.maxCodesPerDay || DEFAULT_CONFIG.maxCodesPerDay,
            chestRewards: saved.chestRewards || DEFAULT_CONFIG.chestRewards,
            friendRewards: saved.friendRewards || DEFAULT_CONFIG.friendRewards,
            maxFriendsPerDay: saved.maxFriendsPerDay || DEFAULT_CONFIG.maxFriendsPerDay,
            minWithdraw: saved.minWithdraw || DEFAULT_CONFIG.minWithdraw,
            maxWithdraw: saved.maxWithdraw || DEFAULT_CONFIG.maxWithdraw,
            maxWithdrawPerDay: saved.maxWithdrawPerDay || DEFAULT_CONFIG.maxWithdrawPerDay,
            exchange_rate: saved.exchange_rate || DEFAULT_CONFIG.exchange_rate,
            starColor: saved.starColor || DEFAULT_CONFIG.starColor,
            bgColor1: saved.bgColor1 || DEFAULT_CONFIG.bgColor1,
            bgColor2: saved.bgColor2 || DEFAULT_CONFIG.bgColor2,
            codeResetDays: saved.codeResetDays || DEFAULT_CONFIG.codeResetDays,
            linkTypes: saved.linkTypes || DEFAULT_CONFIG.linkTypes,
            socialLinks: saved.socialLinks || DEFAULT_CONFIG.socialLinks
        };
        // CONFIG is a shared object reference imported everywhere else, so we
        // mutate it in place instead of reassigning (reassigning `CONFIG =`
        // here would only rebind this module's local variable, not the
        // object every other module already imported).
        Object.assign(CONFIG, merged);
        for (const key in DEFAULT_CONFIG.linkTypes) {
            if (!CONFIG.linkTypes[key]) CONFIG.linkTypes[key] = DEFAULT_CONFIG.linkTypes[key];
        }
    }

    async addTransactionHistory(uid, type, amount, detail = '') {
        const ref = this.db.ref('transactions/' + uid).push();
        await ref.set({
            type, amount, detail,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    // ===== CLOUD FUNCTIONS (chỉ cho tài khoản web đăng nhập Firebase Auth
    // thật — xem functions/. Tài khoản Telegram chưa đăng nhập Auth nên
    // isWebSession() luôn false với Telegram, các method bên dưới tự động
    // rơi về logic cũ (client ghi trực tiếp) để không phá vỡ Telegram.) =====
    isWebSession() {
        return !!(firebase.auth && firebase.auth().currentUser);
    }

    async callFn(name, payload = {}) {
        return await callApi(name, payload);
    }

    // Cho tài khoản web đang dùng email giả (đăng ký/nâng cấp trước khi có
    // bước hỏi email) tự thêm email thật sau — để dùng "Quên mật khẩu".
    async addRecoveryEmail(email) {
        if (!this.isWebSession()) {
            throw new Error('Chỉ áp dụng cho tài khoản web');
        }
        return await this.callFn('addRecoveryEmail', { email });
    }

    /**
     * Tạo tài khoản mới.
     * @param {string} uid
     * @param {{username: string}} data
     * @param {{deviceHash?: string|null, extraFields?: object}} [options]
     *   deviceHash: hash "dấu vân tay thiết bị" của người đăng ký, dùng để
     *   chặn 1 thiết bị tạo nhiều tài khoản (xem device-fingerprint.js).
     *   extraFields: các field bổ sung riêng cho flow web (password,
     *   passwordSalt...) mà flow Telegram không cần.
     * @returns {{blocked: boolean, alreadyExists?: boolean, reason?: string, user?: object}}
     */
    async createUser(uid, data, { deviceHash = null, extraFields = {} } = {}) {
        const ref = this.db.ref('users/' + uid);
        const snap = await ref.once('value');
        if (snap.exists()) {
            return { blocked: false, alreadyExists: true, user: snap.val() };
        }

        if (deviceHash) {
            const deviceSnap = await this.db.ref('device_registrations/' + deviceHash).once('value');
            if (deviceSnap.exists()) {
                return { blocked: true, reason: 'device_limit' };
            }
        }

        const newUser = {
            id: uid, username: data.username || 'Unknown', balance: 0,
            dailyStreak: 0, lastDaily: '', completedLinks: 0,
            totalLinksWeekly: 0, totalLinksAllTime: 0,
            friends: [], invitedBy: '', codesUsed: [], giftCodesUsed: [],
            lastLinkTime: 0, chestsOpened: 0, isBanned: false, isAdmin: false,
            createdAt: Date.now(), friendsCount: 0,
            registrationDeviceHash: deviceHash || null,
            ...extraFields
        };

        // Ghi user + khóa thiết bị trong CÙNG MỘT update() — Firebase coi
        // đây là 1 thao tác atomic (tất cả thành công hoặc tất cả thất
        // bại). Nhờ vậy nếu ai đó cố lách bằng cách chỉ gửi request ghi
        // users/ mà bỏ qua device_registrations/, phần users/ vẫn bị
        // Firebase Rules chặn luôn (xem firebase-rules.json).
        const updates = { ['users/' + uid]: newUser };
        if (deviceHash) {
            updates['device_registrations/' + deviceHash] = { uid, username: newUser.username, createdAt: Date.now() };
        }
        await this.db.ref().update(updates);
        return { blocked: false, alreadyExists: false, user: newUser };
    }

    // Dùng khi admin cần gỡ khóa cho 1 thiết bị (ví dụ: máy dùng chung
    // trong gia đình/lớp học bị chặn oan).
    async releaseDeviceLock(deviceHash) {
        await this.db.ref('device_registrations/' + deviceHash).remove();
    }

    async getUser(uid) { return (await this.db.ref('users/' + uid).once('value')).val(); }
    async updateUser(uid, data) { await this.db.ref('users/' + uid).update(data); }

    // Balance writes go through a transaction so two concurrent requests
    // (double-click, two open tabs, retried network call) can't stomp on
    // each other the way a read-then-set would.
    async addBalance(uid, amount) {
        await this.db.ref('users/' + uid + '/balance').transaction(current => Math.max(0, (current || 0) + amount));
    }

    // SECURITY: với web (đăng nhập Firebase Auth thật), admin status đọc từ
    // CUSTOM CLAIMS trong ID token (`admin: true`) — cái này ký bằng khóa
    // riêng của Firebase, không client nào giả được, khác hẳn field
    // `isAdmin` trong RTDB (ai cũng ghi được qua console). Xem
    // scripts/set-admin.js để phong admin.
    // Với Telegram (chưa có Firebase Auth), tạm thời vẫn đọc field cũ —
    // đây là phần CHƯA được bảo vệ, nằm ngoài phạm vi đã thống nhất.
    async isAdmin(uid) {
        if (this.isWebSession()) {
            const tokenResult = await firebase.auth().currentUser.getIdTokenResult();
            return tokenResult.claims.admin === true;
        }
        const user = await this.getUser(uid);
        return !!(user && user.isAdmin === true);
    }

    async dailyCheckin(uid) {
        if (this.isWebSession()) {
            // Server tự xác định uid từ token đăng nhập — không tin uid
            // truyền vào từ client cho việc này.
            return await this.callFn('dailyCheckin');
        }
        const user = await this.getUser(uid);
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (user.lastDaily === today) return { status: 'already' };
        const streak = user.lastDaily === yesterday ? (user.dailyStreak >= 7 ? 1 : user.dailyStreak + 1) : 1;
        const reward = CONFIG.dailyRewards[streak - 1];
        await this.updateUser(uid, {
            dailyStreak: streak,
            lastDaily: today,
            balance: firebase.database.ServerValue.increment(reward)
        });
        await this.addTransactionHistory(uid, 'daily', reward, `Điểm danh ngày ${streak}`);
        return { status: 'ok', streak, reward };
    }

    // ===== LẤY LINK / XÁC NHẬN MÃ — chỉ dùng cho web (Cloud Functions).
    // TasksPage (Telegram) tiếp tục dùng getCodeFromPool()/updateUser()
    // trực tiếp như cũ; TasksPage bản web nên gọi 2 hàm này thay vì ghi DB
    // trực tiếp, để được bảo vệ bởi Cloud Functions. =====
    async claimLinkTask(typeId) {
        return await this.callFn('claimLinkTask', { typeId });
    }

    async verifyLinkCode(code) {
        return await this.callFn('verifyLinkCode', { code });
    }

    // ===== POOL MÃ =====
    async getCodeFromPool(linkTypeId) {
        const poolRef = this.db.ref(`code_pools/${linkTypeId}`);
        const snap = await poolRef.once('value');
        const pool = snap.val() || {};
        const now = Date.now();
        const resetMs = CONFIG.codeResetDays * 86400000;
        const availableCodes = [];
        for (const code in pool) {
            if (!pool[code].usedAt || (now - pool[code].usedAt > resetMs)) availableCodes.push(code);
        }
        if (availableCodes.length === 0) return null;
        const randomCode = availableCodes[Math.floor(Math.random() * availableCodes.length)];
        await poolRef.child(randomCode).set({
            used: true, usedAt: now, usedCount: (pool[randomCode]?.usedCount || 0) + 1
        });
        return randomCode;
    }

    async getCodePoolStats(linkTypeId) {
        const poolRef = this.db.ref(`code_pools/${linkTypeId}`);
        const snap = await poolRef.once('value');
        const pool = snap.val() || {};
        const now = Date.now();
        const resetMs = CONFIG.codeResetDays * 86400000;
        let total = 0, available = 0, used = 0, expired = 0;
        const codes = [];
        for (const code in pool) {
            total++;
            const cd = pool[code];
            const isExpired = cd.usedAt && (now - cd.usedAt > resetMs);
            const isAvailable = !cd.usedAt || isExpired;
            if (isAvailable) { available++; if (isExpired) expired++; } else used++;
            codes.push({ code, usedAt: cd.usedAt || null, usedCount: cd.usedCount || 0, available: isAvailable, expired: isExpired });
        }
        codes.sort((a, b) => {
            if (a.available && !b.available) return -1;
            if (!a.available && b.available) return 1;
            if (a.usedAt && b.usedAt) return b.usedAt - a.usedAt;
            return 0;
        });
        return { total, available, used, expired, codes };
    }

    async importCodes(linkTypeId, codesArray) {
        const poolRef = this.db.ref(`code_pools/${linkTypeId}`);
        const updates = {};
        for (const code of codesArray) {
            const c = code.trim();
            if (c) updates[c] = { used: false, usedAt: null, usedCount: 0, addedAt: Date.now() };
        }
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

    async verifyCode(uid, code) {
        if (!rateLimiter.check(`verify_${uid}`, 5, 60000)) {
            return { status: 'error', message: 'Bạn đã gửi quá nhiều yêu cầu, vui lòng đợi!' };
        }
        const tasks = await this.getTasks();
        let task = null, taskId = null;
        for (const id in tasks) {
            if (tasks[id].code === code && tasks[id].active !== false) {
                task = tasks[id]; taskId = id; break;
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
                type: 'suspicious_speed', userId: uid, username: user.username,
                code, timeMs: timeSinceLink, timestamp: Date.now(), status: 'unread'
            });
        }

        if (taskId) {
            await this.db.ref(`tasks/${taskId}/usedCount`).set((task.usedCount || 0) + 1);
        }

        const reward = task.reward || 100;
        await this.updateUser(uid, {
            balance: firebase.database.ServerValue.increment(reward),
            completedLinks: firebase.database.ServerValue.increment(1),
            totalLinksWeekly: firebase.database.ServerValue.increment(1),
            totalLinksAllTime: firebase.database.ServerValue.increment(1),
            lastCodeTime: Date.now(),
            codesUsed: [...(user.codesUsed || []), code],
            codesToday: today,
            codesCountToday: codesToday + 1
        });
        await this.addTransactionHistory(uid, 'task', reward, `Vượt link: ${code}`);
        await this.updateLeaderboard(uid, 1);

        if (isTool) return { status: 'ok', reward, warning: 'Cảnh báo: Bạn đã nhập mã quá nhanh!' };
        return { status: 'ok', reward };
    }

    async openChest(uid) {
        if (this.isWebSession()) {
            return await this.callFn('openChest');
        }
        const user = await this.getUser(uid);
        const completedLinks = user.completedLinks || 0;
        const chestsCanOpen = Math.floor(completedLinks / CONFIG.linksForChest);
        if (chestsCanOpen === 0) return { status: 'error', message: 'Chưa đủ link để mở rương!' };

        const reward = CONFIG.chestRewards[Math.floor(Math.random() * CONFIG.chestRewards.length)];
        await this.updateUser(uid, {
            balance: firebase.database.ServerValue.increment(reward),
            chestsOpened: firebase.database.ServerValue.increment(1),
            completedLinks: completedLinks - CONFIG.linksForChest
        });
        await this.addTransactionHistory(uid, 'chest', reward, `Mở rương nhận ${reward}🪙`);
        return { status: 'ok', reward };
    }

    async addFriend(uid, friendId) {
        if (this.isWebSession()) {
            return await this.callFn('addFriend', { friendId });
        }
        if (uid === friendId) return { status: 'error', message: 'Không thể tự mời chính mình!' };
        const friendData = await this.getUser(friendId);
        if (!friendData) return { status: 'error', message: 'Người dùng không tồn tại!' };

        const user = await this.getUser(uid);
        const friends = user.friends || [];
        if (friends.includes(friendId)) return { status: 'already' };
        friends.push(friendId);
        await this.updateUser(uid, { friends, friendsCount: friends.length });

        let bonus = 0;
        for (const [k, v] of Object.entries(CONFIG.friendRewards)) {
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
        if (this.isWebSession()) {
            return await this.callFn('redeemGiftCode', { code });
        }
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
        if (this.isWebSession()) {
            return await this.callFn('requestWithdraw', data);
        }
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
        for (const key in all) {
            if (all[key].userId === uid) arr.push({ id: key, ...all[key] });
        }
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return arr;
    }

    async getTransactionHistory(uid, limit = 200) {
        const snap = await this.db.ref('transactions/' + uid).orderByChild('timestamp').limitToLast(limit).once('value');
        const arr = [];
        snap.forEach(c => arr.push({ id: c.key, ...c.val() }));
        return arr.reverse();
    }

    async updateLeaderboard(uid, links) {
        const user = await this.getUser(uid);
        const ref = this.db.ref('leaderboard/' + uid);
        await ref.transaction(currentData => {
            if (currentData === null) {
                return { userId: uid, username: user?.username || 'Unknown', links, updatedAt: Date.now() };
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
        const fundSnap = await this.db.ref('prize_fund').once('value');
        const fund = fundSnap.val() || 0;
        let pending = 0;
        const wSnap = await this.db.ref('withdraw_requests').orderByChild('status').equalTo('pending').once('value');
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

    // RELIABILITY FIX: if two people had the leaderboard page open at the
    // reset moment, both would previously read `lastReset` as stale, both
    // pass the check, and the prize fund could be distributed twice. The
    // "claim this week" step now happens inside a transaction, so only the
    // caller that wins the race proceeds past it.
    async checkAndDistributeRewards() {
        const thisWeek = this.getWeekNumber();
        const claim = await this.db.ref('leaderboard_config/lastReset').transaction(current => {
            if (current === thisWeek) return; // abort: already claimed
            return thisWeek;
        });
        if (!claim.committed) return;

        const top10 = await this.getTopLinks(10);
        const fundSnap = await this.db.ref('prize_fund').once('value');
        const fund = fundSnap.val() || 0;

        if (top10.length > 0 && fund > 0) {
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
            }
        }

        const usersSnap = await this.db.ref('users').once('value');
        const userUpdates = {};
        usersSnap.forEach(child => { userUpdates[`${child.key}/totalLinksWeekly`] = 0; });
        await this.db.ref().update(userUpdates);
        await this.db.ref('leaderboard').remove();
    }

    getWeekNumber() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const diff = now - start;
        return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
    }
}

export const FB = new FirebaseManager();
