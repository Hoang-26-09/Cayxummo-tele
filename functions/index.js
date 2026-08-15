const admin = require('firebase-admin');
admin.initializeApp();

const { registerUser, legacyLogin, resolveLoginEmail, addRecoveryEmail } = require('./auth');
const { telegramLogin } = require('./telegram-auth');
const {
    dailyCheckin, claimLinkTask, verifyLinkCode,
    openChest, redeemGiftCode, addFriend, requestWithdraw
} = require('./rewards');

exports.registerUser = registerUser;
exports.legacyLogin = legacyLogin;
exports.resolveLoginEmail = resolveLoginEmail;
exports.addRecoveryEmail = addRecoveryEmail;
exports.telegramLogin = telegramLogin;
exports.dailyCheckin = dailyCheckin;
exports.claimLinkTask = claimLinkTask;
exports.verifyLinkCode = verifyLinkCode;
exports.openChest = openChest;
exports.redeemGiftCode = redeemGiftCode;
exports.addFriend = addFriend;
exports.requestWithdraw = requestWithdraw;
