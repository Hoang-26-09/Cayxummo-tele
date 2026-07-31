export default class TasksPage {
    constructor(app, container, userData) { this.app = app; this.container = container; this.userData = userData; }
    async render() {
        const tasks = await FB.getTasks();
        const activeTask = Object.values(tasks).find(t => t.active !== false);
        const completedLinks = this.userData.completedLinks || 0;
        const progress = completedLinks % CONFIG.LINKS_FOR_CHEST;
        const cooldown = this.userData.lastLinkTime ? Math.max(0, CONFIG.LINK_COOLDOWN - (Date.now() - this.userData.lastLinkTime)) : 0;
        this.container.innerHTML = `
            <div class="card">
                <div class="card-title">📋 Nhiệm vụ</div>
                ${activeTask ? `
                    <div style="text-align:center;margin:20px 0;">
                        ${cooldown > 0 ? `
                            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;">
                                <p style="font-size:40px;">✅</p>
                                <p>Đã lấy link</p>
                                <p style="font-size:13px;color:var(--text2);">Đợi ${Math.ceil(cooldown/60000)} phút</p>
                            </div>
                        ` : `
                            <button class="btn btn-primary go-link-btn" style="width:200px;height:200px;border-radius:50%;font-size:18px;margin:0 auto;">
                                <div style="font-size:40px;">🔗</div><div>LẤY LINK</div>
                            </button>
                        `}
                    </div>
                    <div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);">
                        <p style="font-weight:bold;">🔑 Nhập mã xác nhận:</p>
                        <input class="input" id="codeInput" placeholder="Nhập mã...">
                        <button class="btn btn-gold" id="btnVerify">✅ Xác nhận</button>
                    </div>
                ` : '<p style="text-align:center;">Chưa có nhiệm vụ</p>'}
            </div>
            <div class="card">
                <div class="card-title">🎁 Rương thưởng</div>
                <div class="progress-bar"><div class="progress-fill" style="width:${progress/5*100}%"></div></div>
                <p style="text-align:center;">${progress}/5</p>
                <button class="btn btn-gold" id="btnChest" ${completedLinks >= 5 ? '' : 'disabled'}>🎁 Mở rương</button>
            </div>
        `;
        const goBtn = this.container.querySelector('.go-link-btn');
        if (goBtn) goBtn.onclick = async () => {
            const link = activeTask.link;
            window.open(link, '_blank');
            await FB.updateUser(this.app.user.id, { lastLinkTime: Date.now() });
            this.app.toast('Đã mở link!', 'info');
            this.render();
        };
        this.container.querySelector('#btnVerify').onclick = async () => {
            const code = this.container.querySelector('#codeInput').value.trim();
            if (!code) return this.app.toast('Nhập mã!', 'warning');
            const result = await FB.verifyCode(this.app.user.id, code);
            if (result.status === 'ok') {
                this.app.toast(`+${result.reward} xu!`, 'success');
                this.app.refreshUserBar();
                this.render();
            } else this.app.toast(result.message || 'Mã không đúng!', 'error');
        };
        this.container.querySelector('#btnChest').onclick = async () => {
            const res = await FB.openChest(this.app.user.id);
            if (res.status === 'ok') { this.app.toast(`Nhận ${res.reward} xu!`, 'success'); this.app.refreshUserBar(); this.render(); }
            else this.app.toast(res.message, 'error');
        };
    }
}