const CONFIG = {
    firebase: {
        apiKey: "AIzaSyCbevkIQrQ7vw7RegFrYfTL86z-8feHtUM",
        authDomain: "cay-xu-mmo.firebaseapp.com",
        databaseURL: "https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "cay-xu-mmo",
        storageBucket: "cay-xu-mmo.firebasestorage.app",
        messagingSenderId: "186442076157",
        appId: "1:186442076157:web:52d64c0239b0ae2d35d394",
        measurementId: "G-KLCC12WSG5"
    },
    DAILY_REWARDS: [50, 50, 50, 50, 100, 150, 300],
    PVP_TIMEOUT: 30,
    PVP_FEE: 0.1,
    MIN_WITHDRAW: 20000,
    MAX_WITHDRAW: 100000,
    LINKS_FOR_CHEST: 5,
    LINK_COOLDOWN: 300000,
    FRIEND_REWARDS: { 2: 100, 5: 300, 10: 1000 },
    DEFAULT_EXCHANGE_RATE: 10
};c0239b0ae2d35d394",
  measurementId: "G-KLCC12WSG5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);