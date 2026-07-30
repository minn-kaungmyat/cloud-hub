
import type {  User, Activity, UploadItem } from '../types';

export const mockUser: User = {
  id: 'user-1',
  name: 'Min Kaung',
  email: 'min@example.com',
  avatar: 'M',
  createdAt: '2026-01-15T08:00:00Z',
};

export const mockActivities: Activity[] = [
  { id: 'act-1', type: 'upload', fileName: 'UI_Mockups_Final.fig', provider: 'google-drive', timestamp: '2026-10-25T14:32:00Z', description: 'Uploaded to Work Drive' },
  { id: 'act-2', type: 'rename', fileName: 'Q3_Budget_Report.xlsx', provider: 'google-drive', timestamp: '2026-10-23T16:50:00Z', description: 'Renamed from "budget_q3.xlsx"' },
  { id: 'act-3', type: 'download', fileName: 'logo_final_v3.svg', provider: 'dropbox', timestamp: '2026-10-23T15:00:00Z', description: 'Downloaded from Dropbox' },
  { id: 'act-4', type: 'share', fileName: 'presentation_deck.pptx', provider: 'google-drive', timestamp: '2026-10-22T10:00:00Z', description: 'Shared with team@company.com' },
  { id: 'act-5', type: 'favorite', fileName: 'Documents', provider: 'google-drive', timestamp: '2026-10-21T09:00:00Z', description: 'Added to favorites' },
  { id: 'act-6', type: 'delete', fileName: 'old_backup.zip', provider: 'dropbox', timestamp: '2026-10-20T17:30:00Z', description: 'Deleted from Dropbox' },
  { id: 'act-7', type: 'move', fileName: 'CloudHub_Architecture.pdf', provider: 'google-drive', timestamp: '2026-10-20T14:00:00Z', description: 'Moved to Documents' },
  { id: 'act-8', type: 'sync', fileName: '', provider: 'google-drive', timestamp: '2026-10-20T08:00:00Z', description: 'Synced Work Drive — 142 files updated' },
  { id: 'act-9', type: 'upload', fileName: 'backup_config.json', provider: 'dropbox', timestamp: '2026-10-17T08:30:00Z', description: 'Uploaded to Dropbox' },
  { id: 'act-10', type: 'sync', fileName: '', provider: 'onedrive', timestamp: '2026-10-16T10:00:00Z', description: 'Synced OneDrive — 23 files updated' },
];

export const mockUploadItems: UploadItem[] = [
  { id: 'upl-1', fileName: 'new_design_v2.fig', size: 32000000, progress: 100, status: 'complete', targetAccountId: 'acc-1' },
  { id: 'upl-2', fileName: 'quarterly_analysis.xlsx', size: 1200000, progress: 65, status: 'uploading', targetAccountId: 'acc-1' },
  { id: 'upl-3', fileName: 'team_photo.png', size: 5400000, progress: 30, status: 'uploading', targetAccountId: 'acc-3' },
  { id: 'upl-4', fileName: 'corrupted_file.dat', size: 800000, progress: 12, status: 'error', targetAccountId: 'acc-4' },
  { id: 'upl-5', fileName: 'readme.md', size: 4096, progress: 0, status: 'pending', targetAccountId: 'acc-1' },
];
