import { CONFIG } from '../config.js';
import { FB } from '../firebase-manager.js';
import { withLoading } from '../ui.js';

export class AccountPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    async render() {
        const u = this.userData;
        const rate = CONFIG.exchange_rate;

        // Chỉ hiện khối "Thêm email khôi phục" cho tài khoản web đang
        // dùng email giả (@cayxummo.local) — tài khoản đã có email thật
        // hoặc đang là Telegram (chưa đăng nhập Firebase Auth) thì ẩn.
        const currentAuthUser = firebase.auth().currentUser;
        const isFakeEmail = currentAuthUser?.email?.endsWith('@cayxummo.local');
        const recoveryEmailHTML = isFakeEmail ? `
            <div class="card">
                <div class="card-title">📧 Email khôi phục</div>
                <p style="font-size:12px;color:var(--text2);margin-bottom:8px;">
                    Tài khoản của bạn chưa có email thật — "Quên mật khẩu" sẽ
                    không hoạt động cho tới khi bạn thêm email ở đây.
                </p>
                <input class="input" id="recoveryEmailInput" type="email" placeholder="Email của bạn">
                <button class="btn btn-primary" id="btnAddRecoveryEmail">Lưu email</button>
            </div>
        ` : '';

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">👤 Tài khoản</div>
                <p>👤 ${u.username}</p>
                <p>🆔 ${u.id}</p>
                <p>🪙 ${(u.balance || 0).toLocaleString()}</p>
                <button class="btn btn-danger" id="btnLogout" style="margin-top:15px;width:100%;padding:12px;">🚪 Đăng xuất</button>
            </div>
            ${recoveryEmailHTML}
            <div class="card"><div class="card-title">💱 Tỷ giá</div><p>3.000 🪙 = ${(1000 * rate).toLocaleString()}đ</p></div>
            <div class="card">
                <div class="card-title">📢 Tham gia Group</div>
                <button class="btn btn-primary" id="btnJoinCodeGroup" style="margin-bottom:8px;">📋 Group Code</button>
                <button class="btn btn-primary" id="btnJoinNotifyGroup">🔔 Group Thông báo</button>
            </div>
            <div class="card">
                <div class="card-title">🎁 Gift Code</div>
                <input class="input" id="giftInput" placeholder="Nhập Gift Code">
                <button class="btn btn-gold" id="btnGift">Nhận</button>
            </div>
            <div class="card">
                <div class="card-title">💸 Rút 🪙</div>
                <input class="input" id="wdBank" placeholder="Ngân hàng">
                <input class="input" id="wdName" placeholder="Tên chủ TK">
                <input class="input" id="wdAccount" placeholder="Số TK">
                <input class="input" id="wdAmount" type="number" placeholder="Số 🪙 (${CONFIG.minWithdraw.toLocaleString()} - ${CONFIG.maxWithdraw.toLocaleString()}🪙)">
                <button class="btn btn-warning" id="btnWithdraw">Gửi yêu cầu</button>
            </div>
            <div class="card"><div class="card-title">📜 Lịch sử rút</div><div id="wdHistory">Đang tải...</div></div>
        `;

        document.getElementById('btnJoinCodeGroup').onclick = () => {
            const link = 'https://t.me/CodeXummo';
            if (this.app.tg) this.app.tg.openLink(link);
            else window.open(link, '_blank');
        };

        document.getElementById('btnJoinNotifyGroup').onclick = () => {
            const link = 'https://t.me/Cayxummo';
            if (this.app.tg) this.app.tg.openLink(link);
            else window.open(link, '_blank');
        };

        if (isFakeEmail) {
            document.getElementById('btnAddRecoveryEmail').onclick = async () => {
                const email = document.getElementById('recoveryEmailInput').value.trim();
                if (!email) return this.app.toast('Nhập email!', 'warning');
                const btn = document.getElementById('btnAddRecoveryEmail');
                try {
                    await withLoading(btn, '⏳...', async () => {
                        await FB.addRecoveryEmail(email);
                        this.app.toast('Đã lưu email khôi phục!', 'success');
                        this.render();
                    }, { onError: (e) => this.app.toast(e.message || 'Có lỗi!', 'error') });
                } catch (e) {
                    // đã xử lý
                }
            };
        }

        this.container.querySelector('#btnGift').onclick = async () => {
            const code = this.container.querySelector('#giftInput').value.trim();
            if (!code) return this.app.toast('Nhập code!', 'warning');
            const btn = this.container.querySelector('#btnGift');
            try {
                await withLoading(btn, '⏳ Đang xử lý...', async () => {
                    const res = await FB.redeemGiftCode(this.app.user.id, code);
                    if (res.status === 'ok') {
                        this.app.toast(`+${res.reward} 🪙!`, 'success');
                        this.app.refreshUserBar();
                    } else {
                        this.app.toast('Code không hợp lệ!', 'error');
                    }
                }, { onError: () => this.app.toast('Có lỗi xảy ra, vui lòng thử lại!', 'error') });
            } catch (e) {
                // đã xử lý
            }
        };

        this.container.querySelector('#btnWithdraw').onclick = async () => {
            const data = {
                bank: this.container.querySelector('#wdBank').value.trim(),
                accountName: this.container.querySelector('#wdName').value.trim(),
                accountNumber: this.container.querySelector('#wdAccount').value.trim(),
                amount: this.container.querySelector('#wdAmount').value.trim()
            };
            if (!data.bank || !data.accountName || !data.accountNumber || !data.amount) {
                return this.app.toast('Điền đầy đủ!', 'warning');
            }
            const btn = this.container.querySelector('#btnWithdraw');
            try {
                await withLoading(btn, '⏳ Đang xử lý...', async () => {
                    const res = await FB.requestWithdraw(this.app.user.id, data);
                    if (res.status === 'ok') {
                        this.app.toast('Đã gửi yêu cầu!', 'success');
                        this.app.refreshUserBar();
                        this.render();
                    } else {
                        this.app.toast(res.message || 'Có lỗi!', 'error');
                    }
                }, { onError: (e) => this.app.toast(e.message || 'Có lỗi xảy ra, vui lòng thử lại!', 'error') });
            } catch (e) {
                // đã xử lý
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
