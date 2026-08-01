export default class HomePage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const u = this.userData;
        const streak = u.dailyStreak || 0;

        // Tạo ô lịch điểm danh
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

        // Render toàn bộ nội dung
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

        // Gắn sự kiện điểm danh
        document.getElementById('btnDaily').onclick = () => this.doDaily();
    }

    async doDaily() {
        const result = await FB.dailyCheckin(this.app.user.id);
        if (result.status === 'already') {
            this.app.toast('Hôm nay bạn đã điểm danh rồi!', 'warning');
        } else {
            this.app.toast(`+${result.reward} xu! Ngày ${result.streak}/7`, 'success');
            this.app.refreshUserBar();
            this.render(); // load lại giao diện
        }
    }
}

export default class TasksPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
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
                                <p style="font-size:13px;color:var(--text2);">Đợi ${Math.ceil(cooldown/60000)} phút</p>
                            </div>
                        ` : `
                            <button class="btn btn-primary go-link-btn" style="width:200px;height:200px;border-radius:50%;font-size:18px;margin:0 auto;">
                                <div style="font-size:40px;">🔗</div><div>LẤY LINK</div>
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
                <div class="progress-bar"><div class="progress-fill" style="width:${progress/5*100}%"></div></div>
                <p style="text-align:center;">${progress}/5</p>
                <button class="btn btn-gold" id="btnChest" ${completedLinks >= 5 ? '' : 'disabled'}>🎁 Mở rương</button>
            </div>
        `;
        const goBtn = this.container.querySelector('.go-link-btn');
        if (goBtn) goBtn.onclick = async () => {
            const link = activeTask.link;
            window.open(link, '_blank');
            await FB.updateUser(this.app.user.id, { lastLinkTime: Date.now() });
            this.app.toast('Đã mở link!', 'info');
            this.render();
        };
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
            if (res.status === 'ok') { this.app.toast(`Nhận ${res.reward} xu!`, 'success'); this.app.refreshUserBar(); this.render(); }
            else this.app.toast(res.message, 'error');
        };
    }
}

export default class FriendsPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
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
                <div class="card-title">📊 Bạn đã mời: ${(u.friends||[]).length}</div>
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
        const html = top.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">👥 ${u.friends}</span></div>`).join('');
        this.container.querySelector('#topFriends').innerHTML = html || '<p>Chưa có dữ liệu</p>';
    }
}

export default class LeaderboardPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        this.container.innerHTML = `<div class="card"><div class="card-title">🏆 Top vượt link</div><p style="font-size:12px;color:var(--text2);">Reset mỗi 7 ngày</p><div id="topLinks">Đang tải...</div></div>`;
        const top = await FB.getTopLinks(10);
        const html = top.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">🔗 ${u.links||0}</span></div>`).join('');
        this.container.querySelector('#topLinks').innerHTML = html || '<p>Chưa có dữ liệu</p>';
    }
}

export default class PvPPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData;
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">🎮 PvP Oẳn Tù Tì</div>
                <p style="text-align:center;">🪙 ${(u.balance||0).toLocaleString()} xu</p>
                <p style="margin-top:12px;">Chọn phòng:</p>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${[{bet:1000,icon:'🥉',label:'Phổ thông'},{bet:3000,icon:'🥈',label:'Trung cấp'},{bet:5000,icon:'🥇',label:'Cao cấp'}].map(r => `
                        <button class="btn btn-primary room-btn" data-bet="${r.bet}" ${(u.balance||0) < r.bet ? 'disabled' : ''}>
                            ${r.icon} ${r.label} - ${r.bet.toLocaleString()} xu
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        this.container.querySelectorAll('.room-btn').forEach(btn => btn.onclick = () => this.joinRoom(parseInt(btn.dataset.bet)));
    }
    async joinRoom(bet) {
        // Đơn giản hóa: chỉ thông báo, chưa xử lý matchmaking đầy đủ
        this.app.toast(`Vào phòng ${bet.toLocaleString()} xu. Đang tìm đối thủ...`, 'info');
        // (Sẽ bổ sung logic matchmaking nếu cần)
    }
}

export default class AccountPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        const u = this.userData;
        const rateSnap = await FB.db.ref('admin_config/exchange_rate').once('value');
        const rate = rateSnap.val() || CONFIG.DEFAULT_EXCHANGE_RATE;
        this.container.innerHTML = `
            <div class="card"><div class="card-title">👤 Tài khoản</div><p>👤 ${u.username}</p><p>🆔 ${u.id}</p><p>🪙 ${(u.balance||0).toLocaleString()} xu</p></div>
            <div class="card"><div class="card-title">💱 Tỷ giá</div><p>1.000 xu = ${(1000*rate).toLocaleString()}đ</p></div>
            <div class="card"><div class="card-title">🎁 Gift Code</div><input class="input" id="giftInput" placeholder="Nhập Gift Code"><button class="btn btn-gold" id="btnGift">Nhận</button></div>
            <div class="card"><div class="card-title">💸 Rút xu</div>
                <input class="input" id="wdBank" placeholder="Ngân hàng">
                <input class="input" id="wdName" placeholder="Tên chủ TK">
                <input class="input" id="wdAccount" placeholder="Số TK">
                <input class="input" id="wdAmount" type="number" placeholder="Số xu (20k-100k)">
                <button class="btn btn-warning" id="btnWithdraw">Gửi yêu cầu</button>
            </div>
            <div class="card"><div class="card-title">📜 Lịch sử rút</div><div id="wdHistory">Đang tải...</div></div>
        `;
        this.container.querySelector('#btnGift').onclick = async () => {
            const code = this.container.querySelector('#giftInput').value.trim();
            if (!code) return this.app.toast('Nhập code!', 'warning');
            const res = await FB.redeemGiftCode(this.app.user.id, code);
            if (res.status === 'ok') { this.app.toast(`+${res.reward} xu!`, 'success'); this.app.refreshUserBar(); }
            else this.app.toast('Code không hợp lệ!', 'error');
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
            if (res.status === 'ok') { this.app.toast('Đã gửi yêu cầu!', 'success'); this.app.refreshUserBar(); this.render(); }
            else this.app.toast(res.message, 'error');
        };
        this.loadHistory();
    }
    async loadHistory() {
        const history = await FB.getWithdrawHistory(this.app.user.id);
        const html = history.map(h => `
            <div style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);">
                <p>💰 ${h.amountXu.toLocaleString()} xu = ${h.amountVnd.toLocaleString()}đ</p>
                <p>🏦 ${h.bank} - ${h.accountNumber}</p>
                <span class="badge badge-${h.status==='pending'?'pending':h.status==='approved'?'success':'rejected'}">${h.status==='pending'?'🟡 Chờ':h.status==='approved'?'🟢 Thành công':'🔴 Từ chối'}</span>
            </div>
        `).join('');
        this.container.querySelector('#wdHistory').innerHTML = html || '<p>Chưa có lịch sử</p>';
    }
}

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

