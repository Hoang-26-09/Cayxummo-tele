// Gọi tới Vercel Serverless Functions (thư mục api/) thay cho Firebase
// Cloud Functions — vì Cloud Functions cần gói Blaze (có thẻ), còn cách
// này chạy trên Vercel free tier (Hobby), không cần thẻ.
//
// API_BASE để '/api' (đường dẫn tương đối) vì frontend + api/ được deploy
// CHUNG 1 project Vercel (cùng domain) — không bị CORS chặn. Nếu sau này
// tách api/ sang domain khác, đổi thành URL đầy đủ, VD:
// 'https://ten-project.vercel.app/api'
const API_BASE = '/api';

export async function callApi(name, payload = {}, { requireAuth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };

    if (requireAuth) {
        const user = firebase.auth().currentUser;
        if (user) {
            const token = await user.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const res = await fetch(`${API_BASE}/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const err = new Error((data.error && data.error.message) || 'Có lỗi xảy ra, vui lòng thử lại!');
        err.code = (data.error && data.error.code) || 'unknown';
        throw err;
    }

    return data;
}
