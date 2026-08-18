import { CONFIG, DEFAULT_CONFIG } from './config.js';
import { Storage } from './storage.js';
import { FB } from './firebase-manager.js';
import { setupWebLogin } from './pages/web-auth.js';
import { signInTelegram } from './pages/telegram-auth.js';
import { HomePage } from './pages/home.js';
import { TasksPage } from './pages/tasks.js';
import { FriendsPage } from './pages/friends.js';
import { LeaderboardPage } from './pages/leaderboard.js';
import { AccountPage } from './pages/account.js';
import { AdminPage } from './pages/admin.js';

// ==================== APP CHÍNH ====================
function waitForFirebaseAuth() {
    return new Promise((resolve) => {
        const unsub = firebase.auth().onAuthStateChanged((user) => {
            unsub();
            resolve(user);
        });
    });
}

class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) { this.tg.ready(); this.tg.expand(); }
        this.user = null;
        this.isAdmin = false;
        this.currentPage = null;
    }

    async init() {
        try {
            await FB.loadConfig();

            if (this.tg?.initData) {
                // Telegram: xác thực THẬT qua Cloud Function (xem
                // TELEGRAM-AUTH.md) — không còn tin thẳng initDataUnsafe.
                try {
                    const firebaseUser = await signInTelegram(this.tg);
                    this.user = { id: firebaseUser.uid, username: firebaseUser.displayName || 'User' };
                } catch (e) {
                    document.getElementById('loadingScreen').innerHTML = `
                        <div style="color:red;padding:20px;">
                            <h3>❌ Không xác thực được Telegram</h3>
                            <p>${e.message}</p>
                            <button onclick="location.reload()">🔄 Tải lại</button>
                        </div>`;
                    return;
                }
            } else {
                // Web: chờ Firebase Auth khôi phục phiên đăng nhập cũ (nếu có)
                const firebaseUser = await waitForFirebaseAuth();
                if (firebaseUser) {
                    this.user = { id: firebaseUser.uid, username: Storage.getItem('cayxummo_user') || firebaseUser.displayName || 'User' };
                } else {
                    Storage.removeItem('cayxummo_uid');
                    Storage.removeItem('cayxummo_user');
                    document.getElementById('loadingScreen').style.display = 'none';
                    document.getElementById('loginScreen').style.display = 'flex';
                    setupWebLogin(this);
                    return;
                }
            }

            const userData = await FB.getUser(this.user.id);
            if (!userData) {
                // Bình thường không xảy ra (telegramLogin/registerUser đã
                // tạo sẵn) — giữ làm lưới an toàn dự phòng.
                if (this.tg) {
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

            // Xử lý link mời (chỉ web — Telegram dùng startapp riêng)
            if (!this.tg) {
                const urlParams = new URLSearchParams(window.location.search);
                const refId = urlParams.get('ref');
                if (refId && refId !== this.user.id) {
                    const refUser = await FB.getUser(refId);
                    if (refUser) {
                        try {
                            const result = await FB.addFriend(this.user.id, refId);
                            if (result.status === 'ok' || result.status === 'reward') {
                                this.toast(`🎉 Bạn được mời bởi @${refUser.username || refId}!`, 'success');
                            }
                        } catch (e) {
                            console.warn('Không thể xử lý lời mời:', e);
                        }
                    }
                }
            }

            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';

            this.setupNav();
            this.loadPage('home');
            this.refreshUserBar();
            this.applyTheme();

            FB.db.ref('notifications').orderByChild('timestamp').limitToLast(20).on('value', snap => {
                const arr = [];
                snap.forEach(c => arr.push(c.val()));
                arr.reverse();
                this._notifications = arr;
                const lastSeen = Number(Storage.getItem('lastSeenNotify') || 0);
                const newCount = arr.filter(n => n.timestamp > lastSeen).length;
                const badge = document.getElementById('notifyBadge');
                if (badge) {
                    if (newCount > 0) { badge.textContent = newCount; badge.style.display = 'block'; }
                    else badge.style.display = 'none';
                }
            });

            document.getElementById('btnNotifications').onclick = () => this.showNotifications();

            setInterval(() => { if (this.user) this.refreshUserBar(); }, 30000);

            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.currentPage && this.currentPage.destroy) {
                    this.currentPage.destroy();
                }
            });

        } catch (e) {
            document.getElementById('loadingScreen').innerHTML = `
                <div style="color:red;padding:20px;">
                    <h3>❌ Lỗi khởi tạo:</h3>
                    <p>${e.message}</p>
                    <button onclick="location.reload()" style="margin-top:10px;padding:8px 20px;">🔄 Tải lại</button>
                </div>`;
            console.error(e);
        }
    }

    setupNav() {
        const items = [
            { page: 'home', icon: '🏠', label: 'Trang chủ' },
            { page: 'tasks', icon: '📋', label: 'Nhiệm vụ' },
            { page: 'friends', icon: '👥', label: 'Bạn bè' },
            { page: 'leaderboard', icon: '🏆', label: 'BXH' },
            { page: 'account', icon: '👤', label: 'Tài khoản' }
        ];
        if (this.isAdmin) items.push({ page: 'admin', icon: '👑', label: 'Admin' });
        document.getElementById('bottomNav').innerHTML = items.map(item =>
            `<button class="nav-btn" data-page="${item.page}"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`
        ).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }

    async loadPage(page) {
        if (this.currentPage && this.currentPage.destroy) this.currentPage.destroy();
        const main = document.getElementById('mainContent');
        const userData = await FB.getUser(this.user.id);
        const pages = { home: HomePage, tasks: TasksPage, friends: FriendsPage, leaderboard: LeaderboardPage, account: AccountPage, admin: AdminPage };
        if (pages[page]) {
            this.currentPage = new pages[page](this, main, userData);
            // BUG FIX: trước đây gọi render() không có await — nếu render()
            // (là hàm async) ném lỗi, lỗi đó biến mất âm thầm (unhandled
            // promise rejection), màn hình vẫn hiện trang CŨ, trông như
            // "bấm không có gì xảy ra". Giờ await + try/catch để lỗi thật
            // sự hiện ra cho người dùng thấy.
            try {
                await this.currentPage.render();
            } catch (e) {
                console.error(`Lỗi khi tải trang "${page}":`, e);
                main.innerHTML = `
                    <div class="card" style="border-color:#ff4757;">
                        <p style="color:#ff4757;">❌ Không tải được trang này</p>
                        <p style="font-size:12px;color:var(--text2);">${e.message || e}</p>
                    </div>`;
            }
        }
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    async refreshUserBar() {
        const userData = await FB.getUser(this.user.id);
        document.getElementById('userBar').innerHTML =
            `<span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span><span>🪙 ${(userData.balance || 0).toLocaleString()}</span>`;
    }

    toast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = `toast toast-${type} show`;
        setTimeout(() => t.classList.remove('show'), 2500);
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
            .shooting_star { background: linear-gradient(-45deg, ${starColor}, rgba(0, 0, 255, 0)) !important; filter: drop-shadow(0 0 6px ${starColor}) !important; }
            .shooting_star::before, .shooting_star::after { background: linear-gradient(-45deg, rgba(0, 0, 255, 0), ${starColor}, rgba(0, 0, 255, 0)) !important; }
        `;
    }

    async logout() {
        // THÊM MỚI: đăng xuất khỏi Firebase Auth thật (nếu có phiên nào)
        if (firebase.auth().currentUser) {
            try { await firebase.auth().signOut(); } catch (e) { /* bỏ qua */ }
        }
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
        const html = notifies.length === 0
            ? '<p style="text-align:center;color:var(--text2);">Chưa có thông báo</p>'
            : notifies.map(n => `<div class="notify-item"><p>${n.message}</p><p class="time">${new Date(n.timestamp).toLocaleString('vi-VN')}</p></div>`).join('');
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

window.addEventListener('DOMContentLoaded', () => {
    window.app = new CayXumMo();
    window.app.init();
});
