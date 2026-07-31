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
