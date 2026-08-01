import fs from 'fs';
import { ICloudProvider } from './provider.interface';

const ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const ONEDRIVE_CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.API_URL}/api/cloud-accounts/callback/onedrive`;
const SCOPES = 'Files.ReadWrite.All offline_access User.Read';

export class OneDriveProvider implements ICloudProvider {
  
  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state: state
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async getTokens(code: string) {
    const params = new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID!,
      client_secret: ONEDRIVE_CLIENT_SECRET!,
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to get OneDrive tokens: ${errorText}`);
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in * 1000)
    };
  }

  private async refreshAccessToken(refreshToken: string) {
    const params = new URLSearchParams({
      client_id: ONEDRIVE_CLIENT_ID!,
      client_secret: ONEDRIVE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      throw new Error('Failed to refresh OneDrive token');
    }
    const data = await res.json();
    return data.access_token as string;
  }

  private async fetchGraph(url: string, options: RequestInit, accessToken: string, refreshToken: string | null): Promise<Response> {
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
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!res.ok) throw new Error('Failed to get OneDrive user info');
    
    const data = await res.json();
    return {
      id: data.id,
      email: data.userPrincipalName || data.mail || 'Unknown Email'
    };
  }

  async getDriveQuota(accessToken: string, refreshToken: string | null) {
    const res = await this.fetchGraph('https://graph.microsoft.com/v1.0/me/drive', {}, accessToken, refreshToken);
    if (!res.ok) return {};
    
    const data = await res.json();
    return {
      limit: data.quota?.total?.toString(),
      usage: data.quota?.used?.toString()
    };
  }

  private mapGraphFileToGeneric(item: any) {
    return {
      id: item.id,
      name: item.name,
      mimeType: item.folder ? 'application/vnd.google-apps.folder' : (item.file?.mimeType || 'application/octet-stream'),
      size: item.size,
      parents: item.parentReference?.id ? [item.parentReference.id] : undefined,
      modifiedTime: item.lastModifiedDateTime,
      thumbnailLink: (
        item.file?.mimeType?.startsWith('image/') || 
        item.file?.mimeType?.startsWith('video/') ||
        item.file?.mimeType === 'application/pdf' ||
        item.file?.mimeType?.includes('word') ||
        item.file?.mimeType?.includes('presentation') ||
        item.file?.mimeType?.includes('excel') ||
        item.file?.mimeType?.includes('officedocument')
      ) ? 'has_thumbnail' : null,
      trashed: false,
      ownedByMe: true // Graph API typically returns user's own items
    };
  }

  async listFiles(accessToken: string, refreshToken: string | null) {
    // Get root folder ID
    const rootRes = await this.fetchGraph('https://graph.microsoft.com/v1.0/me/drive/root', {}, accessToken, refreshToken);
    if (!rootRes.ok) throw new Error('Failed to fetch OneDrive root');
    const rootData = await rootRes.json();
    const rootFolderId = rootData.id;

    let url = 'https://graph.microsoft.com/v1.0/me/drive/root/delta?select=id,name,file,folder,size,parentReference,lastModifiedDateTime,deleted';
    const allFilesMap = new Map<string, any>();

    while (url) {
      const res = await this.fetchGraph(url, {}, accessToken, refreshToken);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to list files: ${err}`);
      }
      
      const data = await res.json();
      if (data.value) {
        for (const item of data.value) {
          if (item.deleted) {
            allFilesMap.delete(item.id);
          } else {
            allFilesMap.set(item.id, this.mapGraphFileToGeneric(item));
          }
        }
      }
      url = data['@odata.nextLink'] || '';
    }

    return { files: Array.from(allFilesMap.values()), rootFolderId };
  }

  async getThumbnailLink(accessToken: string, refreshToken: string | null, fileId: string) {
    const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/thumbnails`, {}, accessToken, refreshToken);
    if (!res.ok) return null;
    
    const data = await res.json();
    if (data.value && data.value.length > 0) {
      return data.value[0].large?.url || data.value[0].medium?.url || data.value[0].small?.url || null;
    }
    return null;
  }

  async renameFile(accessToken: string, refreshToken: string | null, fileId: string, newName: string) {
    const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to rename file on OneDrive');
    const data = await res.json();
    return this.mapGraphFileToGeneric(data);
  }

  async downloadFileStream(accessToken: string, refreshToken: string | null, fileId: string, mimeType: string) {
    const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {}, accessToken, refreshToken);
    
    if (!res.ok) {
      throw new Error(`Failed to download file from OneDrive: ${res.statusText}`);
    }

    // Node fetch Response.body is a ReadableStream which is not exactly a Node.js stream,
    // but we can convert it or just return it if the backend handles it.
    // Let's import stream and convert it to Node stream.
    // Wait, node-fetch or native fetch in Node 18 returns a ReadableStream.
    // We can convert it to Node stream using Readable.fromWeb(res.body as any)
    const { Readable } = await import('stream');
    return { data: Readable.fromWeb(res.body as any) };
  }

  async moveFile(accessToken: string, refreshToken: string | null, fileId: string, newParentId: string) {
    const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentReference: {
          id: newParentId
        }
      })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to move file on OneDrive');
    const data = await res.json();
    return this.mapGraphFileToGeneric(data);
  }

  async createFolder(accessToken: string, refreshToken: string | null, name: string, parentId: string) {
    const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename'
      })
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to create folder on OneDrive');
    const data = await res.json();
    return this.mapGraphFileToGeneric(data);
  }

  async trashFile(accessToken: string, refreshToken: string | null, fileId: string) {
    const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      method: 'DELETE'
    }, accessToken, refreshToken);

    if (!res.ok) throw new Error('Failed to delete file on OneDrive');
    return { success: true };
  }

  async getStartPageToken(accessToken: string, refreshToken: string | null) {
    const res = await this.fetchGraph('https://graph.microsoft.com/v1.0/me/drive/root/delta?token=latest', {}, accessToken, refreshToken);
    if (!res.ok) throw new Error('Failed to get OneDrive delta token');
    const data = await res.json();
    return data['@odata.deltaLink'] || '';
  }

  async listChanges(accessToken: string, refreshToken: string | null, pageToken: string) {
    if (!pageToken) return { changes: [] };

    let url = pageToken;
    const allChanges: any[] = [];
    let newStartPageToken: string | undefined = undefined;

    while (url) {
      const res = await this.fetchGraph(url, {}, accessToken, refreshToken);
      if (!res.ok) throw new Error('Failed to fetch OneDrive changes');
      
      const data = await res.json();
      if (data.value) {
        for (const item of data.value) {
          allChanges.push({
            fileId: item.id,
            removed: item.deleted !== undefined,
            file: item.deleted ? null : this.mapGraphFileToGeneric(item)
          });
        }
      }
      
      if (data['@odata.nextLink']) {
        url = data['@odata.nextLink'];
      } else {
        newStartPageToken = data['@odata.deltaLink'];
        break;
      }
    }

    return { changes: allChanges, newStartPageToken };
  }

  async uploadFile(
    accessToken: string,
    refreshToken: string | null,
    name: string,
    mimeType: string,
    filePath: string,
    parentId: string
  ) {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    if (fileSize < 4 * 1024 * 1024) {
      const fileBuffer = fs.readFileSync(filePath);
      const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(name)}:/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': fileSize.toString()
        },
        body: fileBuffer
      }, accessToken, refreshToken);

      if (!res.ok) {
         const err = await res.text();
         throw new Error(`Failed to upload small file to OneDrive: ${err}`);
      }
      const data = await res.json();
      return this.mapGraphFileToGeneric(data);
    } else {
      const sessionRes = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(name)}:/createUploadSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'rename',
            name: name
          }
        })
      }, accessToken, refreshToken);

      if (!sessionRes.ok) {
        const err = await sessionRes.text();
        throw new Error(`Failed to create OneDrive upload session: ${err}`);
      }

      const sessionData = await sessionRes.json();
      const uploadUrl = sessionData.uploadUrl;

      const CHUNK_SIZE = 327680 * 10; 
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(CHUNK_SIZE);
      let position = 0;
      let uploadResultData = null;

      try {
        while (position < fileSize) {
          const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, position);
          const chunk = buffer.subarray(0, bytesRead);
          const endPosition = position + bytesRead - 1;

          // Note: The upload URL itself contains auth token internally for OneDrive, 
          // but we will still pass standard headers. We don't use fetchGraph because uploadUrl doesn't need auth header.
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': bytesRead.toString(),
              'Content-Range': `bytes ${position}-${endPosition}/${fileSize}`
            },
            body: chunk
          });

          if (!res.ok && res.status !== 202 && res.status !== 201 && res.status !== 200) {
            const errText = await res.text();
            throw new Error(`Failed to upload chunk: ${res.status} ${errText}`);
          }

          if (res.status === 201 || res.status === 200) {
            uploadResultData = await res.json();
          }

          position += bytesRead;
        }
      } finally {
        fs.closeSync(fd);
      }

      return this.mapGraphFileToGeneric(uploadResultData);
    }
  }
}
