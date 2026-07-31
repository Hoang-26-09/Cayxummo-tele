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