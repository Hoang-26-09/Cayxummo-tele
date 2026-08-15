# Hướng dẫn Tích hợp (Integration)

## Cấu trúc thư mục

```
cayxummo/
├── index.html              (file chính, giữ nguyên)
├── main.js                 (entry point chính, cần sửa import)
├── config.js               (NEW)
├── storage.js              (NEW)
├── crypto.js               (NEW)
├── rate-limiter.js         (NEW)
├── firebase-manager.js     (NEW - thay thế các method Firebase cũ)
├── ui.js                   (NEW)
├── firebase-rules.json     (NEW - deploy lên Firebase)
├── pages/
│   ├── home.js             (NEW - HomePage class)
│   ├── web-auth.js         (NEW - setupWebLogin function)
│   ├── tasks.js            (cần convert - TasksPage)
│   ├── friends.js          (cần convert - FriendsPage)
│   ├── leaderboard.js      (cần convert - LeaderboardPage)
│   ├── account.js          (cần convert - AccountPage)
│   └── admin/              (folder riêng cho admin)
│       ├── admin.js        (cần convert - AdminPage)
│       ├── tabs/
│       │   ├── config.js
│       │   ├── linktypes.js
│       │   ├── codes.js
│       │   ├── withdraws.js
│       │   ├── users.js
│       │   └── ...
│       └── utils.js        (helpers cho admin)
└── styles.css              (giữ nguyên)
```

---

## Cách Import & Dùng

### 1. Trong `main.js` (hoặc `app.js`), thay vì inline tất cả:

**Trước:**
```javascript
// 1500 dòng inline trong 1 file
class CayXumMo { ... }
class HomePage { ... }
class AdminPage { ... }
class FirebaseManager { ... }
```

**Sau:**
```javascript
import { CONFIG, DEFAULT_CONFIG, firebaseConfig } from './config.js';
import { Storage, generateUniqueId } from './storage.js';
import { hashPassword, generateSalt, verifyPassword } from './crypto.js';
import { rateLimiter } from './rate-limiter.js';
import { FB } from './firebase-manager.js';
import { withLoading } from './ui.js';

import { HomePage } from './pages/home.js';
import { TasksPage } from './pages/tasks.js';
import { FriendsPage } from './pages/friends.js';
import { LeaderboardPage } from './pages/leaderboard.js';
import { AccountPage } from './pages/account.js';
import { AdminPage } from './pages/admin/admin.js';
import { setupWebLogin } from './pages/web-auth.js';

// Giờ CayXumMo class chỉ cần ~150 dòng, lệnh import + logic chính
class CayXumMo {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        if (this.tg) { this.tg.ready(); this.tg.expand(); }
        this.user = null;
        this.isAdmin = false;
        this.currentPage = null;
    }

    async init() {
        try {
            await FB.loadConfig();
            // ... rest of init
        } catch (e) {
            console.error(e);
        }
    }

    // ... setupNav, loadPage, refreshUserBar, etc.
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new CayXumMo();
    const savedId = Storage.getItem('cayxummo_uid');
    if (savedId) {
        window.app.user = { 
            id: savedId, 
            username: Storage.getItem('cayxummo_user') || 'User' 
        };
        window.app.init();
    } else {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        setupWebLogin(window.app);
    }
});
```

---

### 2. Các page khác (tasks.js, friends.js, v.v.)

Mỗi page follow pattern tương tự `pages/home.js`:

```javascript
// pages/tasks.js
import { CONFIG } from '../config.js';
import { FB } from '../firebase-manager.js';
import { withLoading } from '../ui.js';

export class TasksPage {
    constructor(app, container, userData) {
        this.app = app;
        this.container = container;
        this.userData = userData;
    }

    async render() {
        // HTML + listeners
    }
}
```

---

### 3. Admin page (split vào tab files)

**Trước:** AdminPage = 1500 dòng, 12 tab trong 1 method

**Sau:** Bỏ tab logic vào file riêng:

```javascript
// pages/admin/admin.js
import { AdminTabConfig } from './tabs/config.js';
import { AdminTabLinkTypes } from './tabs/linktypes.js';
import { AdminTabWithdraws } from './tabs/withdraws.js';
// ... etc

export class AdminPage {
    constructor(app, container, userData) { ... }
    
    async render() {
        // Render nav tabs
        this.loadTab('config');
        document.querySelectorAll('.admin-tab').forEach(btn => 
            btn.onclick = () => this.loadTab(btn.dataset.tab)
        );
    }

    async loadTab(tab) {
        const content = document.getElementById('adminTabContent');
        
        if (tab === 'config') {
            const tabHandler = new AdminTabConfig(this.app);
            await tabHandler.render(content);
        } else if (tab === 'linktypes') {
            const tabHandler = new AdminTabLinkTypes(this.app);
            await tabHandler.render(content);
        }
        // ... etc
    }
}
```

```javascript
// pages/admin/tabs/config.js
export class AdminTabConfig {
    constructor(app) { this.app = app; }
    
    async render(container) {
        // Config tab logic
    }
}
```

---

## Migration Checklist

- [ ] Tạo folder structure như trên
- [ ] Copy `config.js`, `storage.js`, `crypto.js`, `rate-limiter.js`, `firebase-manager.js`, `ui.js` vào root
- [ ] Copy `firebase-rules.json` vào root (để deploy)
- [ ] Convert HomePage → `pages/home.js` (dùng pattern ở trên)
- [ ] Convert TasksPage → `pages/tasks.js`
- [ ] Convert FriendsPage → `pages/friends.js`
- [ ] Convert LeaderboardPage → `pages/leaderboard.js`
- [ ] Convert AccountPage → `pages/account.js`
- [ ] Split AdminPage vào `pages/admin/admin.js` + tab files
- [ ] Copy `pages/web-auth.js` (setupWebLogin dùng crypto mới)
- [ ] Update `main.js` (hoặc `app.js`) import tất cả trên
- [ ] Test Telegram bot + web login
- [ ] Deploy Firebase Rules (`firebase-rules.json` vào Console)
- [ ] Promote 1 user thành admin (set `isAdmin: true` trong user record)

---

## Tips

1. **Tree-shaking:** Nếu dùng bundler (webpack/vite), unused imports sẽ bị loại bỏ → file size nhỏ hơn
2. **Lazy load pages:** Load page class chỉ khi navigate:
   ```javascript
   async loadPage(page) {
       const PageClass = await import(`./pages/${page}.js`).then(m => m[`${capitalize(page)}Page`]);
       this.currentPage = new PageClass(this, container, userData);
       this.currentPage.render();
   }
   ```
3. **Testing:** Mỗi module giờ có thể test riêng (unit test `crypto.js`, `rate-limiter.js`, v.v.)
4. **Firebase offline:** Storage wrapper giữ in-memory fallback, nên app không hoàn toàn chết nếu localStorage bị block

---

## Rollback nếu có vấn đề

- Tất cả modules mới phù hợp với cấu trúc cũ (imports có thể swap)
- Nếu có lỗi, comment `import` của module mới, dùng lại code cũ
- Tests cũ (nếu có) vẫn chạy được (không break API public)
