// ==================== 1. CẤU HÌNH ====================
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

// ==================== 2. BẮT LỖI HIỂN THỊ RA MÀN HÌNH ====================
window.onerror = function(msg, url, line) {
    document.getElementById('loadingScreen').innerHTML = 
        '<div style="color:red;padding:20px;"><h3>❌ Lỗi JavaScript:</h3><p>' + msg + '</p><p>Dòng: ' + line + '</p></div>';
};

// ==================== 3. FIREBASE MANAGER (ĐẦY ĐỦ) ====================
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
                id: uid,
                username: data.username || 'Unknown',
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
                createdAt: Date.now()
            });
        }
        return (await ref.once('value')).val();
    }

    async getUser(uid) {
        const snap = await this.db.ref('users/' + uid).once('value');
        return snap.val();
    }

    async updateUser(uid, data) {
        await this.db.ref('users/' + uid).update(data);
    }

    async addBalance(uid, amount) {
        const ref = this.db.ref('users/' + uid + '/balance');
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
        await this.updateUser(uid, {
            dailyStreak: streak,
            lastDaily: today,
            balance: (user.balance || 0) + reward
        });
        return { status: 'ok', streak, reward };
    }

    async getTasks() {
        const snap = await this.db.ref('tasks').once('value');
        return snap.val() || {};
    }

    async verifyCode(uid, code) {
        const tasks = await this.getTasks();
        let task = null;
        for (let id in tasks) {
            if (tasks[id].code === code && tasks[id].active !== false) {
                task = tasks[id];
                break;
            }
        }
        if (!task) return { status: 'invalid' };
        const user = await this.getUser(uid);
        if ((user.codesUsed || []).includes(code)) return { status: 'used' };
        if (user.lastLinkTime && Date.now() - user.lastLinkTime < CONFIG.LINK_COOLDOWN) {
            const left = Math.ceil((CONFIG.LINK_COOLDOWN - (Date.now() - user.lastLinkTime)) / 60000);
            return { status: 'cooldown', message: 'Đợi ' + left + ' phút' };
        }
        const reward = task.reward || 100;
        const codesUsed = [...(user.codesUsed || []), code];
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            completedLinks: (user.completedLinks || 0) + 1,
            totalLinksWeekly: (user.totalLinksWeekly || 0) + 1,
            totalLinksAllTime: (user.totalLinksAllTime || 0) + 1,
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
        await this.updateUser(uid, {
            balance: (user.balance || 0) + reward,
            chestsOpened: (user.chestsOpened || 0) + 1
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
        if (bonus > 0) {
            await this.addBalance(uid, bonus);
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
            userId: uid,
            username: user.username,
            bank: data.bank,
            accountName: data.accountName,
            accountNumber: data.accountNumber,
            amountXu: amount,
            amountVnd: amount * rate,
            exchangeRate: rate,
            status: 'pending',
            createdAt: Date.now()
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
        await this.db.ref('leaderboard/' + uid).set({
            userId: uid,
            username: user?.username || 'Unknown',
            links,
            updatedAt: Date.now()
        });
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
        let totalUsers = Object.keys(users).length,
            totalBalance = 0,
            totalLinks = 0;
        Object.values(users).forEach(u => {
            totalBalance += u.balance || 0;
            totalLinks += u.totalLinksAllTime || 0;
        });
        const fundSnap = await this.db.ref('prize_fund').once('value');
        const fund = fundSnap.val() || 0;
        let pending = 0;
        const wSnap = await this.db.ref('withdraw_requests').orderByChild('status').equalTo('pending').once('value');
        wSnap.forEach(() => pending++);
        return { totalUsers, totalBalance, totalLinks, prizeFund: fund, pendingWithdraws: pending };
    }
}
const FB = new FirebaseManager();

// ==================== 4. CÁC TRANG (ĐẦY ĐỦ) ====================
class HomePage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const u = this.userData;
        const streak = u.dailyStreak || 0;

        let dailyHTML = '<div class="daily-grid">';
        for (let i = 1; i <= 7; i++) {
            let cls = '';
            if (i <= streak) cls = 'claimed';
            if (i === streak + 1 || (streak === 7 && i === 1)) cls = 'today';
            dailyHTML += `
                <div class="daily-item ${cls}">
                    <div class="day">Ngày ${i}</div>
                    <div class="reward">+${CONFIG.DAILY_REWARDS[i - 1]} xu</div>
                    ${i <= streak ? '✅' : ''}
                </div>`;
        }
        dailyHTML += '</div>';

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📅 Điểm danh hàng ngày</div>
                ${dailyHTML}
                <button class="btn btn-gold" id="btnDaily">
                    ${u.lastDaily === new Date().toDateString() ? '✅ Đã điểm danh' : '🎁 Điểm danh nhận thưởng'}
                </button>
            </div>
            <div class="card">
                <div class="card-title">📊 Thống kê của bạn</div>
                <div class="grid-2">
                    <div class="stat-card">
                        <div class="stat-icon">🔗</div>
                        <div class="stat-value">${(u.completedLinks || 0).toLocaleString()}</div>
                        <div class="stat-label">Link đã vượt</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">👥</div>
                        <div class="stat-value">${(u.friends || []).length}</div>
                        <div class="stat-label">Bạn bè</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🎁</div>
                        <div class="stat-value">${u.chestsOpened || 0}</div>
                        <div class="stat-label">Rương đã mở</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🏆</div>
                        <div class="stat-value">${(u.totalLinksWeekly || 0).toLocaleString()}</div>
                        <div class="stat-label">Link tuần này</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-title">🎯 Tiến độ mở rương</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${((u.completedLinks || 0) % CONFIG.LINKS_FOR_CHEST) / CONFIG.LINKS_FOR_CHEST * 100}%"></div>
                </div>
                <p style="text-align:center;font-size:13px;color:var(--text2);margin-top:6px;">
                    ${(u.completedLinks || 0) % CONFIG.LINKS_FOR_CHEST}/${CONFIG.LINKS_FOR_CHEST} link để mở rương
                </p>
            </div>
        `;

        document.getElementById('btnDaily').onclick = () => this.doDaily();
    }

    async doDaily() {
        const result = await FB.dailyCheckin(this.app.user.id);
        if (result.status === 'already') {
            this.app.toast('Hôm nay bạn đã điểm danh rồi!', 'warning');
        } else {
            this.app.toast(`+${result.reward} xu! Ngày ${result.streak}/7`, 'success');
            this.app.refreshUserBar();
            this.render();
        }
    }
}

class TasksPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    async render() {
        const tasks = await FB.getTasks();
        const activeTask = Object.values(tasks).find(t => t.active !== false);
        const completedLinks = this.userData.completedLinks || 0;
        const progress = completedLinks % CONFIG.LINKS_FOR_CHEST;
        const cooldown = this.userData.lastLinkTime ? Math.max(0, CONFIG.LINK_COOLDOWN - (Date.now() - this.userData.lastLinkTime)) : 0;

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📋 Nhiệm vụ</div>
                ${activeTask ? `
                    <div style="text-align:center;margin:20px 0;">
                        ${cooldown > 0 ? `
                            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;">
                                <p style="font-size:40px;">✅</p>
                                <p>Đã lấy link</p>
                                <p style="font-size:13px;color:var(--text2);">Đợi ${Math.ceil(cooldown / 60000)} phút</p>
                            </div>
                        ` : `
                            <button class="btn btn-primary go-link-btn" style="width:200px;height:200px;border-radius:50%;font-size:18px;margin:0 auto;">
                                <div style="font-size:40px;">🔗</div>
                                <div>LẤY LINK</div>
                            </button>
                        `}
                    </div>
                    <div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);">
                        <p style="font-weight:bold;">🔑 Nhập mã xác nhận:</p>
                        <input class="input" id="codeInput" placeholder="Nhập mã...">
                        <button class="btn btn-gold" id="btnVerify">✅ Xác nhận</button>
                    </div>
                ` : '<p style="text-align:center;">Chưa có nhiệm vụ</p>'}
            </div>
            <div class="card">
                <div class="card-title">🎁 Rương thưởng</div>
                <div class="progress-bar"><div class="progress-fill" style="width:${progress / 5 * 100}%"></div></div>
                <p style="text-align:center;">${progress}/5</p>
                <button class="btn btn-gold" id="btnChest" ${completedLinks >= 5 ? '' : 'disabled'}>🎁 Mở rương</button>
            </div>
        `;

        const goBtn = this.container.querySelector('.go-link-btn');
        if (goBtn) {
            goBtn.onclick = async () => {
                window.open(activeTask.link, '_blank');
                await FB.updateUser(this.app.user.id, { lastLinkTime: Date.now() });
                this.app.toast('Đã mở link!', 'info');
                this.render();
            };
        }
        this.container.querySelector('#btnVerify').onclick = async () => {
            const code = this.container.querySelector('#codeInput').value.trim();
            if (!code) return this.app.toast('Nhập mã!', 'warning');
            const result = await FB.verifyCode(this.app.user.id, code);
            if (result.status === 'ok') {
                this.app.toast(`+${result.reward} xu!`, 'success');
                this.app.refreshUserBar();
                this.render();
            } else this.app.toast(result.message || 'Mã không đúng!', 'error');
        };
        this.container.querySelector('#btnChest').onclick = async () => {
            const res = await FB.openChest(this.app.user.id);
            if (res.status === 'ok') {
                this.app.toast(`Nhận ${res.reward} xu!`, 'success');
                this.app.refreshUserBar();
                this.render();
            } else this.app.toast(res.message, 'error');
        };
    }
}

class FriendsPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const u = this.userData;
        const refLink = `https://t.me/${this.app.tg.botUsername || 'cayxummo_bot'}?start=${u.id}`;
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">👥 Mời bạn bè</div>
                <p style="font-size:13px;color:var(--text2);">Link mời của bạn:</p>
                <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;word-break:break-all;margin-bottom:10px;">${refLink}</div>
                <button class="btn btn-primary" id="copyLink">📋 Copy link</button>
                <p style="margin-top:12px;">🎁 Thưởng:<br>2 bạn → +100 xu<br>5 bạn → +300 xu<br>10 bạn → +1.000 xu</p>
            </div>
            <div class="card">
                <div class="card-title">📊 Bạn đã mời: ${(u.friends || []).length}</div>
            </div>
            <div class="card">
                <div class="card-title">🏆 Top mời bạn</div>
                <div id="topFriends">Đang tải...</div>
            </div>
        `;
        this.container.querySelector('#copyLink').onclick = () => {
            navigator.clipboard.writeText(refLink);
            this.app.toast('Đã copy!', 'success');
        };
        this.loadTopFriends();
    }

    async loadTopFriends() {
        const top = await FB.getTopFriends(10);
        const html = top.map((u, i) => `
            <div class="leaderboard-item">
                <span class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">#${i + 1}</span>
                <span>${u.username || 'Unknown'}</span>
                <span style="margin-left:auto;">👥 ${u.friends}</span>
            </div>
        `).join('');
        this.container.querySelector('#topFriends').innerHTML = html || '<p>Chưa có dữ liệu</p>';
    }
}

class LeaderboardPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    async render() {
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">🏆 Top vượt link</div>
                <p style="font-size:12px;color:var(--text2);">Reset mỗi 7 ngày</p>
                <div id="topLinks">Đang tải...</div>
            </div>
        `;
        const top = await FB.getTopLinks(10);
        const html = top.map((u, i) => `
            <div class="leaderboard-item">
                <span class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">#${i + 1}</span>
                <span>${u.username || 'Unknown'}</span>
                <span style="margin-left:auto;">🔗 ${u.links || 0}</span>
            </div>
        `).join('');
        this.container.querySelector('#topLinks').innerHTML = html || '<p>Chưa có dữ liệu</p>';
    }
}

class PvPPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const u = this.userData;
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">🎮 PvP Oẳn Tù Tì</div>
                <p style="text-align:center;">🪙 ${(u.balance || 0).toLocaleString()} xu</p>
                <p style="margin-top:12px;">Chọn phòng:</p>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${[
                        { bet: 1000, icon: '🥉', label: 'Phổ thông' },
                        { bet: 3000, icon: '🥈', label: 'Trung cấp' },
                        { bet: 5000, icon: '🥇', label: 'Cao cấp' }
                    ].map(r => `
                        <button class="btn btn-primary room-btn" data-bet="${r.bet}" ${(u.balance || 0) < r.bet ? 'disabled' : ''}>
                            ${r.icon} ${r.label} - ${r.bet.toLocaleString()} xu
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        this.container.querySelectorAll('.room-btn').forEach(btn => {
            btn.onclick = () => this.joinRoom(parseInt(btn.dataset.bet));
        });
    }

    async joinRoom(bet) {
        this.app.toast(`Vào phòng ${bet.toLocaleString()} xu. Đang tìm đối thủ...`, 'info');
        // Logic matchmaking sẽ được thêm sau
    }
}

class AccountPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    async render() {
        const u = this.userData;
        const rateSnap = await FB.db.ref('admin_config/exchange_rate').once('value');
        const rate = rateSnap.val() || CONFIG.DEFAULT_EXCHANGE_RATE;

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">👤 Tài khoản</div>
                <p>👤 ${u.username}</p>
                <p>🆔 ${u.id}</p>
                <p>🪙 ${(u.balance || 0).toLocaleString()} xu</p>
            </div>
            <div class="card">
                <div class="card-title">💱 Tỷ giá</div>
                <p>1.000 xu = ${(1000 * rate).toLocaleString()}đ</p>
            </div>
            <div class="card">
                <div class="card-title">🎁 Gift Code</div>
                <input class="input" id="giftInput" placeholder="Nhập Gift Code">
                <button class="btn btn-gold" id="btnGift">Nhận</button>
            </div>
            <div class="card">
                <div class="card-title">💸 Rút xu</div>
                <input class="input" id="wdBank" placeholder="Ngân hàng">
                <input class="input" id="wdName" placeholder="Tên chủ TK">
                <input class="input" id="wdAccount" placeholder="Số TK">
                <input class="input" id="wdAmount" type="number" placeholder="Số xu (20k-100k)">
                <button class="btn btn-warning" id="btnWithdraw">Gửi yêu cầu</button>
            </div>
            <div class="card">
                <div class="card-title">📜 Lịch sử rút</div>
                <div id="wdHistory">Đang tải...</div>
            </div>
        `;

        this.container.querySelector('#btnGift').onclick = async () => {
            const code = this.container.querySelector('#giftInput').value.trim();
            if (!code) return this.app.toast('Nhập code!', 'warning');
            const res = await FB.redeemGiftCode(this.app.user.id, code);
            if (res.status === 'ok') {
                this.app.toast(`+${res.reward} xu!`, 'success');
                this.app.refreshUserBar();
            } else this.app.toast('Code không hợp lệ!', 'error');
        };

        this.container.querySelector('#btnWithdraw').onclick = async () => {
            const data = {
                bank: this.container.querySelector('#wdBank').value.trim(),
                accountName: this.container.querySelector('#wdName').value.trim(),
                accountNumber: this.container.querySelector('#wdAccount').value.trim(),
                amount: this.container.querySelector('#wdAmount').value.trim()
            };
            if (!data.bank || !data.accountName || !data.accountNumber || !data.amount) return this.app.toast('Điền đầy đủ!', 'warning');
            const res = await FB.requestWithdraw(this.app.user.id, data);
            if (res.status === 'ok') {
                this.app.toast('Đã gửi yêu cầu!', 'success');
                this.app.refreshUserBar();
                this.render();
            } else this.app.toast(res.message, 'error');
        };

        this.loadHistory();
    }

    async loadHistory() {
        const history = await FB.getWithdrawHistory(this.app.user.id);
        const html = history.map(h => `
            <div style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">
                <p>💰 ${h.amountXu.toLocaleString()} xu = ${h.amountVnd.toLocaleString()}đ</p>
                <p>🏦 ${h.bank} - ${h.accountNumber}</p>
                <span class="badge badge-${h.status === 'pending' ? 'pending' : h.status === 'approved' ? 'success' : 'rejected'}">
                    ${h.status === 'pending' ? '🟡 Chờ' : h.status === 'approved' ? '🟢 Thành công' : '🔴 Từ chối'}
                </span>
            </div>
        `).join('');
        this.container.querySelector('#wdHistory').innerHTML = html || '<p>Chưa có lịch sử</p>';
    }
}

class AdminPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    async render() {
        if (!this.app.isAdmin) {
            this.container.innerHTML = '<p style="text-align:center;padding:40px;">⛔ Không có quyền truy cập!</p>';
            return;
        }

        const stats = await FB.getDashboard();

        this.container.innerHTML = `
            <h2 style="margin-bottom:12px;">👑 Admin Panel</h2>
            
            <div class="grid-2" style="margin-bottom:12px;">
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-value">${stats.totalUsers}</div>
                    <div class="stat-label">Tổng users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🪙</div>
                    <div class="stat-value">${stats.totalBalance.toLocaleString()}</div>
                    <div class="stat-label">Tổng xu</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🔗</div>
                    <div class="stat-value">${stats.totalLinks.toLocaleString()}</div>
                    <div class="stat-label">Link đã vượt</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">💰</div>
                    <div class="stat-value">${stats.prizeFund.toLocaleString()}</div>
                    <div class="stat-label">Quỹ BXH</div>
                </div>
            </div>

            <p style="margin-bottom:12px;">📥 Yêu cầu rút đang chờ: <strong>${stats.pendingWithdraws}</strong></p>

            <div class="admin-tabs" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
                <button class="admin-tab active" data-tab="config">⚙️ Cấu hình</button>
                <button class="admin-tab" data-tab="tasks">📋 Nhiệm vụ</button>
                <button class="admin-tab" data-tab="giftcodes">🎁 Gift Code</button>
                <button class="admin-tab" data-tab="withdraws">💸 Rút xu</button>
                <button class="admin-tab" data-tab="users">👥 Users</button>
            </div>

            <div id="adminTabContent"></div>
        `;

