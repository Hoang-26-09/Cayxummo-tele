import { CONFIG } from '../config.js';
import { FB } from '../firebase-manager.js';
import { withLoading } from '../ui.js';

export class HomePage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const u = this.userData;
        const streak = u.dailyStreak || 0;

        // Vòng 7 ngày điểm danh
        let dailyHTML = '<div class="daily-grid">';
        for (let i = 1; i <= 7; i++) {
            let cls = '';
            if (i <= streak) cls = 'claimed';
            if (i === streak + 1 || (streak === 7 && i === 1)) cls = 'today';
            dailyHTML += `
                <div class="daily-item ${cls}">
                    <div class="day">Ngày ${i}</div>
                    <div class="reward">+${CONFIG.dailyRewards[i - 1]} 🪙</div>
                    ${i <= streak ? '✅' : ''}
                </div>
            `;
        }
        dailyHTML += '</div>';

        const hasChecked = u.lastDaily === new Date().toDateString();

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📅 Điểm danh hàng ngày</div>
                ${dailyHTML}
                <button class="btn btn-gold" id="btnDaily" ${hasChecked ? 'disabled' : ''}>
                    ${hasChecked ? '✅ Đã điểm danh' : '🎁 Điểm danh nhận thưởng'}
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
                    <div class="progress-fill" style="width: ${((u.completedLinks || 0) % CONFIG.linksForChest) / CONFIG.linksForChest * 100}%"></div>
                </div>
                <p style="text-align: center; font-size: 13px; color: var(--text2);">
                    ${(u.completedLinks || 0) % CONFIG.linksForChest}/${CONFIG.linksForChest} link
                </p>
            </div>
        `;

        document.getElementById('btnDaily').onclick = () => this.doDaily();
    }

    async doDaily() {
        const btn = document.getElementById('btnDaily');
        try {
            await withLoading(btn, '⏳ Đang xử lý...', async () => {
                const result = await FB.dailyCheckin(this.app.user.id);
                if (result.status === 'already') {
                    this.app.toast('Hôm nay bạn đã điểm danh rồi!', 'warning');
                } else {
                    this.app.toast(`+${result.reward} 🪙! Ngày ${result.streak}/7`, 'success');
                    this.app.refreshUserBar();
                    this.render();
                }
            }, { onError: (e) => this.app.toast('Có lỗi xảy ra!', 'error') });
        } catch (e) {
            // lỗi đã được xử lý bởi onError callback
        }
    }
}
