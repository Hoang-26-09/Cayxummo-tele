const crypto = require('crypto');

function verifyTelegramInitData(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const authDate = parseInt(params.get('auth_date'), 10);
    if (!authDate || (Date.now() / 1000 - authDate) > 86400) return null;

    const userJson = params.get('user');
    if (!userJson) return null;
    try {
        return JSON.parse(userJson);
    } catch (e) {
        return null;
    }
}

module.exports = { verifyTelegramInitData };
