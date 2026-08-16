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

// ==================== ADMIN PAGE ====================
// CHƯA hardening trong đợt này (đã thống nhất, xem
// CLOUD-FUNCTIONS-MIGRATION.md mục 2) — giữ nguyên logic gốc, chỉ chuyển
// sang dùng FB/CONFIG import thay vì biến toàn cục.
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
                                <p style="font-size:13px;color:var(--text2);">Vui lòng kiểm tra lại User ID</p>
                            </div>`;
                        return;
                    }
                    const history = await FB.getTransactionHistory(uid, 500);
                    if (history.length === 0) {
                        document.getElementById('historyResult').innerHTML = `
                            <div class="card">
                                <p><b>👤 ${user.username}</b> (ID: ${uid})</p>
                                <p>🪙 Số dư hiện tại: <b>${(user.balance || 0).toLocaleString()}</b></p>
                                <p style="color:var(--text2);margin-top:10px;">📭 Chưa có lịch sử giao dịch</p>
                            </div>`;
                        return;
                    }
                    let totalIn = 0, totalOut = 0;
                    const typeLabels = { daily: '📅 Điểm danh', task: '🔗 Vượt link', chest: '🎁 Mở rương', gift: '🎫 Gift Code', friend: '👥 Mời bạn', withdraw: '💸 Rút xu' };
                    const typeColors = { daily: '#2ed573', task: '#5f91ff', chest: '#ffd700', gift: '#ff6b81', friend: '#a29bfe', withdraw: '#ff4757' };
                    history.forEach(h => { if (h.amount > 0) totalIn += h.amount; else totalOut += Math.abs(h.amount); });

                    let html = `
                        <div class="card">
                            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div><p style="font-size:18px;font-weight:bold;">👤 ${user.username}</p><p style="font-size:13px;color:var(--text2);">🆔 ${uid}</p></div>
                                <div style="text-align:right;"><p>🪙 Số dư: <b style="color:#ffd700;font-size:20px;">${(user.balance || 0).toLocaleString()}</b></p></div>
                            </div>
                            <div style="display:flex;gap:20px;margin-top:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
                                <span style="color:#2ed573;">📈 Tổng nhận: <b>+${totalIn.toLocaleString()}</b></span>
                                <span style="color:#ff4757;">📉 Tổng chi: <b>-${totalOut.toLocaleString()}</b></span>
                                <span style="color:#5f91ff;">📊 Giao dịch: <b>${history.length}</b></span>
                            </div>
                        </div>
                        <div class="card"><div class="card-title">📋 Chi tiết giao dịch</div><div style="max-height:500px;overflow-y:auto;">
                    `;
                    history.forEach((h, index) => {
                        const typeLabel = typeLabels[h.type] || h.type;
                        const color = typeColors[h.type] || '#ffffff';
                        const sign = h.amount >= 0 ? '+' : '';
                        const date = h.timestamp ? new Date(h.timestamp).toLocaleString('vi-VN') : 'N/A';
                        const bgColor = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)';
                        html += `
                            <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;background:${bgColor};border-radius:4px;margin-bottom:2px;">
                                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="color:${color};font-weight:600;font-size:14px;">${typeLabel}</span><span style="font-size:12px;color:var(--text2);">${h.detail || ''}</span></div>
                                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><span style="color:${h.amount >= 0 ? '#2ed573' : '#ff4757'};font-weight:bold;font-size:15px;">${sign}${h.amount.toLocaleString()} 🪙</span><span style="font-size:11px;color:var(--text2);">${date}</span></div>
                            </div>`;
                    });
                    html += `</div></div>`;
                    document.getElementById('historyResult').innerHTML = html;
                } catch (error) {
                    console.error('Load history error:', error);
                    document.getElementById('historyResult').innerHTML = `<div class="card" style="border-color:#ff4757;"><p style="color:#ff4757;">❌ Có lỗi xảy ra khi tải lịch sử</p></div>`;
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            };
            document.getElementById('searchHistoryUser').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') document.getElementById('searchHistoryBtn').click();
            });
        }

        else if (tab === 'codestats') {
            const linkTypes = CONFIG.linkTypes || {};
            let statsHTML = '';
            for (const [typeId, typeCfg] of Object.entries(linkTypes)) {
                const stats = await FB.getCodePoolStats(typeId);
                const ap = stats.total > 0 ? Math.round(stats.available / stats.total * 100) : 0;
                statsHTML += `<div class="card" style="border-left:4px solid ${typeCfg.color};"><div class="card-title">${typeCfg.icon || '🔗'} ${typeCfg.name} (${typeId})</div>
                <div style="display:flex;gap:15px;flex-wrap:wrap;margin-bottom:10px;">
                    <div style="flex:1;background:rgba(46,213,115,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#2ed573;">${stats.available}</div><div style="font-size:11px;">✅ Còn lại</div></div>
                    <div style="flex:1;background:rgba(255,71,87,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#ff4757;">${stats.used}</div><div style="font-size:11px;">❌ Đã dùng</div></div>
                    <div style="flex:1;background:rgba(255,215,0,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#ffd700;">${stats.total}</div><div style="font-size:11px;">📋 Tổng</div></div>
                    ${stats.expired > 0 ? `<div style="flex:1;background:rgba(95,145,255,0.1);padding:10px;border-radius:8px;text-align:center;"><div style="font-size:24px;color:#5f91ff;">${stats.expired}</div><div style="font-size:11px;">🔄 Đã reset</div></div>` : ''}
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;height:8px;overflow:hidden;margin-bottom:5px;"><div style="height:100%;background:linear-gradient(90deg,#2ed573 ${ap}%,#ff4757 ${ap}%);width:100%;"></div></div>
                <details style="margin-top:10px;"><summary style="cursor:pointer;color:var(--accent);font-size:13px;">📋 Xem danh sách mã (${stats.codes.length} mã)</summary>
                <div style="max-height:300px;overflow-y:auto;margin-top:10px;">
                <table style="width:100%;font-size:11px;border-collapse:collapse;">
                <thead><tr style="background:rgba(255,255,255,0.05);"><th style="padding:6px;text-align:left;">Mã</th><th style="padding:6px;text-align:center;">Trạng thái</th><th style="padding:6px;text-align:center;">Số lần dùng</th><th style="padding:6px;text-align:right;">Dùng lúc</th></tr></thead>
                <tbody>${stats.codes.map(c => `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:6px;font-family:monospace;">${c.code}</td><td style="padding:6px;text-align:center;"><span style="padding:2px 6px;border-radius:10px;font-size:10px;background:${c.available ? 'rgba(46,213,115,0.2)' : 'rgba(255,71,87,0.2)'};color:${c.available ? '#2ed573' : '#ff4757'};">${c.expired ? '🔄 Reset' : c.available ? '✅ Sẵn sàng' : '❌ Đã dùng'}</span></td><td style="padding:6px;text-align:center;">${c.usedCount}</td><td style="padding:6px;text-align:right;font-size:10px;color:var(--text2);">${c.usedAt ? new Date(c.usedAt).toLocaleString('vi-VN') : '-'}</td></tr>`).join('')}</tbody></table></div></details></div>`;
            }
            content.innerHTML = `<h3>📊 Thống kê mã</h3><p style="font-size:12px;color:var(--text2);margin-bottom:10px;">⏰ Reset sau ${CONFIG.codeResetDays} ngày</p>${statsHTML || '<p>Chưa có loại link nào</p>'}`;
        }

        else if (tab === 'import') {
            const linkTypes = CONFIG.linkTypes || {};
            let typeOptions = '';
            for (const [id, cfg] of Object.entries(linkTypes)) typeOptions += `<option value="${id}">${cfg.icon || '🔗'} ${cfg.name}</option>`;
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
            const linkTypes = CONFIG.linkTypes || {};
            let listHTML = '';
            for (const [id, cfg] of Object.entries(linkTypes)) {
                const stats = await FB.getCodePoolStats(id);
                listHTML += `<div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:10px;border-left:4px solid ${cfg.color || '#5f91ff'};"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;"><div><span style="font-size:18px;">${cfg.icon || '🔗'}</span><b style="margin-left:6px;">${cfg.name}</b><span style="font-size:12px;color:var(--text2);margin-left:8px;">ID: ${id}</span><span style="margin-left:8px;padding:2px 8px;border-radius:10px;font-size:11px;background:${cfg.active ? 'rgba(46,213,115,0.2)' : 'rgba(255,71,87,0.2)'};color:${cfg.active ? '#2ed573' : '#ff4757'};">${cfg.active ? '🟢 Hoạt động' : '🔴 Tắt'}</span></div><div style="display:flex;gap:6px;"><button class="btn-sm btn-primary edit-linktype" data-id="${id}">✏️ Sửa</button><button class="btn-sm btn-warning toggle-linktype" data-id="${id}" data-active="${cfg.active}">${cfg.active ? '⛔ Tắt' : '✅ Bật'}</button><button class="btn-sm btn-danger delete-linktype" data-id="${id}" data-name="${cfg.name}">🗑️ Xóa</button></div></div><div style="margin-top:6px;font-size:12px;color:var(--text2);">🔄 ${cfg.maxPerDay || 1} lượt/ngày | 🪙 +${cfg.reward || 100} | 📊 Mã: <span style="color:#2ed573;">${stats.available} còn</span> / <span style="color:#ff4757;">${stats.used} đã dùng</span> / ${stats.total} tổng</div><div style="font-size:11px;color:var(--text2);margin-top:4px;">🔗 URL: ${cfg.url || 'Chưa cấu hình'}</div></div>`;
            }
            content.innerHTML = `<div class="card"><div class="card-title">📋 Danh sách loại link</div>${listHTML || '<p>Chưa có loại link nào</p>'}</div>
            <div class="card"><div class="card-title">➕ Thêm loại link mới</div>
            <label>Tên:</label><input class="input" id="newLinkName" placeholder="VD: Link5m">
            <label>ID (tự động):</label><input class="input" id="newLinkId" readonly style="background:rgba(255,255,255,0.05);">
            <label>Lượt/ngày:</label><input class="input" id="newLinkMax" type="number" value="3">
            <label>🪙 Thưởng:</label><input class="input" id="newLinkReward" type="number" value="100">
            <div style="display:flex;gap:10px;"><div style="flex:1;"><label>Icon:</label><input class="input" id="newLinkIcon" value="🔗"></div><div style="flex:1;"><label>Màu:</label><div style="display:flex;gap:6px;"><input type="color" id="newLinkColorPicker" value="#ff00ff" style="width:40px;height:40px;"><input class="input" id="newLinkColor" value="#ff00ff"></div></div></div>
            <label>URL ({code} = mã):</label><input class="input" id="newLinkUrl" placeholder="https://...?url={code}">
            <label>Trạng thái:</label><select class="input" id="newLinkActive"><option value="true">🟢 Hoạt động</option><option value="false">🔴 Tắt</option></select>
            <button class="btn btn-success" id="addLinkType">➕ THÊM LOẠI</button></div>`;

            document.getElementById('newLinkName').addEventListener('input', function () { document.getElementById('newLinkId').value = this.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); });
            document.getElementById('newLinkColorPicker').addEventListener('input', function () { document.getElementById('newLinkColor').value = this.value; });

            document.getElementById('addLinkType').onclick = async () => {
                const name = document.getElementById('newLinkName').value.trim();
                const id = document.getElementById('newLinkId').value.trim();
                if (!name || !id) return this.app.toast('Nhập tên!', 'warning');
                if (CONFIG.linkTypes && CONFIG.linkTypes[id]) return this.app.toast('ID đã tồn tại!', 'error');
                const btn = document.getElementById('addLinkType'); btn.disabled = true; btn.textContent = '⏳...';
                try {
                    const ut = { ...(CONFIG.linkTypes || {}), [id]: { name, maxPerDay: parseInt(document.getElementById('newLinkMax').value) || 3, reward: parseInt(document.getElementById('newLinkReward').value) || 100, icon: document.getElementById('newLinkIcon').value.trim() || '🔗', color: document.getElementById('newLinkColor').value.trim() || '#ff00ff', url: document.getElementById('newLinkUrl').value.trim(), active: document.getElementById('newLinkActive').value === 'true' } };
                    await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig();
                    this.app.toast(`Đã thêm: ${name}!`, 'success'); this.loadTab('linktypes');
                } catch (e) { this.app.toast('Có lỗi!', 'error'); }
                finally { btn.disabled = false; btn.textContent = '➕ THÊM LOẠI'; }
            };

            this.container.querySelectorAll('.toggle-linktype').forEach(btn => btn.onclick = async () => {
                const id = btn.dataset.id; const ca = btn.dataset.active === 'true';
                try { const ut = { ...CONFIG.linkTypes }; if (ut[id]) ut[id].active = !ca; await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig(); this.app.toast(`Đã ${!ca ? 'bật' : 'tắt'}!`, 'success'); this.loadTab('linktypes'); }
                catch (e) { this.app.toast('Có lỗi!', 'error'); }
            });

            this.container.querySelectorAll('.delete-linktype').forEach(btn => btn.onclick = async () => {
                if (!confirm(`Xóa "${btn.dataset.name}"?`)) return;
                try { const ut = { ...CONFIG.linkTypes }; delete ut[btn.dataset.id]; await FB.db.ref('admin_config/linkTypes').set(ut); await FB.loadConfig(); this.app.toast('Đã xóa!', 'success'); this.loadTab('linktypes'); }
                catch (e) { this.app.toast('Có lỗi!', 'error'); }
            });

            this.container.querySelectorAll('.edit-linktype').forEach(btn => btn.onclick = () => {
                const id = btn.dataset.id; const cfg = CONFIG.linkTypes[id]; if (!cfg) return;
                content.innerHTML = `<div class="card"><div class="card-title">✏️ Sửa: ${cfg.name}</div>
                <label>Tên:</label><input class="input" id="editLinkName" value="${cfg.name}">
                <label>ID: <b>${id}</b> (không đổi)</label>
                <label>Lượt/ngày:</label><input class="input" id="editLinkMax" type="number" value="${cfg.maxPerDay || 3}">
                <label>🪙 Thưởng:</label><input class="input" id="editLinkReward" type="number" value="${cfg.reward || 100}">
                <label>Icon:</label><input class="input" id="editLinkIcon" value="${cfg.icon || '🔗'}">
                <label>Màu:</label><div style="display:flex;gap:6px;"><input type="color" id="editLinkColorPicker" value="${cfg.color || '#ff00ff'}" style="width:40px;height:40px;"><input class="input" id="editLinkColor" value="${cfg.color || '#ff00ff'}"></div>
                <label>URL:</label><input class="input" id="editLinkUrl" value="${cfg.url || ''}">
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

        else if (tab === 'config') {
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
                <div class="card"><div class="card-title">👥 Bạn bè</div><label class="input-label">Thưởng mời bạn (số_bạn:🪙)</label><input class="input" id="cfgFriendRewards" value="${Object.entries(friendRewards).map(([k, v]) => `${k}:${v}`).join(',')}"><label class="input-label">Giới hạn mời/ngày</label><input class="input" id="cfgMaxFriendsPerDay" type="number" value="${maxFriendsPerDay}"></div>
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
                        minWithdraw: parseInt(document.getElementById('cfgMinWithdraw').value) || 20000,
                        maxWithdraw: parseInt(document.getElementById('cfgMaxWithdraw').value) || 100000,
                        maxWithdrawPerDay: parseInt(document.getElementById('cfgMaxWithdrawPerDay').value) || 3,
                        exchange_rate: parseInt(document.getElementById('cfgRate').value) || 10,
                        linkTypes: CONFIG.linkTypes || {}
                    };
                    await FB.db.ref('admin_config').set(newConfig);
                    await FB.loadConfig();
                    await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'save_config', details: newConfig, timestamp: firebase.database.ServerValue.TIMESTAMP });
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
                <p style="font-size:12px;color:var(--text2);">Nguồn: Admin nạp thủ công</p>
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
                    await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'add_fund', amount: add, timestamp: firebase.database.ServerValue.TIMESTAMP });
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
            content.innerHTML = `<h3>🎁 Gift Code</h3><input class="input" id="giftName" placeholder="Tên code"><input class="input" id="giftReward" type="number" value="500" placeholder="🪙"><input class="input" id="giftMax" type="number" value="100" placeholder="Lượt dùng"><input class="input" id="giftExpiry" type="date"><button class="btn btn-success" id="createGift">Tạo</button><div style="margin-top:10px;">${Object.entries(gifts).map(([code, g]) => `<div style="padding:5px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><b>${code}</b> | ${g.reward}🪙 | ${g.usedCount || 0}/${g.maxUses} | <button class="btn-sm btn-danger" data-code="${code}">Xóa</button></div>`).join('')}</div>`;
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
                    await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'create_gift', code: name, details: { reward, maxUses, expiry }, timestamp: firebase.database.ServerValue.TIMESTAMP });
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
                        await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'delete_gift', code, timestamp: firebase.database.ServerValue.TIMESTAMP });
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
            wSnap.forEach(c => withdraws.push({ id: c.key, ...c.val() }));
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
                        <span class="badge badge-${w.status === 'pending' ? 'pending' : w.status === 'approved' ? 'success' : 'rejected'}">${w.status === 'pending' ? '🟡 Chờ' : w.status === 'approved' ? '🟢 Thành công' : '🔴 Từ chối'}</span>
                        ${w.status === 'pending' ? `<button class="btn-sm btn-success approve" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Duyệt</button><button class="btn-sm btn-danger reject" data-id="${w.id}" data-uid="${w.userId}" data-amount="${w.amountXu}">Từ chối</button>` : ''}
                    </div>`).join('')}
                </div>`;
            document.querySelectorAll('.filter-withdraw').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.filter-withdraw').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const filter = btn.dataset.filter;
                    document.querySelectorAll('.withdraw-item').forEach(item => { item.style.display = (filter === 'all' || item.dataset.status === filter) ? 'block' : 'none'; });
                };
            });
            document.querySelectorAll('.approve').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Xác nhận duyệt yêu cầu này?')) return;
                    const id = btn.dataset.id, uid = btn.dataset.uid, amount = parseInt(btn.dataset.amount);
                    try {
                        await FB.db.ref(`withdraw_requests/${id}`).update({ status: 'approved', reviewedBy: this.app.user.username, reviewedAt: firebase.database.ServerValue.TIMESTAMP });
                        await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'approve_withdraw', requestId: id, userId: uid, amount, timestamp: firebase.database.ServerValue.TIMESTAMP });
                        this.app.toast('Đã duyệt!', 'success'); this.loadTab('withdraws');
                    } catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
                };
            });
            document.querySelectorAll('.reject').forEach(btn => {
                btn.onclick = async () => {
                    const reason = prompt('Lý do từ chối (không bắt buộc):');
                    if (!confirm('Xác nhận từ chối yêu cầu này?')) return;
                    const id = btn.dataset.id, uid = btn.dataset.uid, amount = parseInt(btn.dataset.amount);
                    try {
                        await FB.addBalance(uid, amount);
                        await FB.db.ref(`withdraw_requests/${id}`).update({ status: 'rejected', reviewedBy: this.app.user.username, reviewedAt: firebase.database.ServerValue.TIMESTAMP, rejectReason: reason || '' });
                        await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'reject_withdraw', requestId: id, userId: uid, amount, reason: reason || '', timestamp: firebase.database.ServerValue.TIMESTAMP });
                        this.app.toast('Đã từ chối, hoàn 🪙!', 'warning'); this.loadTab('withdraws');
                    } catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
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
            let allUsers = [], currentPage = 1, filteredUsers = null;

            const renderUsers = (usersArr) => {
                const start = (currentPage - 1) * ITEMS_PER_PAGE;
                const pageUsers = usersArr.slice(start, start + ITEMS_PER_PAGE);
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
                            ${!u.isBanned ? `<button class="btn-sm btn-danger banUser" data-uid="${id}" data-username="${u.username}">🚫 Khóa</button>` : `<button class="btn-sm btn-success unbanUser" data-uid="${id}" data-username="${u.username}">✅ Mở khóa</button>`}
                            <button class="btn-sm btn-danger deleteUser" data-uid="${id}" data-username="${u.username}" style="background:#d50000;">🗑️ Xóa</button>
                        </div>
                    </div>`).join('');
                document.getElementById('userResult').innerHTML = html;

                document.querySelectorAll('.editBal').forEach(btn => {
                    btn.onclick = async () => {
                        const newBal = parseInt(document.getElementById(`editBal_${btn.dataset.uid}`).value);
                        if (isNaN(newBal)) return;
                        try { await FB.updateUser(btn.dataset.uid, { balance: newBal }); this.app.toast('Đã cập nhật!', 'success'); this.loadTab('users'); }
                        catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
                    };
                });
                document.querySelectorAll('.banUser').forEach(btn => {
                    btn.onclick = async () => {
                        if (confirm(`Khóa tài khoản ${btn.dataset.username}?`)) {
                            try { await FB.updateUser(btn.dataset.uid, { isBanned: true }); this.app.toast('Đã khóa!', 'success'); this.loadTab('users'); }
                            catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
                        }
                    };
                });
                document.querySelectorAll('.unbanUser').forEach(btn => {
                    btn.onclick = async () => {
                        if (confirm(`Mở khóa tài khoản ${btn.dataset.username}?`)) {
                            try { await FB.updateUser(btn.dataset.uid, { isBanned: false }); this.app.toast('Đã mở khóa!', 'success'); this.loadTab('users'); }
                            catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
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
                                if (Object.keys(updates).length > 0) await FB.db.ref().update(updates);
                                await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'delete_user', deletedUserId: uid, deletedUsername: btn.dataset.username, timestamp: firebase.database.ServerValue.TIMESTAMP });
                                this.app.toast(`Đã xóa tài khoản ${btn.dataset.username}!`, 'success');
                                this.loadTab('users');
                            } catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
                        }
                    };
                });

                const totalPages = Math.ceil(usersArr.length / ITEMS_PER_PAGE);
                let pagHTML = '';
                for (let i = 1; i <= totalPages; i++) pagHTML += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : ''}" style="width:auto;padding:6px 10px;" data-page="${i}">${i}</button>`;
                document.getElementById('pagination').innerHTML = pagHTML;
                document.querySelectorAll('#pagination button').forEach(btn => {
                    btn.onclick = () => { currentPage = parseInt(btn.dataset.page); renderUsers(filteredUsers || allUsers); };
                });
            };

            const snap = await FB.db.ref('users').once('value');
            allUsers = Object.entries(snap.val() || {}).sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0));
            renderUsers(allUsers);

            document.getElementById('searchBtn').onclick = async () => {
                const keyword = document.getElementById('searchUser').value.trim().toLowerCase();
                if (!keyword) { filteredUsers = null; currentPage = 1; renderUsers(allUsers); return; }
                const filtered = allUsers.filter(([id, u]) => id.includes(keyword) || (u.username || '').toLowerCase().includes(keyword));
                filteredUsers = filtered; currentPage = 1; renderUsers(filtered);
            };
        }

        else if (tab === 'leaderboard') {
            const topLinks = await FB.getTopLinks(10);
            const topFriends = await FB.getTopFriends(10);
            content.innerHTML = `
                <div class="grid-2">
                    <div class="card"><div class="card-title">🏆 Top vượt link</div>${topLinks.map((u, i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">#${i + 1}</span><span>${u.username || 'Unknown'}</span><span style="margin-left:auto;">🔗 ${u.links || 0}</span></div>`).join('')}</div>
                    <div class="card"><div class="card-title">👥 Top mời bạn</div>${topFriends.map((u, i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">#${i + 1}</span><span>${u.username || 'Unknown'}</span><span style="margin-left:auto;">👥 ${u.friends}</span></div>`).join('')}</div>
                </div>`;
        }

        else if (tab === 'notify') {
            content.innerHTML = `
                <div class="card"><div class="card-title">📢 Gửi thông báo</div><textarea class="input" id="notifyMsg" rows="3" placeholder="Nội dung thông báo..."></textarea><button class="btn btn-warning" id="btnNotify">📢 Gửi cho tất cả</button></div>
                <div class="card"><div class="card-title">📋 Lịch sử</div><div id="notifyHistory">Đang tải...</div></div>`;
            document.getElementById('btnNotify').onclick = async () => {
                const msg = document.getElementById('notifyMsg').value.trim();
                if (!msg) return this.app.toast('Nhập nội dung!', 'warning');
                const btn = document.getElementById('btnNotify');
                const originalText = btn.textContent;
                btn.textContent = '⏳ Đang gửi...';
                btn.disabled = true;
                try {
                    await FB.db.ref('notifications').push({ message: msg, sentBy: this.app.user.username, timestamp: firebase.database.ServerValue.TIMESTAMP });
                    await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'send_notification', message: msg, timestamp: firebase.database.ServerValue.TIMESTAMP });
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
            content.innerHTML = `<h3>🛡️ Cảnh báo bảo mật</h3>${alerts.map(a => `<div style="padding:8px;background:rgba(255,255,255,0.05);border-radius:5px;margin-bottom:5px;"><p><b>${a.type}</b> - ${a.username} (${a.userId})</p><p style="font-size:11px;">${new Date(a.timestamp).toLocaleString('vi-VN')}</p>${a.status === 'unread' ? `<button class="btn-sm btn-warning" data-id="${a.id}">Đã xem</button>` : ''}</div>`).join('') || '<p>Không có cảnh báo</p>'}`;
            document.querySelectorAll('.btn-warning').forEach(btn => btn.onclick = async () => {
                try { await FB.db.ref(`admin_alerts/${btn.dataset.id}/status`).set('reviewed'); this.loadTab('security'); }
                catch (error) { this.app.toast('Có lỗi xảy ra!', 'error'); }
            });
        }

        else if (tab === 'theme') {
            const configSnap = await FB.db.ref('admin_config').once('value');
            const config = configSnap.val() || {};
            const starColor = config.starColor || CONFIG.starColor;
            const bgColor1 = config.bgColor1 || CONFIG.bgColor1;
            const bgColor2 = config.bgColor2 || CONFIG.bgColor2;
            content.innerHTML = `
                <div class="card"><div class="card-title">🌟 Màu sao băng</div><div style="display:flex;gap:8px;align-items:center;"><input type="color" id="cfgStarColorPicker" value="${starColor}" style="width:50px;height:40px;border:none;cursor:pointer;"><input class="input" id="cfgStarColorHex" placeholder="Nhập mã hex (VD: #ff0000)" value="${starColor}" style="flex:1;"></div></div>
                <div class="card"><div class="card-title">🌌 Màu nền (Gradient)</div>
                    <label class="input-label">Màu trên cùng:</label><div style="display:flex;gap:8px;align-items:center;"><input type="color" id="cfgBgColor1Picker" value="${bgColor1}" style="width:50px;height:40px;border:none;cursor:pointer;"><input class="input" id="cfgBgColor1Hex" placeholder="Nhập mã hex" value="${bgColor1}" style="flex:1;"></div>
                    <label class="input-label">Màu dưới cùng:</label><div style="display:flex;gap:8px;align-items:center;"><input type="color" id="cfgBgColor2Picker" value="${bgColor2}" style="width:50px;height:40px;border:none;cursor:pointer;"><input class="input" id="cfgBgColor2Hex" placeholder="Nhập mã hex" value="${bgColor2}" style="flex:1;"></div>
                </div>
                <button class="btn btn-primary" id="saveTheme">💾 Lưu giao diện</button>
                <p style="font-size:12px;color:var(--text2);margin-top:8px;">⚠️ Áp dụng ngay sau khi lưu.</p>`;

            const syncColor = (pickerId, hexId) => {
                const picker = document.getElementById(pickerId), hex = document.getElementById(hexId);
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
                    await FB.db.ref('admin_config').update({ starColor: newStarColor, bgColor1: newBgColor1, bgColor2: newBgColor2 });
                    await FB.loadConfig();
                    this.app.applyTheme();
                    await FB.db.ref('admin_logs').push({ adminId: this.app.user.id, action: 'save_theme', details: { starColor: newStarColor, bgColor1: newBgColor1, bgColor2: newBgColor2 }, timestamp: firebase.database.ServerValue.TIMESTAMP });
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
            this.currentPage.render();
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
