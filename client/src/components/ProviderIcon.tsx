import { createElement } from 'react';
import { HardDrive, Cloud, Database } from 'lucide-react';
import type { Provider } from '../types';

const providerIcons = {
  'google-drive': HardDrive,
  'dropbox': Cloud,
  'onedrive': Database,
} as const;

const providerLabels: Record<Provider, string> = {
  'google-drive': 'Google Drive',
  'dropbox': 'Dropbox',
  'onedrive': 'OneDrive',
};

export const ProviderIcon = ({ provider, size = 14, className = '' }: { provider: Provider; size?: number; className?: string }) => {
  const icon = providerIcons[provider];
  return createElement(icon, { size, className });
};

// eslint-disable-next-line react-refresh/only-export-components
export const getProviderLabel = (provider: Provider) => providerLabels[provider];
