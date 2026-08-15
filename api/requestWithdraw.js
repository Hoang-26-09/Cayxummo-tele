const { admin, db } = require('./_lib/admin');
const { handlePreflight, HttpError, requireAuth, sendError } = require('./_lib/http');
const { getConfig, requireActiveUser, pushTransaction } = require('./_lib/rewards-helpers');

module.exports = async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const uid = await requireAuth(req);
        const body = req.body || {};
        const amount = parseInt(body.amount, 10);
        const { bank, accountName, accountNumber } = body;
        if (!bank || !accountName || !accountNumber || !amount) throw new HttpError(400, 'invalid-argument', 'Điền đầy đủ thông tin!');

        const config = await getConfig();
        const minWithdraw = config.minWithdraw || 20000;
        const maxWithdraw = config.maxWithdraw || 100000;
        const rate = config.exchange_rate || 10;
        if (amount < minWithdraw || amount > maxWithdraw) throw new HttpError(400, 'invalid-argument', 'Số 🪙 không hợp lệ');

        const user = await requireActiveUser(uid);
        if ((user.balance || 0) < amount) throw new HttpError(400, 'failed-precondition', 'Không đủ số dư');

        const ref = db.ref('withdraw_requests').push();
        await ref.set({
            userId: uid, username: user.username, bank, accountName, accountNumber,
            amountXu: amount, amountVnd: amount * rate, exchangeRate: rate,
            status: 'pending', createdAt: admin.database.ServerValue.TIMESTAMP
        });
        await db.ref('users/' + uid + '/balance').set(admin.database.ServerValue.increment(-amount));
        await pushTransaction(uid, 'withdraw', -amount, `Rút ${amount}🪙`);
        res.status(200).json({ status: 'ok', id: ref.key });
    } catch (e) {
        sendError(res, e);
    }
};
