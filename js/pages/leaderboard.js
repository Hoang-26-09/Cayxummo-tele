import { FB } from '../firebase-manager.js';

export class LeaderboardPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
        this.countdownInterval = null;
    }

    destroy() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    async render() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        await FB.checkAndDistributeRewards();

        const top = await FB.getTopLinks(10);
        const fundSnap = await FB.db.ref('prize_fund').once('value');
        const fund = fundSnap.val() || 0;
        const timeUntil = FB.getTimeUntilSunday8AM();

        const days = Math.floor(timeUntil / 86400000);
        const hours = Math.floor((timeUntil % 86400000) / 3600000);
        const minutes = Math.floor((timeUntil % 3600000) / 60000);
        const seconds = Math.floor((timeUntil % 60000) / 1000);
        const countdownStr = `${days}ngày ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">💰 Quỹ thưởng BXH</div>
                <p style="text-align:center;font-size:28px;font-weight:bold;color:var(--gold);">${fund.toLocaleString()} 🪙</p>
                <p style="text-align:center;font-size:12px;color:var(--text2);">Phát thưởng vào 8h Chủ nhật cho Top 10</p>
            </div>
            <div class="card">
                <div class="card-title">🏆 Top vượt link</div>
                <p style="font-size:12px;color:var(--text2);">Reset mỗi Chủ nhật 8h sáng</p>
                <p style="text-align:center;font-size:18px;font-weight:bold;color:var(--accent);margin:8px 0;" class="countdown-timer">⏰ Còn: ${countdownStr}</p>
                <div id="topLinks">
                    ${top.length === 0 ? '<p style="text-align:center;color:var(--text2);">Chưa có dữ liệu</p>' :
                        top.map((u, i) => `<div class="leaderboard-item">
                            <span class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">#${i + 1}</span>
                            <span>${u.username || 'Unknown'}</span>
                            <span style="margin-left:auto;">🔗 ${u.links || 0}</span>
                            ${i < 7 ? `<span style="font-size:11px;color:var(--gold);margin-left:4px;">(${['40%', '25%', '15%', '10%', '5%', '3%', '2%'][i]})</span>` : ''}
                        </div>`).join('')}
                </div>
            </div>
        `;

        this.countdownInterval = setInterval(() => {
            const timeEl = document.querySelector('.countdown-timer');
            if (!timeEl) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                return;
            }
            const t = FB.getTimeUntilSunday8AM();
            if (t <= 0) {
                timeEl.textContent = '🔄 Đang phát thưởng...';
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                this.render();
                return;
            }
            const d = Math.floor(t / 86400000);
            const h = Math.floor((t % 86400000) / 3600000);
            const m = Math.floor((t % 3600000) / 60000);
            const s = Math.floor((t % 60000) / 1000);
            timeEl.textContent = `${d}ngày ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 1000);
    }
}
