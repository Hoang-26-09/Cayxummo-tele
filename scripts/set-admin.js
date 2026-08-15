/**
 * Chạy 1 LẦN trên máy bạn (KHÔNG deploy lên Cloud Functions) để phong admin
 * cho 1 tài khoản, dùng Firebase Custom Claims thay vì field `isAdmin`
 * trong RTDB (field đó ai cũng ghi được qua console — đây là lỗ hổng đã
 * báo ở phần trước).
 *
 * Cách chạy:
 *   1. Firebase Console > Project Settings > Service accounts >
 *      Generate new private key -> tải file JSON, đặt tên
 *      "service-account.json", để CÙNG THƯ MỤC với file này.
 *      (File này TUYỆT ĐỐI không commit lên Git / chia sẻ cho ai)
 *   2. npm install firebase-admin   (chạy trong thư mục scripts/)
 *   3. node set-admin.js <uid-hoặc-username>
 */
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app'
});

async function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Dùng: node set-admin.js <uid-hoặc-username>');
        process.exit(1);
    }

    let uid = arg;
    // Nếu arg không phải uid (không tìm thấy Auth user), thử tìm theo username trong RTDB
    try {
        await admin.auth().getUser(uid);
    } catch (e) {
        const snap = await admin.database().ref('users').orderByChild('username').equalTo(arg).once('value');
        if (!snap.exists()) {
            console.error(`Không tìm thấy user với uid/username: ${arg}`);
            process.exit(1);
        }
        snap.forEach(c => { uid = c.key; });
    }

    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`✅ Đã phong admin cho uid: ${uid}`);
    console.log('Người dùng cần đăng xuất/đăng nhập lại (hoặc đợi token refresh ~1h) để claim có hiệu lực.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
