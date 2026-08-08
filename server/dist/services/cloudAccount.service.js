"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudAccountService = exports.CloudAccountService = void 0;
const prisma_1 = require("../database/prisma");
const crypto_1 = require("../utils/crypto");
class CloudAccountService {
    async upsertAccount(userId, provider, providerAccountId, email, accessToken, refreshToken, expiresIn, storageUsed, storageTotal) {
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
        const encryptedAccess = (0, crypto_1.encryptToken)(accessToken);
        const encryptedRefresh = (0, crypto_1.encryptToken)(refreshToken);
        // We check if this provider + providerAccountId already exists for this user
        const existing = await prisma_1.prisma.cloudAccount.findFirst({
            where: { userId, provider, providerAccountId },
        });
        if (existing) {
            return prisma_1.prisma.cloudAccount.update({
                where: { id: existing.id },
                data: {
                    email,
                    accessToken: encryptedAccess,
                    ...(encryptedRefresh && { refreshToken: encryptedRefresh }), // Only update refresh token if provided
                    ...(expiresAt && { expiresAt }),
                    ...(storageUsed !== undefined && { storageUsed }),
                    ...(storageTotal !== undefined && { storageTotal }),
                    syncStatus: 'idle',
                    syncError: null,
                },
            });
        }
        return prisma_1.prisma.cloudAccount.create({
            data: {
                userId,
                provider,
                providerAccountId,
                email,
                accessToken: encryptedAccess,
                refreshToken: encryptedRefresh,
                expiresAt,
                storageUsed,
                storageTotal,
            },
        });
    }
    async getAccounts(userId) {
        return prisma_1.prisma.cloudAccount.findMany({
            where: { userId },
            orderBy: {
                createdAt: 'asc'
            },
        });
    }
    async deleteAccount(id, userId) {
        const result = await prisma_1.prisma.cloudAccount.deleteMany({
            where: { id, userId }
        });
        return result;
    }
}
exports.CloudAccountService = CloudAccountService;
exports.cloudAccountService = new CloudAccountService();
