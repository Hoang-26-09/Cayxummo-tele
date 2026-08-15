import { CONFIG } from '../config.js';
import { FB } from '../firebase-manager.js';
import { withLoading } from '../ui.js';

export class TasksPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const completedLinks = this.userData.completedLinks || 0;
        const progress = completedLinks % CONFIG.linksForChest;
        const isReady = completedLinks >= CONFIG.linksForChest && progress === 0;
        const activeLinkTypes = Object.entries(CONFIG.linkTypes || {}).filter(([, cfg]) => cfg.active);
        const cooldown = this.userData.lastCodeTime
            ? Math.max(0, CONFIG.linkCooldown - (Date.now() - this.userData.lastCodeTime)) : 0;
        const isCooldown = cooldown > 0;

        let linkTypeCardsHTML = '';
        for (const [typeId, typeCfg] of activeLinkTypes) {
            const dailyCountKey = `linkDaily_${typeId}`;
            const dailyCountDateKey = `linkDailyDate_${typeId}`;
            const today = new Date().toDateString();
            const countToday = (this.userData[dailyCountDateKey] === today) ? (this.userData[dailyCountKey] || 0) : 0;
            const maxPerDay = typeCfg.maxPerDay || 1;
            const isFull = countToday >= maxPerDay;

            linkTypeCardsHTML += `
                <div class="link-type-card" style="border-left:4px solid ${typeCfg.color};background:rgba(255,255,255,0.05);padding:15px;border-radius:12px;margin-bottom:15px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <div>
                            <span style="font-size:20px;">${typeCfg.icon || '🔗'}</span>
                            <span style="font-weight:bold;margin-left:8px;">${typeCfg.name}</span>
                            <span style="font-size:12px;color:var(--text2);margin-left:8px;">(${countToday}/${maxPerDay} hôm nay)</span>
                        </div>
                        <span style="font-size:12px;padding:4px 10px;border-radius:20px;background:${isFull ? 'rgba(255,71,87,0.2)' : 'rgba(46,213,115,0.2)'};color:${isFull ? '#ff4757' : '#2ed573'};">
                            ${isFull ? '⛔ Hết lượt' : `✅ Còn ${maxPerDay - countToday} lượt`}
                        </span>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <button class="btn btn-primary get-link-btn" data-type="${typeId}" style="flex:1;" ${isFull || isCooldown ? 'disabled' : ''}>
                            ${isFull ? '⛔ ĐÃ HẾT LƯỢT' : isCooldown ? `⏳ Đợi ${Math.ceil(cooldown / 60000)}p` : '🔗 LẤY LINK'}
                        </button>
                        <span style="font-size:12px;color:var(--text2);">🪙 +${typeCfg.reward || 100}</span>
                    </div>
                </div>`;
        }
        if (!linkTypeCardsHTML) {
            linkTypeCardsHTML = '<p style="text-align:center;color:var(--text2);padding:30px;">⚠️ Chưa có loại link nào được kích hoạt.</p>';
        }

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📋 Nhiệm vụ</div>
                <p style="font-size:12px;color:var(--text2);margin-bottom:10px;">Mỗi loại link có giới hạn lượt/ngày.</p>
                ${linkTypeCardsHTML}
            </div>
            <div class="card">
                <div class="card-title">🔑 Nhập mã xác nhận</div>
                <input class="input" id="codeInput" placeholder="Nhập mã...">
                <button class="btn btn-success" id="btnVerify">✅ Xác nhận</button>
                ${isCooldown ? `<p style="font-size:12px;color:var(--text2);text-align:center;margin-top:8px;">⏱️ Đợi ${Math.ceil(cooldown / 60000)} phút để làm nhiệm vụ tiếp</p>` : ''}
            </div>
            <div class="card">
                <div class="card-title">🎁 Rương thưởng</div>
                <div class="progress-bar"><div class="progress-fill" style="width:${(isReady ? CONFIG.linksForChest : progress) / CONFIG.linksForChest * 100}%"></div></div>
                <p style="text-align:center;">${isReady ? CONFIG.linksForChest : progress}/${CONFIG.linksForChest}</p>
                <button class="btn btn-gold" id="btnChest" ${isReady ? '' : 'disabled'}>🎁 Mở rương</button>
            </div>
        `;

        // "LẤY LINK" — gọi Cloud Function claimLinkTask, KHÔNG tự ghi DB
        // (khác code gốc: bấm nút này trước đây gọi FB.updateUser() trực
        // tiếp từ client, không qua kiểm tra/bảo vệ nào).
        this.container.querySelectorAll('.get-link-btn').forEach(btn => {
            btn.onclick = async () => {
                const typeId = btn.dataset.type;
                try {
                    await withLoading(btn, '⏳...', async () => {
                        const result = await FB.claimLinkTask(typeId);
                        if (this.app.tg) this.app.tg.openLink(result.url);
                        else window.open(result.url, '_blank');
                        this.app.toast('Đã mở link! Tìm mã và nhập vào bên dưới.', 'info');
                    }, { onError: (e) => this.app.toast(e.message || 'Có lỗi!', 'error') });
                } catch (e) {
                    // lỗi đã được xử lý
                }
            };
        });

        // "XÁC NHẬN" — gọi Cloud Function verifyLinkCode. Server tự đọc
        // currentTaskCode/currentTaskType/cooldown từ DB, không tin bất kỳ
        // giá trị nào client tự khai.
        this.container.querySelector('#btnVerify').onclick = async () => {
            const code = this.container.querySelector('#codeInput').value.trim();
            if (!code) return this.app.toast('Nhập mã!', 'warning');
            const btn = this.container.querySelector('#btnVerify');
            try {
                await withLoading(btn, '⏳...', async () => {
                    const result = await FB.verifyLinkCode(code);
                    if (result.status === 'ok') {
                        this.app.toast(`+${result.reward} 🪙!`, 'success');
                        this.app.refreshUserBar();
                        this.userData = await FB.getUser(this.app.user.id);
                        this.container.querySelector('#codeInput').value = '';
                        this.render();
                    } else {
                        this.app.toast(result.message || 'Mã không đúng!', 'error');
                    }
                }, { onError: (e) => this.app.toast(e.message || 'Có lỗi!', 'error') });
            } catch (e) {
                // lỗi đã được xử lý
            }
        };

        this.container.querySelector('#btnChest').onclick = async () => {
            const btn = this.container.querySelector('#btnChest');
            try {
                await withLoading(btn, '⏳...', async () => {
                    const res = await FB.openChest(this.app.user.id);
                    if (res.reward) {
                        this.app.toast(`Nhận ${res.reward} 🪙!`, 'success');
                        this.app.refreshUserBar();
                        this.userData = await FB.getUser(this.app.user.id);
                        this.render();
                    } else {
                        this.app.toast(res.message || 'Chưa đủ điều kiện!', 'error');
                    }
                }, { onError: (e) => this.app.toast(e.message || 'Có lỗi!', 'error') });
            } catch (e) {
                // lỗi đã được xử lý
            }
        };
    }
}