        this.loadTab('config');
        document.querySelectorAll('.admin-tab').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadTab(btn.dataset.tab);
            };
        });
    }

    async loadTab(tab) {
        const content = document.getElementById('adminTabContent');

        if (tab === 'config') {
            const rateSnap = await FB.db.ref('admin_config/exchange_rate').once('value');
            const rate = rateSnap.val() || CONFIG.DEFAULT_EXCHANGE_RATE;
            content.innerHTML = `
                <h3>⚙️ Cấu hình hệ thống</h3>
                <label class="input-label">Tỷ giá (1 xu = ? VND):</label>
                <input class="input" id="cfgRate" type="number" value="${rate}">
                <button class="btn btn-primary" id="saveRate">💾 Lưu cấu hình</button>
            `;
            document.getElementById('saveRate').onclick = async () => {
                const newRate = parseInt(document.getElementById('cfgRate').value) || CONFIG.DEFAULT_EXCHANGE_RATE;
                await FB.db.ref('admin_config/exchange_rate').set(newRate);
                this.app.toast('Đã lưu tỷ giá mới!', 'success');
            };
        }
        else if (tab === 'tasks') {
            const tasks = await FB.getTasks();
            content.innerHTML = `
                <h3>📋 Quản lý nhiệm vụ</h3>
                <div style="margin-bottom:12px;">
                    <input class="input" id="taskLink" placeholder="Link">
                    <input class="input" id="taskCode" placeholder="Mã xác nhận">
                    <input class="input" id="taskReward" type="number" placeholder="Xu thưởng" value="100">
                    <button class="btn btn-success" id="addTask">➕ Thêm nhiệm vụ</button>
                </div>
                <div id="taskList">
                    ${Object.entries(tasks).map(([id, t]) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px;font-size:13px;">
                            <div>
                                <p>🔗 ${t.link?.substring(0, 40)}...</p>
                                <p>🔑 ${t.code} | 🪙 ${t.reward} xu</p>
                                <p style="font-size:11px;color:var(--text2);">${t.active !== false ? '🟢 Đang hoạt động' : '🔴 Đã tắt'}</p>
                            </div>
                            <div style="display:flex;gap:4px;flex-direction:column;">
                                <button class="btn btn-sm btn-warning toggle-task" data-id="${id}" data-active="${t.active !== false}">${t.active !== false ? 'Tắt' : 'Bật'}</button>
                                <button class="btn btn-sm btn-danger delete-task" data-id="${id}">🗑️ Xóa</button>
                            </div>
                        </div>
                    `).join('') || '<p style="color:var(--text2);text-align:center;">Chưa có nhiệm vụ</p>'}
                </div>
            `;
            document.getElementById('addTask').onclick = async () => {
                const link = document.getElementById('taskLink').value.trim();
                const code = document.getElementById('taskCode').value.trim();
                const reward = parseInt(document.getElementById('taskReward').value) || 100;
                if (!link || !code) return this.app.toast('Vui lòng điền đầy đủ thông tin!', 'warning');
                await FB.db.ref('tasks').push({ link, code, reward, active: true, createdBy: this.app.user.username, createdAt: Date.now() });
                this.app.toast('Đã thêm nhiệm vụ mới!', 'success');
                this.loadTab('tasks');
            };
            document.querySelectorAll('.toggle-task').forEach(btn => {
                btn.onclick = async () => {
                    const isActive = btn.dataset.active === 'true';
                    await FB.db.ref(`tasks/${btn.dataset.id}/active`).set(!isActive);
                    this.app.toast(`Đã ${!isActive ? 'bật' : 'tắt'} nhiệm vụ!`, 'success');
                    this.loadTab('tasks');
                };
            });
            document.querySelectorAll('.delete-task').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm('Xác nhận xóa nhiệm vụ này?')) {
                        await FB.db.ref(`tasks/${btn.dataset.id}`).remove();
                        this.app.toast('Đã xóa nhiệm vụ!', 'success');
                        this.loadTab('tasks');
                    }
                };
            });
        }
        else if (tab === 'giftcodes') {
            const giftsSnap = await FB.db.ref('gift_codes').once('value');
            const gifts = giftsSnap.val() || {};
            content.innerHTML = `
                <h3>🎁 Quản lý Gift Code</h3>
                <div style="margin-bottom:12px;">
                    <input class="input" id="giftName" placeholder="Tên Gift Code">
                    <input class="input" id="giftReward" type="number" placeholder="Xu thưởng" value="500">
                    <input class="input" id="giftMax" type="number" placeholder="Giới hạn lượt dùng" value="100">
                    <input class="input" id="giftExpiry" type="date">
                    <button class="btn btn-success" id="createGift">➕ Tạo Gift Code</button>
                </div>
                <div id="giftList">
                    ${Object.entries(gifts).map(([code, g]) => `
                        <div style="padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div>
                                    <p><strong>${code}</strong></p>
                                    <p>🪙 ${g.reward} xu | 👥 ${g.usedCount || 0}/${g.maxUses}</p>
                                    ${g.expiry ? `<p style="font-size:11px;">📅 Hết hạn: ${new Date(g.expiry).toLocaleDateString('vi-VN')}</p>` : ''}
                                    <p style="font-size:11px;">${g.active ? '🟢 Hoạt động' : '🔴 Đã tắt'}</p>
                                </div>
                                <div style="display:flex;gap:4px;flex-direction:column;">
                                    <button class="btn btn-sm btn-warning toggle-gift" data-code="${code}" data-active="${g.active}">${g.active ? 'Tắt' : 'Bật'}</button>
                                    <button class="btn btn-sm btn-danger delete-gift" data-code="${code}">🗑️ Xóa</button>
                                </div>
                            </div>
                        </div>
                    `).join('') || '<p style="color:var(--text2);text-align:center;">Chưa có Gift Code</p>'}
                </div>
            `;
            document.getElementById('createGift').onclick = async () => {
                const code = document.getElementById('giftName').value.trim().toUpperCase();
                const reward = parseInt(document.getElementById('giftReward').value) || 500;
                const maxUses = parseInt(document.getElementById('giftMax').value) || 100;
                const expiryDate = document.getElementById('giftExpiry').value;
                if (!code) return this.app.toast('Vui lòng nhập tên Gift Code!', 'warning');
                const snap = await FB.db.ref(`gift_codes/${code}`).once('value');
                if (snap.exists()) return this.app.toast('Gift Code đã tồn tại!', 'error');
                await FB.db.ref(`gift_codes/${code}`).set({
                    reward,
                    maxUses,
                    usedCount: 0,
                    expiry: expiryDate ? new Date(expiryDate).getTime() : null,
                    active: true,
                    createdBy: this.app.user.username,
                    createdAt: Date.now()
                });
                this.app.toast(`Đã tạo Gift Code ${code}!`, 'success');
                this.loadTab('giftcodes');
            };
            document.querySelectorAll('.toggle-gift').forEach(btn => {
                btn.onclick = async () => {
                    const isActive = btn.dataset.active === 'true';
                    await FB.db.ref(`gift_codes/${btn.dataset.code}/active`).set(!isActive);
                    this.app.toast(`Đã ${!isActive ? 'bật' : 'tắt'} Gift Code!`, 'success');
                    this.loadTab('giftcodes');
                };
            });
            document.querySelectorAll('.delete-gift').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm(`Xác nhận xóa Gift Code ${btn.dataset.code}?`)) {
                        await FB.db.ref(`gift_codes/${btn.dataset.code}`).remove();
                        this.app.toast('Đã xóa Gift Code!', 'success');
                        this.loadTab('giftcodes');
                    }
                };
            });
        }
        else if (tab === 'withdraws') {
            const wSnap = await FB.db.ref('withdraw_requests').orderByChild('createdAt').limitToLast(50).once('value');
            const withdraws = [];
            wSnap.forEach(c => withdraws.push({ id: c.key, ...c.val() }));
            withdraws.reverse();
            content.innerHTML = `
                <h3>💸 Yêu cầu rút xu</h3>
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <button class="btn btn-sm btn-primary filter-withdraw active" data-filter="all">Tất cả</button>
                    <button class="btn btn-sm btn-warning filter-withdraw" data-filter="pending">🟡 Chờ duyệt</button>
                    <button class="btn btn-sm btn-success filter-withdraw" data-filter="approved">🟢 Đã duyệt</button>
                    <button class="btn btn-sm btn-danger filter-withdraw" data-filter="rejected">🔴 Từ chối</button>
                </div>
                <div id="withdrawList">
                    ${withdraws.map(w => `
                        <div class="withdraw-item" data-status="${w.status}" style="padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px;font-size:13px;">
                            <p>👤 ${w.username} | 💰 ${w.amountXu.toLocaleString()} xu = ${w.amountVnd.toLocaleString()}đ</p>
                            <p>🏦 ${w.bank} - ${w.accountNumber} | ${w.accountName}</p>
                            <span class="badge badge-${w.status === 'pending' ? 'pending' : w.status === 'approved' ? 'success' : 'rejected'}">
                                ${w.status === 'pending' ? '🟡 Chờ duyệt' : w.status === 'approved' ? '🟢 Thành công' : '🔴 Từ chối'}
                            </span>
                            ${w.status === 'pending' ? `
                                <div style="margin-top:8px;">
                                    <button class="btn btn-sm btn-success approve" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">✅ Duyệt</button>
                                    <button class="btn btn-sm btn-danger reject" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">❌ Từ chối</button>
                                </div>
                            ` : ''}
                        </div>
                    `).join('') || '<p style="color:var(--text2);text-align:center;">Chưa có yêu cầu rút nào</p>'}
                </div>
            `;
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
                    await FB.db.ref(`withdraw_requests/${btn.dataset.id}`).update({
                        status: 'approved',
                        reviewedBy: this.app.user.username,
                        reviewedAt: Date.now()
                    });
                    this.app.toast('Đã duyệt yêu cầu rút!', 'success');
                    this.loadTab('withdraws');
                };
            });
            document.querySelectorAll('.reject').forEach(btn => {
                btn.onclick = async () => {
                    const reason = prompt('Lý do từ chối (không bắt buộc):');
                    if (!confirm('Xác nhận từ chối yêu cầu này?')) return;
                    await FB.addBalance(btn.dataset.uid, parseInt(btn.dataset.amount));
                    await FB.db.ref(`withdraw_requests/${btn.dataset.id}`).update({
                        status: 'rejected',
                        reviewedBy: this.app.user.username,
                        reviewedAt: Date.now(),
                        rejectReason: reason || ''
                    });
                    this.app.toast('Đã từ chối và hoàn xu!', 'warning');
                    this.loadTab('withdraws');
                };
            });
        }
        else if (tab === 'users') {
            content.innerHTML = `
                <h3>👥 Quản lý người dùng</h3>
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <input class="input" id="searchUser" placeholder="Tìm ID hoặc username..." style="margin-bottom:0;">
                    <button class="btn btn-sm btn-primary" id="searchBtn">🔍 Tìm</button>
                </div>
                <div id="userSearchResult"></div>
            `;
            document.getElementById('searchBtn').onclick = async () => {
                const keyword = document.getElementById('searchUser').value.trim().toLowerCase();
                if (!keyword) return;
                const snap = await FB.db.ref('users').once('value');
                const users = snap.val() || {};
                const results = Object.entries(users).filter(([id, u]) => id.includes(keyword) || (u.username || '').toLowerCase().includes(keyword)).slice(0, 20);
                const resultDiv = document.getElementById('userSearchResult');
                if (results.length === 0) {
                    resultDiv.innerHTML = '<p style="text-align:center;color:var(--text2);">Không tìm thấy</p>';
                    return;
                }
                resultDiv.innerHTML = results.map(([id, u]) => `
                    <div class="card" style="font-size:13px;">
                        <div style="display:flex;justify-content:space-between;align-items:start;">
                            <div>
                                <p>👤 <strong>${u.username || 'Unknown'}</strong></p>
                                <p>🆔 ${id}</p>
                                <p>🪙 ${(u.balance || 0).toLocaleString()} xu</p>
                                <p>🔗 ${u.completedLinks || 0} link | 👥 ${(u.friends || []).length} bạn</p>
                                <p>📅 Tham gia: ${new Date(u.createdAt).toLocaleDateString('vi-VN')}</p>
                                <p>${u.isBanned ? '🔴 Đã khóa' : u.underReview ? '🟡 Đang theo dõi' : '🟢 Bình thường'}</p>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <button class="btn btn-sm btn-primary edit-bal" data-uid="${id}" data-current="${u.balance || 0}">✏️ Sửa xu</button>
                                ${!u.isBanned ? 
                                    `<button class="btn btn-sm btn-danger ban-user" data-uid="${id}" data-username="${u.username}">🚫 Khóa</button>` :
                                    `<button class="btn btn-sm btn-success unban-user" data-uid="${id}" data-username="${u.username}">✅ Mở khóa</button>`
                                }
                            </div>
                        </div>
                    </div>
                `).join('');
                document.querySelectorAll('.edit-bal').forEach(btn => {
                    btn.onclick = () => {
                        const newBal = prompt('Nhập số xu mới:', btn.dataset.current);
                        if (newBal !== null && !isNaN(newBal)) {
                            FB.updateUser(btn.dataset.uid, { balance: parseInt(newBal) });
                            this.app.toast('Đã cập nhật số xu!', 'success');
                            this.loadTab('users');
                            document.getElementById('searchBtn').click();
                        }
                    };
                });
                document.querySelectorAll('.ban-user').forEach(btn => {
                    btn.onclick = () => {
                        if (confirm(`Xác nhận khóa tài khoản ${btn.dataset.username}?`)) {
                            FB.updateUser(btn.dataset.uid, { isBanned: true, bannedBy: this.app.user.username, bannedAt: Date.now() });
                            this.app.toast('Đã khóa tài khoản!', 'success');
                            this.loadTab('users');
                            document.getElementById('searchBtn').click();
                        }
                    };
                });
                document.querySelectorAll('.unban-user').forEach(btn => {
                    btn.onclick = () => {
                        if (confirm(`Xác nhận mở khóa tài khoản ${btn.dataset.username}?`)) {
                            FB.updateUser(btn.dataset.uid, { isBanned: false, underReview: false });
                            this.app.toast('Đã mở khóa tài khoản!', 'success');
                            this.loadTab('users');
                            document.getElementById('searchBtn').click();
                        }
                    };
                });
            };
        }
    }
}

// ==================== 5. APP CHÍNH ====================
class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) {
            this.tg.ready();
            this.tg.expand();
        }
        this.user = null;
        this.isAdmin = false;
    }

    async init() {
        try {
            const initData = this.tg?.initDataUnsafe;
            if (initData?.user) {
                this.user = {
                    id: initData.user.id.toString(),
                    username: initData.user.username || 'User'
                };
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
            { page: 'home', icon: '🏠', label: 'Trang chủ' },
            { page: 'tasks', icon: '📋', label: 'Nhiệm vụ' },
            { page: 'friends', icon: '👥', label: 'Bạn bè' },
            { page: 'leaderboard', icon: '🏆', label: 'BXH' },
            { page: 'pvp', icon: '🎮', label: 'PvP' },
            { page: 'account', icon: '👤', label: 'Tài khoản' }
        ];
        if (this.isAdmin) items.push({ page: 'admin', icon: '👑', label: 'Admin' });
        const nav = document.getElementById('bottomNav');
        nav.innerHTML = items.map(item => `<button class="nav-btn" data-page="${item.page}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }

    async loadPage(page) {
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
        if (pages[page]) new pages[page](this, main, userData).render();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    async refreshUserBar() {
        const userData = await FB.getUser(this.user.id);
        document.getElementById('userBar').innerHTML = `<span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span><span>🪙 ${(userData.balance || 0).toLocaleString()} xu</span>`;
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
