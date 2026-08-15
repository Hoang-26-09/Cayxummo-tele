// ==================== STORAGE WRAPPER ====================
export const Storage = {
    _memory: {},

    getItem(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem(key);
            }
        } catch (e) {
            console.warn('localStorage không khả dụng, dùng memory storage');
        }
        return this._memory[key] || null;
    },

    setItem(key, value) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, value);
                return;
            }
        } catch (e) {
            console.warn('localStorage không khả dụng, dùng memory storage');
        }
        this._memory[key] = value;
    },

    removeItem(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
                return;
            }
        } catch (e) {
            console.warn('localStorage không khả dụng, dùng memory storage');
        }
        delete this._memory[key];
    }
};

// ==================== TẠO ID DUY NHẤT ====================
// BUG FIX: the original computed a `random` suffix but never appended it,
// so the id was just `UidWEB_<timestamp>` — two registrations in the same
// millisecond (e.g. a double-click, or two tabs) could theoretically collide.
export function generateUniqueId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `UidWEB_${timestamp}_${random}`;
}
