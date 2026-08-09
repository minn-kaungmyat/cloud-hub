"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleDriveProvider = void 0;
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email',
];
class GoogleDriveProvider {
    getGoogleOAuthClient() {
        return new googleapis_1.google.auth.OAuth2({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            redirectUri: `${process.env.API_URL}/api/cloud-accounts/callback/google-drive`
        });
    }
    getDriveClient(accessToken, refreshToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        return googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
    }
    generateAuthUrl(state) {
        const oAuth2Client = this.getGoogleOAuthClient();
        return oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: SCOPES,
            state,
            redirect_uri: `${process.env.API_URL}/api/cloud-accounts/callback/google-drive`
        });
    }
    async getTokens(code) {
        const oAuth2Client = this.getGoogleOAuthClient();
        const { tokens } = await oAuth2Client.getToken(code);
        return tokens;
    }
    async getUserInfo(accessToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({ access_token: accessToken });
        const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: oAuth2Client });
        const { data } = await oauth2.userinfo.get();
        return data; // { email, id, ... }
    }
    async *listFiles(accessToken, refreshToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        // Get the actual root folder ID ("My Drive" has a real ID like 0AMm-r4-DDJMqUk9PVA)
        const rootRes = await drive.files.get({ fileId: 'root', fields: 'id' });
        const rootFolderId = rootRes.data.id;
        console.log('Google Drive root folder ID:', rootFolderId);
        let pageToken = undefined;
        do {
            const res = await drive.files.list({
                pageSize: 1000,
                q: 'trashed=false or trashed=true',
                fields: 'nextPageToken, files(id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe)',
                pageToken: pageToken,
            });
            if (res.data.files && res.data.files.length > 0) {
                console.log(`Yielding ${res.data.files.length} Google Drive files...`);
                yield { files: res.data.files, rootFolderId };
            }
            pageToken = res.data.nextPageToken || undefined;
        } while (pageToken);
    }
    async getThumbnailLink(accessToken, refreshToken, fileId) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        const res = await drive.files.get({
            fileId,
            fields: 'thumbnailLink'
        });
        const link = res.data.thumbnailLink;
        if (!link)
            return null;
        return link.replace(/=s\d+$/, '') + '=s512';
    }
    async getDriveQuota(accessToken, refreshToken) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        const res = await drive.about.get({
            fields: 'storageQuota'
        });
        return res.data.storageQuota;
    }
    async renameFile(accessToken, refreshToken, fileId, newName) {
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
    async downloadFileStream(accessToken, refreshToken, fileId, mimeType, range) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        // Map Google Workspace mime types to standard Office formats
        const exportMimeTypes = {
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
            }, { responseType: 'stream' });
        }
        else {
            // Download standard file
            const options = { responseType: 'stream' };
            if (range) {
                options.headers = { Range: range };
            }
            return drive.files.get({
                fileId,
                alt: 'media',
                acknowledgeAbuse: true
            }, options);
        }
    }
    async moveFile(accessToken, refreshToken, fileId, newParentId) {
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
    async createFolder(accessToken, refreshToken, name, parentId) {
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
    async trashFile(accessToken, refreshToken, fileId) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        await drive.files.update({
            fileId,
            requestBody: { trashed: true }
        });
        return { success: true };
    }
    async restoreFile(accessToken, refreshToken, fileId) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        await drive.files.update({
            fileId,
            requestBody: { trashed: false }
        });
        return { success: true };
    }
    async permanentlyDeleteFile(accessToken, refreshToken, fileId) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        await drive.files.delete({ fileId });
        return { success: true };
    }
    async emptyTrash(accessToken, refreshToken) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        await drive.files.emptyTrash();
        return { success: true };
    }
    async getStartPageToken(accessToken, refreshToken) {
        const drive = this.getDriveClient(accessToken, refreshToken);
        const res = await drive.changes.getStartPageToken({});
        return res.data.startPageToken;
    }
    async *listChanges(accessToken, refreshToken, pageToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        let currentToken = pageToken;
        do {
            const res = await drive.changes.list({
                pageToken: currentToken,
                fields: 'newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe))',
            });
            const newStartPageToken = res.data.newStartPageToken || undefined;
            if (res.data.changes && res.data.changes.length > 0) {
                yield { changes: res.data.changes, newStartPageToken };
            }
            else if (newStartPageToken) {
                // Even if no changes, we might need to yield the newStartPageToken
                yield { changes: [], newStartPageToken };
            }
            currentToken = res.data.nextPageToken || undefined;
        } while (currentToken);
    }
    async uploadFile(accessToken, refreshToken, name, mimeType, filePath, parentId) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const fileMetadata = {
            name: name,
            parents: parentId !== 'root' ? [parentId] : undefined,
        };
        const media = {
            mimeType: mimeType,
            body: fs_1.default.createReadStream(filePath),
        };
        const res = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe'
        }).catch(async (error) => {
            // If the token was expired, the googleapis library cannot auto-retry because the body is a stream.
            // We must manually refresh the token, recreate the stream, and retry.
            if (error.code === 401 || error.status === 401) {
                if (!refreshToken)
                    throw error;
                console.log('Access token expired during upload, refreshing and retrying...');
                const { credentials } = await oAuth2Client.refreshAccessToken();
                oAuth2Client.setCredentials(credentials);
                const retryMedia = {
                    mimeType: mimeType,
                    body: fs_1.default.createReadStream(filePath),
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
    async createUploadSession(accessToken, refreshToken, name, mimeType, parentId, size) {
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
            const uploadUrl = response.headers.get ? response.headers.get('Location') : response.headers.location;
            if (!uploadUrl) {
                throw new Error('Google Drive did not return a Location header for the upload session');
            }
            return { direct: true, uploadUrl, method: 'PUT' };
        }
        catch (error) {
            if (error.response) {
                const details = typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data;
                console.error('Google Drive Upload Session Error:', details);
                throw new Error(`Failed to create Google Drive upload session: ${error.response.status} ${error.response.statusText}. Details: ${details}`);
            }
            throw error;
        }
    }
}
exports.GoogleDriveProvider = GoogleDriveProvider;
