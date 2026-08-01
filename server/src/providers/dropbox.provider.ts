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
      id: item.id,
      name: item.name,
      mimeType: isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream',
      size: item.size || 0,
      parents: [item.path_lower?.split('/').slice(0, -1).join('/') || ''], 
      modifiedTime: item.server_modified || item.client_modified || new Date().toISOString(),
      thumbnailLink: !isFolder ? 'has_thumbnail' : null, // We'll try to get thumb for all files
      trashed: false,
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
        : { path: '', recursive: true, include_deleted: false };

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
          if (item['.tag'] !== 'deleted') {
            allFilesMap.set(item.id, this.mapDropboxFileToGeneric(item));
          } else {
            allFilesMap.delete(item.id);
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

  async downloadFileStream(accessToken: string, refreshToken: string | null, fileId: string, mimeType: string) {
    const res = await this.fetchApi('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path: fileId })
      }
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
          allChanges.push({
            fileId: item.id,
            removed: item['.tag'] === 'deleted',
            file: item['.tag'] === 'deleted' ? null : this.mapDropboxFileToGeneric(item)
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
      if (fileSize === 0) {
        const simpleRes = await this.fetchApi('https://content.dropboxapi.com/2/files/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({ path: uploadPath, mode: 'add', autorename: true })
          },
          body: Buffer.from('')
        }, accessToken, refreshToken);
        
        if (!simpleRes.ok) throw new Error('Failed to upload empty file');
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
}
