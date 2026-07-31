import HomePage from './pages/home.js';
import TasksPage from './pages/tasks.js';
import FriendsPage from './pages/friends.js';
import LeaderboardPage from './pages/leaderboard.js';
import PvPPage from './pages/pvp.js';
import AccountPage from './pages/account.js';
import AdminPage from './pages/admin.js';

class CayXumMo {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.tg.ready(); this.tg.expand();
        this.user = null; this.isAdmin = false;
    }
    async init() {
        const initData = this.tg.initDataUnsafe;
        if (!initData?.user) {
            document.getElementById('loadingScreen').innerHTML = '<p>Mở trong Telegram</p>';
            return;
        }
        this.user = { id: initData.user.id.toString(), username: initData.user.username || 'User' };
        await FB.createUser(this.user.id, this.user);
        this.isAdmin = await FB.isAdmin(this.user.id);
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        this.setupNav();
        this.loadPage('home');
        this.refreshUserBar();
    }
    setupNav() {
        const nav = document.getElementById('bottomNav');
        const items = [
            { page:'home', icon:'🏠', label:'Trang chủ' },
            { page:'tasks', icon:'📋', label:'Nhiệm vụ' },
            { page:'friends', icon:'👥', label:'Bạn bè' },
            { page:'leaderboard', icon:'🏆', label:'BXH' },
            { page:'pvp', icon:'🎮', label:'PvP' },
            { page:'account', icon:'👤', label:'Tài khoản' }
        ];
        if (this.isAdmin) items.push({ page:'admin', icon:'👑', label:'Admin' });
        nav.innerHTML = items.map(item => `
            <button class="nav-btn" data-page="${item.page}">
                <span class="nav-icon">${item.icon}</span><span>${item.label}</span>
            </button>
        `).join('');
        document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => this.loadPage(btn.dataset.page));
    }
    async loadPage(page) {
        if (page === 'admin' && !this.isAdmin) return this.toast('⛔ Không có quyền!', 'error');
        const main = document.getElementById('mainContent');
        const userData = await FB.getUser(this.user.id);
        const pages = { home: HomePage, tasks: TasksPage, friends: FriendsPage, leaderboard: LeaderboardPage, pvp: PvPPage, account: AccountPage, admin: AdminPage };
        if (pages[page]) new pages[page](this, main, userData).render();
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }
    async refreshUserBar() {
        const userData = await FB.getUser(this.user.id);
        document.getElementById('userBar').innerHTML = `
            <span>👤 ${userData.username}${this.isAdmin ? ' <span style="background:#ffd700;color:#000;padding:2px 8px;border-radius:10px;font-size:10px;">ADMIN</span>' : ''}</span>
            <span>🪙 ${(userData.balance||0).toLocaleString()} xu</span>
        `;
    }
    toast(msg, type='info') {
        const t = document.getElementById('toast');
        t.textContent = msg; t.className = `toast toast-${type} show`;
        clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2500);
    }
}
window.addEventListener('DOMContentLoaded', () => { window.app = new CayXumMo(); window.app.init(); });
