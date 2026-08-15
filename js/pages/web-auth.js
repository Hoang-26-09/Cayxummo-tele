import { FB } from '../firebase-manager.js';
import { Storage } from '../storage.js';
import { getDeviceHash, isDeviceAlreadyRegistered } from '../device-fingerprint.js';
import { withLoading } from '../ui.js';
import { callApi } from '../api-client.js';

// Map lỗi Cloud Functions/Firebase Auth sang tiếng Việt dễ hiểu
function friendlyError(e) {
    const code = e.code || '';
    if (code.includes('already-exists')) return e.message || 'Đã tồn tại!';
    if (code.includes('not-found')) return 'Tên đăng nhập không tồn tại!';
    if (code.includes('permission-denied')) return e.message || 'Tài khoản đã bị khóa';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Sai mật khẩu!';
    if (code === 'auth/user-not-found') return 'Tên đăng nhập không tồn tại!';
    if (code === 'auth/too-many-requests') return 'Thử sai quá nhiều lần, vui lòng đợi rồi thử lại!';
    if (code === 'auth/invalid-email') return 'Email không hợp lệ!';
    return e.message || 'Có lỗi xảy ra, vui lòng thử lại!';
}

async function loginWithUsername(username, password) {
    const resolved = await callApi('resolveLoginEmail', { username }, { requireAuth: false });

    if (resolved.mode === 'legacy') {
        // Tài khoản CŨ, chưa nâng cấp -> verify + migrate server-side.
        // Không hỏi email ở đây để không làm rối luồng đăng nhập bình
        // thường; người dùng có thể thêm email khôi phục sau trong
        // Tài khoản > "Thêm email khôi phục".
        const result = await callApi('legacyLogin', { username, password }, { requireAuth: false });
        return await firebase.auth().signInWithCustomToken(result.customToken);
    }

    return await firebase.auth().signInWithEmailAndPassword(resolved.email, password);
}

export function setupWebLogin(app) {
    document.getElementById('showRegister').onclick = (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    };

    document.getElementById('showLogin').onclick = (e) => {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    };

    // ===== ĐĂNG NHẬP =====
    document.getElementById('btnLogin').onclick = async () => {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();

        if (!username || !password) {
            alert('⚠️ Vui lòng nhập đầy đủ thông tin!');
            return;
        }

        const btn = document.getElementById('btnLogin');
        try {
            await withLoading(btn, '⏳ Đang đăng nhập...', async () => {
                const cred = await loginWithUsername(username, password);
                Storage.setItem('cayxummo_uid', cred.user.uid);
                Storage.setItem('cayxummo_user', username);
                app.user = { id: cred.user.uid, username };
                document.getElementById('loginScreen').style.display = 'none';
                app.init();
            }, { onError: (e) => alert('❌ ' + friendlyError(e)) });
        } catch (e) {
            // lỗi đã được xử lý trong onError
        }
    };

    // ===== QUÊN MẬT KHẨU =====
    // Cần thêm 1 link/nút trong HTML với id="forgotPasswordLink" trong
    // form đăng nhập, ví dụ:
    // <a href="#" id="forgotPasswordLink">Quên mật khẩu?</a>
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.onclick = async (e) => {
            e.preventDefault();
            const username = prompt('Nhập tên đăng nhập của bạn:');
            if (!username) return;
            try {
                const resolved = await callApi('resolveLoginEmail', { username: username.trim() }, { requireAuth: false });

                if (resolved.mode === 'legacy' || !resolved.hasRealEmail) {
                    alert('⚠️ Tài khoản này chưa có email khôi phục.\n\nHãy đăng nhập bình thường rồi vào "Tài khoản > Thêm email khôi phục" để thiết lập cho lần sau, hoặc liên hệ admin để được hỗ trợ.');
                    return;
                }

                await firebase.auth().sendPasswordResetEmail(resolved.email);
                alert('✅ Đã gửi link đặt lại mật khẩu tới email đã đăng ký!\n\nKiểm tra hộp thư đến (và cả mục Spam/Rác).');
            } catch (err) {
                alert('❌ ' + friendlyError(err));
            }
        };
    }

    // ===== ĐĂNG KÝ =====
    document.getElementById('btnRegister').onclick = async () => {
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const confirmPassword = document.getElementById('regConfirmPassword').value.trim();

        if (!username || !email || !password || !confirmPassword) {
            alert('⚠️ Vui lòng nhập đầy đủ thông tin!');
            return;
        }
        if (username.length < 3) {
            alert('⚠️ Tên đăng nhập phải có ít nhất 3 ký tự!');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('⚠️ Email không hợp lệ!');
            return;
        }
        if (password.length < 7) {
            alert('⚠️ Mật khẩu phải có ít nhất 7 ký tự!');
            return;
        }
        if (password !== confirmPassword) {
            alert('⚠️ Mật khẩu xác nhận không khớp!');
            return;
        }

        const btn = document.getElementById('btnRegister');
        try {
            await withLoading(btn, '⏳ Đang đăng ký...', async () => {
                const deviceHash = await getDeviceHash();
                if (await isDeviceAlreadyRegistered(deviceHash)) {
                    alert('❌ Thiết bị này đã được dùng để tạo 1 tài khoản rồi!');
                    return;
                }

                await callApi('registerUser', { username, email, password, deviceHash }, { requireAuth: false });

                const cred = await firebase.auth().signInWithEmailAndPassword(email, password);

                Storage.setItem('cayxummo_uid', cred.user.uid);
                Storage.setItem('cayxummo_user', username);
                app.user = { id: cred.user.uid, username };
                document.getElementById('loginScreen').style.display = 'none';
                app.init();

                alert('✅ Đăng ký thành công! Chào mừng bạn đến với CayXuMMO!');
            }, { onError: (e) => alert('❌ ' + friendlyError(e)) });
        } catch (e) {
            // lỗi đã được xử lý trong onError
        }
    };
}
