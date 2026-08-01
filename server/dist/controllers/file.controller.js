"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileController = exports.FileController = void 0;
const file_service_1 = require("../services/file.service");
const asyncHandler_1 = require("../utils/asyncHandler");
const AppError_1 = require("../utils/AppError");
const archiver = require("archiver");
const provider_factory_1 = require("../providers/provider.factory");
class FileController {
    syncFiles = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const accountId = req.params.accountId;
        const userId = req.user.id;
        const result = await file_service_1.fileService.syncFiles(accountId, userId);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    });
    incrementalSync = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const accountId = req.params.accountId;
        const userId = req.user.id;
        const result = await file_service_1.fileService.incrementalSync(accountId, userId);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    });
    getFiles = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const accountId = req.query.accountId;
        const folderId = req.query.folderId;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const cursor = req.query.cursor;
        const type = req.query.type;
        const userId = req.user.id;
        const result = await file_service_1.fileService.getFiles(accountId, userId, folderId, limit, cursor, type);
        res.status(200).json({
            status: 'success',
            data: result
        });
    });
    browseFiles = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const filters = req.body;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const cursor = req.query.cursor;
        const userId = req.user.id;
        const result = await file_service_1.fileService.advancedBrowse(userId, filters, limit, cursor);
        res.status(200).json({
            status: 'success',
            data: result
        });
    });
    searchFiles = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const accountId = req.query.accountId;
        const query = req.query.q;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const cursor = req.query.cursor;
        const userId = req.user.id;
        if (!query) {
            return res.status(200).json({ status: 'success', data: { files: [], nextCursor: null } });
        }
        const result = await file_service_1.fileService.searchFiles(accountId, userId, query, limit, cursor);
        res.status(200).json({
            status: 'success',
            data: result
        });
    });
    getFolderPath = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const folderId = req.params.folderId;
        const userId = req.user.id;
        const path = await file_service_1.fileService.getFolderPath(folderId, userId);
        res.status(200).json({
            status: 'success',
            data: { path }
        });
    });
    getThumbnail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const id = req.params.id;
        const userId = req.user.id;
        const result = await file_service_1.fileService.getThumbnailUrl(id, userId);
        if (!result) {
            res.status(204).end();
            return;
        }
        const { url, accessToken } = result;
        try {
            if (url.startsWith('data:')) {
                const parts = url.split(',');
                const contentType = parts[0].split(':')[1].split(';')[0];
                const buffer = Buffer.from(parts[1], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=86400');
                res.send(buffer);
                return;
            }
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            // If Google fails to return a thumbnail (e.g. 404), return a 204 No Content.
            // Throwing a 404 AppError here causes global error logging, which triggers 
            // Cloudflare's DDoS brute-force protection if many thumbnails fail at once,
            // leading to temporary IP bans.
            if (!response.ok) {
                res.status(204).end();
                return;
            }
            const contentType = response.headers.get('content-type');
            if (contentType) {
                res.setHeader('Content-Type', contentType);
            }
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
            const arrayBuffer = await response.arrayBuffer();
            res.send(Buffer.from(arrayBuffer));
        }
        catch (error) {
            // Fail silently for thumbnails to prevent IP bans
            res.status(204).end();
        }
    });
    renameFile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const id = req.params.id;
        const { name } = req.body;
        const userId = req.user.id;
        if (!name) {
            throw new AppError_1.AppError('New name is required', 400);
        }
        const updatedFile = await file_service_1.fileService.renameFile(id, userId, name);
        res.status(200).json({
            status: 'success',
            data: { file: updatedFile }
        });
    });
    downloadFile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const id = req.params.id;
        const userId = req.user.id;
        const result = await file_service_1.fileService.downloadFile(id, userId);
        const isInline = req.query.inline === 'true';
        const disposition = isInline ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(result.filename)}"`);
        if (result.mimeType) {
            res.setHeader('Content-Type', result.mimeType);
        }
        if (result.isArchive) {
            const { filesToZip, cloudAccount } = result;
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.on('error', (err) => {
                console.error('Archiver error:', err);
            });
            res.setHeader('Content-Type', 'application/zip');
            archive.pipe(res);
            const provider = provider_factory_1.ProviderFactory.getProvider(cloudAccount.provider);
            for (const f of filesToZip) {
                try {
                    const streamResponse = await provider.downloadFileStream(cloudAccount.accessToken, cloudAccount.refreshToken, f.dbFile.providerFileId, f.dbFile.mimeType);
                    let finalName = f.path;
                    if (cloudAccount.provider === 'google-drive') {
                        if (f.dbFile.mimeType === 'application/vnd.google-apps.document' && !finalName.endsWith('.docx')) {
                            finalName += '.docx';
                        }
                        else if (f.dbFile.mimeType === 'application/vnd.google-apps.spreadsheet' && !finalName.endsWith('.xlsx')) {
                            finalName += '.xlsx';
                        }
                        else if (f.dbFile.mimeType === 'application/vnd.google-apps.presentation' && !finalName.endsWith('.pptx')) {
                            finalName += '.pptx';
                        }
                    }
                    archive.append(streamResponse.data, { name: finalName });
                    // Wait for the stream to be fully consumed by archiver before fetching the next one
                    // This ensures we only have 1 active HTTP connection to Google Drive at a time
                    await new Promise((resolve) => {
                        streamResponse.data.on('end', resolve);
                        streamResponse.data.on('error', resolve);
                    });
                }
                catch (error) {
                    console.error(`Failed to download and zip file: ${f.path}`, error);
                    // Skip the failing file and continue so the zip successfully finalizes
                }
            }
            await archive.finalize();
        }
        else {
            // Pipe the google drive stream directly to the express response
            result.stream.pipe(res);
        }
    });
    moveFile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const id = req.params.id;
        const { newParentId } = req.body;
        const userId = req.user.id;
        if (!newParentId) {
            throw new AppError_1.AppError('newParentId is required', 400);
        }
        const updatedFile = await file_service_1.fileService.moveFile(id, newParentId, userId);
        res.status(200).json({
            status: 'success',
            data: { file: updatedFile }
        });
    });
    createFolder = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const { name, parentId, accountId } = req.body;
        const userId = req.user.id;
        if (!name) {
            throw new AppError_1.AppError('Folder name is required', 400);
        }
        if (!accountId) {
            throw new AppError_1.AppError('accountId is required', 400);
        }
        const folder = await file_service_1.fileService.createFolder(accountId, userId, name, parentId || 'root');
        res.status(201).json({
            status: 'success',
            data: { folder }
        });
    });
    createFoldersBatch = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const { paths, parentId, accountId } = req.body;
        const userId = req.user.id;
        if (!Array.isArray(paths)) {
            throw new AppError_1.AppError('paths must be an array of strings', 400);
        }
        if (!accountId) {
            throw new AppError_1.AppError('accountId is required', 400);
        }
        const folderMap = await file_service_1.fileService.createFoldersBatch(accountId, userId, paths, parentId || 'root');
        res.status(201).json({
            status: 'success',
            data: { folderMap }
        });
    });
    deleteFile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const id = req.params.id;
        const userId = req.user.id;
        await file_service_1.fileService.deleteFile(id, userId);
        res.status(204).send();
    });
    uploadFile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const accountId = req.params.accountId;
        const parentId = req.body.parentId || 'root';
        const userId = req.user?.id;
        const file = req.file;
        if (!userId)
            throw new AppError_1.AppError('Unauthorized', 401);
        if (!file)
            throw new AppError_1.AppError('No file provided', 400);
        // fileService will handle the cleanup using a finally block!
        const result = await file_service_1.fileService.uploadFile(accountId, parentId, file.path, file.originalname, file.mimetype, file.size, userId);
        res.status(201).json({
            status: 'success',
            data: { file: result }
        });
    });
}
exports.FileController = FileController;
exports.fileController = new FileController();
