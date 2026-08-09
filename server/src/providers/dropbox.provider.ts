import fs from 'fs';
import { ICloudProvider } from './provider.interface';

const DROPBOX_CLIENT_ID = process.env.DROPBOX_CLIENT_ID;
const DROPBOX_CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.API_URL}/api/cloud-accounts/callback/dropbox`;

export class DropboxProvider implements ICloudProvider {
  
  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: DROPBOX_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      state: state,
      token_access_type: 'offline'
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  async getTokens(code: string) {
    const params = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: DROPBOX_CLIENT_ID!,
      client_secret: DROPBOX_CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI
    });

    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to get Dropbox tokens: ${errorText}`);
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined
    };
  }

  private async refreshAccessToken(refreshToken: string) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: DROPBOX_CLIENT_ID!,
      client_secret: DROPBOX_CLIENT_SECRET!
    });

    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      throw new Error('Failed to refresh Dropbox token');
    }
    const data = await res.json();
    return data.access_token as string;
  }

  private async fetchApi(url: string, options: RequestInit, accessToken: string, refreshToken: string | null): Promise<Response> {
    let res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (res.status === 401 && refreshToken) {
      const newAccessToken = await this.refreshAccessToken(refreshToken);
      res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newAccessToken}`
        }
      });
    }
    return res;
  }

  async getUserInfo(accessToken: string) {
    const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!res.ok) throw new Error('Failed to get Dropbox user info');
    
    const data = await res.json();
    return {
      id: data.account_id,
      email: data.email
    };
  }

  async getDriveQuota(accessToken: string, refreshToken: string | null) {
    const res = await this.fetchApi('https://api.dropboxapi.com/2/users/get_space_usage', { method: 'POST' }, accessToken, refreshToken);
    if (!res.ok) return {};
    
    const data = await res.json();
    return {
      limit: data.allocation?.allocated?.toString(),
      usage: data.used?.toString()
    };
  }

  private mapDropboxFileToGeneric(item: any) {
    const isFolder = item['.tag'] === 'folder';
    const hasThumb = !isFolder && item.has_explicit_shared_members !== undefined; 
    
    return {
      id: item.id || item.path_lower,
      name: item.name,
      mimeType: isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
      size: item.size || 0,
      parents: [item.path_lower?.split('/').slice(0, -1).join('/') || ''], 
      modifiedTime: item.server_modified || item.client_modified || new Date().toISOString(),
      thumbnailLink: !isFolder ? 'has_thumbnail' : null,
      trashed: item['.tag'] === 'deleted',
      ownedByMe: true
    };
  }

  async listFiles(accessToken: string, refreshToken: string | null) {
    const rootFolderId = '';
    const allFilesMap = new Map<string, any>();
    
    let hasMore = true;
    let cursor = '';

    while (hasMore) {
      const url = cursor 
        ? 'https://api.dropboxapi.com/2/files/list_folder/continue'
        : 'https://api.dropboxapi.com/2/files/list_folder';
        
      const body = cursor 
        ? { cursor }
        : { path: '', recursive: true, include_deleted: true };

      const res = await this.fetchApi(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, accessToken, refreshToken);

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to list files: ${err}`);
      }
      
      const data = await res.json();
      if (data.entries) {
        for (const item of data.entries) {
          // Store all files, including deleted ones (which have .tag === 'deleted')
          const mapped = this.mapDropboxFileToGeneric(item);
          if (mapped.id) {
            allFilesMap.set(mapped.id, mapped);
          }
        }
      }
      
      hasMore = data.has_more;
      cursor = data.cursor;
    }

    return { files: Array.from(allFilesMap.values()), rootFolderId };
  }

  async getThumbnailLink(accessToken: string, refreshToken: string | null, fileId: string) {
    const res = await this.fetchApi('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({
          resource: { '.tag': 'path', path: fileId },
          format: { '.tag': 'jpeg' },
          size: { '.tag': 'w480h320' },
          mode: { '.tag': 'strict' }
        })
      }
    }, accessToken, refreshToken);
    
    if (!res.ok) {
      const err = await res.text();
      if (res.status === 409 && err.includes('not_found')) {
        return null; // Silently ignore deleted files
      }
      console.error('Dropbox thumbnail error:', res.status, err);
      return null;
    }
    
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  }

  async renameFile(accessToken: string, refreshToken: string | null, fileId: string, newName: string) {
    // To rename in Dropbox, we need the current path. But move_v2 accepts `from_path` as ID.
    // Wait, move_v2 to a new folder requires the new full path.
    // It's better to fetch the metadata first to get the current path.
    const metaRes = await this.fetchApi('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileId })
    }, accessToken, refreshToken);
    
    if (!metaRes.ok) throw new Error('Failed to get metadata for rename');
    const meta = await metaRes.json();
    
    const parentPath = meta.path_display.split('/').slice(0, -1).join('/');
    const toPath = `${parentPath}/${newName}`;

    const res = await this.fetchApi('https://api.dropboxapi.com/2/files/move_v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_path: fileId,
        to_path: toPath,
        autorename: true
      })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to rename file on Dropbox');
    const data = await res.json();
    return this.mapDropboxFileToGeneric(data.metadata);
  }
  async downloadFileStream(accessToken: string, refreshToken: string | null, fileId: string, mimeType: string, range?: string) {
    const headers: any = {
      'Dropbox-API-Arg': JSON.stringify({ path: fileId })
    };
    if (range) {
      headers.Range = range;
    }

    const res = await this.fetchApi('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers
    }, accessToken, refreshToken);
    
    if (!res.ok) {
      throw new Error(`Failed to download file from Dropbox: ${res.statusText}`);
    }

    const { Readable } = await import('stream');
    return { data: Readable.fromWeb(res.body as any) };
  }

  async moveFile(accessToken: string, refreshToken: string | null, fileId: string, newParentId: string) {
    const metaRes = await this.fetchApi('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileId })
    }, accessToken, refreshToken);
    if (!metaRes.ok) throw new Error('Failed to get metadata for move');
    const meta = await metaRes.json();
    
    let targetParentPath = '';
    if (newParentId && newParentId !== 'root' && newParentId !== '') {
      const parentMetaRes = await this.fetchApi('https://api.dropboxapi.com/2/files/get_metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newParentId })
      }, accessToken, refreshToken);
      if (parentMetaRes.ok) {
        const pMeta = await parentMetaRes.json();
        targetParentPath = pMeta.path_display;
      }
    }
    
    const toPath = `${targetParentPath}/${meta.name}`;

    const res = await this.fetchApi('https://api.dropboxapi.com/2/files/move_v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_path: fileId,
        to_path: toPath,
        autorename: true
      })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to move file on Dropbox');
    const data = await res.json();
    return this.mapDropboxFileToGeneric(data.metadata);
  }

  async createFolder(accessToken: string, refreshToken: string | null, name: string, parentId: string) {
    let parentPath = '';
    if (parentId && parentId !== 'root' && parentId !== '') {
      const parentMetaRes = await this.fetchApi('https://api.dropboxapi.com/2/files/get_metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: parentId })
      }, accessToken, refreshToken);
      if (parentMetaRes.ok) {
        const pMeta = await parentMetaRes.json();
        parentPath = pMeta.path_display;
      }
    }

    const path = `${parentPath}/${name}`;
    
    const res = await this.fetchApi('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, autorename: true })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to create folder on Dropbox');
    const data = await res.json();
    return this.mapDropboxFileToGeneric(data.metadata);
  }

  async trashFile(accessToken: string, refreshToken: string | null, fileId: string) {
    const res = await this.fetchApi('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileId })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to delete file on Dropbox');
    return { success: true };
  }

  async restoreFile(accessToken: string, refreshToken: string | null, fileId: string) {
    // Dropbox restore requires the file path and the rev. But if we just use the API, restore works differently.
    // It's actually easier to use files/restore if we know the path and rev.
    // However, if we don't have rev, we can't easily restore via ID.
    // Fallback to Dropbox web interface for deleted files.
    return { fallbackUrl: 'https://www.dropbox.com/deleted_files' };
  }

  async permanentlyDeleteFile(accessToken: string, refreshToken: string | null, fileId: string) {
    const res = await this.fetchApi('https://api.dropboxapi.com/2/files/permanently_delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileId })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to permanently delete file on Dropbox');
    return { success: true };
  }

  async emptyTrash(accessToken: string, refreshToken: string | null) {
    throw new Error('Dropbox does not support a single empty trash command. Files must be permanently deleted individually.');
  }

  async getStartPageToken(accessToken: string, refreshToken: string | null) {
    const res = await this.fetchApi('https://api.dropboxapi.com/2/files/list_folder/get_latest_cursor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '', recursive: true, include_deleted: false })
    }, accessToken, refreshToken);
    
    if (!res.ok) throw new Error('Failed to get Dropbox cursor');
    const data = await res.json();
    return data.cursor;
  }

  async listChanges(accessToken: string, refreshToken: string | null, pageToken: string) {
    if (!pageToken) return { changes: [] };

    let cursor = pageToken;
    const allChanges: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const res = await this.fetchApi('https://api.dropboxapi.com/2/files/list_folder/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor })
      }, accessToken, refreshToken);
      
      if (!res.ok) throw new Error('Failed to fetch Dropbox changes');
      
      const data = await res.json();
      if (data.entries) {
        for (const item of data.entries) {
          const isDeleted = item['.tag'] === 'deleted';
          const resolvedId = item.id || item.path_lower;
          
          if (!resolvedId) continue;
          
          const mappedFile = isDeleted ? { id: resolvedId, trashed: true } as any : this.mapDropboxFileToGeneric(item);
          if (isDeleted) {
            // Dropbox does not distinguish well between soft and hard delete in list_folder
            // We map to trashed so it shows in the Trash bin
            mappedFile.trashed = true;
          }
          
          allChanges.push({
            fileId: resolvedId,
            removed: false, // Don't remove from DB, just mark as trashed
            file: mappedFile
          });
        }
      }
      
      hasMore = data.has_more;
      cursor = data.cursor;
    }

    return { changes: allChanges, newStartPageToken: cursor };
  }

  async uploadFile(
    accessToken: string,
    refreshToken: string | null,
    name: string,
    mimeType: string,
    filePath: string,
    parentId: string
  ) {
    let parentPath = '';
    if (parentId && parentId !== 'root' && parentId !== '') {
      const parentMetaRes = await this.fetchApi('https://api.dropboxapi.com/2/files/get_metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: parentId })
      }, accessToken, refreshToken);
      if (parentMetaRes.ok) {
        const pMeta = await parentMetaRes.json();
        parentPath = pMeta.path_display;
      }
    }

    const uploadPath = `${parentPath}/${name}`;
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(CHUNK_SIZE);
    let position = 0;
    let sessionId = '';

    try {
      if (fileSize <= CHUNK_SIZE) {
        const fileContent = fs.readFileSync(filePath);
        const simpleRes = await this.fetchApi('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({ path: uploadPath, mode: 'add', autorename: true })
          },
          body: fileContent
        }, accessToken, refreshToken);
        
        if (!simpleRes.ok) throw new Error('Failed to upload file');
        const data = await simpleRes.json();
        return this.mapDropboxFileToGeneric(data);
      }

      while (position < fileSize) {
        const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, position);
        const chunk = buffer.subarray(0, bytesRead);
        
        if (position === 0) {
          // Start session
          const startRes = await this.fetchApi('https://content.dropboxapi.com/2/files/upload_session/start', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': JSON.stringify({ close: false })
            },
            body: chunk
          }, accessToken, refreshToken);
          
          if (!startRes.ok) {
            const err = await startRes.text();
            throw new Error(`Failed to start upload session: ${err}`);
          }
          
          const startData = await startRes.json();
          sessionId = startData.session_id;
        } else if (position + bytesRead < fileSize) {
          // Append
          const appendRes = await this.fetchApi('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': JSON.stringify({
                cursor: { session_id: sessionId, offset: position },
                close: false
              })
            },
            body: chunk
          }, accessToken, refreshToken);
          
          if (!appendRes.ok) {
            const err = await appendRes.text();
            throw new Error(`Failed to append chunk: ${err}`);
          }
        } else {
          // Finish (last chunk)
          const finishRes = await this.fetchApi('https://content.dropboxapi.com/2/files/upload_session/finish', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': JSON.stringify({
                cursor: { session_id: sessionId, offset: position },
                commit: { path: uploadPath, mode: 'add', autorename: true, mute: false, strict_conflict: false }
              })
            },
            body: chunk
          }, accessToken, refreshToken);

          if (!finishRes.ok) {
            const err = await finishRes.text();
            throw new Error(`Failed to finish upload session: ${err}`);
          }
          
          const finishData = await finishRes.json();
          return this.mapDropboxFileToGeneric(finishData);
        }

        position += bytesRead;
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  async createUploadSession(
    accessToken: string,
    refreshToken: string | null,
    name: string,
    mimeType: string,
    parentId: string,
    size: number
  ) {
    // Dropbox requires complex chunked uploads with a cursor for large files, which is difficult 
    // to proxy securely and efficiently directly to the frontend without exposing tokens.
    // For now, we fallback to the Node.js server proxy method for Dropbox uploads.
    // Future enhancement: Implement Dropbox direct uploads.
    return { direct: false };
  }
}
