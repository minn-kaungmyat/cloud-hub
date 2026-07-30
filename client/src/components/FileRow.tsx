import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Folder, FileText, Image, FileSpreadsheet, FileCode, Film, Music, File } from 'lucide-react';
import type { CloudFile } from '../types';
import { FavoriteButton } from './FavoriteButton';
import { FileCheckbox } from './FileCheckbox';
import { useFileStore } from '../store/fileStore';
import { useUIStore } from '../store/uiStore';
import { MoreVertical } from 'lucide-react';

function getFileIcon(mimeType: string, isFolder: boolean): LucideIcon {
  if (isFolder) return Folder;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css')) return FileCode;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('markdown')) return FileText;
  return File;
}

import { formatFileSize, formatDate } from '../utils/format';

export interface FileRowProps {
  file: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent, file: CloudFile) => void;
  onDoubleClick?: (file: CloudFile) => void;
}

export const FileIcon = ({ mimeType, isFolder, size, className }: { mimeType: string; isFolder: boolean; size: number; className: string }) => {
  const icon = getFileIcon(mimeType, isFolder);
  return createElement(icon, { size, className });
};

export const FileRow = ({ file, selected, onClick, onDoubleClick }: FileRowProps) => {
  const { bulkMode, selectedFileIds, toggleFileSelection, setSelectedFile } = useFileStore();
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const isChecked = selectedFileIds.includes(file.id);

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
        if (!isChecked && !selected) {
          if (!bulkMode) {
            setSelectedFile(file.id);
          } else {
            // Right clicking outside selection in bulk mode usually clears it and selects the new item
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
      onDragOver={(e) => {
        if (!file.isFolder) return;
        e.preventDefault(); // allow drop
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('bg-zinc-800/80', 'border-l-accent');
      }}
      onDragLeave={(e) => {
        if (!file.isFolder) return;
        e.currentTarget.classList.remove('bg-zinc-800/80', 'border-l-accent');
      }}
      onDrop={(e) => {
        if (!file.isFolder) return;
        e.preventDefault();
        e.currentTarget.classList.remove('bg-zinc-800/80', 'border-l-accent');
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'));
          if (data.ids) {
            window.dispatchEvent(new CustomEvent('move-file', { detail: { fileIds: data.ids.filter((id: string) => id !== file.id), targetFolderId: file.id } }));
          } else if (data.id && data.id !== file.id) {
            const event = new CustomEvent('move-file', { detail: { fileIds: [data.id], targetFolderId: file.id } });
            window.dispatchEvent(event);
          }
        } catch { 
          // Ignore invalid JSON from drag event
        }
      }}
      className={`flex items-center h-9 px-4 border-b border-zinc-800/40 cursor-pointer transition-colors text-sm select-none group ${
        selected || isChecked
          ? 'bg-zinc-900/40 border-l-2 border-l-accent text-zinc-200'
          : 'text-zinc-300 hover:bg-zinc-800/40 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {bulkMode ? (
          <FileCheckbox
            checked={isChecked}
            onChange={(e) => {
              e.stopPropagation();
              toggleFileSelection(file.id);
            }}
          />
        ) : (
          <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} size={16} className={selected ? 'text-accent shrink-0' : 'text-zinc-500 shrink-0 group-hover:text-zinc-400 transition-colors'} />
        )}
        <span className="truncate">{file.name}</span>
      </div>
      
      <div className="w-8 shrink-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <FavoriteButton
          isFavorite={file.isFavorite}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      </div>

      <div className="w-24 shrink-0 font-mono text-zinc-400 tabular-nums text-xs text-right">
        {formatFileSize(file.size)}
      </div>
      <div className="w-36 shrink-0 font-mono text-zinc-400 tabular-nums text-xs text-right">
        {formatDate(file.modifiedTime)}
      </div>
      <div className="w-8 shrink-0 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setContextMenu(true, e.clientX, e.clientY, file.id);
          }}
          className="flex items-center justify-center w-7 h-7 text-zinc-500 hover:text-zinc-300 rounded-full hover:bg-zinc-800/80 transition-colors cursor-pointer"
        >
          <MoreVertical size={16} />
        </button>
      </div>
    </div>
  );
};
