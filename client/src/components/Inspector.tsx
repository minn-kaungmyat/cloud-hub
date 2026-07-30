import { Share, Download, Link as LinkIcon, Trash2, File, Edit3, FolderInput, X } from 'lucide-react';
import { IconButton } from './IconButton';
import { MetadataRow } from './MetadataRow';
import { useFileStore } from '../store/fileStore';
import { useUIStore } from '../store/uiStore';
import { useCloudAccounts } from '../hooks/useCloudAccounts';
import { useFiles, useDeleteFile } from '../hooks/useFiles';
import { ProviderIcon, getProviderLabel } from './ProviderIcon';
import { StatusBadge } from './StatusBadge';
import { useAuthStore } from '../store/authStore';
import { FileIcon } from './FileRow';
import { formatFileSize, formatDate, formatMimeType } from '../utils/format';
import { useSearchParams } from 'react-router-dom';

export const Inspector = () => {
  const { selectedFileId, toggleInspector } = useFileStore();
  const { openRename, openMove, openConfirm } = useUIStore();
  const { data: accounts = [] } = useCloudAccounts();
  const token = useAuthStore((state) => state.token);
  const [searchParams] = useSearchParams();
  const activeAccount = searchParams.get('account') || 'google-drive';
  const accountId = ['recent', 'favorites', 'large-files'].includes(activeAccount) ? undefined : activeAccount;
  const folderId = searchParams.get('folder') || 'root';
  const { data } = useFiles(accountId, folderId);
  const { mutate: deleteFile } = useDeleteFile();
  const files = data?.pages.flatMap(p => p.files) ?? [];
  
  const file = files.find((f) => f.id === selectedFileId);
  const account = file ? accounts.find(a => a.id === file.cloudAccountId) : null;

  return (
    <aside className="w-[320px] flex flex-col border-l border-zinc-800/60 bg-zinc-900/40 shrink-0">
      <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-800/60 font-medium text-sm text-zinc-200">
        Inspector
        <button onClick={toggleInspector} className="text-zinc-500 hover:text-zinc-300">
          <X size={16} />
        </button>
      </div>

      {!file ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
          <File size={32} className="mb-4 text-zinc-700" />
          <p className="text-sm">Select a file or folder to view its details</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4">
            {/* Preview thumbnail */}
            <div className="aspect-video bg-zinc-950/50 rounded-sm mb-4 border border-zinc-800/60 flex items-center justify-center overflow-hidden">
              {file.hasThumbnail ? (
                <img 
                  src={`${import.meta.env.VITE_API_URL}/api/files/${file.id}/thumbnail?token=${token}`} 
                  alt={file.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} size={48} className={file.isFolder ? 'text-accent/90' : 'text-zinc-600'} />
              )}
            </div>

            {/* File name */}
            <h3 className="font-medium text-zinc-200 mb-4 break-all text-sm">{file.name}</h3>

            {/* Metadata */}
            <div className="space-y-3 text-sm">
              <MetadataRow label="Size" value={formatFileSize(file.size)} />
              <MetadataRow label="Type" value={formatMimeType(file.mimeType, file.isFolder)} />
              <MetadataRow label="Modified" value={formatDate(file.modifiedTime)} />

              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/40 mt-3">
                <span className="text-zinc-500">Location</span>
                <div className="flex items-center gap-2 bg-zinc-900 p-2 rounded-sm border border-zinc-800/60">
                  <ProviderIcon provider={file.provider} size={14} className="text-zinc-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-300 truncate">{getProviderLabel(file.provider)}</div>
                    {account && <div className="text-[10px] text-zinc-500 truncate">{account.email}</div>}
                  </div>
                </div>
              </div>
              
              {account && (
                <div className="flex justify-between items-center py-2">
                   <span className="text-zinc-500">Sync Status</span>
                   <StatusBadge status={account.status} />
                </div>
              )}

              {file.tags.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/40 mt-3">
                  <span className="text-zinc-500 block mb-2">Tags</span>
                  <div className="flex gap-2 flex-wrap">
                    {file.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono text-[10px] px-2 py-0.5 rounded-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="p-4 border-t border-zinc-800/60 grid grid-cols-3 gap-2 shrink-0">
            <IconButton icon={Edit3} label="Rename" onClick={() => openRename(file.id, file.name)} />
            <IconButton icon={FolderInput} label="Move" onClick={() => openMove(file.id, file.name)} />
            <IconButton icon={Share} label="Share" onClick={() => {}} />
            <IconButton icon={LinkIcon} label="Copy Link" onClick={() => {}} />
            <IconButton icon={Download} label="Download" onClick={() => {}} />
            <IconButton 
              icon={Trash2} 
              label="Delete" 
              variant="danger" 
              onClick={() => openConfirm('Delete File', `Are you sure you want to delete "${file.name}"?`, 'danger', () => {
                deleteFile(file.id, {
                  onSuccess: () => clearSelection()
                });
              })} 
            />
          </div>
        </>
      )}
    </aside>
  );
};
