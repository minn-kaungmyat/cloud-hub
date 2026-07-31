import { Folder, MoreVertical } from 'lucide-react';
import type { CloudFile } from '../types';
import { useUIStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';

interface FolderCardProps {
  file: CloudFile;
  selected: boolean;
  onClick: (e: React.MouseEvent, file: CloudFile) => void;
  onDoubleClick?: (file: CloudFile) => void;
}

export const FolderCard = ({ file, selected, onClick, onDoubleClick }: FolderCardProps) => {
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const setSelectedFile = useFileStore((s) => s.setSelectedFile);

  return (
    <div
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
          e.dataTransfer.setData('application/json', JSON.stringify({ id: file.id, type: 'folder' }));
        }
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault(); // allow drop
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('bg-zinc-800/90', 'border-accent/60', 'ring-1', 'ring-accent/50');
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove('bg-zinc-800/90', 'border-accent/60', 'ring-1', 'ring-accent/50');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-zinc-800/90', 'border-accent/60', 'ring-1', 'ring-accent/50');
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
        relative group flex flex-row items-center gap-4 px-4 py-3 rounded-md cursor-pointer border transition-all duration-200
        ${selected ? 'bg-zinc-800/80 border-zinc-700/80 ring-1 ring-zinc-700' : 'bg-zinc-900/60 border-zinc-800/40 hover:bg-zinc-800/60 hover:border-zinc-700/60'}
      `}
    >
      <div className="shrink-0 text-zinc-400 group-hover:text-zinc-300 transition-colors">
        <Folder size={24} className="fill-zinc-800 group-hover:fill-zinc-700 transition-colors" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-200 truncate">{file.name}</div>
      </div>
      
      <div 
        className="shrink-0 flex items-center justify-center w-7 h-7 -mr-2 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-zinc-800/80 hover:text-zinc-300 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          setContextMenu(true, e.clientX, e.clientY, file.id);
        }}
      >
        <MoreVertical size={16} />
      </div>
    </div>
  );
};
