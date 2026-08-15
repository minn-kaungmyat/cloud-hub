import { decryptToken } from '../utils/crypto';
import { prisma } from '../database/prisma';
import fs from 'fs';
import { ProviderFactory } from '../providers/provider.factory';
import { AppError } from '../utils/AppError';
import { v4 as uuidv4 } from 'uuid';

export class FileService {
  private async handleProviderError<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      const isAuthError =
        error.response?.status === 401 ||
        error.message?.toLowerCase().includes('invalid_grant') ||
        error.code === 401 ||
        error.code === '401';

      if (isAuthError) {
        await prisma.cloudAccount.update({
          where: { id: accountId },
          data: { syncStatus: 'failed', syncError: 'invalid_grant' },
        });
      }
      throw error;
    }
  }

  async syncFiles(cloudAccountId: string, userId: string) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, userId },
    });

    if (!account) {
      throw new AppError('Cloud account not found', 404);
    }

    if (!decryptToken(account.accessToken)!) throw new AppError('Account not authenticated', 401);

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

        try {
          const quota = await provider.getDriveQuota(decryptToken(account.accessToken)!, decryptToken(account.refreshToken));
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

      // Clear out the old files
      await prisma.file.deleteMany({
        where: { cloudAccountId },
      });

      let totalFiles = 0;
      let rootFolderId = '';
      const localIdMap = new Map<string, string>();
      const getLocalId = (providerId: string) => {
        if (!localIdMap.has(providerId)) localIdMap.set(providerId, uuidv4());
        return localIdMap.get(providerId)!;
      };

      const relationships: { childId: string, parentProviderId: string }[] = [];

      for await (const page of provider.listFiles(decryptToken(account.accessToken)!, decryptToken(account.refreshToken))) {
        if (page.rootFolderId) rootFolderId = page.rootFolderId;
        
        const data = page.files.map((f: any) => {
          const childId = getLocalId(f.id as string);
          
          if (f.parents && f.parents.length > 0) {
             const rawParent = f.parents[0];
             if (rawParent !== rootFolderId) {
                relationships.push({ childId, parentProviderId: rawParent });
             }
          }
          
          return {
            id: childId,
            providerFileId: f.id as string,
            provider: account.provider,
            name: f.name as string || 'Unknown',
            mimeType: (f.name?.toLowerCase().endsWith('.ts') ? ((f.size ? BigInt(f.size) : BigInt(0)) > 5 * 1024 * 1024 ? 'video/mp2t' : 'application/typescript') : (f.mimeType as string || 'application/octet-stream')),
            size: f.size ? BigInt(f.size) : BigInt(0),
            parentId: null, // We'll link parents in pass 2
            modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
            hasThumbnail: !!f.thumbnailLink,
            isFolder: f.mimeType === 'application/vnd.google-apps.folder',
            isShared: f.ownedByMe === false,
            isTrashed: f.trashed === true,
            cloudAccountId: account.id,
          };
        });

        if (data.length > 0) {
          await prisma.file.createMany({ data });
          totalFiles += data.length;
        }
      }

      // Pass 2: Resolve parent relationships
      if (relationships.length > 0) {
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < relationships.length; i += CHUNK_SIZE) {
          const chunk = relationships.slice(i, i + CHUNK_SIZE);
          await prisma.$transaction(
            chunk.map(rel => {
              const parentId = localIdMap.get(rel.parentProviderId);
              if (parentId) {
                return prisma.file.update({
                  where: { id: rel.childId },
                  data: { parentId }
                });
              }
              // Skip orphans or parents not in map by returning a dummy promise
              return prisma.file.findUnique({ where: { id: '00000000-0000-0000-0000-000000000000' } });
            })
          );
        }
      }

      // Mark as completed and save start page token
      const syncToken = await provider.getStartPageToken(decryptToken(account.accessToken)!, decryptToken(account.refreshToken));

      await prisma.cloudAccount.update({
        where: { id: account.id },
        data: { 
          syncStatus: 'completed',
          lastSyncedAt: new Date(),
          fileCount: totalFiles,
          syncToken
        }
      });

      return { count: totalFiles };
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

    if (!decryptToken(account.accessToken)!) throw new AppError('Account not authenticated', 401);

    if (account.syncStatus === 'syncing') {
      return { count: 0, message: 'Sync already in progress' };
    }

    if (!account.syncToken) return this.syncFiles(cloudAccountId, userId);

    try {
      const provider = ProviderFactory.getProvider(account.provider);
      
      let finalSyncToken = account.syncToken;
      let hasChanges = false;

      const existingFiles = await prisma.file.findMany({
        where: { cloudAccountId: account.id },
        select: { id: true, providerFileId: true }
      });
      const validIds = new Map(existingFiles.map(f => [f.providerFileId, f.id]));

      for await (const page of provider.listChanges(decryptToken(account.accessToken)!, decryptToken(account.refreshToken), account.syncToken!)) {
        const { changes, newStartPageToken } = page;
        if (newStartPageToken) finalSyncToken = newStartPageToken;
        if (changes.length === 0) continue;
        
        hasChanges = true;

        await prisma.$transaction(async (tx) => {
          for (const change of changes) {
            const providerFileId = change.fileId;
            
            if (change.removed) {
              if (providerFileId) {
                await tx.file.deleteMany({
                  where: { cloudAccountId: account.id, providerFileId }
                });
                validIds.delete(providerFileId);
              }
            } else if (change.file) {
              const f = change.file;
              
              let parentId: string | null = null;
              if (f.parents && f.parents.length > 0) {
                const rawParent = f.parents[0];
                if (validIds.has(rawParent)) {
                  parentId = validIds.get(rawParent)!;
                }
              }
              
              const data: any = {
                providerFileId: f.id as string,
                provider: account.provider,
                isTrashed: f.trashed === true,
                cloudAccountId: account.id,
              };

              if (f.name !== undefined) data.name = f.name as string;
              if (f.mimeType !== undefined) data.mimeType = (f.name?.toLowerCase().endsWith('.ts') ? ((f.size ? BigInt(f.size) : BigInt(0)) > 5 * 1024 * 1024 ? 'video/mp2t' : 'application/typescript') : (f.mimeType as string));
              if (f.size !== undefined) data.size = f.size ? BigInt(f.size) : BigInt(0);
              if (parentId !== undefined) data.parentId = parentId;
              if (f.modifiedTime !== undefined) data.modifiedTime = f.modifiedTime ? new Date(f.modifiedTime) : new Date();
              if (f.thumbnailLink !== undefined) data.hasThumbnail = !!f.thumbnailLink;
              if (f.mimeType !== undefined) data.isFolder = f.mimeType === 'application/vnd.google-apps.folder';
              if (f.ownedByMe !== undefined) data.isShared = f.ownedByMe === false;
              
              const existing = await tx.file.findFirst({
                where: { cloudAccountId: account.id, providerFileId }
              });
              
              if (existing) {
                await tx.file.update({
                  where: { id: existing.id },
                  data
                });
              } else {
                // If it doesn't exist but it's trashed with no name, skip it
                if (!f.name) continue;
                const newId = uuidv4();
                await tx.file.create({ data: { id: newId, ...data } });
                validIds.set(providerFileId, newId);
              }
            }
          }
        }, { timeout: 30000 });
      }

      if (hasChanges || (finalSyncToken && finalSyncToken !== account.syncToken)) {
        const count = await prisma.file.count({ where: { cloudAccountId: account.id } });
        await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { 
            fileCount: count,
            syncToken: finalSyncToken,
            lastSyncedAt: new Date()
          }
        });
      }
        
        // Always fetch the latest storage quota to correct any drift from external changes
        try {
          const quota = await provider.getDriveQuota(decryptToken(account.accessToken)!, decryptToken(account.refreshToken));
          if (quota && quota.usage) {
            await prisma.cloudAccount.update({
              where: { id: account.id },
              data: { storageUsed: BigInt(quota.usage) }
            });
          }
        } catch (e) {
          console.error('Failed to fetch quota during incremental sync:', e);
        }
        
        return { success: true };
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
      isTrashed: false,
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
      isTrashed: filters.isTrashed || false,
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
    if (!filters.isTrashed) {
      whereClause.isFolder = false;
    }

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
        name: { contains: query, mode: 'insensitive' },
        isTrashed: false,
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

    if (!decryptToken(file.cloudAccount.accessToken)!) return null;

    const provider = ProviderFactory.getProvider(file.provider);
    let url = await this.handleProviderError(file.cloudAccountId, () => 
      provider.getThumbnailLink(decryptToken(file.cloudAccount.accessToken)!, decryptToken(file.cloudAccount.refreshToken), file.providerFileId)
    );
    
    if (url) {
      if (file.provider === 'google-drive') {
        url = url.replace(/=s\d+$/, '=s512');
      }
      return { url, accessToken: decryptToken(file.cloudAccount.accessToken)! };
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

    if (!decryptToken(cloudAccount.accessToken)!) {
      throw new AppError('Account not authenticated', 401);
    }
    
    const provider = ProviderFactory.getProvider(cloudAccount.provider);
    
    let updatedDriveFile;
    try {
      updatedDriveFile = await this.handleProviderError(cloudAccount.id, () => 
        provider.renameFile(
          decryptToken(cloudAccount.accessToken)!,
          decryptToken(cloudAccount.refreshToken),
          file.providerFileId,
          newName
        )
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

  async downloadFile(id: string, userId: string, range?: string) {
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

    if (!decryptToken(cloudAccount.accessToken)!) {
      throw new AppError('Account not authenticated', 401);
    }
    
    if (file.isFolder) {
      const getDescendants = async (parentId: string, currentPath: string): Promise<{dbFile: any, path: string}[]> => {
        const children = await prisma.file.findMany({ where: { parentId, cloudAccountId: cloudAccount.id }});
        let result: {dbFile: any, path: string}[] = [];
        for (const child of children) {
          if (child.isFolder) {
            result = result.concat(await getDescendants(child.id, `${currentPath}${child.name}/`));
          } else {
            result.push({ dbFile: child, path: `${currentPath}${child.name}` });
          }
        }
        return result;
      };

      const filesToZip = await getDescendants(file.id, `${file.name}/`);

      return {
        isArchive: true,
        filesToZip,
        filename: `${file.name}.zip`,
        cloudAccount
      } as any;
    }

    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      const streamResponse = await this.handleProviderError(cloudAccount.id, () =>
        provider.downloadFileStream(
          decryptToken(cloudAccount.accessToken)!,
          decryptToken(cloudAccount.refreshToken),
          file.providerFileId,
          file.mimeType,
          range
        )
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
        mimeType: file.mimeType,
        status: streamResponse.status,
        headers: streamResponse.headers || {},
        size: Number(file.size)
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

    if (!decryptToken(cloudAccount.accessToken)!) {
      throw new AppError('Account not authenticated', 401);
    }
    
    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      const updatedDriveFile = await this.handleProviderError(cloudAccount.id, () =>
        provider.moveFile(
          decryptToken(cloudAccount.accessToken)!,
          decryptToken(cloudAccount.refreshToken),
          file.providerFileId,
          targetProviderId
        )
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
    if (!decryptToken(account.accessToken)!) throw new AppError('Account not authenticated', 401);

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
      const driveFolder = await this.handleProviderError(account.id, () =>
        provider.createFolder(
          decryptToken(account.accessToken)!,
          decryptToken(account.refreshToken),
          folderName,
          targetProviderId
        )
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
    if (!decryptToken(account.accessToken)!) throw new AppError('Account not authenticated', 401);

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
          decryptToken(account.accessToken)!,
          decryptToken(account.refreshToken),
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

    if (!decryptToken(cloudAccount.accessToken)!) {
      throw new AppError('Account not authenticated', 401);
    }
    
    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      await provider.trashFile(
        decryptToken(cloudAccount.accessToken)!,
        decryptToken(cloudAccount.refreshToken),
        file.providerFileId
      );

      // Soft delete local DB record
      await prisma.file.update({
        where: { id },
        data: { isTrashed: true }
      });

      return { success: true };
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new AppError('Permission denied. You must remove and re-add your account to grant write access.', 403);
      }
      throw new AppError(error.message || `Failed to delete file on ${cloudAccount.provider}`, 500);
    }
  }

  async restoreFile(id: string, userId: string) {
    const file = await prisma.file.findUnique({
      where: { id },
      include: { cloudAccount: true }
    });

    if (!file) throw new AppError('File not found', 404);
    if (file.cloudAccount.userId !== userId) throw new AppError('Unauthorized', 403);

    const { cloudAccount } = file;
    if (!decryptToken(cloudAccount.accessToken)!) throw new AppError('Account not authenticated', 401);

    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      const res = await provider.restoreFile(
        decryptToken(cloudAccount.accessToken)!,
        decryptToken(cloudAccount.refreshToken),
        file.providerFileId
      );

      // If it's OneDrive and returned a fallback, we keep it trashed locally until sync? 
      // Actually, if we return a fallbackUrl, we don't update local state, because the user has to do it manually.
      if (res && res.fallbackUrl) {
        return res;
      }

      await prisma.file.update({
        where: { id },
        data: { isTrashed: false }
      });

      return { success: true };
    } catch (error: any) {
      throw new AppError(error.message || `Failed to restore file on ${cloudAccount.provider}`, 500);
    }
  }

  async permanentlyDeleteFile(id: string, userId: string) {
    const file = await prisma.file.findUnique({
      where: { id },
      include: { cloudAccount: true }
    });

    if (!file) throw new AppError('File not found', 404);
    if (file.cloudAccount.userId !== userId) throw new AppError('Unauthorized', 403);

    const { cloudAccount } = file;
    if (!decryptToken(cloudAccount.accessToken)!) throw new AppError('Account not authenticated', 401);

    try {
      const provider = ProviderFactory.getProvider(cloudAccount.provider);
      await provider.permanentlyDeleteFile(
        decryptToken(cloudAccount.accessToken)!,
        decryptToken(cloudAccount.refreshToken),
        file.providerFileId
      );

      await prisma.file.delete({
        where: { id }
      });

      if (cloudAccount.storageUsed !== null && file.size) {
        await prisma.cloudAccount.update({
          where: { id: cloudAccount.id },
          data: { storageUsed: { decrement: file.size } }
        });
      }

      return { success: true };
    } catch (error: any) {
      throw new AppError(error.message || `Failed to permanently delete file on ${cloudAccount.provider}`, 500);
    }
  }

  async emptyTrash(userId: string, providerNames: string[]) {
    if (!providerNames || providerNames.length === 0) return { success: true };

    const accounts = await prisma.cloudAccount.findMany({
      where: { userId, provider: { in: providerNames } }
    });

    for (const account of accounts) {
      const accessToken = decryptToken(account.accessToken);
      if (!accessToken) continue;

      const provider = ProviderFactory.getProvider(account.provider);

      try {
        if (account.provider === 'google-drive') {
          // Google supports empty trash natively
          await provider.emptyTrash(accessToken, decryptToken(account.refreshToken));
          await prisma.file.deleteMany({
            where: { cloudAccountId: account.id, isTrashed: true }
          });
        } else {
          // Others need individual deletion
          const trashedFiles = await prisma.file.findMany({
            where: { cloudAccountId: account.id, isTrashed: true }
          });

          for (const f of trashedFiles) {
            try {
              await provider.permanentlyDeleteFile(accessToken, decryptToken(account.refreshToken), f.providerFileId);
              await prisma.file.delete({ where: { id: f.id } });
            } catch (err) {
              console.error(`Failed to permanently delete ${f.id} on ${account.provider}`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to empty trash for ${account.provider}`, err);
      }
    }

    return { success: true };
  }

  async uploadFile(accountId: string, parentId: string, filePath: string, originalName: string, mimeType: string, size: number, userId: string) {
    const account = await prisma.cloudAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) throw new Error('Account not found');
    if (account.userId !== userId) throw new Error('Unauthorized');
    if (!decryptToken(account.accessToken)!) throw new Error('Account not authenticated');

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
      const driveFile = await this.handleProviderError(account.id, () =>
        provider.uploadFile(
          decryptToken(account.accessToken)!,
          decryptToken(account.refreshToken),
          originalName,
          mimeType,
          filePath,
          targetProviderId
        )
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

      if (account.storageUsed !== null && dbFile.size) {
        await prisma.cloudAccount.update({
          where: { id: account.id },
          data: { storageUsed: { increment: dbFile.size } }
        });
      }

      return { ...dbFile, size: Number(dbFile.size) };
    } finally {
      // 4. Guaranteed to run whether upload succeeds OR throws an error! (Prevents disk leaks)
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(console.error);
      }
    }
  }

  async createUploadSession(accountId: string, userId: string, name: string, mimeType: string, parentProviderId: string, size: number) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) throw new AppError('Cloud account not found', 404);
    if (!decryptToken(account.accessToken)!) throw new AppError('Account not authenticated', 401);

    const provider = ProviderFactory.getProvider(account.provider);
    
    if (!provider.createUploadSession) {
      return { direct: false };
    }

    let targetProviderId = 'root';
    if (parentProviderId !== 'root') {
      const parentRecord = await prisma.file.findUnique({
        where: { id: parentProviderId }
      });
      if (!parentRecord) throw new AppError('Parent folder not found', 404);
      targetProviderId = parentRecord.providerFileId;
    }

    try {
      const result = await this.handleProviderError(account.id, () =>
        provider.createUploadSession(
          decryptToken(account.accessToken)!,
          decryptToken(account.refreshToken),
          name,
          mimeType,
          targetProviderId,
          size
        )
      );
      return { ...result, provider: account.provider };
    } catch (error: any) {
      throw new AppError(error.message || `Failed to create upload session on ${account.provider}`, 500);
    }
  }

  async completeUpload(accountId: string, userId: string, fileData: any) {
    const account = await prisma.cloudAccount.findFirst({
      where: { id: accountId, userId }
    });

    if (!account) throw new AppError('Cloud account not found', 404);

    let parentLocalId = null;
    if (fileData.parentId && fileData.parentId !== 'root') {
      const parentRecord = await prisma.file.findFirst({
        where: { providerFileId: fileData.parentId, cloudAccountId: account.id }
      });
      if (parentRecord) {
        parentLocalId = parentRecord.id;
      }
    }

    const newFile = await prisma.file.create({
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
      await prisma.cloudAccount.update({
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

export const fileService = new FileService();
