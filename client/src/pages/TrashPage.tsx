import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InfiniteGrid } from '../components/InfiniteGrid';
import { CommandBar } from '../components/CommandBar';
import { FileActionBar } from '../components/FileActionBar';
import { useFileStore } from '../store/fileStore';
import { useAdvancedBrowse, useEmptyTrash } from '../hooks/useFiles';
import { useCloudAccounts } from '../hooks/useCloudAccounts';
import { Trash2 } from 'lucide-react';
import { useUIStore } from '../store/uiStore';

const TrashPage = () => {
  const [searchParams] = useSearchParams();
  const { viewMode, setViewMode } = useFileStore();
  const { openConfirm } = useUIStore();
  const { mutateAsync: emptyTrash, isPending: isEmptyingTrash } = useEmptyTrash();
  const { data: accounts = [] } = useCloudAccounts();

  // Parse filters from URL, enforcing isTrashed: true
  const filters = useMemo(() => {
    return {
      type: searchParams.get('type') || null,
      providers: searchParams.getAll('providers'),
      includeAccounts: searchParams.getAll('includeAccounts'),
      excludeAccounts: searchParams.getAll('excludeAccounts'),
      sortBy: searchParams.get('sortBy') || 'date',
      sortOrder: searchParams.get('sortOrder') || 'desc',
      isTrashed: true,
    };
  }, [searchParams]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status, refetch } = useAdvancedBrowse(filters);

  const handleEmptyTrash = () => {
    // Collect unique provider names from user's accounts
    const providerNames = Array.from(new Set(accounts.map(a => a.provider)));
    
    // Instead of a complex multi-select modal for now, we'll just show a global confirm
    // that empties all trash for all connected providers.
    openConfirm(
      'Empty All Trash',
      'Are you sure you want to permanently delete all items in the trash across all your cloud accounts? This action cannot be undone.',
      'danger',
      () => {
        emptyTrash(providerNames).then(() => refetch());
      }
    );
  };

  return (
    <div className="flex-1 flex min-h-0 min-w-0 relative bg-zinc-950">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950 text-zinc-100 relative">
        <CommandBar 
          segments={[{ id: 'trash', label: 'Trash' }]}
          viewMode={viewMode}
          onNavigate={() => {}}
          onViewModeChange={setViewMode}
          rightSlot={
            <div className="flex items-center h-8 ml-2">
              <button
                onClick={handleEmptyTrash}
                disabled={isEmptyingTrash || status === 'pending' || (data?.pages[0]?.files.length === 0)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-red-400 text-zinc-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Empty Trash"
              >
                <Trash2 size={14} />
                {isEmptyingTrash ? 'Emptying...' : 'Empty Trash'}
              </button>
            </div>
          }
        />
        
        <FileActionBar hideNewButton isTrashMode />

        <div className="bg-zinc-900/50 border-b border-zinc-800/40 px-4 py-2 text-xs text-zinc-400 text-center">
          Items in the trash may be permanently deleted after 30 days depending on your cloud provider.
        </div>

        <div className="flex-1 overflow-y-auto relative">
          <InfiniteGrid 
            data={data}
            status={status}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </div>
      </div>
    </div>
  );
};

export default TrashPage;
