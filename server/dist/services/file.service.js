"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileService = exports.FileService = void 0;
const crypto_1 = require("../utils/crypto");
const prisma_1 = require("../database/prisma");
const fs_1 = __importDefault(require("fs"));
const provider_factory_1 = require("../providers/provider.factory");
const AppError_1 = require("../utils/AppError");
const uuid_1 = require("uuid");
class FileService {
    async syncFiles(cloudAccountId, userId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: cloudAccountId, userId },
        });
        if (!account) {
            throw new AppError_1.AppError('Cloud account not found', 404);
        }
        if (!(0, crypto_1.decryptToken)(account.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        if (account.syncStatus === 'syncing') {
            return { count: 0, message: 'Sync already in progress' };
        }
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
            // Mark as syncing
            await prisma_1.prisma.cloudAccount.update({
                where: { id: account.id },
                data: { syncStatus: 'syncing', syncError: null }
            });
            // Fetch from Provider
            const { files: driveFiles, rootFolderId } = await provider.listFiles((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken));
            try {
                const quota = await provider.getDriveQuota((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken));
                if (quota) {
                    await prisma_1.prisma.cloudAccount.update({
                        where: { id: account.id },
                        data: {
                            storageUsed: quota.usage ? BigInt(quota.usage) : null,
                            storageTotal: quota.limit ? BigInt(quota.limit) : null,
                        }
                    });
                }
            }
            catch (e) {
                console.error('Failed to update drive quota during sync', e);
            }
            // Build a mapping of providerFileId -> localUUID
            const localIdMap = new Map();
            for (const f of driveFiles) {
                localIdMap.set(f.id, (0, uuid_1.v4)());
            }
            // We'll perform a transaction: delete old files, insert new files.
            await prisma_1.prisma.$transaction(async (tx) => {
                // Delete existing files for this account
                await tx.file.deleteMany({
                    where: { cloudAccountId },
                });
                // Insert new files
                const data = driveFiles.map((f) => {
                    // Determine the parentId:
                    let parentId = null;
                    if (f.parents && f.parents.length > 0) {
                        const rawParent = f.parents[0];
                        if (rawParent === rootFolderId) {
                            parentId = null; // Root-level file
                        }
                        else if (localIdMap.has(rawParent)) {
                            parentId = localIdMap.get(rawParent); // Use perfectly mapped local UUID
                        }
                        else {
                            parentId = null; // Orphan (parent not in our dataset)
                        }
                    }
                    return {
                        id: localIdMap.get(f.id),
                        providerFileId: f.id,
                        provider: account.provider,
                        name: f.name,
                        mimeType: f.mimeType,
                        size: f.size ? BigInt(f.size) : BigInt(0),
                        parentId,
                        modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
                        hasThumbnail: !!f.thumbnailLink,
                        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
                        isShared: f.ownedByMe === false,
                        isTrashed: f.trashed === true,
                        cloudAccountId: account.id,
                    };
                });
                // Topologically sort to ensure parents are inserted before children
                const dataMap = new Map(data.map(f => [f.id, f]));
                const depths = new Map();
                const getDepth = (id, visited = new Set()) => {
                    if (!id)
                        return 0;
                    if (depths.has(id))
                        return depths.get(id);
                    if (visited.has(id))
                        return 0; // Break cycles
                    visited.add(id);
                    const file = dataMap.get(id);
                    if (!file || !file.parentId) {
                        depths.set(id, 0);
                        return 0;
                    }
                    const depth = 1 + getDepth(file.parentId, visited);
                    depths.set(id, depth);
                    return depth;
                };
                data.forEach(f => getDepth(f.id));
                data.sort((a, b) => depths.get(a.id) - depths.get(b.id));
                if (data.length > 0) {
                    const CHUNK_SIZE = 1000;
                    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
                        const chunk = data.slice(i, i + CHUNK_SIZE);
                        await tx.file.createMany({
                            data: chunk,
                        });
                    }
                }
            }, { timeout: 120000 });
            // Mark as completed and save start page token
            const syncToken = await provider.getStartPageToken((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken));
            await prisma_1.prisma.cloudAccount.update({
                where: { id: account.id },
                data: {
                    syncStatus: 'completed',
                    lastSyncedAt: new Date(),
                    fileCount: driveFiles.length,
                    syncToken
                }
            });
            return { count: driveFiles.length };
        }
        catch (error) {
            console.error('Sync failed:', error);
            await prisma_1.prisma.cloudAccount.update({
                where: { id: account.id },
                data: {
                    syncStatus: 'failed',
                    syncError: error.message || 'Unknown error occurred during sync'
                }
            });
            throw new AppError_1.AppError('File sync failed', 500);
        }
    }
    async incrementalSync(cloudAccountId, userId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: cloudAccountId, userId },
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        if (!(0, crypto_1.decryptToken)(account.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        if (account.syncStatus === 'syncing') {
            return { count: 0, message: 'Sync already in progress' };
        }
        if (!account.syncToken)
            return this.syncFiles(cloudAccountId, userId);
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
            const { changes, newStartPageToken } = await provider.listChanges((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken), account.syncToken);
            if (changes.length > 0) {
                const existingFiles = await prisma_1.prisma.file.findMany({
                    where: { cloudAccountId: account.id },
                    select: { id: true, providerFileId: true }
                });
                const validIds = new Map(existingFiles.map(f => [f.providerFileId, f.id]));
                await prisma_1.prisma.$transaction(async (tx) => {
                    for (const change of changes) {
                        const providerFileId = change.fileId;
                        if (change.removed) {
                            if (providerFileId) {
                                await tx.file.deleteMany({
                                    where: { cloudAccountId: account.id, providerFileId }
                                });
                                validIds.delete(providerFileId);
                            }
                        }
                        else if (change.file) {
                            const f = change.file;
                            let parentId = null;
                            if (f.parents && f.parents.length > 0) {
                                const rawParent = f.parents[0];
                                if (validIds.has(rawParent)) {
                                    parentId = validIds.get(rawParent);
                                }
                            }
                            const data = {
                                providerFileId: f.id,
                                provider: account.provider,
                                isTrashed: f.trashed === true,
                                cloudAccountId: account.id,
                            };
                            if (f.name !== undefined)
                                data.name = f.name;
                            if (f.mimeType !== undefined)
                                data.mimeType = f.mimeType;
                            if (f.size !== undefined)
                                data.size = f.size ? BigInt(f.size) : BigInt(0);
                            if (parentId !== undefined)
                                data.parentId = parentId;
                            if (f.modifiedTime !== undefined)
                                data.modifiedTime = f.modifiedTime ? new Date(f.modifiedTime) : new Date();
                            if (f.thumbnailLink !== undefined)
                                data.hasThumbnail = !!f.thumbnailLink;
                            if (f.mimeType !== undefined)
                                data.isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                            if (f.ownedByMe !== undefined)
                                data.isShared = f.ownedByMe === false;
                            const existing = await tx.file.findFirst({
                                where: { cloudAccountId: account.id, providerFileId }
                            });
                            if (existing) {
                                await tx.file.update({
                                    where: { id: existing.id },
                                    data
                                });
                            }
                            else {
                                // If it doesn't exist but it's trashed with no name, skip it
                                if (!f.name)
                                    continue;
                                const newId = (0, uuid_1.v4)();
                                await tx.file.create({ data: { id: newId, ...data } });
                                validIds.set(providerFileId, newId);
                            }
                        }
                    }
                    const count = await tx.file.count({ where: { cloudAccountId: account.id } });
                    await tx.cloudAccount.update({
                        where: { id: account.id },
                        data: {
                            fileCount: count,
                            syncToken: newStartPageToken || account.syncToken,
                            lastSyncedAt: new Date()
                        }
                    });
                }, { timeout: 30000 });
            }
            else if (newStartPageToken && newStartPageToken !== account.syncToken) {
                await prisma_1.prisma.cloudAccount.update({
                    where: { id: account.id },
                    data: { syncToken: newStartPageToken, lastSyncedAt: new Date() }
                });
            }
            // Always fetch the latest storage quota to correct any drift from external changes
            try {
                const quota = await provider.getDriveQuota((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken));
                if (quota && quota.usage) {
                    await prisma_1.prisma.cloudAccount.update({
                        where: { id: account.id },
                        data: { storageUsed: BigInt(quota.usage) }
                    });
                }
            }
            catch (e) {
                console.error('Failed to fetch quota during incremental sync:', e);
            }
            return { count: changes.length };
        }
        catch (error) {
            console.error('Incremental sync failed:', error);
            throw new AppError_1.AppError('Incremental file sync failed', 500);
        }
    }
    async getFiles(cloudAccountId, userId, folderId = 'root', limit = 50, cursor, type) {
        const accountFilter = cloudAccountId ? { id: cloudAccountId, userId } : { userId };
        const accounts = await prisma_1.prisma.cloudAccount.findMany({
            where: accountFilter,
            select: { id: true },
        });
        const accountIds = accounts.map(a => a.id);
        if (accountIds.length === 0) {
            return { files: [], nextCursor: null };
        }
        const whereClause = {
            cloudAccountId: { in: accountIds },
            isTrashed: false,
        };
        if (folderId === 'root') {
            whereClause.parentId = null;
            whereClause.isShared = false;
        }
        else {
            whereClause.parentId = folderId;
        }
        if (type === 'folder') {
            whereClause.isFolder = true;
        }
        else if (type === 'file') {
            whereClause.isFolder = false;
        }
        const files = await prisma_1.prisma.file.findMany({
            where: whereClause,
            take: limit + 1,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: [
                { isFolder: 'desc' },
                { name: 'asc' }
            ],
        });
        let nextCursor = null;
        if (files.length > limit) {
            const nextItem = files.pop();
            nextCursor = nextItem.id;
        }
        return {
            files: files.map(f => ({
                ...f,
                size: Number(f.size),
                isFavorite: false,
                tags: [],
            })),
            nextCursor
        };
    }
    async advancedBrowse(userId, filters, limit = 50, cursor) {
        // 1. Get user's cloud accounts to ensure they only query their own files
        const accounts = await prisma_1.prisma.cloudAccount.findMany({
            where: { userId },
            select: { id: true, provider: true },
        });
        if (accounts.length === 0) {
            return { files: [], nextCursor: null };
        }
        const accountIds = accounts.map(a => a.id);
        let whereClause = {
            cloudAccountId: { in: accountIds },
            isTrashed: filters.isTrashed || false,
        };
        // 2. Filter by Type
        if (filters.type) {
            if (filters.type === 'image') {
                whereClause.mimeType = { startsWith: 'image/' };
            }
            else if (filters.type === 'video') {
                whereClause.mimeType = { startsWith: 'video/' };
            }
            else if (filters.type === 'audio') {
                whereClause.mimeType = { startsWith: 'audio/' };
            }
            else if (filters.type === 'document') {
                whereClause.mimeType = {
                    in: [
                        'application/pdf',
                        'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/vnd.ms-excel',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'application/vnd.ms-powerpoint',
                        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                        'text/plain'
                    ]
                };
            }
        }
        // 3. Filter by Provider
        if (filters.providers && filters.providers.length > 0) {
            whereClause.provider = { in: filters.providers };
        }
        // 4. Handle Account Inclusions & Exclusions
        let validAccountIds = [...accountIds];
        if (filters.includeAccounts && filters.includeAccounts.length > 0) {
            validAccountIds = validAccountIds.filter(id => filters.includeAccounts.includes(id));
        }
        if (filters.excludeAccounts && filters.excludeAccounts.length > 0) {
            validAccountIds = validAccountIds.filter(id => !filters.excludeAccounts.includes(id));
        }
        if (validAccountIds.length === 0) {
            return { files: [], nextCursor: null }; // Excluded everything
        }
        whereClause.cloudAccountId.in = validAccountIds;
        // We only want files in browse mode, not folders (usually, or we can make it optional)
        // Actually, DAMs usually show files. We will filter out folders unless requested.
        if (!filters.isTrashed) {
            whereClause.isFolder = false;
        }
        // 5. Determine Sorting
        let orderByClause = { modifiedTime: 'desc' }; // default
        if (filters.sortBy === 'date')
            orderByClause = { modifiedTime: filters.sortOrder || 'desc' };
        if (filters.sortBy === 'size')
            orderByClause = { size: filters.sortOrder || 'desc' };
        if (filters.sortBy === 'name')
            orderByClause = { name: filters.sortOrder || 'asc' };
        // 6. Execute Query
        const files = await prisma_1.prisma.file.findMany({
            where: whereClause,
            take: limit + 1,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: orderByClause,
        });
        let nextCursor = null;
        if (files.length > limit) {
            const nextItem = files.pop();
            nextCursor = nextItem.id;
        }
        return {
            files: files.map(f => ({
                ...f,
                size: Number(f.size),
                isFavorite: false,
                tags: [],
            })),
            nextCursor
        };
    }
    async searchFiles(cloudAccountId, userId, query, limit = 50, cursor) {
        const accountFilter = cloudAccountId ? { id: cloudAccountId, userId } : { userId };
        const accounts = await prisma_1.prisma.cloudAccount.findMany({
            where: accountFilter,
            select: { id: true },
        });
        const accountIds = accounts.map(a => a.id);
        if (accountIds.length === 0) {
            return { files: [], nextCursor: null };
        }
        const files = await prisma_1.prisma.file.findMany({
            where: {
                cloudAccountId: { in: accountIds },
                name: { contains: query, mode: 'insensitive' },
                isTrashed: false,
            },
            take: limit + 1,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: { modifiedTime: 'desc' },
        });
        let nextCursor = null;
        if (files.length > limit) {
            const nextItem = files.pop();
            nextCursor = nextItem.id;
        }
        return {
            files: files.map(f => ({
                ...f,
                size: Number(f.size),
                isFavorite: false,
                tags: [],
            })),
            nextCursor
        };
    }
    async getFolderPath(folderId, userId) {
        if (folderId === 'root')
            return [];
        let currentId = folderId;
        const path = [];
        const visited = new Set();
        while (currentId && currentId !== 'root' && !visited.has(currentId)) {
            visited.add(currentId);
            const folder = await prisma_1.prisma.file.findFirst({
                where: { id: currentId, cloudAccount: { userId } },
                select: { id: true, name: true, parentId: true }
            });
            if (!folder)
                break;
            path.unshift({ id: folder.id, label: folder.name });
            currentId = folder.parentId;
        }
        return path;
    }
    async getThumbnailUrl(fileId, userId) {
        const file = await prisma_1.prisma.file.findFirst({
            where: { id: fileId, cloudAccount: { userId } },
            include: { cloudAccount: true },
        });
        if (!file || !file.hasThumbnail) {
            return null;
        }
        if (!(0, crypto_1.decryptToken)(file.cloudAccount.accessToken))
            return null;
        const provider = provider_factory_1.ProviderFactory.getProvider(file.provider);
        let url = await provider.getThumbnailLink((0, crypto_1.decryptToken)(file.cloudAccount.accessToken), (0, crypto_1.decryptToken)(file.cloudAccount.refreshToken), file.providerFileId);
        if (url) {
            if (file.provider === 'google-drive') {
                url = url.replace(/=s\d+$/, '=s512');
            }
            return { url, accessToken: (0, crypto_1.decryptToken)(file.cloudAccount.accessToken) };
        }
        return null;
    }
    async renameFile(id, userId, newName) {
        // 1. Fetch file from our DB
        const file = await prisma_1.prisma.file.findUnique({
            where: { id },
            include: { cloudAccount: true }
        });
        if (!file) {
            throw new AppError_1.AppError('File not found', 404);
        }
        if (file.cloudAccount.userId !== userId) {
            throw new AppError_1.AppError('Unauthorized', 403);
        }
        const { cloudAccount } = file;
        if (!(0, crypto_1.decryptToken)(cloudAccount.accessToken)) {
            throw new AppError_1.AppError('Account not authenticated', 401);
        }
        const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
        let updatedDriveFile;
        try {
            updatedDriveFile = await provider.renameFile((0, crypto_1.decryptToken)(cloudAccount.accessToken), (0, crypto_1.decryptToken)(cloudAccount.refreshToken), file.providerFileId, newName);
        }
        catch (error) {
            if (error.response?.status === 403) {
                throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
            }
            throw new AppError_1.AppError(error.message || `Failed to rename file on ${cloudAccount.provider}`, 500);
        }
        // 3. Update local DB
        const updatedFile = await prisma_1.prisma.file.update({
            where: { id },
            data: {
                name: newName,
                modifiedTime: updatedDriveFile.modifiedTime ? new Date(updatedDriveFile.modifiedTime) : new Date(),
            }
        });
        return {
            ...updatedFile,
            size: Number(updatedFile.size)
        };
    }
    async downloadFile(id, userId, range) {
        const file = await prisma_1.prisma.file.findUnique({
            where: { id },
            include: { cloudAccount: true }
        });
        if (!file) {
            throw new AppError_1.AppError('File not found', 404);
        }
        if (file.cloudAccount.userId !== userId) {
            throw new AppError_1.AppError('Unauthorized', 403);
        }
        const { cloudAccount } = file;
        if (!(0, crypto_1.decryptToken)(cloudAccount.accessToken)) {
            throw new AppError_1.AppError('Account not authenticated', 401);
        }
        if (file.isFolder) {
            const getDescendants = async (parentId, currentPath) => {
                const children = await prisma_1.prisma.file.findMany({ where: { parentId, cloudAccountId: cloudAccount.id } });
                let result = [];
                for (const child of children) {
                    if (child.isFolder) {
                        result = result.concat(await getDescendants(child.providerFileId, `${currentPath}${child.name}/`));
                    }
                    else {
                        result.push({ dbFile: child, path: `${currentPath}${child.name}` });
                    }
                }
                return result;
            };
            const filesToZip = await getDescendants(file.providerFileId, `${file.name}/`);
            return {
                isArchive: true,
                filesToZip,
                filename: `${file.name}.zip`,
                cloudAccount
            };
        }
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
            const streamResponse = await provider.downloadFileStream((0, crypto_1.decryptToken)(cloudAccount.accessToken), (0, crypto_1.decryptToken)(cloudAccount.refreshToken), file.providerFileId, file.mimeType, range);
            let finalName = file.name;
            if (cloudAccount.provider === 'google-drive') {
                if (file.mimeType === 'application/vnd.google-apps.document' && !finalName.endsWith('.docx')) {
                    finalName += '.docx';
                }
                else if (file.mimeType === 'application/vnd.google-apps.spreadsheet' && !finalName.endsWith('.xlsx')) {
                    finalName += '.xlsx';
                }
                else if (file.mimeType === 'application/vnd.google-apps.presentation' && !finalName.endsWith('.pptx')) {
                    finalName += '.pptx';
                }
            }
            return {
                stream: streamResponse.data,
                filename: finalName,
                mimeType: file.mimeType,
                status: streamResponse.status,
                headers: streamResponse.headers || {},
                size: Number(file.size)
            };
        }
        catch (error) {
            if (error.response?.status === 403) {
                throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write/download access.', 403);
            }
            throw new AppError_1.AppError(error.message || `Failed to download file from ${cloudAccount.provider}`, 500);
        }
    }
    async moveFile(id, newParentId, userId) {
        const file = await prisma_1.prisma.file.findUnique({
            where: { id },
            include: { cloudAccount: true }
        });
        if (!file) {
            throw new AppError_1.AppError('File not found', 404);
        }
        if (file.cloudAccount.userId !== userId) {
            throw new AppError_1.AppError('Unauthorized', 403);
        }
        const { cloudAccount } = file;
        // We must find the new parent folder to get its providerFileId
        let targetProviderId = 'root';
        if (newParentId !== 'root') {
            const targetFolder = await prisma_1.prisma.file.findUnique({
                where: { id: newParentId }
            });
            if (!targetFolder || !targetFolder.isFolder) {
                throw new AppError_1.AppError('Target folder not found or is not a folder', 400);
            }
            targetProviderId = targetFolder.providerFileId;
        }
        if (!(0, crypto_1.decryptToken)(cloudAccount.accessToken)) {
            throw new AppError_1.AppError('Account not authenticated', 401);
        }
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
            const updatedDriveFile = await provider.moveFile((0, crypto_1.decryptToken)(cloudAccount.accessToken), (0, crypto_1.decryptToken)(cloudAccount.refreshToken), file.providerFileId, targetProviderId);
            // Update local DB
            const updatedFile = await prisma_1.prisma.file.update({
                where: { id },
                data: {
                    parentId: newParentId === 'root' ? null : newParentId,
                    modifiedTime: updatedDriveFile.modifiedTime ? new Date(updatedDriveFile.modifiedTime) : new Date(),
                }
            });
            return {
                ...updatedFile,
                size: Number(updatedFile.size)
            };
        }
        catch (error) {
            if (error.response?.status === 403) {
                throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
            }
            throw new AppError_1.AppError(error.message || `Failed to move file on ${cloudAccount.provider}`, 500);
        }
    }
    async createFolder(accountId, userId, folderName, parentProviderId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: accountId, userId }
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        if (!(0, crypto_1.decryptToken)(account.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        try {
            let targetProviderId = 'root';
            if (parentProviderId !== 'root') {
                const parentRecord = await prisma_1.prisma.file.findUnique({
                    where: { id: parentProviderId }
                });
                if (!parentRecord)
                    throw new AppError_1.AppError('Parent folder not found', 404);
                targetProviderId = parentRecord.providerFileId;
            }
            const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
            const driveFolder = await provider.createFolder((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken), folderName, targetProviderId);
            // Create local DB record
            const newFolder = await prisma_1.prisma.file.create({
                data: {
                    providerFileId: driveFolder.id,
                    provider: account.provider,
                    name: driveFolder.name,
                    mimeType: driveFolder.mimeType,
                    size: BigInt(0),
                    parentId: parentProviderId === 'root' ? null : parentProviderId,
                    modifiedTime: driveFolder.modifiedTime ? new Date(driveFolder.modifiedTime) : new Date(),
                    hasThumbnail: false,
                    isFolder: true,
                    isShared: false,
                    cloudAccountId: account.id
                }
            });
            return {
                ...newFolder,
                size: Number(newFolder.size)
            };
        }
        catch (error) {
            throw new AppError_1.AppError(error.message || `Failed to create folder on ${account.provider}`, 500);
        }
    }
    async createFoldersBatch(accountId, userId, paths, parentProviderId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: accountId, userId }
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        if (!(0, crypto_1.decryptToken)(account.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        let targetRootProviderId = 'root';
        if (parentProviderId !== 'root') {
            const parentRecord = await prisma_1.prisma.file.findUnique({
                where: { id: parentProviderId }
            });
            if (!parentRecord)
                throw new AppError_1.AppError('Root parent folder not found', 404);
            targetRootProviderId = parentRecord.providerFileId;
        }
        // Sort paths by depth (number of slashes) so parents are created before children
        const sortedPaths = [...paths].sort((a, b) => a.split('/').length - b.split('/').length);
        const folderProviderIdMap = {
            '': targetRootProviderId
        };
        const folderLocalIdMap = {
            '': parentProviderId
        };
        // Process sequentially to ensure parent exists before child
        for (const path of sortedPaths) {
            const parts = path.split('/');
            const folderName = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join('/');
            const parentProviderId = folderProviderIdMap[parentPath];
            const parentLocalId = folderLocalIdMap[parentPath];
            if (!parentProviderId) {
                throw new AppError_1.AppError(`Missing parent folder ID for path: ${path}`, 500);
            }
            // Check if this specific folder already exists in our DB to avoid duplicates
            const existing = await prisma_1.prisma.file.findFirst({
                where: {
                    cloudAccountId: account.id,
                    name: folderName,
                    parentId: parentLocalId === 'root' ? null : parentLocalId,
                    isFolder: true
                }
            });
            if (existing) {
                folderProviderIdMap[path] = existing.providerFileId;
                folderLocalIdMap[path] = existing.id;
                continue;
            }
            try {
                const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
                const driveFolder = await provider.createFolder((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken), folderName, parentProviderId);
                // Save to PostgreSQL immediately
                const newFolder = await prisma_1.prisma.file.create({
                    data: {
                        providerFileId: driveFolder.id,
                        provider: account.provider,
                        name: driveFolder.name,
                        mimeType: driveFolder.mimeType,
                        size: BigInt(0),
                        parentId: parentLocalId === 'root' ? null : parentLocalId,
                        modifiedTime: driveFolder.modifiedTime ? new Date(driveFolder.modifiedTime) : new Date(),
                        hasThumbnail: false,
                        isFolder: true,
                        isShared: false,
                        cloudAccountId: account.id
                    }
                });
                folderProviderIdMap[path] = newFolder.providerFileId;
                folderLocalIdMap[path] = newFolder.id;
            }
            catch (error) {
                console.error(`Failed to create folder ${path}`, error);
                throw new AppError_1.AppError(`Failed to create folder ${path} on ${account.provider}`, 500);
            }
        }
        return folderLocalIdMap;
    }
    async deleteFile(id, userId) {
        const file = await prisma_1.prisma.file.findUnique({
            where: { id },
            include: { cloudAccount: true }
        });
        if (!file) {
            throw new AppError_1.AppError('File not found', 404);
        }
        if (file.cloudAccount.userId !== userId) {
            throw new AppError_1.AppError('Unauthorized', 403);
        }
        const { cloudAccount } = file;
        if (!(0, crypto_1.decryptToken)(cloudAccount.accessToken)) {
            throw new AppError_1.AppError('Account not authenticated', 401);
        }
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
            await provider.trashFile((0, crypto_1.decryptToken)(cloudAccount.accessToken), (0, crypto_1.decryptToken)(cloudAccount.refreshToken), file.providerFileId);
            // Soft delete local DB record
            await prisma_1.prisma.file.update({
                where: { id },
                data: { isTrashed: true }
            });
            return { success: true };
        }
        catch (error) {
            if (error.response?.status === 403) {
                throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
            }
            throw new AppError_1.AppError(error.message || `Failed to delete file on ${cloudAccount.provider}`, 500);
        }
    }
    async restoreFile(id, userId) {
        const file = await prisma_1.prisma.file.findUnique({
            where: { id },
            include: { cloudAccount: true }
        });
        if (!file)
            throw new AppError_1.AppError('File not found', 404);
        if (file.cloudAccount.userId !== userId)
            throw new AppError_1.AppError('Unauthorized', 403);
        const { cloudAccount } = file;
        if (!(0, crypto_1.decryptToken)(cloudAccount.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
            const res = await provider.restoreFile((0, crypto_1.decryptToken)(cloudAccount.accessToken), (0, crypto_1.decryptToken)(cloudAccount.refreshToken), file.providerFileId);
            // If it's OneDrive and returned a fallback, we keep it trashed locally until sync? 
            // Actually, if we return a fallbackUrl, we don't update local state, because the user has to do it manually.
            if (res && res.fallbackUrl) {
                return res;
            }
            await prisma_1.prisma.file.update({
                where: { id },
                data: { isTrashed: false }
            });
            return { success: true };
        }
        catch (error) {
            throw new AppError_1.AppError(error.message || `Failed to restore file on ${cloudAccount.provider}`, 500);
        }
    }
    async permanentlyDeleteFile(id, userId) {
        const file = await prisma_1.prisma.file.findUnique({
            where: { id },
            include: { cloudAccount: true }
        });
        if (!file)
            throw new AppError_1.AppError('File not found', 404);
        if (file.cloudAccount.userId !== userId)
            throw new AppError_1.AppError('Unauthorized', 403);
        const { cloudAccount } = file;
        if (!(0, crypto_1.decryptToken)(cloudAccount.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        try {
            const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
            await provider.permanentlyDeleteFile((0, crypto_1.decryptToken)(cloudAccount.accessToken), (0, crypto_1.decryptToken)(cloudAccount.refreshToken), file.providerFileId);
            await prisma_1.prisma.file.delete({
                where: { id }
            });
            if (cloudAccount.storageUsed !== null && file.size) {
                await prisma_1.prisma.cloudAccount.update({
                    where: { id: cloudAccount.id },
                    data: { storageUsed: { decrement: file.size } }
                });
            }
            return { success: true };
        }
        catch (error) {
            throw new AppError_1.AppError(error.message || `Failed to permanently delete file on ${cloudAccount.provider}`, 500);
        }
    }
    async emptyTrash(userId, providerNames) {
        if (!providerNames || providerNames.length === 0)
            return { success: true };
        const accounts = await prisma_1.prisma.cloudAccount.findMany({
            where: { userId, provider: { in: providerNames } }
        });
        for (const account of accounts) {
            const accessToken = (0, crypto_1.decryptToken)(account.accessToken);
            if (!accessToken)
                continue;
            const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
            try {
                if (account.provider === 'google-drive') {
                    // Google supports empty trash natively
                    await provider.emptyTrash(accessToken, (0, crypto_1.decryptToken)(account.refreshToken));
                    await prisma_1.prisma.file.deleteMany({
                        where: { cloudAccountId: account.id, isTrashed: true }
                    });
                }
                else {
                    // Others need individual deletion
                    const trashedFiles = await prisma_1.prisma.file.findMany({
                        where: { cloudAccountId: account.id, isTrashed: true }
                    });
                    for (const f of trashedFiles) {
                        try {
                            await provider.permanentlyDeleteFile(accessToken, (0, crypto_1.decryptToken)(account.refreshToken), f.providerFileId);
                            await prisma_1.prisma.file.delete({ where: { id: f.id } });
                        }
                        catch (err) {
                            console.error(`Failed to permanently delete ${f.id} on ${account.provider}`, err);
                        }
                    }
                }
            }
            catch (err) {
                console.error(`Failed to empty trash for ${account.provider}`, err);
            }
        }
        return { success: true };
    }
    async uploadFile(accountId, parentId, filePath, originalName, mimeType, size, userId) {
        const account = await prisma_1.prisma.cloudAccount.findUnique({
            where: { id: accountId }
        });
        if (!account)
            throw new Error('Account not found');
        if (account.userId !== userId)
            throw new Error('Unauthorized');
        if (!(0, crypto_1.decryptToken)(account.accessToken))
            throw new Error('Account not authenticated');
        try {
            let targetProviderId = 'root';
            if (parentId !== 'root') {
                const parentRecord = await prisma_1.prisma.file.findUnique({
                    where: { id: parentId }
                });
                if (!parentRecord)
                    throw new AppError_1.AppError('Parent folder not found', 404);
                targetProviderId = parentRecord.providerFileId;
            }
            // 1. Upload to Provider
            const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
            const driveFile = await provider.uploadFile((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken), originalName, mimeType, filePath, targetProviderId);
            // 3. Insert into our PostgreSQL DB so it appears instantly
            const dbFile = await prisma_1.prisma.file.create({
                data: {
                    name: driveFile.name || originalName,
                    providerFileId: driveFile.id,
                    isFolder: false,
                    provider: account.provider,
                    mimeType: driveFile.mimeType || mimeType,
                    size: BigInt(parseInt(driveFile.size || size.toString(), 10) || size),
                    hasThumbnail: !!driveFile.thumbnailLink,
                    cloudAccountId: account.id,
                    parentId: parentId === 'root' ? null : parentId,
                    modifiedTime: driveFile.modifiedTime ? new Date(driveFile.modifiedTime) : new Date(),
                }
            });
            if (account.storageUsed !== null && dbFile.size) {
                await prisma_1.prisma.cloudAccount.update({
                    where: { id: account.id },
                    data: { storageUsed: { increment: dbFile.size } }
                });
            }
            return { ...dbFile, size: Number(dbFile.size) };
        }
        finally {
            // 4. Guaranteed to run whether upload succeeds OR throws an error! (Prevents disk leaks)
            if (fs_1.default.existsSync(filePath)) {
                await fs_1.default.promises.unlink(filePath).catch(console.error);
            }
        }
    }
    async createUploadSession(accountId, userId, name, mimeType, parentProviderId, size) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: accountId, userId }
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        if (!(0, crypto_1.decryptToken)(account.accessToken))
            throw new AppError_1.AppError('Account not authenticated', 401);
        const provider = provider_factory_1.ProviderFactory.getProvider(account.provider);
        if (!provider.createUploadSession) {
            return { direct: false };
        }
        let targetProviderId = 'root';
        if (parentProviderId !== 'root') {
            const parentRecord = await prisma_1.prisma.file.findUnique({
                where: { id: parentProviderId }
            });
            if (!parentRecord)
                throw new AppError_1.AppError('Parent folder not found', 404);
            targetProviderId = parentRecord.providerFileId;
        }
        try {
            const result = await provider.createUploadSession((0, crypto_1.decryptToken)(account.accessToken), (0, crypto_1.decryptToken)(account.refreshToken), name, mimeType, targetProviderId, size);
            return { ...result, provider: account.provider };
        }
        catch (error) {
            throw new AppError_1.AppError(error.message || `Failed to create upload session on ${account.provider}`, 500);
        }
    }
    async completeUpload(accountId, userId, fileData) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: accountId, userId }
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        let parentLocalId = null;
        if (fileData.parentId && fileData.parentId !== 'root') {
            const parentRecord = await prisma_1.prisma.file.findFirst({
                where: { providerFileId: fileData.parentId, cloudAccountId: account.id }
            });
            if (parentRecord) {
                parentLocalId = parentRecord.id;
            }
        }
        const newFile = await prisma_1.prisma.file.create({
            data: {
                providerFileId: fileData.providerFileId || fileData.id,
                provider: account.provider,
                name: fileData.name,
                mimeType: fileData.mimeType,
                size: BigInt(fileData.size || 0),
                parentId: parentLocalId,
                modifiedTime: fileData.modifiedTime ? new Date(fileData.modifiedTime) : new Date(),
                hasThumbnail: !!fileData.thumbnailLink,
                isFolder: fileData.mimeType === 'application/vnd.google-apps.folder',
                isShared: false,
                cloudAccountId: account.id
            }
        });
        if (account.storageUsed !== null && newFile.size) {
            await prisma_1.prisma.cloudAccount.update({
                where: { id: account.id },
                data: { storageUsed: { increment: newFile.size } }
            });
        }
        return {
            ...newFile,
            size: Number(newFile.size)
        };
    }
}
exports.FileService = FileService;
exports.fileService = new FileService();
