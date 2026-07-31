"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudAccountController = exports.CloudAccountController = void 0;
const google_provider_1 = require("../providers/google.provider");
const cloudAccount_service_1 = require("../services/cloudAccount.service");
const file_service_1 = require("../services/file.service");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AppError_1 = require("../utils/AppError");
const asyncHandler_1 = require("../utils/asyncHandler");
class CloudAccountController {
    authRedirect = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const { provider } = req.params;
        const token = req.query.token;
        if (provider !== 'google-drive') {
            throw new AppError_1.AppError('Provider not supported', 400);
        }
        if (!token) {
            throw new AppError_1.AppError('No token provided', 401);
        }
        // Verify token to get userId (cannot use requireAuth middleware easily for a direct window redirect)
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            // We pass the userId inside the "state" parameter to survive the OAuth roundtrip
            const state = Buffer.from(JSON.stringify({ userId: decoded.id })).toString('base64');
            const authUrl = (0, google_provider_1.generateAuthUrl)(state);
            res.redirect(authUrl);
        }
        catch (err) {
            const frontendUrl = process.env.FRONTEND_URL;
            res.redirect(`${frontendUrl}/settings?error=invalid_token`);
        }
    });
    callback = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const { provider } = req.params;
        const { code, state, error } = req.query;
        const frontendUrl = process.env.FRONTEND_URL;
        if (error) {
            return res.redirect(`${frontendUrl}/settings?error=access_denied`);
        }
        if (!code || !state) {
            return res.redirect(`${frontendUrl}/settings?error=invalid_callback`);
        }
        try {
            const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
            const userId = decodedState.userId;
            if (provider === 'google-drive') {
                const tokens = await (0, google_provider_1.getTokens)(code);
                if (!tokens.access_token) {
                    throw new Error('No access token received');
                }
                const userInfo = await (0, google_provider_1.getUserInfo)(tokens.access_token);
                if (!userInfo.id || !userInfo.email) {
                    throw new Error('Incomplete user info from Google');
                }
                let storageUsed = null;
                let storageTotal = null;
                try {
                    const quota = await (0, google_provider_1.getDriveQuota)(tokens.access_token, tokens.refresh_token || null);
                    if (quota) {
                        storageUsed = quota.usage ? BigInt(quota.usage) : null;
                        storageTotal = quota.limit ? BigInt(quota.limit) : null;
                    }
                }
                catch (e) {
                    console.error('Failed to fetch drive quota', e);
                }
                const account = await cloudAccount_service_1.cloudAccountService.upsertAccount(userId, provider, userInfo.id, userInfo.email, tokens.access_token, tokens.refresh_token, tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : null, storageUsed, storageTotal);
                // Auto-sync files in background
                file_service_1.fileService.syncFiles(account.id, userId).catch(err => {
                    console.error('Initial file sync failed:', err);
                });
                return res.redirect(`${frontendUrl}/settings?success=true`);
            }
            res.redirect(`${frontendUrl}/settings?error=provider_not_supported`);
        }
        catch (err) {
            console.error('OAuth Callback Error:', err);
            res.redirect(`${frontendUrl}/settings?error=server_error`);
        }
    });
    getAccounts = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const accounts = await cloudAccount_service_1.cloudAccountService.getAccounts(req.user.id);
        // Format response to match the frontend expected format
        const formatted = accounts.map(acc => {
            let status = 'connected';
            if (acc.syncStatus === 'syncing')
                status = 'syncing';
            if (acc.syncStatus === 'failed')
                status = 'error';
            // If token expired logic here (we can leave it simple for now)
            return {
                id: acc.id,
                provider: acc.provider,
                email: acc.email,
                label: acc.provider === 'google-drive' ? 'Google Drive' : acc.provider,
                storageUsed: acc.storageUsed ? Number(acc.storageUsed) : 0,
                storageTotal: acc.storageTotal ? Number(acc.storageTotal) : 15 * 1024 * 1024 * 1024,
                status,
                syncStatus: acc.syncStatus,
                lastSyncedAt: acc.lastSyncedAt ? acc.lastSyncedAt.toISOString() : (acc.expiresAt ? acc.expiresAt.toISOString() : new Date().toISOString()),
                syncError: acc.syncError,
                fileCount: acc.fileCount,
            };
        });
        res.status(200).json({
            status: 'success',
            data: { accounts: formatted }
        });
    });
    deleteAccount = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        await cloudAccount_service_1.cloudAccountService.deleteAccount(req.params.id, req.user.id);
        res.status(200).json({ status: 'success', message: 'Account deleted' });
    });
}
exports.CloudAccountController = CloudAccountController;
exports.cloudAccountController = new CloudAccountController();
