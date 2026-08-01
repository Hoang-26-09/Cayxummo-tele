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
        return { status: 'ok', reward };
    }

    async openChest(uid) {
        const user = await this.getUser(uid);
        const progress = (user.completedLinks || 0) % CONFIG.LINKS_FOR_CHEST;
        const isReady = (user.completedLinks || 0) >= CONFIG.LINKS_FOR_CHEST && progress === 0;
        if (!isReady) return { status: 'error', message: 'Chưa đủ link!' };
        const rewards = [50, 80, 100, 150, 200, 300, 500, 1000];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            chestsOpened: (user.chestsOpened || 0) + 1,
            completedLinks: (user.completedLinks || 0) - CONFIG.LINKS_FOR_CHEST
        });
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
        for (let [k, v] of Object.entries(CONFIG.FRIEND_REWARDS)) {
            if (friends.length === parseInt(k)) { bonus = v; break; }
        }
        if (bonus > 0) { await this.addBalance(uid, bonus); return { status: 'reward', count: friends.length, bonus }; }
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
        return { status: 'ok', reward: gift.reward };
    }

    async requestWithdraw(uid, data) {
        const user = await this.getUser(uid);
        const amount = parseInt(data.amount);
        if (amount < CONFIG.MIN_WITHDRAW || amount > CONFIG.MAX_WITHDRAW) return { status: 'error', message: 'Số 🪙 không hợp lệ' };
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

// ==================== CÁC TRANG ====================
class HomePage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData; const streak = u.dailyStreak || 0;
        let dailyHTML = '<div class="daily-grid">';
        for (let i = 1; i <= 7; i++) {
            let cls = ''; if (i <= streak) cls = 'claimed'; if (i === streak + 1 || (streak === 7 && i === 1)) cls = 'today';
            dailyHTML += `<div class="daily-item ${cls}"><div class="day">Ngày ${i}</div><div class="reward">+${CONFIG.DAILY_REWARDS[i-1]} 🪙</div>${i<=streak?'✅':''}</div>`;
        }
        dailyHTML += '</div>';
        this.container.innerHTML = `
            <div class="card"><div class="card-title">📅 Điểm danh hàng ngày</div>${dailyHTML}<button class="btn btn-gold" id="btnDaily">${u.lastDaily===new Date().toDateString()?'✅ Đã điểm danh':'🎁 Điểm danh nhận thưởng'}</button></div>
            <div class="card"><div class="card-title">📊 Thống kê của bạn</div><div class="grid-2"><div class="stat-card"><div class="stat-icon">🔗</div><div class="stat-value">${(u.completedLinks||0).toLocaleString()}</div><div class="stat-label">Link đã vượt</div></div><div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${(u.friends||[]).length}</div><div class="stat-label">Bạn bè</div></div><div class="stat-card"><div class="stat-icon">🎁</div><div class="stat-value">${u.chestsOpened||0}</div><div class="stat-label">Rương đã mở</div></div><div class="stat-card"><div class="stat-icon">🏆</div><div class="stat-value">${(u.totalLinksWeekly||0).toLocaleString()}</div><div class="stat-label">Link tuần này</div></div></div></div>
            <div class="card"><div class="card-title">🎯 Tiến độ mở rương</div><div class="progress-bar"><div class="progress-fill" style="width:${((u.completedLinks||0)%CONFIG.LINKS_FOR_CHEST)/CONFIG.LINKS_FOR_CHEST*100}%"></div></div><p style="text-align:center;font-size:13px;color:var(--text2);">${(u.completedLinks||0)%CONFIG.LINKS_FOR_CHEST}/${CONFIG.LINKS_FOR_CHEST} link</p></div>
        `;
        document.getElementById('btnDaily').onclick = () => this.doDaily();
    }
    async doDaily() {
        const result = await FB.dailyCheckin(this.app.user.id);
        if (result.status === 'already') this.app.toast('Hôm nay bạn đã điểm danh rồi!', 'warning');
        else { this.app.toast(`+${result.reward} 🪙! Ngày ${result.streak}/7`, 'success'); this.app.refreshUserBar(); this.render(); }
    }
}

class TasksPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        const tasks = await FB.getTasks(); const activeTask = Object.values(tasks).find(t => t.active !== false);
        const completedLinks = this.userData.completedLinks || 0;
        const progress = completedLinks % CONFIG.LINKS_FOR_CHEST;
        const isReady = completedLinks >= CONFIG.LINKS_FOR_CHEST && progress === 0;
        const cooldown = this.userData.lastLinkTime ? Math.max(0, CONFIG.LINK_COOLDOWN - (Date.now() - this.userData.lastLinkTime)) : 0;
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📋 Nhiệm vụ</div>
                ${activeTask ? `
                    <div style="text-align:center;margin:20px 0;">
                        ${cooldown > 0 ? `
                            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;">
                                <p style="font-size:40px;">✅</p><p>Đã lấy link</p>
                                <p style="font-size:13px;color:var(--text2);">Đợi ${Math.ceil(cooldown/60000)} phút</p>
                            </div>
                        ` : `
                            <button class="btn btn-gold get-link-btn" style="padding:20px 40px;font-size:18px;border-radius:16px;margin:0 auto;display:inline-flex;align-items:center;gap:10px;">
                                <span style="font-size:30px;">🔗</span> <span>LẤY LINK</span>
                            </button>
                        `}
                    </div>
                    <div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);">
                        <p style="font-weight:bold;">🔑 Nhập mã xác nhận:</p>
                        <input class="input" id="codeInput" placeholder="Nhập mã...">
                        <button class="btn btn-success" id="btnVerify">✅ Xác nhận</button>
                    </div>
                ` : '<p style="text-align:center;">Chưa có nhiệm vụ</p>'}
            </div>
            <div class="card">
                <div class="card-title">🎁 Rương thưởng</div>
                <div class="progress-bar"><div class="progress-fill" style="width:${(isReady ? CONFIG.LINKS_FOR_CHEST : progress) / CONFIG.LINKS_FOR_CHEST * 100}%"></div></div>
                <p style="text-align:center;">${isReady ? CONFIG.LINKS_FOR_CHEST : progress}/${CONFIG.LINKS_FOR_CHEST}</p>
                <button class="btn btn-gold" id="btnChest" ${isReady ? '' : 'disabled'}>🎁 Mở rương</button>
            </div>
        `;
        const goBtn = this.container.querySelector('.get-link-btn');
        if (goBtn) goBtn.onclick = async () => { window.open(activeTask.link, '_blank'); await FB.updateUser(this.app.user.id, { lastLinkTime: Date.now() }); this.app.toast('Đã mở link!', 'info'); this.render(); };
        this.container.querySelector('#btnVerify').onclick = async () => {
            const code = this.container.querySelector('#codeInput').value.trim(); if (!code) return this.app.toast('Nhập mã!', 'warning');
            const result = await FB.verifyCode(this.app.user.id, code);
            if (result.status === 'ok') { this.app.toast(`+${result.reward} 🪙!`, 'success'); this.app.refreshUserBar(); this.render(); }
            else this.app.toast(result.message || 'Mã không đúng!', 'error');
        };
        this.container.querySelector('#btnChest').onclick = async () => { const res = await FB.openChest(this.app.user.id); if (res.status === 'ok') { this.app.toast(`Nhận ${res.reward} 🪙!`, 'success'); this.app.refreshUserBar(); this.render(); } else this.app.toast(res.message, 'error'); };
    }
}

class FriendsPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData; const refLink = `https://t.me/${this.app.tg.botUsername || 'cayxummo_bot'}?start=${u.id}`;
        this.container.innerHTML = `
            <div class="card"><div class="card-title">👥 Mời bạn bè</div><p style="font-size:13px;color:var(--text2);">Link mời của bạn:</p><div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;word-break:break-all;margin-bottom:10px;">${refLink}</div><button class="btn btn-primary" id="copyLink">📋 Copy link</button><p style="margin-top:12px;">🎁 Thưởng:<br>2 bạn → +100 🪙<br>5 bạn → +300 🪙<br>10 bạn → +1.000 🪙</p></div>
            <div class="card"><div class="card-title">📊 Bạn đã mời: ${(u.friends||[]).length}</div></div>
            <div class="card"><div class="card-title">🏆 Top mời bạn</div><div id="topFriends">Đang tải...</div></div>
        `;
        this.container.querySelector('#copyLink').onclick = () => { navigator.clipboard.writeText(refLink); this.app.toast('Đã copy!', 'success'); };
        this.loadTopFriends();
    }
    async loadTopFriends() { const top = await FB.getTopFriends(10); const html = top.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">👥 ${u.friends}</span></div>`).join(''); this.container.querySelector('#topFriends').innerHTML = html || '<p>Chưa có dữ liệu</p>'; }
}

class LeaderboardPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() { this.container.innerHTML = `<div class="card"><div class="card-title">🏆 Top vượt link</div><p style="font-size:12px;color:var(--text2);">Reset mỗi 7 ngày</p><div id="topLinks">Đang tải...</div></div>`; const top = await FB.getTopLinks(10); const html = top.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">🔗 ${u.links||0}</span></div>`).join(''); this.container.querySelector('#topLinks').innerHTML = html || '<p>Chưa có dữ liệu</p>'; }
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
        const u = this.userData; const rateSnap = await FB.db.ref('admin_config/exchange_rate').once('value'); const rate = rateSnap.val() || CONFIG.DEFAULT_EXCHANGE_RATE;
        this.container.innerHTML = `
            <div class="card"><div class="card-title">👤 Tài khoản</div><p>👤 ${u.username}</p><p>🆔 ${u.id}</p><p>🪙 ${(u.balance||0).toLocaleString()}</p></div>
            <div class="card"><div class="card-title">💱 Tỷ giá</div><p>3.000 🪙 = ${(3000*rate).toLocaleString()}đ</p></div>
            <div class="card"><div class="card-title">🎁 Gift Code</div><input class="input" id="giftInput" placeholder="Nhập Gift Code"><button class="btn btn-gold" id="btnGift">Nhận</button></div>
            <div class="card"><div class="card-title">💸 Rút 🪙</div><input class="input" id="wdBank" placeholder="Ngân hàng"><input class="input" id="wdName" placeholder="Tên chủ TK"><input class="input" id="wdAccount" placeholder="Số TK"><input class="input" id="wdAmount" type="number" placeholder="Số 🪙 (20k-100k)"><button class="btn btn-warning" id="btnWithdraw">Gửi yêu cầu</button></div>
            <div class="card"><div class="card-title">📜 Lịch sử rút</div><div id="wdHistory">Đang tải...</div></div>
        `;
        this.container.querySelector('#btnGift').onclick = async () => { const code = this.container.querySelector('#giftInput').value.trim(); if (!code) return this.app.toast('Nhập code!', 'warning'); const res = await FB.redeemGiftCode(this.app.user.id, code); if (res.status === 'ok') { this.app.toast(`+${res.reward} 🪙!`, 'success'); this.app.refreshUserBar(); } else this.app.toast('Code không hợp lệ!', 'error'); };
        this.container.querySelector('#btnWithdraw').onclick = async () => { const data = { bank: this.container.querySelector('#wdBank').value.trim(), accountName: this.container.querySelector('#wdName').value.trim(), accountNumber: this.container.querySelector('#wdAccount').value.trim(), amount: this.container.querySelector('#wdAmount').value.trim() }; if (!data.bank || !data.accountName || !data.accountNumber || !data.amount) return this.app.toast('Điền đầy đủ!', 'warning'); const res = await FB.requestWithdraw(this.app.user.id, data); if (res.status === 'ok') { this.app.toast('Đã gửi yêu cầu!', 'success'); this.app.refreshUserBar(); this.render(); } else this.app.toast(res.message, 'error'); };
        this.loadHistory();
    }
    async loadHistory() { const history = await FB.getWithdrawHistory(this.app.user.id); const html = history.map(h => `<div style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);"><p>💰 ${h.amountXu.toLocaleString()} 🪙 = ${h.amountVnd.toLocaleString()}đ</p><p>🏦 ${h.bank} - ${h.accountNumber}</p><span class="badge badge-${h.status==='pending'?'pending':h.status==='approved'?'success':'rejected'}">${h.status==='pending'?'🟡 Chờ':h.status==='approved'?'🟢 Thành công':'🔴 Từ chối'}</span></div>`).join(''); this.container.querySelector('#wdHistory').innerHTML = html || '<p>Chưa có lịch sử</p>'; }
}

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
            </div>
            <div id="adminTabContent"></div>
        `;
        this.loadTab('config');
        this.container.querySelectorAll('.admin-tab').forEach(btn => btn.onclick = () => { this.container.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.loadTab(btn.dataset.tab); });
    }

    async loadTab(tab) {
        const content = document.getElementById('adminTabContent');
        if (tab === 'config') {
            const configSnap = await FB.db.ref('admin_config').once('value');
            const config = configSnap.val() || {};
            const rate = config.exchange_rate || CONFIG.DEFAULT_EXCHANGE_RATE;
            const dailyRewards = config.dailyRewards || CONFIG.DAILY_REWARDS;
            const linksForChest = config.linksForChest || CONFIG.LINKS_FOR_CHEST;
            const linkCooldown = config.linkCooldown || (CONFIG.LINK_COOLDOWN / 60000);
            const maxCodesPerDay = config.maxCodesPerDay || 20;
            const chestRewards = config.chestRewards || [50,80,100,150,200,300,500,1000];
            const friendRewards = config.friendRewards || CONFIG.FRIEND_REWARDS;
            const maxFriendsPerDay = config.maxFriendsPerDay || 50;
            const minBet = config.minBet || 100;
            const maxBet = config.maxBet || 100000;
            const pvpFee = ((config.pvpFee !== undefined ? config.pvpFee : CONFIG.PVP_FEE) * 100).toFixed(1);
            const pvpTimeout = config.pvpTimeout || CONFIG.PVP_TIMEOUT;
            const minWithdraw = config.minWithdraw || CONFIG.MIN_WITHDRAW;
            const maxWithdraw = config.maxWithdraw || CONFIG.MAX_WITHDRAW;
            const maxWithdrawPerDay = config.maxWithdrawPerDay || 3;
            content.innerHTML = `
                <div class="card"><div class="card-title">📅 Điểm danh 7 ngày</div><label class="input-label">🪙 thưởng 7 ngày (cách nhau dấu phẩy)</label><input class="input" id="cfgDailyRewards" value="${dailyRewards.join(',')}"></div>
                <div class="card"><div class="card-title">🎁 Rương & Link</div>
                    <label class="input-label">Số link mở rương</label><input class="input" id="cfgLinksForChest" type="number" value="${linksForChest}">
                    <label class="input-label">Thời gian chờ giữa link (phút)</label><input class="input" id="cfgLinkCooldown" type="number" value="${linkCooldown}">
                    <label class="input-label">🔢 Giới hạn mã/ngày (số lần nhập mã tối đa/user/ngày)</label><input class="input" id="cfgMaxCodesPerDay" type="number" value="${maxCodesPerDay}">
                    <label class="input-label">🪙 thưởng rương (cách nhau dấu phẩy)</label><input class="input" id="cfgChestRewards" value="${chestRewards.join(',')}">
                </div>
                <div class="card"><div class="card-title">👥 Bạn bè</div><label class="input-label">Thưởng mời bạn (dạng: số_bạn:🪙, cách nhau dấu phẩy)</label><input class="input" id="cfgFriendRewards" value="${Object.entries(friendRewards).map(([k,v])=>`${k}:${v}`).join(',')}"><label class="input-label">Giới hạn mời/ngày</label><input class="input" id="cfgMaxFriendsPerDay" type="number" value="${maxFriendsPerDay}"></div>
                <div class="card"><div class="card-title">🎮 PvP</div><label class="input-label">Cược tối thiểu</label><input class="input" id="cfgMinBet" type="number" value="${minBet}"><label class="input-label">Cược tối đa</label><input class="input" id="cfgMaxBet" type="number" value="${maxBet}"><label class="input-label">Phí PvP (%)</label><input class="input" id="cfgPvpFee" type="number" value="${pvpFee}" step="0.1"><label class="input-label">Đếm ngược PvP (giây)</label><input class="input" id="cfgPvpTimeout" type="number" value="${pvpTimeout}"></div>
                <div class="card"><div class="card-title">💸 Rút 🪙</div><label class="input-label">Rút tối thiểu</label><input class="input" id="cfgMinWithdraw" type="number" value="${minWithdraw}"><label class="input-label">Rút tối đa/lần</label><input class="input" id="cfgMaxWithdraw" type="number" value="${maxWithdraw}"><label class="input-label">Số lần rút/ngày</label><input class="input" id="cfgMaxWithdrawPerDay" type="number" value="${maxWithdrawPerDay}"><label class="input-label">💱 Tỷ giá (1 🪙 = ? VND)</label><input class="input" id="cfgRate" type="number" value="${rate}"></div>
                <button class="btn btn-primary" id="saveConfig">💾 Lưu cấu hình</button>
            `;
            document.getElementById('saveConfig').onclick = async () => {
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
                this.app.toast('Đã lưu cấu hình!', 'success');
                this.loadTab('config');
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
                await FB.db.ref('prize_fund').set(fund + add);
                this.app.toast(`Đã nạp ${add.toLocaleString()} 🪙!`, 'success');
                this.loadTab('fund');
            };
        }
        else if (tab === 'tasks') {
            const tasks = await FB.getTasks();
            content.innerHTML = `<h3>📋 Nhiệm vụ</h3><input class="input" id="taskLink" placeholder="Link"><input class="input" id="taskCode" placeholder="Mã"><input class="input" id="taskReward" type="number" value="100" placeholder="🪙 thưởng"><button class="btn btn-success" id="addTask">Thêm</button><div style="margin-top:10px;">${Object.entries(tasks).map(([id,t]) => `<div style="display:flex;justify-content:space-between;padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><span>${t.link?.substring(0,20)}... | ${t.code} | ${t.reward}🪙</span><button class="btn-sm btn-danger" data-id="${id}">Xóa</button></div>`).join('')}</div>`;
            document.getElementById('addTask').onclick = async () => { const link = document.getElementById('taskLink').value.trim(); const code = document.getElementById('taskCode').value.trim(); const reward = parseInt(document.getElementById('taskReward').value) || 100; if (!link || !code) return this.app.toast('Nhập đủ!', 'warning'); await FB.db.ref('tasks').push({ link, code, reward, active: true }); this.app.toast('Đã thêm!', 'success'); this.loadTab('tasks'); };
            document.querySelectorAll('.btn-danger').forEach(btn => btn.onclick = async () => { await FB.db.ref(`tasks/${btn.dataset.id}`).remove(); this.loadTab('tasks'); });
        }
        else if (tab === 'giftcodes') {
            const giftsSnap = await FB.db.ref('gift_codes').once('value');
            const gifts = giftsSnap.val() || {};
            content.innerHTML = `<h3>🎁 Gift Code</h3><input class="input" id="giftName" placeholder="Tên code"><input class="input" id="giftReward" type="number" value="500" placeholder="🪙"><input class="input" id="giftMax" type="number" value="100" placeholder="Lượt dùng"><input class="input" id="giftExpiry" type="date"><button class="btn btn-success" id="createGift">Tạo</button><div style="margin-top:10px;">${Object.entries(gifts).map(([code,g]) => `<div style="padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><b>${code}</b> | ${g.reward}🪙 | ${g.usedCount||0}/${g.maxUses} | <button class="btn-sm btn-danger" data-code="${code}">Xóa</button></div>`).join('')}</div>`;
            document.getElementById('createGift').onclick = async () => { const name = document.getElementById('giftName').value.trim(); const reward = parseInt(document.getElementById('giftReward').value) || 500; const maxUses = parseInt(document.getElementById('giftMax').value) || 100; const expiry = document.getElementById('giftExpiry').value; if (!name) return this.app.toast('Nhập tên!', 'warning'); await FB.db.ref(`gift_codes/${name}`).set({ reward, maxUses, usedCount: 0, expiry: expiry ? new Date(expiry).getTime() : null, active: true }); this.app.toast('Đã tạo!', 'success'); this.loadTab('giftcodes'); };
            document.querySelectorAll('.btn-danger').forEach(btn => btn.onclick = async () => { await FB.db.ref(`gift_codes/${btn.dataset.code}`).remove(); this.loadTab('giftcodes'); });
        }
        else if (tab === 'withdraws') {
            const wSnap = await FB.db.ref('withdraw_requests').orderByChild('createdAt').limitToLast(20).once('value');
            const withdraws = []; wSnap.forEach(c => withdraws.push({ id: c.key, ...c.val() })); withdraws.reverse();
            content.innerHTML = `<h3>💸 Rút 🪙</h3>${withdraws.map(w => `<div style="padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><p>${w.username} - ${w.amountXu.toLocaleString()} 🪙 (${w.amountVnd.toLocaleString()}đ)</p><p>${w.bank} - ${w.accountNumber}</p><span class="badge badge-${w.status==='pending'?'pending':'success'}">${w.status}</span>${w.status==='pending' ? `<button class="btn-sm btn-success approve" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Duyệt</button><button class="btn-sm btn-danger reject" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Từ chối</button>` : ''}</div>`).join('')}`;
            document.querySelectorAll('.approve').forEach(btn => btn.onclick = async () => { await FB.db.ref(`withdraw_requests/${btn.dataset.id}`).update({ status: 'approved', reviewedBy: this.app.user.username, reviewedAt: Date.now() }); this.app.toast('Đã duyệt!', 'success'); this.loadTab('withdraws'); });
            document.querySelectorAll('.reject').forEach(btn => btn.onclick = async () => { await FB.addBalance(btn.dataset.uid, parseInt(btn.dataset.amount)); await FB.db.ref(`withdraw_requests/${btn.dataset.id}`).update({ status: 'rejected', reviewedBy: this.app.user.username, reviewedAt: Date.now() }); this.app.toast('Đã từ chối, hoàn 🪙!', 'warning'); this.loadTab('withdraws'); });
        }
        else if (tab === 'users') {
            content.innerHTML = `<h3>👥 Users</h3><input class="input" id="searchUser" placeholder="Tìm ID"><button class="btn btn-primary" id="searchBtn">Tìm</button><div id="userResult"></div>`;
            document.getElementById('searchBtn').onclick = async () => { const keyword = document.getElementById('searchUser').value.trim().toLowerCase(); if (!keyword) return; const snap = await FB.db.ref('users').once('value'); const users = snap.val() || {}; const results = Object.entries(users).filter(([id,u]) => id.includes(keyword) || (u.username||'').toLowerCase().includes(keyword)).slice(0,5); const html = results.map(([id,u]) => `<div style="padding:8px;background:rgba(255,255,255,0.05);margin-top:5px;border-radius:5px;"><p><b>${u.username}</b> (ID: ${id})</p><p>🪙: ${(u.balance||0).toLocaleString()}</p><input class="input" id="editBal_${id}" placeholder="Sửa 🪙" type="number"><button class="btn-sm btn-primary editBal" data-uid="${id}">Lưu</button></div>`).join(''); document.getElementById('userResult').innerHTML = html || '<p>Không tìm thấy</p>'; document.querySelectorAll('.editBal').forEach(btn => btn.onclick = async () => { const newBal = parseInt(document.getElementById(`editBal_${btn.dataset.uid}`).value); if (isNaN(newBal)) return; await FB.updateUser(btn.dataset.uid, { balance: newBal }); this.app.toast('Đã cập nhật!', 'success'); }); };
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
                await FB.db.ref('notifications').push({ message: msg, sentBy: this.app.user.username, timestamp: Date.now() });
                this.app.toast('Đã gửi thông báo!', 'success');
                document.getElementById('notifyMsg').value = '';
                this.loadTab('notify');
            };
            const notifySnap = await FB.db.ref('notifications').orderByChild('timestamp').limitToLast(10).once('value');
            const notifies = []; notifySnap.forEach(c => notifies.push(c.val())); notifies.reverse();
            document.getElementById('notifyHistory').innerHTML = notifies.map(n => `<div style="padding:5px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">• ${new Date(n.timestamp).toLocaleString('vi-VN')} - ${n.message}</div>`).join('') || '<p>Chưa có thông báo</p>';
        }
        else if (tab === 'logs') {
            const logSnap = await FB.db.ref('admin_logs').orderByChild('timestamp').limitToLast(50).once('value');
            const logs = []; logSnap.forEach(c => logs.push(c.val())); logs.reverse();
            content.innerHTML = `<h3>📝 Nhật ký Admin</h3>${logs.map(l => `<div style="padding:5px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">• ${l.adminId} - ${l.action} - ${new Date(l.timestamp).toLocaleString('vi-VN')}</div>`).join('') || '<p>Chưa có log</p>'}`;
        }
        else if (tab === 'security') {
            const alertSnap = await FB.db.ref('admin_alerts').orderByChild('timestamp').limitToLast(50).once('value');
            const alerts = []; alertSnap.forEach(c => alerts.push({ id: c.key, ...c.val() })); alerts.reverse();
            content.innerHTML = `<h3>🛡️ Cảnh báo bảo mật</h3>${alerts.map(a => `<div style="padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><p><b>${a.type}</b> - ${a.username} (${a.userId})</p><p style="font-size:11px;">${new Date(a.timestamp).toLocaleString('vi-VN')}</p>${a.status==='unread' ? `<button class="btn-sm btn-warning" data-id="${a.id}">Đã xem</button>` : ''}</div>`).join('') || '<p>Không có cảnh báo</p>'}`;
            document.querySelectorAll('.btn-warning').forEach(btn => btn.onclick = async () => { await FB.db.ref(`admin_alerts/${btn.dataset.id}/status`).set('reviewed'); this.loadTab('security'); });
        }
    }
}

// ==================== APP CHÍNH ====================
class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) { this.tg.ready(); this.tg.expand(); }
        this.user = null; this.isAdmin = false;
    }
    async init() {
        try {
            const initData = this.tg?.initDataUnsafe;
            this.user = initData?.user ? { id: initData.user.id.toString(), username: initData.user.username || 'User' } : { id: 'test123', username: 'TestUser' };
            await FB.createUser(this.user.id, this.user); this.isAdmin = await FB.isAdmin(this.user.id);
            document.getElementById('loadingScreen').style.display = 'none'; document.getElementById('app').style.display = 'flex';
            this.setupNav(); this.loadPage('home'); this.refreshUserBar();
        } catch (e) { document.getElementById('loadingScreen').innerHTML = '<div style="color:red;padding:20px;"><h3>❌ Lỗi khởi tạo:</h3><p>' + e.message + '</p></div>'; }
    }
    setupNav() {
        const items = [ { page:'home', icon:'🏠', label:'Trang chủ' }, { page:'tasks', icon:'📋', label:'Nhiệm vụ' }, { page:'friends', icon:'👥', label:'Bạn bè' }, { page:'leaderboard', icon:'🏆', label:'BXH' }, { page:'pvp', icon:'🎮', label:'PvP' }, { page:'account', icon:'👤', label:'Tài khoản' } ];
        if (this.isAdmin) items.push({ page:'admin', icon:'👑', label:'Admin' });
        document.getElementById('bottomNav').innerHTML = items.map(item => `<button class="nav-btn" data-page="${item.page}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }
    async loadPage(page) {
        const main = document.getElementById('mainContent'); const userData = await FB.getUser(this.user.id);
        const pages = { home: HomePage, tasks: TasksPage, friends: FriendsPage, leaderboard: LeaderboardPage, pvp: PvPPage, account: AccountPage, admin: AdminPage };
        if (pages[page]) new pages[page](this, main, userData).render();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`); if (activeBtn) activeBtn.classList.add('active');
    }
    async refreshUserBar() { const userData = await FB.getUser(this.user.id); document.getElementById('userBar').innerHTML = `<span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span><span>🪙 ${(userData.balance||0).toLocaleString()}</span>`; }
    toast(msg, type) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast toast-' + type + ' show'; setTimeout(() => t.classList.remove('show'), 2500); }
}
window.addEventListener('DOMContentLoaded', () => { window.app = new CayXumMo(); window.app.init(); });
