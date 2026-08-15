const crypto = require('crypto');

const FAKE_EMAIL_DOMAIN = 'cayxummo.local';
const LEGACY_SALT = 'cayxummo_salt_2024';

function toFakeEmail(username) {
    return `${username.toLowerCase()}@${FAKE_EMAIL_DOMAIN}`;
}

function isFakeEmail(email) {
    return !!email && email.endsWith('@' + FAKE_EMAIL_DOMAIN);
}

function sha256Hex(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { toFakeEmail, isFakeEmail, sha256Hex, LEGACY_SALT, FAKE_EMAIL_DOMAIN };
