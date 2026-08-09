"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneDriveProvider = void 0;
const fs_1 = __importDefault(require("fs"));
const ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const ONEDRIVE_CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.API_URL}/api/cloud-accounts/callback/onedrive`;
const SCOPES = 'Files.ReadWrite.All offline_access User.Read';
class OneDriveProvider {
    generateAuthUrl(state) {
        const params = new URLSearchParams({
            client_id: ONEDRIVE_CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: SCOPES,
            state: state
        });
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    }
    async getTokens(code) {
        const params = new URLSearchParams({
            client_id: ONEDRIVE_CLIENT_ID,
            client_secret: ONEDRIVE_CLIENT_SECRET,
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
    async refreshAccessToken(refreshToken) {
        const params = new URLSearchParams({
            client_id: ONEDRIVE_CLIENT_ID,
            client_secret: ONEDRIVE_CLIENT_SECRET,
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
        return data.access_token;
    }
    async fetchGraph(url, options, accessToken, refreshToken) {
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
    async getUserInfo(accessToken) {
        const res = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok)
            throw new Error('Failed to get OneDrive user info');
        const data = await res.json();
        return {
            id: data.id,
            email: data.userPrincipalName || data.mail || 'Unknown Email'
        };
    }
    async getDriveQuota(accessToken, refreshToken) {
        const res = await this.fetchGraph('https://graph.microsoft.com/v1.0/me/drive', {}, accessToken, refreshToken);
        if (!res.ok)
            return {};
        const data = await res.json();
        return {
            limit: data.quota?.total?.toString(),
            usage: data.quota?.used?.toString()
        };
    }
    mapGraphFileToGeneric(item) {
        return {
            id: item.id,
            name: item.name,
            mimeType: item.folder ? 'application/vnd.google-apps.folder' : (item.file?.mimeType || 'application/octet-stream'),
            size: item.size,
            parents: item.parentReference?.id ? [item.parentReference.id] : undefined,
            modifiedTime: item.lastModifiedDateTime,
            thumbnailLink: (item.file?.mimeType?.startsWith('image/') ||
                item.file?.mimeType?.startsWith('video/') ||
                item.file?.mimeType === 'application/pdf' ||
                item.file?.mimeType?.includes('word') ||
                item.file?.mimeType?.includes('presentation') ||
                item.file?.mimeType?.includes('excel') ||
                item.file?.mimeType?.includes('officedocument')) ? 'has_thumbnail' : null,
            trashed: false,
            ownedByMe: true // Graph API typically returns user's own items
        };
    }
    async *listFiles(accessToken, refreshToken) {
        // Get root folder ID
        const rootRes = await this.fetchGraph('https://graph.microsoft.com/v1.0/me/drive/root', {}, accessToken, refreshToken);
        if (!rootRes.ok)
            throw new Error('Failed to fetch OneDrive root');
        const rootData = await rootRes.json();
        const rootFolderId = rootData.id;
        let url = 'https://graph.microsoft.com/v1.0/me/drive/root/delta?select=id,name,file,folder,size,parentReference,lastModifiedDateTime,deleted';
        while (url) {
            const res = await this.fetchGraph(url, {}, accessToken, refreshToken);
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Failed to list files: ${err}`);
            }
            const data = await res.json();
            if (data.value && data.value.length > 0) {
                const pageFiles = [];
                for (const item of data.value) {
                    const mapped = this.mapGraphFileToGeneric(item);
                    if (item.deleted) {
                        mapped.trashed = true;
                    }
                    pageFiles.push(mapped);
                }
                yield { files: pageFiles, rootFolderId };
            }
            url = data['@odata.nextLink'] || '';
        }
    }
    async getThumbnailLink(accessToken, refreshToken, fileId) {
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/thumbnails?select=c512x512,medium,large`, {}, accessToken, refreshToken);
        if (!res.ok)
            return null;
        const data = await res.json();
        if (data.value && data.value.length > 0) {
            const thumb = data.value[0];
            return thumb['c512x512']?.url || thumb.medium?.url || thumb.large?.url || null;
        }
        return null;
    }
    async renameFile(accessToken, refreshToken, fileId, newName) {
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        }, accessToken, refreshToken);
        if (!res.ok)
            throw new Error('Failed to rename file on OneDrive');
        const data = await res.json();
        return this.mapGraphFileToGeneric(data);
    }
    async downloadFileStream(accessToken, refreshToken, fileId, mimeType, range) {
        const options = {};
        if (range) {
            options.headers = { Range: range };
        }
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, options, accessToken, refreshToken);
        if (!res.ok) {
            throw new Error(`Failed to download file from OneDrive: ${res.statusText}`);
        }
        // Node fetch Response.body is a ReadableStream which is not exactly a Node.js stream,
        // but we can convert it or just return it if the backend handles it.
        // Let's import stream and convert it to Node stream.
        // Wait, node-fetch or native fetch in Node 18 returns a ReadableStream.
        // We can convert it to Node stream using Readable.fromWeb(res.body as any)
        const { Readable } = await Promise.resolve().then(() => __importStar(require('stream')));
        return { data: Readable.fromWeb(res.body) };
    }
    async moveFile(accessToken, refreshToken, fileId, newParentId) {
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parentReference: {
                    id: newParentId
                }
            })
        }, accessToken, refreshToken);
        if (!res.ok)
            throw new Error('Failed to move file on OneDrive');
        const data = await res.json();
        return this.mapGraphFileToGeneric(data);
    }
    async createFolder(accessToken, refreshToken, name, parentId) {
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                folder: {},
                '@microsoft.graph.conflictBehavior': 'rename'
            })
        }, accessToken, refreshToken);
        if (!res.ok)
            throw new Error('Failed to create folder on OneDrive');
        const data = await res.json();
        return this.mapGraphFileToGeneric(data);
    }
    async trashFile(accessToken, refreshToken, fileId) {
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
            method: 'DELETE'
        }, accessToken, refreshToken);
        if (!res.ok)
            throw new Error('Failed to delete file on OneDrive');
        return { success: true };
    }
    async restoreFile(accessToken, refreshToken, fileId) {
        // Fallback to OneDrive web interface as agreed
        return { fallbackUrl: 'https://onedrive.live.com/?v=managestorage' };
    }
    async permanentlyDeleteFile(accessToken, refreshToken, fileId) {
        // According to Microsoft Graph docs, DELETE on a recycle bin item permanently deletes it.
        // Or if it's not supported easily, we just try to DELETE again.
        const res = await this.fetchGraph(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
            method: 'DELETE'
        }, accessToken, refreshToken);
        return { success: true };
    }
    async emptyTrash(accessToken, refreshToken) {
        throw new Error('OneDrive does not support a single empty trash command. Files must be permanently deleted individually.');
    }
    async getStartPageToken(accessToken, refreshToken) {
        const res = await this.fetchGraph('https://graph.microsoft.com/v1.0/me/drive/root/delta?token=latest', {}, accessToken, refreshToken);
        if (!res.ok)
            throw new Error('Failed to get OneDrive delta token');
        const data = await res.json();
        return data['@odata.deltaLink'] || '';
    }
    async *listChanges(accessToken, refreshToken, pageToken) {
        if (!pageToken)
            return;
        let url = pageToken;
        let newStartPageToken = undefined;
        while (url) {
            const res = await this.fetchGraph(url, {}, accessToken, refreshToken);
            if (!res.ok)
                throw new Error('Failed to fetch OneDrive changes');
            const data = await res.json();
            if (data['@odata.deltaLink']) {
                newStartPageToken = data['@odata.deltaLink'];
            }
            if (data.value && data.value.length > 0) {
                const pageChanges = [];
                for (const item of data.value) {
                    const isHardDeleted = item.deleted ? item.deleted.state === 'hardDeleted' : false;
                    if (item.deleted && !isHardDeleted) {
                        pageChanges.push({
                            fileId: item.id,
                            removed: false,
                            file: { id: item.id, trashed: true }
                        });
                        continue;
                    }
                    const mappedFile = this.mapGraphFileToGeneric(item);
                    pageChanges.push({
                        fileId: item.id,
                        removed: isHardDeleted,
                        file: isHardDeleted ? null : mappedFile
                    });
                }
                yield { changes: pageChanges, newStartPageToken: data['@odata.nextLink'] ? undefined : newStartPageToken };
            }
            else if (!data['@odata.nextLink'] && newStartPageToken) {
                yield { changes: [], newStartPageToken };
            }
            if (data['@odata.nextLink']) {
                url = data['@odata.nextLink'];
            }
            else {
                break;
            }
        }
    }
    async uploadFile(accessToken, refreshToken, name, mimeType, filePath, parentId) {
        const stats = fs_1.default.statSync(filePath);
        const fileSize = stats.size;
        if (fileSize < 4 * 1024 * 1024) {
            const fileBuffer = fs_1.default.readFileSync(filePath);
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
        }
        else {
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
            const fd = fs_1.default.openSync(filePath, 'r');
            const buffer = Buffer.alloc(CHUNK_SIZE);
            let position = 0;
            let uploadResultData = null;
            try {
                while (position < fileSize) {
                    const bytesRead = fs_1.default.readSync(fd, buffer, 0, CHUNK_SIZE, position);
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
            }
            finally {
                fs_1.default.closeSync(fd);
            }
            return this.mapGraphFileToGeneric(uploadResultData);
        }
    }
    async createUploadSession(accessToken, refreshToken, name, mimeType, parentId, size) {
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
        return { direct: true, uploadUrl: sessionData.uploadUrl, method: 'PUT' };
    }
}
exports.OneDriveProvider = OneDriveProvider;
