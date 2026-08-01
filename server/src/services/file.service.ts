import { prisma } from '../database/prisma';
import fs from 'fs';
import { ProviderFactory } from '../providers/provider.factory';
import { AppError } from '../utils/AppError';
import { v4 as uuidv4 } from 'uuid';

export class FileService {
  async syncFiles(cloudAccountId: string, userId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, userId },
    });

    if (!account) {
      throw new AppError('Cloud account not found', 404);
    }

    if (!account.accessToken) throw new AppError('Account not authenticated', 401);

    if (account.syncStatus === 'syncing') {
      return { count: 0, message: 'Sync already in progress' };
    }

    try {
      const provider = ProviderFactory.getProvider(account.provider);

        // Mark as syncing
        await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { syncStatus: 'syncing', syncError: null }
        });

        // Fetch from Provider
        const { files: driveFiles, rootFolderId } = await provider.listFiles(account.accessToken!, account.refreshToken);

        try {
          const quota = await provider.getDriveQuota(account.accessToken!, account.refreshToken);
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

        // Build a mapping of providerFileId -> localUUID
        const localIdMap = new Map<string, string>();
        for (const f of driveFiles) {
          localIdMap.set(f.id as string, uuidv4());
        }

        // We'll perform a transaction: delete old files, insert new files.
        await prisma.$transaction(async (tx) => {
          // Delete existing files for this account
          await tx.file.deleteMany({
            where: { cloudAccountId },
          });

          // Insert new files
          const data = driveFiles.map((f: any) => {
            // Determine the parentId:
            let parentId: string | null = null;
            if (f.parents && f.parents.length > 0) {
              const rawParent = f.parents[0];
              if (rawParent === rootFolderId) {
                parentId = null; // Root-level file
              } else if (localIdMap.has(rawParent)) {
                parentId = localIdMap.get(rawParent)!; // Use perfectly mapped local UUID
              } else {
                parentId = null; // Orphan (parent not in our dataset)
              }
            }

            return {
              id: localIdMap.get(f.id as string)!,
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

          // Topologically sort to ensure parents are inserted before children
          const dataMap = new Map(data.map(f => [f.id, f]));
          const depths = new Map<string, number>();
          const getDepth = (id: string | null, visited = new Set<string>()): number => {
            if (!id) return 0;
            if (depths.has(id)) return depths.get(id)!;
            if (visited.has(id)) return 0; // Break cycles
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
          data.sort((a, b) => depths.get(a.id)! - depths.get(b.id)!);

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
        }, { timeout: 120000 });

        // Mark as completed and save start page token
        const syncToken = await provider.getStartPageToken(account.accessToken!, account.refreshToken);

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

  async incrementalSync(cloudAccountId: string, userId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, userId },
    });

    if (!account) throw new AppError('Cloud account not found', 404);

    if (!account.accessToken) throw new AppError('Account not authenticated', 401);

    if (account.syncStatus === 'syncing') {
      return { count: 0, message: 'Sync already in progress' };
    }

    if (!account.syncToken) return this.syncFiles(cloudAccountId, userId);

    try {
      const provider = ProviderFactory.getProvider(account.provider);
      const { changes, newStartPageToken } = await provider.listChanges(account.accessToken!, account.refreshToken, account.syncToken);

        if (changes.length > 0) {
          const existingFiles = await prisma.file.findMany({
            where: { cloudAccountId: account.id },
            select: { id: true, providerFileId: true }
          });
          const validIds = new Map(existingFiles.map(f => [f.providerFileId, f.id]));
          
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
                    parentId = validIds.get(rawParent)!;
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
                  const newId = uuidv4();
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
      whereClause.parentId = folderId;
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

  async advancedBrowse(userId: string, filters: any, limit: number = 50, cursor?: string) {
    // 1. Get user's cloud accounts to ensure they only query their own files
    const accounts = await prisma.cloudAccount.findMany({
      where: { userId },
      select: { id: true, provider: true },
    });
    
    if (accounts.length === 0) {
      return { files: [], nextCursor: null };
    }
    
    const accountIds = accounts.map(a => a.id);
    let whereClause: any = {
      cloudAccountId: { in: accountIds },
    };

    // 2. Filter by Type
    if (filters.type) {
      if (filters.type === 'image') {
        whereClause.mimeType = { startsWith: 'image/' };
      } else if (filters.type === 'video') {
        whereClause.mimeType = { startsWith: 'video/' };
      } else if (filters.type === 'audio') {
        whereClause.mimeType = { startsWith: 'audio/' };
      } else if (filters.type === 'document') {
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
    whereClause.isFolder = false;

    // 5. Determine Sorting
    let orderByClause: any = { modifiedTime: 'desc' }; // default
    if (filters.sortBy === 'date') orderByClause = { modifiedTime: filters.sortOrder || 'desc' };
    if (filters.sortBy === 'size') orderByClause = { size: filters.sortOrder || 'desc' };
    if (filters.sortBy === 'name') orderByClause = { name: filters.sortOrder || 'asc' };

    // 6. Execute Query
    const files = await prisma.file.findMany({
      where: whereClause,
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: orderByClause,
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
    const path = [];
    const visited = new Set<string>();
    
    while (currentId && currentId !== 'root' && !visited.has(currentId)) {
      visited.add(currentId);
      const folder: any = await prisma.file.findFirst({
        where: { id: currentId, cloudAccount: { userId } },
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

    if (!file.cloudAccount.accessToken) return null;

    const provider = ProviderFactory.getProvider(file.provider);
    let url = await provider.getThumbnailLink(file.cloudAccount.accessToken, file.cloudAccount.refreshToken, file.providerFileId);
    
    if (url) {
      if (file.provider === 'google-drive') {
        url = url.replace(/=s\d+$/, '=s512');
      }
      return { url, accessToken: file.cloudAccount.accessToken };
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

    if (!cloudAccount.accessToken) {
      throw new AppError('Account not authenticated', 401);
    }
    
    const provider = ProviderFactory.getProvider(cloudAccount.provider);
    
    let updatedDriveFile;
    try {
      updatedDriveFile = await provider.renameFile(
        cloudAccount.accessToken,
        cloudAccount.refreshToken,
        file.providerFileId,
        newName
      );
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
      }
      throw new AppError(error.message || `Failed to rename file on ${cloudAccount.provider}`, 500);
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
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      const streamResponse = await provider.downloadFileStream(
        cloudAccount.accessToken,
        cloudAccount.refreshToken,
        file.providerFileId,
        file.mimeType
      );

      let finalName = file.name;
      if (cloudAccount.provider === 'google-drive') {
        if (file.mimeType === 'application/vnd.google-apps.document' && !finalName.endsWith('.docx')) {
          finalName += '.docx';
        } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet' && !finalName.endsWith('.xlsx')) {
          finalName += '.xlsx';
        } else if (file.mimeType === 'application/vnd.google-apps.presentation' && !finalName.endsWith('.pptx')) {
          finalName += '.pptx';
        }
      }

      return {
        stream: streamResponse.data,
        filename: finalName,
      };
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new AppError('Permission denied. You must remove and re-add your account to grant write/download access.', 403);
      }
      throw new AppError(error.message || `Failed to download file from ${cloudAccount.provider}`, 500);
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

    if (newParentId !== 'root') {
      const targetFolder = await prisma.file.findUnique({
        where: { id: newParentId }
      });

      if (!targetFolder || !targetFolder.isFolder) {
        throw new AppError('Target folder not found or is not a folder', 400);
      }
      
      targetProviderId = targetFolder.providerFileId;
    }

    if (!cloudAccount.accessToken) {
      throw new AppError('Account not authenticated', 401);
    }
    
    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      const updatedDriveFile = await provider.moveFile(
        cloudAccount.accessToken,
        cloudAccount.refreshToken,
        file.providerFileId,
        targetProviderId
      );

      // Update local DB
      const updatedFile = await prisma.file.update({
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
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
      }
      throw new AppError(error.message || `Failed to move file on ${cloudAccount.provider}`, 500);
    }
  }

  async createFolder(accountId: string, userId: string, folderName: string, parentProviderId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) throw new AppError('Cloud account not found', 404);
    if (!account.accessToken) throw new AppError('Account not authenticated', 401);

    try {
      let targetProviderId = 'root';
      if (parentProviderId !== 'root') {
        const parentRecord = await prisma.file.findUnique({
          where: { id: parentProviderId }
        });
        if (!parentRecord) throw new AppError('Parent folder not found', 404);
        targetProviderId = parentRecord.providerFileId;
      }

      const provider = ProviderFactory.getProvider(account.provider);
      const driveFolder = await provider.createFolder(
        account.accessToken,
        account.refreshToken,
        folderName,
        targetProviderId
      );

      // Create local DB record
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

      return {
        ...newFolder,
        size: Number(newFolder.size)
      };
    } catch (error: any) {
      throw new AppError(error.message || `Failed to create folder on ${account.provider}`, 500);
    }
  }

  async createFoldersBatch(accountId: string, userId: string, paths: string[], parentProviderId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) throw new AppError('Cloud account not found', 404);
    if (!account.accessToken) throw new AppError('Account not authenticated', 401);

    let targetRootProviderId = 'root';
    if (parentProviderId !== 'root') {
      const parentRecord = await prisma.file.findUnique({
        where: { id: parentProviderId }
      });
      if (!parentRecord) throw new AppError('Root parent folder not found', 404);
      targetRootProviderId = parentRecord.providerFileId;
    }

    // Sort paths by depth (number of slashes) so parents are created before children
    const sortedPaths = [...paths].sort((a, b) => a.split('/').length - b.split('/').length);
    
    const folderProviderIdMap: Record<string, string> = {
      '': targetRootProviderId
    };
    
    const folderLocalIdMap: Record<string, string> = {
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
        throw new AppError(`Missing parent folder ID for path: ${path}`, 500);
      }

      // Check if this specific folder already exists in our DB to avoid duplicates
      const existing = await prisma.file.findFirst({
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
        const provider = ProviderFactory.getProvider(account.provider);
        const driveFolder = await provider.createFolder(
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
      } catch (error: any) {
        console.error(`Failed to create folder ${path}`, error);
        throw new AppError(`Failed to create folder ${path} on ${account.provider}`, 500);
      }
    }
    
    return folderLocalIdMap;
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

    if (!cloudAccount.accessToken) {
      throw new AppError('Account not authenticated', 401);
    }
    
    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      await provider.trashFile(
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
      throw new AppError(error.message || `Failed to delete file on ${cloudAccount.provider}`, 500);
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
      let targetProviderId = 'root';
      if (parentId !== 'root') {
        const parentRecord = await prisma.file.findUnique({
          where: { id: parentId }
        });
        if (!parentRecord) throw new AppError('Parent folder not found', 404);
        targetProviderId = parentRecord.providerFileId;
      }

      // 1. Upload to Provider
      const provider = ProviderFactory.getProvider(account.provider);
      const driveFile = await provider.uploadFile(
        account.accessToken,
        account.refreshToken,
        originalName,
        mimeType,
        filePath,
        targetProviderId
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
          parentId: parentId === 'root' ? null : parentId,
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
