import { prisma } from '../database/prisma';
import * as googleProvider from '../providers/google.provider';
import fs from 'fs';
import { listFiles, getDriveQuota, renameFile as renameDriveFile, downloadFileStream, moveFile as moveDriveFile, createFolder as createDriveFolder, trashFile, getStartPageToken, listChanges } from '../providers/google.provider';
import { AppError } from '../utils/AppError';

export class FileService {
  async syncFiles(cloudAccountId: string, userId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, userId },
    });

    if (!account) {
      throw new AppError('Cloud account not found', 404);
    }

    if (account.provider === 'google-drive') {
      if (!account.accessToken) {
        throw new AppError('Account not authenticated', 401);
      }

      if (account.syncStatus === 'syncing') {
        return { count: 0, message: 'Sync already in progress' };
      }

      try {
        // Mark as syncing
        await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { syncStatus: 'syncing', syncError: null }
        });

        // Fetch from Google
        const { files: driveFiles, rootFolderId } = await listFiles(account.accessToken, account.refreshToken);

        try {
          const quota = await getDriveQuota(account.accessToken, account.refreshToken);
          if (quota) {
            await prisma.cloudAccount.update({
              where: { id: account.id },
              data: { 
                storageUsed: quota.usage ? BigInt(quota.usage) : null,
                storageTotal: quota.limit ? BigInt(quota.limit) : null,
              }
            });
          }
        } catch (e) {
          console.error('Failed to update drive quota during sync', e);
        }

        // Build a set of all file IDs we fetched (used to validate parentId references)
        const validIds = new Set(driveFiles.map((f: any) => f.id));

        // We'll perform a transaction: delete old files, insert new files.
        await prisma.$transaction(async (tx) => {
          // Delete existing files for this account
          await tx.file.deleteMany({
            where: { cloudAccountId },
          });

          // Insert new files
          const data = driveFiles.map((f: any) => {
            // Determine the parentId:
            // - If parent is the Drive root folder ID -> null (it's at root level)
            // - If parent exists in our file set -> keep it (it's a real subfolder)
            // - If parent doesn't exist in our file set -> null (orphan reference)
            let parentId: string | null = null;
            if (f.parents && f.parents.length > 0) {
              const rawParent = f.parents[0];
              if (rawParent === rootFolderId) {
                parentId = null; // Root-level file
              } else if (validIds.has(rawParent)) {
                parentId = rawParent; // Valid subfolder
              } else {
                parentId = null; // Orphan (parent not in our dataset)
              }
            }

            return {
              providerFileId: f.id as string,
              provider: account.provider,
              name: f.name as string,
              mimeType: f.mimeType as string,
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
        const syncToken = await getStartPageToken(account.accessToken, account.refreshToken);

        await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { 
            syncStatus: 'completed',
            lastSyncedAt: new Date(),
            fileCount: driveFiles.length,
            syncToken
          }
        });

        return { count: driveFiles.length };
      } catch (error: any) {
        console.error('Sync failed:', error);
        await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { 
            syncStatus: 'failed',
            syncError: error.message || 'Unknown error occurred during sync'
          }
        });
        throw new AppError('File sync failed', 500);
      }
    }

    throw new AppError('Provider sync not implemented', 501);
  }

  async incrementalSync(cloudAccountId: string, userId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, userId },
    });

    if (!account) throw new AppError('Cloud account not found', 404);

    if (account.provider === 'google-drive') {
      if (!account.accessToken) throw new AppError('Account not authenticated', 401);
      
      if (account.syncStatus === 'syncing') {
        return { count: 0, message: 'Sync already in progress' };
      }

      if (!account.syncToken) return this.syncFiles(cloudAccountId, userId);

      try {
        const { changes, newStartPageToken } = await listChanges(account.accessToken, account.refreshToken, account.syncToken);

        if (changes.length > 0) {
          const existingFiles = await prisma.file.findMany({
            where: { cloudAccountId: account.id },
            select: { providerFileId: true }
          });
          const validIds = new Set(existingFiles.map(f => f.providerFileId));
          
          await prisma.$transaction(async (tx) => {
            for (const change of changes) {
              const providerFileId = change.fileId;
              
              if (change.removed || (change.file && change.file.trashed)) {
                await tx.file.deleteMany({
                  where: { cloudAccountId: account.id, providerFileId }
                });
                validIds.delete(providerFileId);
              } else if (change.file) {
                const f = change.file;
                
                let parentId: string | null = null;
                if (f.parents && f.parents.length > 0) {
                  const rawParent = f.parents[0];
                  if (validIds.has(rawParent)) {
                    parentId = rawParent;
                  }
                }
                
                const data = {
                  providerFileId: f.id as string,
                  provider: account.provider,
                  name: f.name as string,
                  mimeType: f.mimeType as string,
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
                } else {
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
        } else if (newStartPageToken && newStartPageToken !== account.syncToken) {
          await prisma.cloudAccount.update({
            where: { id: account.id },
            data: { syncToken: newStartPageToken, lastSyncedAt: new Date() }
          });
        }
        
        return { count: changes.length };
      } catch (error: any) {
        console.error('Incremental sync failed:', error);
        throw new AppError('Incremental file sync failed', 500);
      }
    }
    
    throw new AppError('Provider sync not implemented', 501);
  }

  async getFiles(cloudAccountId: string | undefined, userId: string, folderId: string = 'root', limit: number = 50, cursor?: string, type?: 'folder' | 'file') {
    const accountFilter = cloudAccountId ? { id: cloudAccountId, userId } : { userId };
    
    const accounts = await prisma.cloudAccount.findMany({
      where: accountFilter,
      select: { id: true },
    });
    
    const accountIds = accounts.map(a => a.id);

    if (accountIds.length === 0) {
      return { files: [], nextCursor: null };
    }

    const whereClause: any = {
      cloudAccountId: { in: accountIds },
    };

    if (folderId === 'root') {
      whereClause.parentId = null;
      whereClause.isShared = false;
    } else {
      let targetParentId = folderId;
      const folderRecord = await prisma.file.findFirst({
        where: { 
          OR: [{ id: folderId }, { providerFileId: folderId }], 
          cloudAccountId: { in: accountIds } 
        },
        select: { providerFileId: true }
      });
      if (folderRecord) {
        targetParentId = folderRecord.providerFileId;
      }
      whereClause.parentId = targetParentId;
    }

    if (type === 'folder') {
      whereClause.isFolder = true;
    } else if (type === 'file') {
      whereClause.isFolder = false;
    }

    const files = await prisma.file.findMany({
      where: whereClause,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: [
        { isFolder: 'desc' },
        { name: 'asc' }
      ],
    });

    let nextCursor: string | null = null;
    if (files.length > limit) {
      const nextItem = files.pop();
      nextCursor = nextItem!.id;
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

  async searchFiles(cloudAccountId: string | undefined, userId: string, query: string, limit: number = 50, cursor?: string) {
    const accountFilter = cloudAccountId ? { id: cloudAccountId, userId } : { userId };
    
    const accounts = await prisma.cloudAccount.findMany({
      where: accountFilter,
      select: { id: true },
    });
    
    const accountIds = accounts.map(a => a.id);

    if (accountIds.length === 0) {
      return { files: [], nextCursor: null };
    }

    const files = await prisma.file.findMany({
      where: {
        cloudAccountId: { in: accountIds },
        name: { contains: query, mode: 'insensitive' }
      },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { modifiedTime: 'desc' },
    });

    let nextCursor: string | null = null;
    if (files.length > limit) {
      const nextItem = files.pop();
      nextCursor = nextItem!.id;
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

  async getFolderPath(folderId: string, userId: string) {
    if (folderId === 'root') return [];

    let currentId: string | null = folderId;

    const startFolder = await prisma.file.findFirst({
      where: {
        OR: [{ id: folderId }, { providerFileId: folderId }],
        cloudAccount: { userId }
      },
      select: { providerFileId: true }
    });

    if (startFolder) {
      currentId = startFolder.providerFileId;
    }

    const path = [];
    const visited = new Set<string>();
    
    while (currentId && currentId !== 'root' && !visited.has(currentId)) {
      visited.add(currentId);
      const folder: any = await prisma.file.findFirst({
        where: { providerFileId: currentId, cloudAccount: { userId } },
        select: { id: true, name: true, parentId: true }
      });
      if (!folder) break;
      
      path.unshift({ id: folder.id, label: folder.name });
      currentId = folder.parentId;
    }
    
    return path;
  }

  async getThumbnailUrl(fileId: string, userId: string): Promise<{ url: string; accessToken: string } | null> {
    const file = await prisma.file.findFirst({
      where: { id: fileId, cloudAccount: { userId } },
      include: { cloudAccount: true },
    });

    if (!file || !file.hasThumbnail) {
      return null;
    }

    if (file.provider === 'google-drive') {
      const { getThumbnailLink } = await import('../providers/google.provider');
      let url = await getThumbnailLink(file.cloudAccount.accessToken!, file.cloudAccount.refreshToken, file.providerFileId);
      if (url) {
        // Google Drive thumbnailLinks default to 220px width (e.g. =s220)
        // We replace it with =s512 for high-resolution images in the grid and inspector
        url = url.replace(/=s\d+$/, '=s512');
        return { url, accessToken: file.cloudAccount.accessToken! };
      }
      return null;
    }

    return null;
  }

  async renameFile(id: string, userId: string, newName: string) {
    // 1. Fetch file from our DB
    const file = await prisma.file.findUnique({
      where: { id },
      include: { cloudAccount: true }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    if (file.cloudAccount.userId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    const { cloudAccount } = file;

    // 2. Perform the actual rename on the cloud provider
    if (cloudAccount.provider === 'google-drive') {
      if (!cloudAccount.accessToken) {
        throw new AppError('Account not authenticated', 401);
      }
      
      let updatedDriveFile;
      try {
        updatedDriveFile = await renameDriveFile(
          cloudAccount.accessToken,
          cloudAccount.refreshToken,
          file.providerFileId,
          newName
        );
      } catch (error: any) {
        if (error.response?.status === 403) {
          throw new AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
        }
        throw new AppError(error.message || 'Failed to rename file on Google Drive', 500);
      }
      // 3. Update local DB
      const updatedFile = await prisma.file.update({
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
    } else {
      throw new AppError('Provider rename not supported', 400);
    }
  }

  async downloadFile(id: string, userId: string) {
    const file = await prisma.file.findUnique({
      where: { id },
      include: { cloudAccount: true }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    if (file.cloudAccount.userId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    const { cloudAccount } = file;

    if (cloudAccount.provider === 'google-drive') {
      if (!cloudAccount.accessToken) {
        throw new AppError('Account not authenticated', 401);
      }
      
      if (file.isFolder) {
        const getDescendants = async (parentId: string, currentPath: string): Promise<{dbFile: any, path: string}[]> => {
          const children = await prisma.file.findMany({ where: { parentId, cloudAccountId: cloudAccount.id }});
          let result: {dbFile: any, path: string}[] = [];
          for (const child of children) {
            if (child.isFolder) {
              result = result.concat(await getDescendants(child.providerFileId, `${currentPath}${child.name}/`));
            } else {
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
        } as any;
      }

      try {
        const streamResponse = await downloadFileStream(
          cloudAccount.accessToken,
          cloudAccount.refreshToken,
          file.providerFileId,
          file.mimeType
        );

        let finalName = file.name;
        // Append correct extension if it was a Google Workspace file being exported
        if (file.mimeType === 'application/vnd.google-apps.document' && !finalName.endsWith('.docx')) {
          finalName += '.docx';
        } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet' && !finalName.endsWith('.xlsx')) {
          finalName += '.xlsx';
        } else if (file.mimeType === 'application/vnd.google-apps.presentation' && !finalName.endsWith('.pptx')) {
          finalName += '.pptx';
        }

        return {
          stream: streamResponse.data,
          filename: finalName,
          // We don't strictly set content type here, we let the frontend or express handle it based on extension
        };
      } catch (error: any) {
        if (error.response?.status === 403) {
          throw new AppError('Permission denied. You must remove and re-add your account to grant write/download access.', 403);
        }
        throw new AppError(error.message || 'Failed to download file from Google Drive', 500);
      }
    } else {
      throw new AppError('Provider download not supported', 400);
    }
  }

  async moveFile(id: string, newParentId: string, userId: string) {
    const file = await prisma.file.findUnique({
      where: { id },
      include: { cloudAccount: true }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    if (file.cloudAccount.userId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    const { cloudAccount } = file;

    // We must find the new parent folder to get its providerFileId
    let targetProviderId = 'root';
    let localParentId = null;

    if (newParentId !== 'root') {
      const targetFolder = await prisma.file.findFirst({
        where: { 
          OR: [{ id: newParentId }, { providerFileId: newParentId }], 
          cloudAccountId: cloudAccount.id 
        }
      });

      if (!targetFolder || !targetFolder.isFolder) {
        throw new AppError('Target folder not found or is not a folder', 400);
      }
      
      targetProviderId = targetFolder.providerFileId;
      localParentId = targetFolder.id;
    }

    if (cloudAccount.provider === 'google-drive') {
      if (!cloudAccount.accessToken) {
        throw new AppError('Account not authenticated', 401);
      }
      
      try {
        const updatedDriveFile = await moveDriveFile(
          cloudAccount.accessToken,
          cloudAccount.refreshToken,
          file.providerFileId,
          targetProviderId
        );

        // Update local DB
        const updatedFile = await prisma.file.update({
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
      } catch (error: any) {
        if (error.response?.status === 403) {
          throw new AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
        }
        throw new AppError(error.message || 'Failed to move file on Google Drive', 500);
      }
    } else {
      throw new AppError('Provider move not supported', 400);
    }
  }

  async createFolder(accountId: string, userId: string, folderName: string, parentProviderId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) throw new AppError('Cloud account not found', 404);
    if (!account.accessToken) throw new AppError('Account not authenticated', 401);

    if (account.provider === 'google-drive') {
      try {
        let resolvedProviderParentId = parentProviderId;
        if (parentProviderId !== 'root') {
          const parentRecord = await prisma.file.findFirst({
            where: { 
              OR: [{ id: parentProviderId }, { providerFileId: parentProviderId }], 
              cloudAccountId: account.id 
            }
          });
          if (parentRecord) {
            resolvedProviderParentId = parentRecord.providerFileId;
          }
        }

        const { createFolder: createDriveFolder } = await import('../providers/google.provider');
        const driveFolder = await createDriveFolder(
          account.accessToken,
          account.refreshToken,
          folderName,
          resolvedProviderParentId
        );

        // Create local DB record
        const newFolder = await prisma.file.create({
          data: {
            providerFileId: driveFolder.id as string,
            provider: account.provider,
            name: driveFolder.name as string,
            mimeType: driveFolder.mimeType as string,
            size: BigInt(0),
            parentId: resolvedProviderParentId === 'root' ? null : resolvedProviderParentId,
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
      } catch (error: any) {
        throw new AppError(error.message || 'Failed to create folder on Google Drive', 500);
      }
    } else {
      throw new AppError('Provider create folder not supported', 400);
    }
  }

  async createFoldersBatch(accountId: string, userId: string, paths: string[], parentProviderId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) throw new AppError('Cloud account not found', 404);
    if (!account.accessToken) throw new AppError('Account not authenticated', 401);
    if (account.provider !== 'google-drive') throw new AppError('Provider not supported', 400);

    let resolvedProviderParentId = parentProviderId;
    if (parentProviderId !== 'root') {
      const parentRecord = await prisma.file.findFirst({
        where: { 
          OR: [{ id: parentProviderId }, { providerFileId: parentProviderId }], 
          cloudAccountId: account.id 
        }
      });
      if (parentRecord) {
        resolvedProviderParentId = parentRecord.providerFileId;
      }
    }

    // Sort paths by depth (number of slashes) so parents are created before children
    const sortedPaths = [...paths].sort((a, b) => a.split('/').length - b.split('/').length);
    
    // Map of full path string to its Google Drive folderId
    const folderIdMap: Record<string, string> = {
      '': resolvedProviderParentId
    };

    // Process sequentially to ensure parent exists before child
    for (const path of sortedPaths) {
      const parts = path.split('/');
      const folderName = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      
      const parentProviderId = folderIdMap[parentPath];
      
      if (!parentProviderId) {
        throw new AppError(`Missing parent folder ID for path: ${path}`, 500);
      }

      // Check if this specific folder already exists in our DB to avoid duplicates
      const existing = await prisma.file.findFirst({
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
        const { createFolder: createDriveFolder } = await import('../providers/google.provider');
        const driveFolder = await createDriveFolder(
          account.accessToken,
          account.refreshToken,
          folderName,
          parentProviderId
        );

        // Save to PostgreSQL immediately
        const newFolder = await prisma.file.create({
          data: {
            providerFileId: driveFolder.id as string,
            provider: account.provider,
            name: driveFolder.name as string,
            mimeType: driveFolder.mimeType as string,
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
      } catch (error: any) {
        console.error(`Failed to create folder ${path}`, error);
        throw new AppError(`Failed to create folder ${path} on Google Drive`, 500);
      }
    }
    
    return folderIdMap;
  }

  async deleteFile(id: string, userId: string) {
    const file = await prisma.file.findUnique({
      where: { id },
      include: { cloudAccount: true }
    });

    if (!file) {
      throw new AppError('File not found', 404);
    }

    if (file.cloudAccount.userId !== userId) {
      throw new AppError('Unauthorized', 403);
    }

    const { cloudAccount } = file;

    if (cloudAccount.provider === 'google-drive') {
      if (!cloudAccount.accessToken) {
        throw new AppError('Account not authenticated', 401);
      }
      
      try {
        const { trashFile } = await import('../providers/google.provider');
        await trashFile(
          cloudAccount.accessToken,
          cloudAccount.refreshToken,
          file.providerFileId
        );

        // Delete local DB record
        await prisma.file.delete({
          where: { id }
        });

        return { success: true };
      } catch (error: any) {
        if (error.response?.status === 403) {
          throw new AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
        }
        throw new AppError(error.message || 'Failed to delete file on Google Drive', 500);
      }
    } else {
      throw new AppError('Provider delete not supported', 400);
    }
  }

  async uploadFile(accountId: string, parentId: string, filePath: string, originalName: string, mimeType: string, size: number, userId: string) {
    const account = await prisma.cloudAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) throw new Error('Account not found');
    if (account.userId !== userId) throw new Error('Unauthorized');
    if (!account.accessToken) throw new Error('Account not authenticated');

    try {
      let resolvedProviderParentId = parentId;
      if (parentId !== 'root') {
        const parentRecord = await prisma.file.findFirst({
          where: { 
            OR: [{ id: parentId }, { providerFileId: parentId }], 
            cloudAccountId: account.id 
          }
        });
        if (parentRecord) {
          resolvedProviderParentId = parentRecord.providerFileId;
        }
      }

      // 1. Upload to Google Drive (Provider handles 403 / quotaExceeded errors by throwing)
      const driveFile = await googleProvider.uploadFile(
        account.accessToken,
        account.refreshToken,
        originalName,
        mimeType,
        filePath,
        resolvedProviderParentId
      );

      // 3. Insert into our PostgreSQL DB so it appears instantly
      const dbFile = await prisma.file.create({
        data: {
          name: driveFile.name || originalName,
          providerFileId: driveFile.id!,
          isFolder: false,
          provider: account.provider,
          mimeType: driveFile.mimeType || mimeType,
          size: BigInt(parseInt(driveFile.size || size.toString(), 10) || size),
          hasThumbnail: !!driveFile.thumbnailLink,
          cloudAccountId: account.id,
          parentId: resolvedProviderParentId === 'root' ? null : resolvedProviderParentId,
          modifiedTime: driveFile.modifiedTime ? new Date(driveFile.modifiedTime) : new Date(),
        }
      });

      return { ...dbFile, size: Number(dbFile.size) };
    } finally {
      // 4. Guaranteed to run whether upload succeeds OR throws an error! (Prevents disk leaks)
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(console.error);
      }
    }
  }
}

export const fileService = new FileService();
