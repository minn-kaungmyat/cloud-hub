export type Provider = 'google-drive' | 'dropbox' | 'onedrive';

export interface CloudAccount {
  id: string;
  provider: Provider;
  email: string;
  label: string;
  storageUsed: number;
  storageTotal: number;
  status: 'connected' | 'syncing' | 'error' | 'expired';
  syncStatus: 'idle' | 'syncing' | 'completed' | 'failed';
  lastSyncedAt: string;
  syncError: string | null;
  fileCount: number;
}

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  isFolder: boolean;
  parentId: string | null;
  provider: Provider;
  cloudAccountId: string;
  modifiedTime: string;
  hasThumbnail: boolean;
  isFavorite: boolean;
  tags: string[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface BreadcrumbSegment {
  id: string;
  label: string;
}

export type ViewMode = 'list' | 'grid';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: 'upload' | 'download' | 'delete' | 'rename' | 'move' | 'share' | 'favorite' | 'sync';
  fileName: string;
  provider: Provider;
  timestamp: string;
  description: string;
}

export interface SearchFilter {
  query: string;
  provider: Provider | 'all';
  mimeType: string | null;
  tags: string[];
  dateFrom: string | null;
  dateTo: string | null;
  minSize: number | null;
  maxSize: number | null;
}

export interface UploadItem {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  targetAccountId: string;
}
