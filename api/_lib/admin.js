const admin = require('firebase-admin');

if (!admin.apps.length) {
    // FIREBASE_SERVICE_ACCOUNT_BASE64: nội dung file service-account.json
    // (Firebase Console > Project Settings > Service accounts > Generate
    // new private key), encode base64, dán vào Vercel > Settings >
    // Environment Variables. Không commit file JSON gốc lên Git.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!raw) {
        throw new Error('Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT_BASE64 trên Vercel');
    }
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
            || 'https://cay-xu-mmo-default-rtdb.asia-southeast1.firebasedatabase.app'
    });
}

const db = admin.database();

module.exports = { admin, db };
