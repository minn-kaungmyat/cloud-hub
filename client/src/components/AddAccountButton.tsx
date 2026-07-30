import { Plus } from 'lucide-react';
import { useUIStore } from '../store/uiStore';

export const AddAccountButton = () => {
  const setConnectAccountOpen = useUIStore((s) => s.setConnectAccountOpen);

  return (
    <button
      onClick={() => setConnectAccountOpen(true)}
      className="flex items-center gap-2 px-3 py-1 mx-1 text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-sm transition-colors w-[calc(100%-8px)]"
    >
      <Plus size={14} />
      <span>Add account</span>
    </button>
  );
};
