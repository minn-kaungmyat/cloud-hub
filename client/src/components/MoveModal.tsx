import { useState } from 'react';
import { X, Folder, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useFolders, useMoveFile } from '../hooks/useFiles';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useFileStore } from '../store/fileStore';

interface FolderTreeItemProps {
  folderId: string;
  localId: string;
  name: string;
  depth?: number;
  accountId?: string;
  selectedId: string;
  onSelect: (id: string, name: string) => void;
  defaultExpanded?: boolean;
}

const FolderTreeItem = ({ folderId, localId, name, depth = 0, accountId, selectedId, onSelect, defaultExpanded = false }: FolderTreeItemProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Only enable the query if this folder is expanded
  const { data, isLoading } = useFolders(accountId, isExpanded ? folderId : undefined);

  const folders = data?.pages.flatMap(p => p.files) || [];
  
  const isSelected = selectedId === localId;

  return (
    <div>
      <div
        className={`w-full flex items-center gap-2 py-1.5 px-2 text-sm rounded-sm transition-colors cursor-pointer ${
          isSelected ? 'bg-accent/20 text-accent' : 'text-zinc-300 hover:bg-zinc-800/40'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(localId, name)}
      >
        <button 
          className="w-4 h-4 flex items-center justify-center shrink-0 hover:bg-zinc-700/50 rounded"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-zinc-400" />
          ) : (
            <ChevronRight size={14} className="text-zinc-400" />
          )}
        </button>
        
        <Folder size={14} className={isSelected ? 'text-accent' : 'text-zinc-500'} shrink-0={true.toString()} />
        <span className="truncate">{name}</span>
      </div>
      
      {isExpanded && (
        <div className="flex flex-col">
          {isLoading && (
            <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(depth + 1) * 16 + 32}px` }}>
              <Loader2 size={12} className="animate-spin text-zinc-500" />
              <span className="text-xs text-zinc-500">Loading...</span>
            </div>
          )}
          {folders.map((child) => (
            <FolderTreeItem
              key={child.id}
              folderId={child.id}
              localId={child.id}
              name={child.name}
              depth={depth + 1}
              accountId={accountId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
          {!isLoading && folders.length === 0 && (
            <div className="py-1 text-xs text-zinc-500 italic" style={{ paddingLeft: `${(depth + 1) * 16 + 32}px` }}>
              No sub-folders
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const MoveModal = () => {
  const { moveOpen, moveTarget, closeMove } = useUIStore();
  const [searchParams] = useSearchParams();
  
  const [selectedId, setSelectedId] = useState<string>('root');
  const [selectedName, setSelectedName] = useState<string>('My Drive');
  
  const activeAccount = searchParams.get('account') || 'google-drive';
  const accountId = ['recent', 'favorites', 'large-files'].includes(activeAccount) ? undefined : activeAccount;

  const { mutateAsync: moveFileAsync, isPending } = useMoveFile();

  if (!moveOpen || !moveTarget) return null;

  const handleMove = () => {
    const { bulkMode, selectedFileIds, clearSelection } = useFileStore.getState();
    const targetIds = bulkMode ? selectedFileIds : [moveTarget.id];
    
    if (targetIds.includes(selectedId)) {
      toast.error('Cannot move a folder into itself');
      return;
    }
    
    toast.promise(
      Promise.all(targetIds.map(id => moveFileAsync({ id, newParentId: selectedId })))
        .finally(() => {
          if (bulkMode) clearSelection();
        }),
      {
        loading: `Moving ${moveTarget.name} to "${selectedName}"...`,
        success: `Moved ${moveTarget.name}`,
        error: (err) => err.message
      }
    );
    
    closeMove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeMove}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-sm flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-medium text-zinc-200 truncate pr-4">Move "{moveTarget.name}"</h3>
          <button onClick={closeMove} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 overflow-y-auto flex-1 min-h-[200px]">
          <FolderTreeItem 
            folderId="root" 
            localId="root"
            name="My Drive" 
            accountId={accountId} 
            selectedId={selectedId}
            onSelect={(id, name) => {
              setSelectedId(id);
              setSelectedName(name);
            }}
            defaultExpanded={true}
          />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={closeMove}
            disabled={isPending}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium bg-accent text-zinc-950 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Move here
          </button>
        </div>
      </div>
    </div>
  );
};
