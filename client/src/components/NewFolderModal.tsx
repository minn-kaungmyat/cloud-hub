import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useCreateFolder } from '../hooks/useFiles';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

export const NewFolderModal = () => {
  const { newFolderOpen, setNewFolderOpen } = useUIStore();
  const [name, setName] = useState('');
  const [searchParams] = useSearchParams();
  
  const { mutate: createFolder, isPending } = useCreateFolder();

  // Reset name when modal opens
  useEffect(() => {
    if (newFolderOpen) {
      setName('');
    }
  }, [newFolderOpen]);

  if (!newFolderOpen) return null;

  const handleCreate = () => {
    const folderName = name.trim() || 'Untitled Folder';
    const folderId = searchParams.get('folder') || 'root';
    const accountId = searchParams.get('account') || 'google-drive';

    if (['recent', 'favorites', 'large-files'].includes(accountId)) {
      toast.error('Cannot create folder in this view');
      return;
    }

    toast.promise(
      new Promise((resolve, reject) => {
        createFolder(
          { name: folderName, parentId: folderId, accountId },
          { onSuccess: resolve, onError: reject }
        );
      }),
      {
        loading: 'Creating folder...',
        success: `Created folder "${folderName}"`,
        error: (err) => err.message
      }
    );
    
    setNewFolderOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNewFolderOpen(false)}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">New Folder</h3>
          <button onClick={() => setNewFolderOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <label htmlFor="folder-name" className="block text-xs text-zinc-400 mb-1.5">Folder name</label>
          <input
            id="folder-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Untitled Folder"
            autoFocus
            disabled={isPending}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent transition-colors mb-4 disabled:opacity-50"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setNewFolderOpen(false)}
              disabled={isPending}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="px-3 py-1.5 text-sm font-medium bg-accent text-zinc-950 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
