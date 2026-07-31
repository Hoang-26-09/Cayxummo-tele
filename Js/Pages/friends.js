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