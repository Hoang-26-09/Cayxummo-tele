/**
 * CẢN TRỞ (không phải chặn tuyệt đối) việc mở DevTools để xem/sửa code.
 * Ai rành kỹ thuật đều có cách né được — đây chỉ để chặn số đông người
 * dùng phổ thông tò mò/copy code, không phải hàng rào bảo mật thật.
 * Bảo mật thật đã nằm ở Cloud Functions (functions/) — có cái này hay
 * không, tiền/balance vẫn an toàn.
 *
 * Dùng: gọi initAntiDevtools() một lần lúc app khởi động.
 */
export function initAntiDevtools({ onDevtoolsDetected } = {}) {
    // Chỉ bật trên desktop — trên điện thoại, bàn phím ảo/xoay màn hình
    // đổi kích thước viewport y hệt như mở DevTools -> false positive
    // liên tục, làm phiền người dùng thật không có ý đồ gì.
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    // Chặn menu chuột phải (Inspect Element) và vài phím tắt phổ biến.
    // Chỉ cản người không rành — bất kỳ ai biết mở DevTools qua menu
    // trình duyệt (⋮ > More tools > Developer tools) đều né được.
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
        const key = e.key;
        const blocked =
            key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(key)) ||
            (e.ctrlKey && ['U', 'u', 'S', 's'].includes(key)) ||
            (e.metaKey && e.altKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(key)); // macOS
        if (blocked) e.preventDefault();
    });

    // Phát hiện DevTools đang mở (chỉ khi DOCKED vào cửa sổ trình duyệt —
    // không phát hiện được nếu mở ở cửa sổ tách rời). Dựa vào chênh lệch
    // kích thước outer/inner của cửa sổ — khi DevTools chiếm 1 phần màn
    // hình, khoảng chênh này tăng vọt.
    const THRESHOLD = 160;
    let warned = false;
    setInterval(() => {
        const widthDiff = window.outerWidth - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        const isOpen = widthDiff > THRESHOLD || heightDiff > THRESHOLD;
        if (isOpen && !warned) {
            warned = true;
            if (onDevtoolsDetected) onDevtoolsDetected();
        } else if (!isOpen) {
            warned = false;
        }
    }, 1000);
}
