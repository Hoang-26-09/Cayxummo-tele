// ==================== MÃ HÓA MẬT KHẨU ====================
// SECURITY NOTE: this is still a client-side hash (fine as a baseline, but
// SHA-256 is fast and not designed for password storage — a determined
// attacker with DB read access could brute-force weak passwords). If you
// ever add a backend (Cloud Functions), move hashing there with a slow
// algorithm like bcrypt/argon2. This pass fixes the more clear-cut issue:
// every account previously shared ONE hardcoded salt
// ('cayxummo_salt_2024'), so a leaked hash table could be attacked with a
// single rainbow table for all users. Each account now gets its own random
// salt stored alongside the hash.

const LEGACY_SALT = 'cayxummo_salt_2024';

export function generateSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
    return sha256(password + salt);
}

// Verifies against a per-user salt. If the account predates this change
// (no `passwordSalt` stored), falls back to the old global salt so existing
// users aren't locked out — the caller should then re-hash with a fresh
// per-user salt and save it (see app.js login flow).
export async function verifyPassword(inputPassword, hashedPassword, salt) {
    const effectiveSalt = salt || LEGACY_SALT;
    return (await hashPassword(inputPassword, effectiveSalt)) === hashedPassword;
}

export { LEGACY_SALT };
