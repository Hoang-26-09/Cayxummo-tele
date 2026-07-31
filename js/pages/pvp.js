export default class PvPPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    render() {
        const u = this.userData;
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">🎮 PvP Oẳn Tù Tì</div>
                <p style="text-align:center;">🪙 ${(u.balance||0).toLocaleString()} xu</p>
                <p style="margin-top:12px;">Chọn phòng:</p>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${[{bet:1000,icon:'🥉',label:'Phổ thông'},{bet:3000,icon:'🥈',label:'Trung cấp'},{bet:5000,icon:'🥇',label:'Cao cấp'}].map(r => `
                        <button class="btn btn-primary room-btn" data-bet="${r.bet}" ${(u.balance||0) < r.bet ? 'disabled' : ''}>
                            ${r.icon} ${r.label} - ${r.bet.toLocaleString()} xu
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        this.container.querySelectorAll('.room-btn').forEach(btn => btn.onclick = () => this.joinRoom(parseInt(btn.dataset.bet)));
    }
    async joinRoom(bet) {
        // Đơn giản hóa: chỉ thông báo, chưa xử lý matchmaking đầy đủ
        this.app.toast(`Vào phòng ${bet.toLocaleString()} xu. Đang tìm đối thủ...`, 'info');
        // (Sẽ bổ sung logic matchmaking nếu cần)
    }
}