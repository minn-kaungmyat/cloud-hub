import { prisma } from '../database/prisma';
import { encryptToken } from '../utils/crypto';

export class CloudAccountService {
  async upsertAccount(
    userId: string,
    provider: string,
    providerAccountId: string,
    email: string,
    accessToken: string,
    refreshToken?: string | null,
    expiresIn?: number | null,
    storageUsed?: bigint | null,
    storageTotal?: bigint | null
  ) {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccess = encryptToken(accessToken);
    const encryptedRefresh = encryptToken(refreshToken);

    // We check if this provider + providerAccountId already exists for this user
    const existing = await prisma.cloudAccount.findFirst({
      where: { userId, provider, providerAccountId },
    });

    if (existing) {
      return prisma.cloudAccount.update({
        where: { id: existing.id },
        data: {
          email,
          accessToken: encryptedAccess,
          ...(encryptedRefresh && { refreshToken: encryptedRefresh }), // Only update refresh token if provided
          ...(expiresAt && { expiresAt }),
          ...(storageUsed !== undefined && { storageUsed }),
          ...(storageTotal !== undefined && { storageTotal }),
        },
      });
    }

    return prisma.cloudAccount.create({
      data: {
        userId,
        provider,
        providerAccountId,
        email,
        accessToken: encryptedAccess!,
        refreshToken: encryptedRefresh,
        expiresAt,
        storageUsed,
        storageTotal,
      },
    });
  }

  async getAccounts(userId: string) {
    return prisma.cloudAccount.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'asc'
      },
    });
  }

  async deleteAccount(id: string, userId: string) {
    const result = await prisma.cloudAccount.deleteMany({
      where: { id, userId }
    });
    return result;
  }
}

export const cloudAccountService = new CloudAccountService();
