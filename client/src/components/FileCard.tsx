import { useAuthStore } from '../store/authStore';
import type { CloudFile } from '../types';
import { MoreVertical } from 'lucide-react';
import { FileIcon } from './FileRow';
import { formatFileSize, formatDate } from '../utils/format';
import { useUIStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';

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
        const { bulkMode, selectedFileIds } = useFileStore.getState();
        const isChecked = selectedFileIds.includes(file.id);
        
        if (!isChecked && !selected) {
          if (!bulkMode) {
            setSelectedFile(file.id);
          } else {
            setSelectedFile(file.id);
          }
        }
        setContextMenu(true, e.clientX, e.clientY, file.id);
      }}
      draggable
      onDragStart={(e) => {
        const { bulkMode, selectedFileIds } = useFileStore.getState();
        if (bulkMode && selectedFileIds.includes(file.id)) {
          e.dataTransfer.setData('application/json', JSON.stringify({ ids: selectedFileIds, type: 'files' }));
        } else {
          e.dataTransfer.setData('application/json', JSON.stringify({ id: file.id, type: 'file' }));
        }
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`
        relative group flex flex-col rounded-md cursor-pointer border transition-colors duration-200 overflow-hidden
        ${selected ? 'bg-zinc-800/90 border-zinc-700 ring-1 ring-zinc-700' : 'bg-zinc-900/60 border-zinc-800/40 hover:bg-zinc-800/80 hover:border-zinc-700/60'}
      `}
    >
      <div 
        className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 text-zinc-500 z-10 bg-zinc-900/80 hover:bg-zinc-800 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all border border-zinc-700/50 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          setContextMenu(true, e.clientX, e.clientY, file.id);
        }}
      >
        <MoreVertical size={16} className="text-zinc-300" />
      </div>

      <div className="w-full aspect-video flex items-center justify-center bg-zinc-950/50 overflow-hidden relative">
        {file.hasThumbnail ? (
          <img 
            src={`${import.meta.env.VITE_API_URL}/api/files/${file.id}/thumbnail?token=${token}`} 
            alt={file.name} 
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} size={48} className={file.isFolder ? 'text-accent/90' : 'text-zinc-600'} />
        )}
      </div>

      <div className="flex-1 flex flex-col p-3 border-t border-zinc-800/40">
        <div className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">{file.name}</div>
        <div className="text-xs text-zinc-500 mt-1 flex justify-between items-center">
          <span>{file.isFolder ? 'Folder' : formatFileSize(file.size)}</span>
          <span>{formatDate(file.modifiedTime)}</span>
        </div>
      </div>
    </div>
  );
};
