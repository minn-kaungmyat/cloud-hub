import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import type { CloudFile } from '../types';
import { MoreVertical } from 'lucide-react';
import { FileIcon } from './FileRow';
import { formatFileSize } from '../utils/format';
import { useUIStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';
import { ProviderIcon } from './ProviderIcon';
import { useLocation } from 'react-router-dom';

interface FileCardProps {
  file: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent, file: CloudFile) => void;
  onDoubleClick?: (file: CloudFile) => void;
}

export const FileCard = ({ file, selected, onClick, onDoubleClick }: FileCardProps) => {
  const token = useAuthStore((state) => state.token);
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const setSelectedFile = useFileStore((s) => s.setSelectedFile);
  const [errorFileId, setErrorFileId] = useState<string | null>(null);
  const imgError = errorFileId === file.id;
  const location = useLocation();

  return (
    <div
      id={`file-${file.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e, file);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onDoubleClick) onDoubleClick(file);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selected) {
          setSelectedFile(file.id);
        }
        setContextMenu(true, e.clientX, e.clientY, file.id);
      }}
      draggable
      onDragStart={(e) => {
        const { bulkMode, selectedFileIds } = useFileStore.getState();
        if (bulkMode && selectedFileIds.includes(file.id)) {
          e.dataTransfer.setData('application/json', JSON.stringify({ ids: selectedFileIds, type: 'files' }));
        } else {
          e.dataTransfer.setData('application/json', JSON.stringify({ id: file.id, type: file.isFolder ? 'folder' : 'file' }));
        }
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!file.isFolder) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('bg-zinc-800/80', 'border-zinc-700/50');
      }}
      onDragLeave={(e) => {
        if (!file.isFolder) return;
        e.currentTarget.classList.remove('bg-zinc-800/80', 'border-zinc-700/50');
      }}
      onDrop={(e) => {
        if (!file.isFolder) return;
        e.preventDefault();
        e.currentTarget.classList.remove('bg-zinc-800/80', 'border-zinc-700/50');
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'));
          if (data.ids) {
            window.dispatchEvent(new CustomEvent('move-file', { detail: { fileIds: data.ids.filter((id: string) => id !== file.id), targetFolderId: file.id } }));
          } else if (data.id && data.id !== file.id) {
            const event = new CustomEvent('move-file', { detail: { fileIds: [data.id], targetFolderId: file.id } });
            window.dispatchEvent(event);
          }
        } catch {
          // Ignore parse errors from drag payload
        }
      }}
      className={`
        relative group flex flex-col items-center gap-1.5 cursor-pointer p-2 rounded-md transition-all duration-200 select-none
        ${selected ? 'bg-zinc-800/60 ring-1 ring-zinc-700/50' : 'hover:bg-zinc-900/40'}
      `}
    >
      <div 
        className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 text-zinc-500 z-10 bg-zinc-900/80 hover:bg-zinc-800 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all border border-zinc-700/50 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          setContextMenu(true, e.clientX, e.clientY, file.id);
        }}
      >
        <MoreVertical size={14} className="text-zinc-300" />
      </div>

      <div className={`w-full aspect-[4/3] flex items-center justify-center rounded-lg overflow-hidden transition-transform group-hover:scale-105 relative ${file.isFolder ? 'bg-transparent' : 'bg-zinc-900/30 shadow-sm border border-zinc-800/30'}`}>
        {file.hasThumbnail && !imgError ? (
          <img 
            src={`${import.meta.env.VITE_API_URL}/api/files/${file.id}/thumbnail?token=${token}&v=2`} 
            alt={file.name} 
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            onError={() => setErrorFileId(file.id)}
          />
        ) : (
          <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} size={64} className={file.isFolder ? 'text-zinc-400 group-hover:text-zinc-300 transition-colors' : 'text-zinc-600'} />
        )}
        {location.pathname === '/trash' && (
          <div className="absolute bottom-1 right-1 bg-zinc-950/80 p-1 rounded-md backdrop-blur-sm z-10">
            <ProviderIcon provider={file.provider} size={12} className="text-zinc-300" />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center w-full px-1">
        <span className="text-xs font-medium text-zinc-300 truncate w-full group-hover:text-white leading-tight">
          {file.name}
        </span>
        <span className="text-[10px] text-zinc-500 mt-0.5">
          {file.isFolder ? 'Folder' : formatFileSize(file.size)}
        </span>
      </div>
    </div>
  );
};
