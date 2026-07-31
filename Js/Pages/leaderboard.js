export default class LeaderboardPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        this.container.innerHTML = `<div class="card"><div class="card-title">🏆 Top vượt link</div><p style="font-size:12px;color:var(--text2);">Reset mỗi 7 ngày</p><div id="topLinks">Đang tải...</div></div>`;
        const top = await FB.getTopLinks(10);
        const html = top.map((u,i) => `<div class="leaderboard-item"><span class="leaderboard-rank ${i<3?'rank-'+(i+1):''}">#${i+1}</span><span>${u.username||'Unknown'}</span><span style="margin-left:auto;">🔗 ${u.links||0}</span></div>`).join('');
        this.container.querySelector('#topLinks').innerHTML = html || '<p>Chưa có dữ liệu</p>';
    }
}