import { FB } from '../firebase-manager.js';

export class FriendsPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    render() {
        const u = this.userData;
        let refLink;
        if (this.app.tg) {
            const botName = this.app.tg.botUsername || 'cayxummo_bot';
            refLink = `https://t.me/${botName}/app?startapp=${u.id}`;
        } else {
            // BUG FIX: bản gốc viết `'?ref=' + 'u.id'` — nối CHUỖI CHỮ
            // "u.id", không phải giá trị biến u.id — nên link mời lúc nào
            // cũng ra y hệt "...?ref=u.id" cho MỌI người, không ai mời
            // được ai (referral không hoạt động). Sửa lại dùng đúng biến.
            const baseUrl = window.location.origin + window.location.pathname;
            refLink = `${baseUrl}?ref=${u.id}`;
        }

        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">👥 Mời bạn bè</div>
                <p style="font-size:13px;color:var(--text2);">Link mời của bạn:</p>
                <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;word-break:break-all;margin-bottom:10px;">${refLink}</div>
                <button class="btn btn-primary" id="copyLink">📋 Copy link</button>
                <p style="margin-top:12px;">🎁 Thưởng:<br>2 bạn → +100 🪙<br>5 bạn → +300 🪙<br>10 bạn → +1.000 🪙</p>
            </div>
            <div class="card"><div class="card-title">📊 Bạn đã mời: ${(u.friends || []).length}</div></div>
            <div class="card"><div class="card-title">🏆 Top mời bạn</div><div id="topFriends">Đang tải...</div></div>
        `;

        this.container.querySelector('#copyLink').onclick = () => {
            navigator.clipboard.writeText(refLink);
            this.app.toast('Đã copy!', 'success');
        };
        this.loadTopFriends();
    }

    async loadTopFriends() {
        try {
            // LƯU Ý: với tài khoản web/Telegram đã nâng cấp
            // (authProvider:'firebase'), rules mới chỉ cho chính chủ đọc
            // users/{uid} của họ -> getTopFriends() (đọc gộp users/) có
            // thể THIẾU những tài khoản đó trong bảng xếp hạng. Đã ghi rõ
            // trong CLOUD-FUNCTIONS-MIGRATION.md mục 3, chưa fix trong đợt
            // này (cần thêm 1 node public_profiles riêng).
            const top = await FB.getTopFriends(10);
            const html = top.map((entry, i) => `
                <div class="leaderboard-item">
                    <span class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">#${i + 1}</span>
                    <span>${entry.username || 'Unknown'}</span>
                    <span style="margin-left:auto;">👥 ${entry.friends}</span>
                </div>`).join('');
            this.container.querySelector('#topFriends').innerHTML = html || '<p>Chưa có dữ liệu</p>';
        } catch (error) {
            this.container.querySelector('#topFriends').innerHTML = '<p>Không thể tải dữ liệu</p>';
        }
    }
}
