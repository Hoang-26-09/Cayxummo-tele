export default class AdminPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        if (!this.app.isAdmin) { this.container.innerHTML = '<p>⛔ Không có quyền!</p>'; return; }
        const stats = await FB.getDashboard();
        this.container.innerHTML = `
            <h2>👑 Admin</h2>
            <div class="grid-2">
                <div class="stat-card"><div class="stat-value">${stats.totalUsers}</div><div class="stat-label">Users</div></div>
                <div class="stat-card"><div class="stat-value">${stats.totalBalance.toLocaleString()}</div><div class="stat-label">Xu</div></div>
                <div class="stat-card"><div class="stat-value">${stats.totalLinks.toLocaleString()}</div><div class="stat-label">Links</div></div>
                <div class="stat-card"><div class="stat-value">${stats.prizeFund.toLocaleString()}</div><div class="stat-label">Quỹ</div></div>
            </div>
            <p style="margin:10px 0;">Yêu cầu rút: <b>${stats.pendingWithdraws}</b></p>
            <div class="admin-tabs">
                <button class="admin-tab active" data-tab="config">⚙️ Cấu hình</button>
                <button class="admin-tab" data-tab="tasks">📋 Nhiệm vụ</button>
                <button class="admin-tab" data-tab="giftcodes">🎁 Gift Code</button>
                <button class="admin-tab" data-tab="withdraws">💸 Rút xu</button>
                <button class="admin-tab" data-tab="users">👥 Users</button>
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
        const content = this.container.querySelector('#adminTabContent');
        if (tab === 'config') {
            const rateSnap = await FB.db.ref('admin_config/exchange_rate').once('value');
            const rate = rateSnap.val() || CONFIG.DEFAULT_EXCHANGE_RATE;
            content.innerHTML = `
                <h3>⚙️ Cấu hình</h3>
                <label>Tỷ giá (1 xu = ? VND):</label>
                <input class="input" id="cfgRate" type="number" value="${rate}">
                <button class="btn btn-primary" id="saveRate">Lưu</button>
            `;
            this.container.querySelector('#saveRate').onclick = async () => {
                const newRate = parseInt(this.container.querySelector('#cfgRate').value) || 10;
                await FB.db.ref('admin_config/exchange_rate').set(newRate);
                this.app.toast('Đã lưu!', 'success');
            };
        } else if (tab === 'tasks') {
            const tasks = await FB.getTasks();
            content.innerHTML = `
                <h3>📋 Nhiệm vụ</h3>
                <input class="input" id="taskLink" placeholder="Link">
                <input class="input" id="taskCode" placeholder="Mã">
                <input class="input" id="taskReward" type="number" value="100" placeholder="Xu thưởng">
                <button class="btn btn-success" id="addTask">Thêm</button>
                <div style="margin-top:10px;">${Object.entries(tasks).map(([id,t]) => `<div style="display:flex;justify-content:space-between;padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><span>${t.link?.substring(0,20)}... | ${t.code} | ${t.reward}xu</span><button class="btn-sm btn-danger" data-id="${id}">Xóa</button></div>`).join('')}</div>
            `;
            this.container.querySelector('#addTask').onclick = async () => {
                const link = this.container.querySelector('#taskLink').value.trim();
                const code = this.container.querySelector('#taskCode').value.trim();
                const reward = parseInt(this.container.querySelector('#taskReward').value) || 100;
                if (!link || !code) return this.app.toast('Nhập đủ!', 'warning');
                await FB.db.ref('tasks').push({ link, code, reward, active: true });
                this.app.toast('Đã thêm!', 'success');
                this.loadTab('tasks');
            };
            this.container.querySelectorAll('.btn-danger').forEach(btn => btn.onclick = async () => {
                await FB.db.ref(`tasks/${btn.dataset.id}`).remove();
                this.loadTab('tasks');
            });
        } else if (tab === 'giftcodes') {
            const giftsSnap = await FB.db.ref('gift_codes').once('value');
            const gifts = giftsSnap.val() || {};
            content.innerHTML = `
                <h3>🎁 Gift Code</h3>
                <input class="input" id="giftName" placeholder="Tên code">
                <input class="input" id="giftReward" type="number" value="500" placeholder="Xu">
                <input class="input" id="giftMax" type="number" value="100" placeholder="Lượt dùng">
                <input class="input" id="giftExpiry" type="date">
                <button class="btn btn-success" id="createGift">Tạo</button>
                <div style="margin-top:10px;">${Object.entries(gifts).map(([code,g]) => `<div style="padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><b>${code}</b> | ${g.reward}xu | ${g.usedCount||0}/${g.maxUses} | <button class="btn-sm btn-danger" data-code="${code}">Xóa</button></div>`).join('')}</div>
            `;
            this.container.querySelector('#createGift').onclick = async () => {
                const name = this.container.querySelector('#giftName').value.trim();
                const reward = parseInt(this.container.querySelector('#giftReward').value) || 500;
                const maxUses = parseInt(this.container.querySelector('#giftMax').value) || 100;
                const expiry = this.container.querySelector('#giftExpiry').value;
                if (!name) return this.app.toast('Nhập tên!', 'warning');
                await FB.db.ref(`gift_codes/${name}`).set({ reward, maxUses, usedCount: 0, expiry: expiry ? new Date(expiry).getTime() : null, active: true });
                this.app.toast('Đã tạo!', 'success');
                this.loadTab('giftcodes');
            };
            this.container.querySelectorAll('.btn-danger').forEach(btn => btn.onclick = async () => {
                await FB.db.ref(`gift_codes/${btn.dataset.code}`).remove();
                this.loadTab('giftcodes');
            });
        } else if (tab === 'withdraws') {
            const wSnap = await FB.db.ref('withdraw_requests').orderByChild('createdAt').limitToLast(20).once('value');
            const withdraws = []; wSnap.forEach(c => withdraws.push({ id: c.key, ...c.val() })); withdraws.reverse();
            content.innerHTML = `<h3>💸 Rút xu</h3>${withdraws.map(w => `
                <div style="padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;">
                    <p>${w.username} - ${w.amountXu.toLocaleString()} xu (${w.amountVnd.toLocaleString()}đ)</p>
                    <p>${w.bank} - ${w.accountNumber}</p>
                    <span class="badge badge-${w.status==='pending'?'pending':'success'}">${w.status}</span>
                    ${w.status==='pending' ? `<button class="btn-sm btn-success approve" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Duyệt</button><button class="btn-sm btn-danger reject" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Từ chối</button>` : ''}
                </div>
            `).join('')}`;
            this.container.querySelectorAll('.approve').forEach(btn => btn.onclick = async () => {
                await FB.db.ref(`withdraw_requests/${btn.dataset.id}`).update({ status: 'approved', reviewedBy: this.app.user.username, reviewedAt: Date.now() });
                this.app.toast('Đã duyệt!', 'success'); this.loadTab('withdraws');
            });
            this.container.querySelectorAll('.reject').forEach(btn => btn.onclick = async () => {
                await FB.addBalance(btn.dataset.uid, parseInt(btn.dataset.amount));
                await FB.db.ref(`withdraw_requests/${btn.dataset.id}`).update({ status: 'rejected', reviewedBy: this.app.user.username, reviewedAt: Date.now() });
                this.app.toast('Đã từ chối, hoàn xu!', 'warning'); this.loadTab('withdraws');
            });
        } else if (tab === 'users') {
            content.innerHTML = `<h3>👥 Users</h3><input class="input" id="searchUser" placeholder="Tìm ID"><button class="btn btn-primary" id="searchBtn">Tìm</button><div id="userResult"></div>`;
            this.container.querySelector('#searchBtn').onclick = async () => {
                const keyword = this.container.querySelector('#searchUser').value.trim().toLowerCase();
                if (!keyword) return;
                const snap = await FB.db.ref('users').once('value');
                const users = snap.val() || {};
                const results = Object.entries(users).filter(([id,u]) => id.includes(keyword) || (u.username||'').toLowerCase().includes(keyword)).slice(0,5);
                const html = results.map(([id,u]) => `
                    <div style="padding:8px;background:rgba(255,255,255,0.05);margin-top:5px;border-radius:5px;">
                        <p><b>${u.username}</b> (ID: ${id})</p>
                        <p>Xu: ${(u.balance||0).toLocaleString()}</p>
                        <input class="input" id="editBal_${id}" placeholder="Sửa xu" type="number">
                        <button class="btn-sm btn-primary editBal" data-uid="${id}">Lưu</button>
                    </div>
                `).join('');
                this.container.querySelector('#userResult').innerHTML = html || '<p>Không tìm thấy</p>';
                this.container.querySelectorAll('.editBal').forEach(btn => btn.onclick = async () => {
                    const newBal = parseInt(this.container.querySelector(`#editBal_${btn.dataset.uid}`).value);
                    if (isNaN(newBal)) return;
                    await FB.updateUser(btn.dataset.uid, { balance: newBal });
                    this.app.toast('Đã cập nhật!', 'success');
                });
            };
        }
    }
}