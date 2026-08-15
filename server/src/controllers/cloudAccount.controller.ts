import { Request, Response } from 'express';
import { ProviderFactory } from '../providers/provider.factory';
import { cloudAccountService } from '../services/cloudAccount.service';
import { fileService } from '../services/file.service';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

export class CloudAccountController {
  
  authRedirect = asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    const token = req.query.token as string;

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    // Verify token to get userId (cannot use requireAuth middleware easily for a direct window redirect)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
      
      // We pass the userId inside the "state" parameter to survive the OAuth roundtrip
      const state = Buffer.from(JSON.stringify({ userId: decoded.id })).toString('base64');
      const providerInstance = ProviderFactory.getProvider(provider as string);
      const authUrl = providerInstance.generateAuthUrl(state);
      
      res.redirect(authUrl);
    } catch (err) {
      const frontendUrl = process.env.FRONTEND_URL as string;
      res.redirect(`${frontendUrl}/settings?error=invalid_token`);
    }
  });

  callback = asyncHandler(async (req: Request, res: Response) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL as string;

    if (error) {
      return res.redirect(`${frontendUrl}/settings?error=access_denied`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/settings?error=invalid_callback`);
    }

    try {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
      const userId = decodedState.userId;

      try {
        const providerInstance = ProviderFactory.getProvider(provider as string);
        const tokens = await providerInstance.getTokens(code as string);
        if (!tokens.access_token) {
          throw new Error('No access token received');
        }

        const userInfo = await providerInstance.getUserInfo(tokens.access_token);
        if (!userInfo.id || !userInfo.email) {
          throw new Error('Incomplete user info from provider');
        }

        let storageUsed: bigint | null = null;
        let storageTotal: bigint | null = null;
        try {
          const quota = await providerInstance.getDriveQuota(tokens.access_token, tokens.refresh_token || null);
          if (quota) {
            storageUsed = quota.usage ? BigInt(quota.usage) : null;
            storageTotal = quota.limit ? BigInt(quota.limit) : null;
          }
        } catch (e) {
          console.error('Failed to fetch drive quota', e);
        }

        const account = await cloudAccountService.upsertAccount(
          userId,
          provider as string,
          userInfo.id,
          userInfo.email,
          tokens.access_token,
          tokens.refresh_token,
          tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : null,
          storageUsed,
          storageTotal
        );

        // Sync files in background.
        // If the account was previously synced (has a syncToken), use incremental sync
        // to avoid deleting existing files and destroying the parent hierarchy.
        if (account.syncToken) {
          fileService.incrementalSync(account.id, userId).catch(err => {
            console.error('Incremental sync after reconnect failed:', err);
          });
        } else {
          fileService.syncFiles(account.id, userId).catch(err => {
            console.error('Initial file sync failed:', err);
          });
        }

        return res.redirect(`${frontendUrl}/drive?account=${account.id}`);
      } catch (e: any) {
        console.error('Error during provider oauth', e);
        require('fs').writeFileSync('oauth_error.log', e.stack || e.message);
        res.redirect(`${frontendUrl}/settings?error=provider_error&message=${encodeURIComponent(e.message)}`);
      }
    } catch (err) {
      console.error('OAuth Callback Error:', err);
      res.redirect(`${frontendUrl}/settings?error=server_error`);
    }
  });

  getAccounts = asyncHandler(async (req: Request, res: Response) => {
    const accounts = await cloudAccountService.getAccounts(req.user!.id);
    // Format response to match the frontend expected format
    const formatted = accounts.map(acc => {
      let status = 'connected';
      if (acc.syncStatus === 'syncing') status = 'syncing';
      if (acc.syncStatus === 'failed') status = 'error';
      // If token expired logic here (we can leave it simple for now)

      return {
        id: acc.id,
        provider: acc.provider,
        email: acc.email,
        label: acc.provider === 'google-drive' ? 'Google Drive' : acc.provider === 'onedrive' ? 'OneDrive' : acc.provider === 'dropbox' ? 'Dropbox' : acc.provider,
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

  deleteAccount = asyncHandler(async (req: Request, res: Response) => {
    await cloudAccountService.deleteAccount(req.params.id as string, req.user!.id);
    res.status(200).json({ status: 'success', message: 'Account deleted' });
  });
}

export const cloudAccountController = new CloudAccountController();
