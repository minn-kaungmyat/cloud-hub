import { Request, Response } from 'express';
import { fileService } from '../services/file.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import archiver = require('archiver');
import { ProviderFactory } from '../providers/provider.factory';

export class FileController {
  
  syncFiles = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;
    const userId = req.user!.id;
    
    const result = await fileService.syncFiles(accountId, userId);
    
    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

  incrementalSync = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;
    const userId = req.user!.id;
    
    const result = await fileService.incrementalSync(accountId, userId);
    
    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

  getFiles = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.query.accountId as string | undefined;
    const folderId = req.query.folderId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const cursor = req.query.cursor as string | undefined;
    const type = req.query.type as 'folder' | 'file' | undefined;
    const userId = req.user!.id;
    
    const result = await fileService.getFiles(accountId, userId, folderId, limit, cursor, type);
    
    res.status(200).json({
      status: 'success',
      data: result
    });
  });

  browseFiles = asyncHandler(async (req: Request, res: Response) => {
    const filters = req.body;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const cursor = req.query.cursor as string | undefined;
    const userId = req.user!.id;
    
    const result = await fileService.advancedBrowse(userId, filters, limit, cursor);
    
    res.status(200).json({
      status: 'success',
      data: result
    });
  });

  searchFiles = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.query.accountId as string | undefined;
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const cursor = req.query.cursor as string | undefined;
    const userId = req.user!.id;
    
    if (!query) {
      return res.status(200).json({ status: 'success', data: { files: [], nextCursor: null } });
    }

    const result = await fileService.searchFiles(accountId, userId, query, limit, cursor);
    
    res.status(200).json({
      status: 'success',
      data: result
    });
  });

  getFolderPath = asyncHandler(async (req: Request, res: Response) => {
    const folderId = req.params.folderId as string;
    const userId = req.user!.id;
    
    const path = await fileService.getFolderPath(folderId, userId);
    
    res.status(200).json({
      status: 'success',
      data: { path }
    });
  });

  getThumbnail = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const result = await fileService.getThumbnailUrl(id, userId);
    
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
    } catch (error) {
      // Fail silently for thumbnails to prevent IP bans
      res.status(204).end();
    }
  });
  renameFile = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name } = req.body;
    const userId = req.user!.id;

    if (!name) {
      throw new AppError('New name is required', 400);
    }

    const updatedFile = await fileService.renameFile(id, userId, name);

    res.status(200).json({
      status: 'success',
      data: { file: updatedFile }
    });
  });
  downloadFile = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const range = req.headers.range;

    const result = await fileService.downloadFile(id, userId, range);

    const isInline = req.query.inline === 'true';
    const disposition = isInline ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(result.filename)}"`);
    
    if (result.mimeType) {
      res.setHeader('Content-Type', result.mimeType);
    }
    
    res.setHeader('Accept-Ranges', 'bytes');
    
    let isPartial = false;
    if (range && (result as any).size) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const size = (result as any).size;
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
      const chunksize = (end - start) + 1;
      
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', chunksize);
      res.status(206);
      isPartial = true;
    } else if ((result as any).size) {
      res.setHeader('Content-Length', (result as any).size);
    }
    
    if (result.headers) {
      if (!isPartial && (result.headers['content-range'] || result.headers['Content-Range'])) {
        res.setHeader('Content-Range', result.headers['content-range'] || result.headers['Content-Range']);
      }
      if (!res.getHeader('Content-Length') && (result.headers['content-length'] || result.headers['Content-Length'])) {
        res.setHeader('Content-Length', result.headers['content-length'] || result.headers['Content-Length']);
      }
    }

    if (result.status === 206 && !isPartial) {
      res.status(206);
    }

    if ((result as any).isArchive) {
      const { filesToZip, cloudAccount } = result as any;
      const archive = (archiver as any)('zip', { zlib: { level: 9 } });

      archive.on('error', (err: any) => {
        console.error('Archiver error:', err);
      });

      res.setHeader('Content-Type', 'application/zip');
      archive.pipe(res);

      const provider = ProviderFactory.getProvider(cloudAccount.provider);

      for (const f of filesToZip) {
        try {
          const streamResponse = await provider.downloadFileStream(
            cloudAccount.accessToken,
            cloudAccount.refreshToken,
            f.dbFile.providerFileId,
            f.dbFile.mimeType
          );
          
          let finalName = f.path;
          if (cloudAccount.provider === 'google-drive') {
            if (f.dbFile.mimeType === 'application/vnd.google-apps.document' && !finalName.endsWith('.docx')) {
              finalName += '.docx';
            } else if (f.dbFile.mimeType === 'application/vnd.google-apps.spreadsheet' && !finalName.endsWith('.xlsx')) {
              finalName += '.xlsx';
            } else if (f.dbFile.mimeType === 'application/vnd.google-apps.presentation' && !finalName.endsWith('.pptx')) {
              finalName += '.pptx';
            }
          }

          archive.append(streamResponse.data, { name: finalName });
          
          // Wait for the stream to be fully consumed by archiver before fetching the next one
          // This ensures we only have 1 active HTTP connection to Google Drive at a time
          await new Promise<void>((resolve) => {
            streamResponse.data.on('end', resolve);
            streamResponse.data.on('error', resolve);
          });
        } catch (error) {
          console.error(`Failed to download and zip file: ${f.path}`, error);
          // Skip the failing file and continue so the zip successfully finalizes
        }
      }

      await archive.finalize();
    } else {
      // Pipe the google drive stream directly to the express response
      result.stream.pipe(res);
    }
  });

  moveFile = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { newParentId } = req.body;
    const userId = req.user!.id;

    if (!newParentId) {
      throw new AppError('newParentId is required', 400);
    }

    const updatedFile = await fileService.moveFile(id, newParentId, userId);

    res.status(200).json({
      status: 'success',
      data: { file: updatedFile }
    });
  });

  createFolder = asyncHandler(async (req: Request, res: Response) => {
    const { name, parentId, accountId } = req.body;
    const userId = req.user!.id;

    if (!name) {
      throw new AppError('Folder name is required', 400);
    }
    if (!accountId) {
      throw new AppError('accountId is required', 400);
    }

    const folder = await fileService.createFolder(accountId, userId, name, parentId || 'root');

    res.status(201).json({
      status: 'success',
      data: { folder }
    });
  });

  createFoldersBatch = asyncHandler(async (req: Request, res: Response) => {
    const { paths, parentId, accountId } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(paths)) {
      throw new AppError('paths must be an array of strings', 400);
    }
    if (!accountId) {
      throw new AppError('accountId is required', 400);
    }

    const folderMap = await fileService.createFoldersBatch(accountId, userId, paths, parentId || 'root');

    res.status(201).json({
      status: 'success',
      data: { folderMap }
    });
  });

  deleteFile = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user!.id;

    await fileService.deleteFile(id, userId);

    res.status(204).send();
  });

  restoreFile = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    
    const result = await fileService.restoreFile(id, userId);
    res.status(200).json({ status: 'success', data: result });
  });

  permanentlyDeleteFile = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userId = req.user!.id;
    
    await fileService.permanentlyDeleteFile(id, userId);
    res.status(204).send();
  });

  emptyTrash = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { providerNames } = req.body;
    
    await fileService.emptyTrash(userId, providerNames);
    res.status(204).send();
  });

  uploadFile = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;
    const parentId = req.body.parentId || 'root';
    const userId = req.user?.id;
    const file = req.file;

    if (!userId) throw new AppError('Unauthorized', 401);
    if (!file) throw new AppError('No file provided', 400);

    // fileService will handle the cleanup using a finally block!
    const result = await fileService.uploadFile(
      accountId, 
      parentId, 
      file.path, 
      file.originalname, 
      file.mimetype, 
      file.size, 
      userId
    );

      res.status(201).json({
      status: 'success',
      data: { file: result }
    });
  });

  createUploadSession = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;
    const { name, mimeType, parentId, size } = req.body;
    const userId = req.user?.id;

    if (!userId) throw new AppError('Unauthorized', 401);
    if (!name || !mimeType || size === undefined) throw new AppError('Missing file metadata', 400);

    const result = await fileService.createUploadSession(
      accountId,
      userId,
      name,
      mimeType,
      parentId || 'root',
      size
    );

    res.status(200).json({
      status: 'success',
      data: result
    });
  });

  completeUpload = asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.accountId as string;
    const { providerFileId, name, mimeType, size, parentId, modifiedTime, thumbnailLink } = req.body;
    const userId = req.user?.id;

    if (!userId) throw new AppError('Unauthorized', 401);
    if (!providerFileId) throw new AppError('Missing provider file ID', 400);

    const result = await fileService.completeUpload(
      accountId,
      userId,
      { providerFileId, name, mimeType, size, parentId, modifiedTime, thumbnailLink }
    );

    res.status(201).json({
      status: 'success',
      data: { file: result }
    });
  });
}

export const fileController = new FileController();
