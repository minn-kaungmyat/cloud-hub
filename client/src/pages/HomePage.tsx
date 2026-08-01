import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilterDrawer } from '../components/FilterDrawer';
import { InfiniteGrid } from '../components/InfiniteGrid';
import { CommandBar } from '../components/CommandBar';
import { FileActionBar } from '../components/FileActionBar';
import { Filter } from 'lucide-react';
import { useFileStore } from '../store/fileStore';
import { useAdvancedBrowse } from '../hooks/useFiles';
import { useCloudAccounts } from '../hooks/useCloudAccounts';

const HomePage = () => {
  const [searchParams] = useSearchParams();
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [wasDrawerOpen, setWasDrawerOpen] = useState(false);
  const { viewMode, setViewMode, inspectorOpen, setInspectorOpen } = useFileStore();

  // Pattern 1: Mutually Exclusive Drawers with memory
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (inspectorOpen) {
      if (isDrawerOpen) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWasDrawerOpen(true);
        timeout = setTimeout(() => setIsDrawerOpen(false), 0);
      }
    } else {
      if (wasDrawerOpen) {
        timeout = setTimeout(() => {
          setIsDrawerOpen(true);
          setWasDrawerOpen(false);
        }, 0);
      }
    }
    return () => clearTimeout(timeout);
  }, [inspectorOpen, isDrawerOpen, wasDrawerOpen]);

  // Parse filters from URL
  const filters = useMemo(() => {
    return {
      type: searchParams.get('type') || null,
      providers: searchParams.getAll('providers'),
      includeAccounts: searchParams.getAll('includeAccounts'),
      excludeAccounts: searchParams.getAll('excludeAccounts'),
      sortBy: searchParams.get('sortBy') || 'date',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    };
  }, [searchParams]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status, refetch } = useAdvancedBrowse(filters);
  const { data: accounts = [] } = useCloudAccounts();

  // Watch for any sync completion globally
  const isAnySyncing = accounts.some(a => a.syncStatus === 'syncing');
  const prevSyncing = React.useRef(isAnySyncing);

  useEffect(() => {
    if (prevSyncing.current && !isAnySyncing) {
      refetch(); // Automatically reload the home page feed when any sync finishes
    }
    prevSyncing.current = isAnySyncing;
  }, [isAnySyncing, refetch]);

  return (
    <div className="flex-1 flex min-h-0 min-w-0 relative bg-zinc-950">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-zinc-950 text-zinc-100 relative">
        <CommandBar 
          segments={[{ id: 'browse', label: 'Home' }]}
          viewMode={viewMode}
          onNavigate={() => {}}
          onViewModeChange={setViewMode}
          rightSlot={
            <div className="flex items-center h-8 border border-zinc-800/80 rounded-md overflow-hidden bg-zinc-950 ml-2">
              <button
                onClick={() => {
                  const nextOpen = !isDrawerOpen;
                  setIsDrawerOpen(nextOpen);
                  if (nextOpen && inspectorOpen) {
                    setInspectorOpen(false);
                  }
                  if (!nextOpen) {
                    setWasDrawerOpen(false); // Explicit close removes memory
                  }
                }}
                className={`flex items-center justify-center w-8 h-full transition-colors ${
                  isDrawerOpen 
                    ? 'bg-zinc-800 text-zinc-200' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Toggle Filters"
              >
                <Filter size={14} />
              </button>
            </div>
          }
        />
        
        <FileActionBar hideNewButton />

        {/* Grid Area */}
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

      {/* Right Drawer */}
      <FilterDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
};

export default HomePage;
