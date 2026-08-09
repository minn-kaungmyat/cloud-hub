import { google } from 'googleapis';
import fs from 'fs';
import { ICloudProvider } from './provider.interface';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
];

export class GoogleDriveProvider implements ICloudProvider {
  private getGoogleOAuthClient() {
    return new google.auth.OAuth2({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${process.env.API_URL}/api/cloud-accounts/callback/google-drive`
    });
  }

  private getDriveClient(accessToken: string, refreshToken: string | null) {
    const oAuth2Client = this.getGoogleOAuthClient();
    oAuth2Client.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken || undefined
    });
    return google.drive({ version: 'v3', auth: oAuth2Client });
  }

  generateAuthUrl(state: string): string {
    const oAuth2Client = this.getGoogleOAuthClient();
    return oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
      redirect_uri: `${process.env.API_URL}/api/cloud-accounts/callback/google-drive`
    });
  }

  async getTokens(code: string) {
    const oAuth2Client = this.getGoogleOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    return tokens as any;
  }

  async getUserInfo(accessToken: string) {
    const oAuth2Client = this.getGoogleOAuthClient();
    oAuth2Client.setCredentials({ access_token: accessToken });
    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const { data } = await oauth2.userinfo.get();
    return data as any; // { email, id, ... }
  }

  async listFiles(accessToken: string, refreshToken: string | null) {
    const oAuth2Client = this.getGoogleOAuthClient();
    oAuth2Client.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken || undefined
    });
    
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    // Get the actual root folder ID ("My Drive" has a real ID like 0AMm-r4-DDJMqUk9PVA)
    const rootRes = await drive.files.get({ fileId: 'root', fields: 'id' });
    const rootFolderId = rootRes.data.id;
    console.log('Google Drive root folder ID:', rootFolderId);

    const allFiles: any[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const res: any = await drive.files.list({
        pageSize: 1000,
        q: 'trashed=false or trashed=true',
        fields: 'nextPageToken, files(id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe)',
        pageToken: pageToken,
      });
      
      if (res.data.files) {
        allFiles.push(...res.data.files);
        console.log(`Fetched ${res.data.files.length} files... (Total: ${allFiles.length})`);
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    
    return { files: allFiles, rootFolderId: rootFolderId! };
  }

  async getThumbnailLink(accessToken: string, refreshToken: string | null, fileId: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    const res = await drive.files.get({
      fileId,
      fields: 'thumbnailLink'
    });
    
    const link = res.data.thumbnailLink;
    if (!link) return null;
    return link.replace(/=s\d+$/, '') + '=s512';
  }

  async getDriveQuota(accessToken: string, refreshToken: string | null) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    const res = await drive.about.get({
      fields: 'storageQuota'
    });
    
    return res.data.storageQuota as any;
  }

  async renameFile(accessToken: string, refreshToken: string | null, fileId: string, newName: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    const res = await drive.files.update({
      fileId,
      requestBody: {
        name: newName,
      },
      fields: 'id, name, modifiedTime',
    });
    
    return res.data;
  }

  async downloadFileStream(accessToken: string, refreshToken: string | null, fileId: string, mimeType: string, range?: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    
    // Map Google Workspace mime types to standard Office formats
    const exportMimeTypes: Record<string, string> = {
      'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };

    const exportMimeType = exportMimeTypes[mimeType];

    if (exportMimeType) {
      // Export Google Workspace file
      return drive.files.export({
        fileId,
        mimeType: exportMimeType
      }, { responseType: 'stream' }) as any;
    } else {
      // Download standard file
      const options: any = { responseType: 'stream' };
      if (range) {
        options.headers = { Range: range };
      }
      return drive.files.get({
        fileId,
        alt: 'media',
        acknowledgeAbuse: true
      }, options) as any;
    }
  }

  async moveFile(accessToken: string, refreshToken: string | null, fileId: string, newParentId: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);

    // First, get the current parents
    const file = await drive.files.get({
      fileId: fileId,
      fields: 'parents'
    });
    
    const currentParents = file.data.parents?.join(',') || '';
    
    // Google Drive moves a file by adding it to a new parent and removing it from the old parent
    const res = await drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: currentParents,
      fields: 'id, parents, modifiedTime'
    });
    
    return res.data;
  }

  async createFolder(accessToken: string, refreshToken: string | null, name: string, parentId: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);

    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId !== 'root' ? [parentId] : undefined,
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name, mimeType, modifiedTime'
    });

    return res.data;
  }

  async trashFile(accessToken: string, refreshToken: string | null, fileId: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    await drive.files.update({
      fileId,
      requestBody: { trashed: true }
    });
    return { success: true };
  }

  async restoreFile(accessToken: string, refreshToken: string | null, fileId: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    await drive.files.update({
      fileId,
      requestBody: { trashed: false }
    });
    return { success: true };
  }

  async permanentlyDeleteFile(accessToken: string, refreshToken: string | null, fileId: string) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    await drive.files.delete({ fileId });
    return { success: true };
  }

  async emptyTrash(accessToken: string, refreshToken: string | null) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    await drive.files.emptyTrash();
    return { success: true };
  }

  async getStartPageToken(accessToken: string, refreshToken: string | null) {
    const drive = this.getDriveClient(accessToken, refreshToken);
    const res = await drive.changes.getStartPageToken({});
    return res.data.startPageToken as string;
  }

  async listChanges(accessToken: string, refreshToken: string | null, pageToken: string) {
    const oAuth2Client = this.getGoogleOAuthClient();
    oAuth2Client.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken || undefined
    });
    
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    
    const allChanges: any[] = [];
    let currentToken: string | undefined = pageToken;
    let newStartPageToken: string | undefined = undefined;

    do {
      const res: any = await drive.changes.list({
        pageToken: currentToken,
        fields: 'newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe))',
      });
      
      if (res.data.changes) {
        allChanges.push(...res.data.changes);
      }
      
      if (res.data.newStartPageToken) {
        newStartPageToken = res.data.newStartPageToken;
      }
      
      currentToken = res.data.nextPageToken || undefined;
    } while (currentToken);

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
    const oAuth2Client = this.getGoogleOAuthClient();
    oAuth2Client.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken || undefined
    });
    
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    const fileMetadata = {
      name: name,
      parents: parentId !== 'root' ? [parentId] : undefined,
    };

    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath),
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe'
    }).catch(async (error: any) => {
      // If the token was expired, the googleapis library cannot auto-retry because the body is a stream.
      // We must manually refresh the token, recreate the stream, and retry.
      if (error.code === 401 || error.status === 401) {
        if (!refreshToken) throw error;
        
        console.log('Access token expired during upload, refreshing and retrying...');
        const { credentials } = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(credentials);
        
        const retryMedia = {
          mimeType: mimeType,
          body: fs.createReadStream(filePath),
        };
        
        return drive.files.create({
          requestBody: fileMetadata,
          media: retryMedia,
          fields: 'id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe'
        });
      }
      throw error;
    });

    return res.data;
  }

  async createUploadSession(
    accessToken: string,
    refreshToken: string | null,
    name: string,
    mimeType: string,
    parentId: string,
    size: number
  ) {
    const oAuth2Client = this.getGoogleOAuthClient();
    oAuth2Client.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken || undefined
    });

    const fileMetadata = {
      name: name,
      parents: parentId !== 'root' ? [parentId] : undefined,
    };

    // Google Drive resumable upload endpoint
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
    
    try {
      // oAuth2Client.request automatically refreshes tokens and injects the Authorization header.
      // It relies on throwing an error on 401 to trigger the refresh interceptor, so we don't use validateStatus.
      const response = await oAuth2Client.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': size.toString(),
          'Origin': process.env.VITE_APP_URL || process.env.API_URL || 'https://cloudhub-app.vercel.app'
        },
        data: fileMetadata
      });

      const uploadUrl = (response.headers as any).get ? (response.headers as any).get('Location') : (response.headers as any).location;
      
      if (!uploadUrl) {
        throw new Error('Google Drive did not return a Location header for the upload session');
      }

      return { direct: true, uploadUrl, method: 'PUT' };
      
    } catch (error: any) {
      if (error.response) {
        const details = typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data;
        console.error('Google Drive Upload Session Error:', details);
        throw new Error(`Failed to create Google Drive upload session: ${error.response.status} ${error.response.statusText}. Details: ${details}`);
      }
      throw error;
    }
  }
}
