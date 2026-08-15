// ==================== CẤU HÌNH MẶC ĐỊNH ====================
export const DEFAULT_CONFIG = {
    dailyRewards: [50, 50, 50, 50, 100, 150, 300],
    linksForChest: 5,
    linkCooldown: 300000,
    maxCodesPerDay: 20,
    chestRewards: [50, 80, 100, 150, 200, 300, 500, 1000],
    friendRewards: { 2: 100, 5: 300, 10: 1000 },
    maxFriendsPerDay: 50,
    minWithdraw: 20000,
    maxWithdraw: 100000,
    maxWithdrawPerDay: 3,
    exchange_rate: 10,
    starColor: '#5f91ff',
    bgColor1: '#1b2735',
    bgColor2: '#090a0f',
    codeResetDays: 30,
    // BUG FIX: this was missing in the original file, so
    // `CONFIG.linkTypes = DEFAULT_CONFIG.linkTypes` always produced `undefined`
    // until an admin saved at least one link type from Firebase.
    linkTypes: {}
};

// Live config, populated by FirebaseManager.loadConfig().
// Kept as a single mutable object (rather than reassigned) so every module
// that imports CONFIG always sees the latest values without re-importing.
export const CONFIG = { ...DEFAULT_CONFIG, linkTypes: {} };

export const firebaseConfig = {
    apiKey: "AIzaSyCbevkIQrQ7vw7RegFrYfTL86z-8feHtUM",
    authDomain: "cay-xu-mmo.firebaseapp.com",
    databaseURL: "https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cay-xu-mmo",
    storageBucket: "cay-xu-mmo.firebasestorage.app",
    messagingSenderId: "186442076157",
    appId: "1:186442076157:web:52d64c0239b0ae2d35d394",
    measurementId: "G-KLCC12WSG5"
};
