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
    async listFiles(accessToken, refreshToken) {
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
        const allFiles = [];
        let pageToken = undefined;
        do {
            const res = await drive.files.list({
                pageSize: 1000,
                fields: 'nextPageToken, files(id, name, mimeType, size, parents, modifiedTime, thumbnailLink, trashed, ownedByMe)',
                q: "trashed = false",
                pageToken: pageToken,
            });
            if (res.data.files) {
                allFiles.push(...res.data.files);
                console.log(`Fetched ${res.data.files.length} files... (Total: ${allFiles.length})`);
            }
            pageToken = res.data.nextPageToken || undefined;
        } while (pageToken);
        return { files: allFiles, rootFolderId: rootFolderId };
    }
    async getThumbnailLink(accessToken, refreshToken, fileId) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const res = await drive.files.get({
            fileId,
            fields: 'thumbnailLink'
        });
        return res.data.thumbnailLink || null;
    }
    async getDriveQuota(accessToken, refreshToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const res = await drive.about.get({
            fields: 'storageQuota'
        });
        return res.data.storageQuota;
    }
    async renameFile(accessToken, refreshToken, fileId, newName) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const res = await drive.files.update({
            fileId,
            requestBody: {
                name: newName,
            },
            fields: 'id, name, modifiedTime',
        });
        return res.data;
    }
    async downloadFileStream(accessToken, refreshToken, fileId, mimeType) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
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
            return drive.files.get({
                fileId,
                alt: 'media'
            }, { responseType: 'stream' });
        }
    }
    async moveFile(accessToken, refreshToken, fileId, newParentId) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
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
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
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
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const res = await drive.files.update({
            fileId,
            requestBody: { trashed: true }
        });
        return res.data;
    }
    async getStartPageToken(accessToken, refreshToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const res = await drive.changes.getStartPageToken({});
        return res.data.startPageToken;
    }
    async listChanges(accessToken, refreshToken, pageToken) {
        const oAuth2Client = this.getGoogleOAuthClient();
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken || undefined
        });
        const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
        const allChanges = [];
        let currentToken = pageToken;
        let newStartPageToken = undefined;
        do {
            const res = await drive.changes.list({
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
}
exports.GoogleDriveProvider = GoogleDriveProvider;
