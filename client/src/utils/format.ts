export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(size < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `Today, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMimeType(mimeType: string, isFolder?: boolean): string {
  if (isFolder) return 'Folder';
  if (!mimeType) return 'Unknown File';

  if (mimeType === 'application/vnd.google-apps.document') return 'Google Doc';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides';
  if (mimeType === 'application/vnd.google-apps.form') return 'Google Form';
  if (mimeType === 'application/vnd.google-apps.folder') return 'Google Drive Folder';
  if (mimeType === 'application/vnd.google-apps.shortcut') return 'Google Drive Shortcut';

  if (mimeType === 'application/pdf') return 'PDF Document';
  if (mimeType.startsWith('image/')) return 'Image (' + mimeType.split('/')[1].toUpperCase() + ')';
  if (mimeType.startsWith('video/')) return 'Video (' + mimeType.split('/')[1].toUpperCase() + ')';
  if (mimeType.startsWith('audio/')) return 'Audio (' + mimeType.split('/')[1].toUpperCase() + ')';
  
  if (mimeType.startsWith('text/')) {
    if (mimeType === 'text/x-url') return 'URL Shortcut';
    if (mimeType === 'text/csv') return 'CSV File';
    if (mimeType === 'text/plain') return 'Text Document';
    return 'Text File';
  }
  if (mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') return 'ZIP Archive';

  return mimeType;
}
