export interface ICloudProvider {
  /** 
   * Auth related
   */
  generateAuthUrl(state: string): string;
  getTokens(code: string): Promise<{ access_token: string; refresh_token?: string; expiry_date?: number }>;
  getUserInfo(accessToken: string): Promise<{ id: string; email: string }>;

  /** 
   * Storage information
   */
  getDriveQuota(accessToken: string, refreshToken: string | null): Promise<{ limit?: string; usage?: string }>;

  /**
   * File operations
   */
  listFiles(accessToken: string, refreshToken: string | null): Promise<{ files: any[]; rootFolderId: string }>;
  getThumbnailLink(accessToken: string, refreshToken: string | null, fileId: string): Promise<string | null>;
  renameFile(accessToken: string, refreshToken: string | null, fileId: string, newName: string): Promise<any>;
  downloadFileStream(accessToken: string, refreshToken: string | null, fileId: string, mimeType: string, range?: string): Promise<any>;
  moveFile(accessToken: string, refreshToken: string | null, fileId: string, newParentId: string): Promise<any>;
  createFolder(accessToken: string, refreshToken: string | null, name: string, parentId: string): Promise<any>;
  trashFile(accessToken: string, refreshToken: string | null, fileId: string): Promise<any>;
  restoreFile(accessToken: string, refreshToken: string | null, fileId: string): Promise<any>;
  permanentlyDeleteFile(accessToken: string, refreshToken: string | null, fileId: string): Promise<any>;
  emptyTrash(accessToken: string, refreshToken: string | null): Promise<any>;
  uploadFile(accessToken: string, refreshToken: string | null, name: string, mimeType: string, filePath: string, parentId: string): Promise<any>;

  /**
   * Syncing
   */
  getStartPageToken(accessToken: string, refreshToken: string | null): Promise<string>;
  listChanges(accessToken: string, refreshToken: string | null, pageToken: string): Promise<{ changes: any[]; newStartPageToken?: string }>;
}
