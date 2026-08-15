import { FB } from './firebase-manager.js';

async function sha256Hex(text) {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Vẽ 1 canvas cố định — cách render (font, anti-aliasing, driver GPU...)
// khác nhau tùy máy/OS/trình duyệt, tạo ra vài bit đặc trưng riêng.
function getCanvasSignature() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 220;
        canvas.height = 40;
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 220, 40);
        ctx.fillStyle = '#069';
        ctx.fillText('CayXuMMO-fp-check-🔒', 2, 15);
        return canvas.toDataURL();
    } catch (e) {
        return 'no-canvas';
    }
}

function getWebglSignature() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'no-webgl';
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return 'webgl-no-debug-info';
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return `${vendor}~${renderer}`;
    } catch (e) {
        return 'webgl-error';
    }
}

function collectRawSignals() {
    const nav = navigator;
    return [
        nav.userAgent || '',
        nav.language || '',
        (nav.languages || []).join(','),
        nav.platform || '',
        String(nav.hardwareConcurrency || ''),
        String(nav.deviceMemory || ''),
        String(nav.maxTouchPoints || ''),
        `${screen.width}x${screen.height}x${screen.colorDepth}`,
        String(Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
        getCanvasSignature(),
        getWebglSignature()
    ].join('||');
}

/**
 * Trả về hash "dấu vân tay thiết bị" — kết hợp đặc điểm phần cứng/trình
 * duyệt (canvas rendering, WebGL renderer, độ phân giải màn hình, số
 * nhân CPU, timezone...). KHÔNG dùng IP nên đổi WiFi/4G không ảnh hưởng.
 *
 * GIỚI HẠN (đã trao đổi rõ): xóa cache/dữ liệu trình duyệt, dùng chế độ
 * ẩn danh, hoặc đổi sang trình duyệt khác trên CÙNG máy sẽ cho ra
 * fingerprint khác → vượt qua được. Đây là hàng rào chống farm nhiều tài
 * khoản "tiện tay" trên cùng máy/trình duyệt, không phải tuyệt đối.
 */
export async function getDeviceHash() {
    const raw = collectRawSignals();
    return sha256Hex('cayxummo_device_v1_' + raw);
}

/**
 * Kiểm tra 1 deviceHash đã dùng để tạo tài khoản chưa. Đây chỉ là bước
 * kiểm tra để hiện thông báo đẹp — chặn thật sự nằm ở Firebase Rules
 * (xem firebase-rules.json), vì bước check này ở client vẫn có thể bị
 * vượt qua bằng DevTools.
 */
export async function isDeviceAlreadyRegistered(deviceHash) {
    if (!deviceHash) return false;
    const snap = await FB.db.ref('device_registrations/' + deviceHash).once('value');
    return snap.exists();
}
