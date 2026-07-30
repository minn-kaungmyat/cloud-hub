import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useRenameFile } from '../hooks/useFiles';
import { toast } from 'sonner';

export const RenameModal = () => {
  const { renameOpen, renameTarget } = useUIStore();

  if (!renameOpen || !renameTarget) return null;

  // By extracting the inner modal, it completely mounts and unmounts,
  // meaning useState will natively initialize with the correct target name
  // every time the modal is opened, eliminating the need for useEffect synchronization.
  return <RenameModalInner target={renameTarget} />;
};

const RenameModalInner = ({ target }: { target: { id: string; name: string } }) => {
  const { closeRename } = useUIStore();
  const [name, setName] = useState(target.name);
  
  const { mutate, isPending } = useRenameFile();

  const handleSave = () => {
    if (!name.trim() || name === target.name) {
      closeRename();
      return;
    }

    mutate({ id: target.id, newName: name.trim() }, {
      onSuccess: () => {
        toast.success(`Renamed to "${name}"`);
        closeRename();
      },
      onError: (error: Error) => {
        const err = error as Error & { response?: { data?: { message?: string } } };
        toast.error(err.response?.data?.message || 'Failed to rename file');
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeRename}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <h3 className="text-sm font-medium text-zinc-200">Rename File</h3>
          <button onClick={closeRename} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <input
            id="rename-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={isPending}
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all mb-5 disabled:opacity-50"
          />
          <div className="flex justify-end gap-3">
            <button
              onClick={closeRename}
              disabled={isPending}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-accent text-zinc-950 rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
