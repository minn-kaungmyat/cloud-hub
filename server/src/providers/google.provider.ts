import { google } from 'googleapis';
import fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
];

export const getGoogleOAuthClient = () => {
  return new google.auth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${process.env.API_URL}/api/cloud-accounts/callback/google-drive`
  });
};

export const generateAuthUrl = (state: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    redirect_uri: `${process.env.API_URL}/api/cloud-accounts/callback/google-drive`
  });
};

export const getTokens = async (code: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
};

export const getUserInfo = async (accessToken: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
  const { data } = await oauth2.userinfo.get();
  return data; // { email, id, ... }
};

export const listFiles = async (accessToken: string, refreshToken: string | null) => {
  const oAuth2Client = getGoogleOAuthClient();
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
  
  return { files: allFiles, rootFolderId: rootFolderId! };
};

export const getThumbnailLink = async (accessToken: string, refreshToken: string | null, fileId: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const res = await drive.files.get({
    fileId,
    fields: 'thumbnailLink'
  });
  
  return res.data.thumbnailLink || null;
};

export const getDriveQuota = async (accessToken: string, refreshToken: string | null) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const res = await drive.about.get({
    fields: 'storageQuota'
  });
  
  return res.data.storageQuota;
};

export const renameFile = async (accessToken: string, refreshToken: string | null, fileId: string, newName: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const res = await drive.files.update({
    fileId,
    requestBody: {
      name: newName,
    },
    fields: 'id, name, modifiedTime',
  });
  
  return res.data;
};
export const downloadFileStream = async (accessToken: string, refreshToken: string | null, fileId: string, mimeType: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  
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
    }, { responseType: 'stream' });
  } else {
    // Download standard file
    return drive.files.get({
      fileId,
      alt: 'media'
    }, { responseType: 'stream' });
  }
};

export const moveFile = async (accessToken: string, refreshToken: string | null, fileId: string, newParentId: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

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
};

export const createFolder = async (accessToken: string, refreshToken: string | null, name: string, parentId: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

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
};

export const trashFile = async (accessToken: string, refreshToken: string | null, fileId: string) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  const res = await drive.files.update({
    fileId,
    requestBody: { trashed: true }
  });

  return res.data;
};

export const getStartPageToken = async (accessToken: string, refreshToken: string | null) => {
  const oAuth2Client = getGoogleOAuthClient();
  oAuth2Client.setCredentials({ 
    access_token: accessToken,
    refresh_token: refreshToken || undefined
  });
  
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const res = await drive.changes.getStartPageToken({});
  return res.data.startPageToken;
};

export const listChanges = async (accessToken: string, refreshToken: string | null, pageToken: string) => {
  const oAuth2Client = getGoogleOAuthClient();
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
};

export const uploadFile = async (
  accessToken: string,
  refreshToken: string | null,
  name: string,
  mimeType: string,
  filePath: string,
  parentId: string
) => {
  const oAuth2Client = getGoogleOAuthClient();
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
  });

  return res.data;
};
