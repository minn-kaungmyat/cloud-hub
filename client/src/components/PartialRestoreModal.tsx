import { ExternalLink } from 'lucide-react';
import { ProviderIcon } from './ProviderIcon';
import type { CloudFile } from '../types';

interface PartialRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  filesToRestore: CloudFile[];
  onConfirm: () => void;
}

export const PartialRestoreModal = ({ isOpen, onClose, filesToRestore, onConfirm }: PartialRestoreModalProps) => {
  if (!isOpen) return null;

  const googleFiles = filesToRestore.filter(f => f.provider === 'google-drive');
  const externalFiles = filesToRestore.filter(f => f.provider !== 'google-drive');
  
  const hasDropbox = externalFiles.some(f => f.provider === 'dropbox');
  const hasOneDrive = externalFiles.some(f => f.provider === 'onedrive');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-zinc-200 mb-3">
          {googleFiles.length > 0 ? 'Mixed Selection Detected' : 'External Restore Required'}
        </h3>
        
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          You selected {filesToRestore.length} file{filesToRestore.length !== 1 && 's'}. 
          {googleFiles.length > 0 && ` ${googleFiles.length} file${googleFiles.length !== 1 ? 's' : ''} can be restored immediately to Google Drive.`}
          {externalFiles.length > 0 && ` Microsoft and Dropbox require you to restore items directly from their web interfaces.`}
        </p>

        {externalFiles.length > 0 && (
          <div className="bg-zinc-950/50 border border-zinc-800/40 rounded-md p-3 mb-5 flex flex-col gap-2">
            {hasDropbox && (
              <a 
                href="https://www.dropbox.com/deleted_files" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white group"
                onClick={googleFiles.length === 0 ? onClose : undefined}
              >
                <ProviderIcon provider="dropbox" size={14} className="text-zinc-500 group-hover:text-zinc-400" />
                <span>Open Dropbox Trash</span>
                <ExternalLink size={12} className="text-zinc-600 group-hover:text-zinc-400 ml-auto" />
              </a>
            )}
            {hasOneDrive && (
              <a 
                href="https://onedrive.live.com/?v=managestorage" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white group"
                onClick={googleFiles.length === 0 ? onClose : undefined}
              >
                <ProviderIcon provider="onedrive" size={14} className="text-zinc-500 group-hover:text-zinc-400" />
                <span>Open OneDrive Trash</span>
                <ExternalLink size={12} className="text-zinc-600 group-hover:text-zinc-400 ml-auto" />
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-md transition-colors"
          >
            {googleFiles.length > 0 ? 'Cancel' : 'Close'}
          </button>
          {googleFiles.length > 0 && (
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-3 py-1.5 text-sm font-medium bg-accent text-zinc-950 hover:opacity-90 rounded-md transition-colors"
            >
              Restore {googleFiles.length} Google File{googleFiles.length !== 1 && 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
