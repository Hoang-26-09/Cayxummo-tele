const { admin } = require('./admin');

function setCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Trả về true nếu đã xử lý xong (preflight OPTIONS) — handler nên return luôn.
function handlePreflight(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true;
    }
    return false;
}

class HttpError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function sendError(res, err) {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
    } else {
        console.error(err);
        res.status(500).json({ error: { code: 'internal', message: 'Có lỗi xảy ra, thử lại sau' } });
    }
}

// Đọc Firebase ID token từ header Authorization: Bearer <token>, xác minh
// bằng Admin SDK (chữ ký thật, không giả được) -> trả về uid. Thay thế
// cho context.auth.uid của Cloud Functions.
async function requireAuth(req) {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) throw new HttpError(401, 'unauthenticated', 'Vui lòng đăng nhập lại');
    try {
        const decoded = await admin.auth().verifyIdToken(match[1]);
        return decoded.uid;
    } catch (e) {
        throw new HttpError(401, 'unauthenticated', 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
    }
}

module.exports = { setCors, handlePreflight, HttpError, sendError, requireAuth };
