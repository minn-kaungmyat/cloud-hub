"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileService = exports.FileService = void 0;
const prisma_1 = require("../database/prisma");
const googleProvider = __importStar(require("../providers/google.provider"));
const fs_1 = __importDefault(require("fs"));
const google_provider_1 = require("../providers/google.provider");
const AppError_1 = require("../utils/AppError");
class FileService {
    async syncFiles(cloudAccountId, userId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: cloudAccountId, userId },
        });
        if (!account) {
            throw new AppError_1.AppError('Cloud account not found', 404);
        }
        if (account.provider === 'google-drive') {
            if (!account.accessToken) {
                throw new AppError_1.AppError('Account not authenticated', 401);
            }
            if (account.syncStatus === 'syncing') {
                return { count: 0, message: 'Sync already in progress' };
            }
            try {
                // Mark as syncing
                await prisma_1.prisma.cloudAccount.update({
                    where: { id: account.id },
                    data: { syncStatus: 'syncing', syncError: null }
                });
                // Fetch from Google
                const { files: driveFiles, rootFolderId } = await (0, google_provider_1.listFiles)(account.accessToken, account.refreshToken);
                try {
                    const quota = await (0, google_provider_1.getDriveQuota)(account.accessToken, account.refreshToken);
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
                // Build a set of all file IDs we fetched (used to validate parentId references)
                const validIds = new Set(driveFiles.map((f) => f.id));
                // We'll perform a transaction: delete old files, insert new files.
                await prisma_1.prisma.$transaction(async (tx) => {
                    // Delete existing files for this account
                    await tx.file.deleteMany({
                        where: { cloudAccountId },
                    });
                    // Insert new files
                    const data = driveFiles.map((f) => {
                        // Determine the parentId:
                        // - If parent is the Drive root folder ID -> null (it's at root level)
                        // - If parent exists in our file set -> keep it (it's a real subfolder)
                        // - If parent doesn't exist in our file set -> null (orphan reference)
                        let parentId = null;
                        if (f.parents && f.parents.length > 0) {
                            const rawParent = f.parents[0];
                            if (rawParent === rootFolderId) {
                                parentId = null; // Root-level file
                            }
                            else if (validIds.has(rawParent)) {
                                parentId = rawParent; // Valid subfolder
                            }
                            else {
                                parentId = null; // Orphan (parent not in our dataset)
                            }
                        }
                        return {
                            providerFileId: f.id,
                            provider: account.provider,
                            name: f.name,
                            mimeType: f.mimeType,
                            size: f.size ? BigInt(f.size) : BigInt(0),
                            parentId,
                            modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
                            hasThumbnail: !!f.thumbnailLink,
                            isFolder: f.mimeType === 'application/vnd.google-apps.folder',
                            isShared: f.ownedByMe === false, // NOT owned by me = shared with me
                            cloudAccountId: account.id,
                        };
                    });
                    if (data.length > 0) {
                        // Chunk inserts to avoid PostgreSQL parameter limit (65535)
                        const chunkSize = 1000;
                        for (let i = 0; i < data.length; i += chunkSize) {
                            const chunk = data.slice(i, i + chunkSize);
                            await tx.file.createMany({
                                data: chunk,
                            });
                        }
                    }
                }, { timeout: 30000 });
                // Mark as completed and save start page token
                const syncToken = await (0, google_provider_1.getStartPageToken)(account.accessToken, account.refreshToken);
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
        throw new AppError_1.AppError('Provider sync not implemented', 501);
    }
    async incrementalSync(cloudAccountId, userId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: cloudAccountId, userId },
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        if (account.provider === 'google-drive') {
            if (!account.accessToken)
                throw new AppError_1.AppError('Account not authenticated', 401);
            if (account.syncStatus === 'syncing') {
                return { count: 0, message: 'Sync already in progress' };
            }
            if (!account.syncToken)
                return this.syncFiles(cloudAccountId, userId);
            try {
                const { changes, newStartPageToken } = await (0, google_provider_1.listChanges)(account.accessToken, account.refreshToken, account.syncToken);
                if (changes.length > 0) {
                    const existingFiles = await prisma_1.prisma.file.findMany({
                        where: { cloudAccountId: account.id },
                        select: { providerFileId: true }
                    });
                    const validIds = new Set(existingFiles.map(f => f.providerFileId));
                    await prisma_1.prisma.$transaction(async (tx) => {
                        for (const change of changes) {
                            const providerFileId = change.fileId;
                            if (change.removed || (change.file && change.file.trashed)) {
                                await tx.file.deleteMany({
                                    where: { cloudAccountId: account.id, providerFileId }
                                });
                                validIds.delete(providerFileId);
                            }
                            else if (change.file) {
                                const f = change.file;
                                let parentId = null;
                                if (f.parents && f.parents.length > 0) {
                                    const rawParent = f.parents[0];
                                    if (validIds.has(rawParent)) {
                                        parentId = rawParent;
                                    }
                                }
                                const data = {
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
                                    cloudAccountId: account.id,
                                };
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
                                    await tx.file.create({ data });
                                    validIds.add(providerFileId);
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
                return { count: changes.length };
            }
            catch (error) {
                console.error('Incremental sync failed:', error);
                throw new AppError_1.AppError('Incremental file sync failed', 500);
            }
        }
        throw new AppError_1.AppError('Provider sync not implemented', 501);
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
                name: { contains: query, mode: 'insensitive' }
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
                where: { providerFileId: currentId, cloudAccount: { userId } },
                select: { providerFileId: true, name: true, parentId: true }
            });
            if (!folder)
                break;
            path.unshift({ id: folder.providerFileId, label: folder.name });
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
        if (file.provider === 'google-drive') {
            const { getThumbnailLink } = await Promise.resolve().then(() => __importStar(require('../providers/google.provider')));
            let url = await getThumbnailLink(file.cloudAccount.accessToken, file.cloudAccount.refreshToken, file.providerFileId);
            if (url) {
                // Google Drive thumbnailLinks default to 220px width (e.g. =s220)
                // We replace it with =s512 for high-resolution images in the grid and inspector
                url = url.replace(/=s\d+$/, '=s512');
                return { url, accessToken: file.cloudAccount.accessToken };
            }
            return null;
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
        // 2. Perform the actual rename on the cloud provider
        if (cloudAccount.provider === 'google-drive') {
            if (!cloudAccount.accessToken) {
                throw new AppError_1.AppError('Account not authenticated', 401);
            }
            let updatedDriveFile;
            try {
                updatedDriveFile = await (0, google_provider_1.renameFile)(cloudAccount.accessToken, cloudAccount.refreshToken, file.providerFileId, newName);
            }
            catch (error) {
                if (error.response?.status === 403) {
                    throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
                }
                throw new AppError_1.AppError(error.message || 'Failed to rename file on Google Drive', 500);
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
        else {
            throw new AppError_1.AppError('Provider rename not supported', 400);
        }
    }
    async downloadFile(id, userId) {
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
        if (cloudAccount.provider === 'google-drive') {
            if (!cloudAccount.accessToken) {
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
                const streamResponse = await (0, google_provider_1.downloadFileStream)(cloudAccount.accessToken, cloudAccount.refreshToken, file.providerFileId, file.mimeType);
                let finalName = file.name;
                // Append correct extension if it was a Google Workspace file being exported
                if (file.mimeType === 'application/vnd.google-apps.document' && !finalName.endsWith('.docx')) {
                    finalName += '.docx';
                }
                else if (file.mimeType === 'application/vnd.google-apps.spreadsheet' && !finalName.endsWith('.xlsx')) {
                    finalName += '.xlsx';
                }
                else if (file.mimeType === 'application/vnd.google-apps.presentation' && !finalName.endsWith('.pptx')) {
                    finalName += '.pptx';
                }
                return {
                    stream: streamResponse.data,
                    filename: finalName,
                    // We don't strictly set content type here, we let the frontend or express handle it based on extension
                };
            }
            catch (error) {
                if (error.response?.status === 403) {
                    throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write/download access.', 403);
                }
                throw new AppError_1.AppError(error.message || 'Failed to download file from Google Drive', 500);
            }
        }
        else {
            throw new AppError_1.AppError('Provider download not supported', 400);
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
        let localParentId = null;
        if (newParentId !== 'root') {
            const targetFolder = await prisma_1.prisma.file.findUnique({
                where: { id: newParentId }
            });
            if (!targetFolder || !targetFolder.isFolder) {
                throw new AppError_1.AppError('Target folder not found or is not a folder', 400);
            }
            targetProviderId = targetFolder.providerFileId;
            localParentId = targetFolder.id;
        }
        if (cloudAccount.provider === 'google-drive') {
            if (!cloudAccount.accessToken) {
                throw new AppError_1.AppError('Account not authenticated', 401);
            }
            try {
                const updatedDriveFile = await (0, google_provider_1.moveFile)(cloudAccount.accessToken, cloudAccount.refreshToken, file.providerFileId, targetProviderId);
                // Update local DB
                const updatedFile = await prisma_1.prisma.file.update({
                    where: { id },
                    data: {
                        parentId: targetProviderId === 'root' ? null : targetProviderId,
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
                throw new AppError_1.AppError(error.message || 'Failed to move file on Google Drive', 500);
            }
        }
        else {
            throw new AppError_1.AppError('Provider move not supported', 400);
        }
    }
    async createFolder(accountId, userId, name, parentId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: accountId, userId },
        });
        if (!account) {
            throw new AppError_1.AppError('Cloud account not found', 404);
        }
        let targetProviderId = 'root';
        if (parentId !== 'root') {
            const parentFolder = await prisma_1.prisma.file.findUnique({
                where: { id: parentId }
            });
            if (!parentFolder || !parentFolder.isFolder) {
                throw new AppError_1.AppError('Parent folder not found or is not a folder', 400);
            }
            targetProviderId = parentFolder.providerFileId;
        }
        if (account.provider === 'google-drive') {
            if (!account.accessToken) {
                throw new AppError_1.AppError('Account not authenticated', 401);
            }
            try {
                const driveFolder = await (0, google_provider_1.createFolder)(account.accessToken, account.refreshToken, name, targetProviderId);
                // Create local DB record
                const newFolder = await prisma_1.prisma.file.create({
                    data: {
                        providerFileId: driveFolder.id,
                        provider: account.provider,
                        name: driveFolder.name,
                        mimeType: driveFolder.mimeType,
                        size: BigInt(0),
                        parentId: targetProviderId === 'root' ? null : targetProviderId,
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
                throw new AppError_1.AppError(error.message || 'Failed to create folder on Google Drive', 500);
            }
        }
        else {
            throw new AppError_1.AppError('Provider create folder not supported', 400);
        }
    }
    async createFoldersBatch(accountId, userId, paths, rootParentId) {
        const account = await prisma_1.prisma.cloudAccount.findFirst({
            where: { id: accountId, userId },
        });
        if (!account)
            throw new AppError_1.AppError('Cloud account not found', 404);
        if (account.provider !== 'google-drive')
            throw new AppError_1.AppError('Provider not supported', 400);
        if (!account.accessToken)
            throw new AppError_1.AppError('Account not authenticated', 401);
        // Sort paths by depth (number of slashes) so parents are created before children
        const sortedPaths = [...paths].sort((a, b) => a.split('/').length - b.split('/').length);
        // Map of full path string to its Google Drive folderId
        const folderIdMap = {
            'root': rootParentId
        };
        let targetRootProviderId = 'root';
        if (rootParentId !== 'root') {
            const rootFolder = await prisma_1.prisma.file.findUnique({ where: { id: rootParentId } });
            if (rootFolder)
                targetRootProviderId = rootFolder.providerFileId;
        }
        // Process sequentially to ensure parent exists before child
        for (const path of sortedPaths) {
            const parts = path.split('/');
            const folderName = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join('/');
            const parentProviderId = parentPath === '' ? targetRootProviderId : folderIdMap[parentPath];
            if (!parentProviderId) {
                throw new AppError_1.AppError(`Missing parent folder ID for path: ${path}`, 500);
            }
            // Check if this specific folder already exists in our DB to avoid duplicates
            // (This is an optimization, though pre-flight usually means they don't exist yet)
            const existing = await prisma_1.prisma.file.findFirst({
                where: {
                    cloudAccountId: account.id,
                    name: folderName,
                    parentId: parentProviderId === 'root' ? null : parentProviderId,
                    isFolder: true
                }
            });
            if (existing) {
                folderIdMap[path] = existing.providerFileId;
                continue;
            }
            try {
                const { createFolder: createDriveFolder } = await Promise.resolve().then(() => __importStar(require('../providers/google.provider')));
                const driveFolder = await createDriveFolder(account.accessToken, account.refreshToken, folderName, parentProviderId);
                // Save to PostgreSQL immediately
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
                folderIdMap[path] = newFolder.providerFileId;
            }
            catch (error) {
                console.error(`Failed to create folder ${path}`, error);
                throw new AppError_1.AppError(`Failed to create folder ${path} on Google Drive`, 500);
            }
        }
        // Now we need to map the providerFileIds back to local DB IDs for the frontend to use
        // because uploadStore expects local DB IDs for parentId, wait no, does uploadStore use local DB IDs?
        // Let's return local DB IDs because fileService.uploadFile expects parentId to be providerFileId or DB ID?
        // uploadFile expects the providerFileId or local ID. It checks:
        // `const parentRecord = await prisma.file.findFirst({ where: { providerFileId: parentId } })`
        // Actually uploadFile uses `parentId` to upload to Drive, so it needs providerFileId.
        // Wait, let's look at uploadFile:
        // `googleProvider.uploadFile(..., parentId)` -> it uses `parentId` directly as Google Drive ID.
        // So returning `providerFileId` in the map is perfect.
        return folderIdMap;
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
        if (cloudAccount.provider === 'google-drive') {
            if (!cloudAccount.accessToken) {
                throw new AppError_1.AppError('Account not authenticated', 401);
            }
            try {
                await (0, google_provider_1.trashFile)(cloudAccount.accessToken, cloudAccount.refreshToken, file.providerFileId);
                // Delete local DB record
                await prisma_1.prisma.file.delete({
                    where: { id }
                });
                return { success: true };
            }
            catch (error) {
                if (error.response?.status === 403) {
                    throw new AppError_1.AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
                }
                throw new AppError_1.AppError(error.message || 'Failed to delete file on Google Drive', 500);
            }
        }
        else {
            throw new AppError_1.AppError('Provider delete not supported', 400);
        }
    }
    async uploadFile(accountId, parentId, filePath, originalName, mimeType, size, userId) {
        const account = await prisma_1.prisma.cloudAccount.findUnique({
            where: { id: accountId }
        });
        if (!account)
            throw new Error('Account not found');
        if (account.userId !== userId)
            throw new Error('Unauthorized');
        if (!account.accessToken)
            throw new Error('Account not authenticated');
        try {
            // 1. Upload to Google Drive (Provider handles 403 / quotaExceeded errors by throwing)
            const driveFile = await googleProvider.uploadFile(account.accessToken, account.refreshToken, originalName, mimeType, filePath, parentId);
            // 2. Resolve parentId in database (so we can insert the file properly)
            let parentDbId = null;
            if (parentId !== 'root') {
                const parentRecord = await prisma_1.prisma.file.findFirst({
                    where: { providerFileId: parentId, cloudAccountId: account.id }
                });
                if (parentRecord) {
                    parentDbId = parentRecord.id;
                }
            }
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
                    parentId: parentDbId,
                    modifiedTime: driveFile.modifiedTime ? new Date(driveFile.modifiedTime) : new Date(),
                }
            });
            return { ...dbFile, size: Number(dbFile.size) };
        }
        finally {
            // 4. Guaranteed to run whether upload succeeds OR throws an error! (Prevents disk leaks)
            if (fs_1.default.existsSync(filePath)) {
                await fs_1.default.promises.unlink(filePath).catch(console.error);
            }
        }
    }
}
exports.FileService = FileService;
exports.fileService = new FileService();
