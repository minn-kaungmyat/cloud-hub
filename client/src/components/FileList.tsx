import React, { useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { FolderX, Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { FileGridHeader } from './FileGridHeader';
import { FileRow } from './FileRow';
import { FileCard } from './FileCard';
import { useActiveAccount } from '../hooks/useActiveAccount';
import { EmptyState } from './EmptyState';
import { useFileStore } from '../store/fileStore';
import { useFiles, useMoveFile } from '../hooks/useFiles';
import { useCloudAccounts } from '../hooks/useCloudAccounts';
import { toast } from 'sonner';
import type { CloudFile } from '../types';

export const FileList = () => {
  const { selectedFileId, selectedFileIds, clearSelection, viewMode } = useFileStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const activeAccount = useActiveAccount();
  const accountId = ['recent', 'favorites', 'large-files'].includes(activeAccount) ? undefined : activeAccount;
  const currentFolderId = searchParams.get('folder') || 'root';

  const { data: accounts } = useCloudAccounts();
  const currentAccount = accounts?.find(a => a.id === accountId);
  const isSyncing = currentAccount?.syncStatus === 'syncing';

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status, refetch } = useFiles(accountId, currentFolderId);
  const { ref, inView } = useInView();
  
  const prevSyncing = React.useRef(isSyncing);

  React.useEffect(() => {
    if (prevSyncing.current && !isSyncing) {
      refetch(); // Automatically reload files when sync finishes
    }
    prevSyncing.current = isSyncing;
  }, [isSyncing, refetch]);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Contextual Navigation: Auto-scroll to the item specifically after jumping from Search
  const scrollToId = location.state?.scrollToId;
  useEffect(() => {
    if (scrollToId && status === 'success') {
      requestAnimationFrame(() => {
        const element = document.getElementById(`file-${scrollToId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Clean up the history state so it doesn't trigger on 'Back' navigation
          const newHistoryState = { ...window.history.state };
          if (newHistoryState.usr) {
            delete newHistoryState.usr.scrollToId;
          }
          
          window.history.replaceState(
            newHistoryState, 
            '', 
            window.location.pathname + window.location.search
          );
        }
      });
    }
  }, [scrollToId, status, clearSelection]);

  const displayedFiles = React.useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.files);
  }, [data]);

  const { mutateAsync: moveFileAsync } = useMoveFile();

  useEffect(() => {
    const handleMove = (e: Event) => {
      const customEvent = e as CustomEvent<{ fileIds: string[]; targetFolderId: string; targetFolderName?: string }>;
      const { fileIds, targetFolderId, targetFolderName } = customEvent.detail;
      
      const filesToMove = displayedFiles.filter(f => fileIds.includes(f.id));
      const targetFolder = displayedFiles.find(f => f.id === targetFolderId);
      
      const folderName = targetFolder?.name || targetFolderName;
      
      if (filesToMove.length > 0 && folderName) {
        const nameDesc = filesToMove.length === 1 ? `"${filesToMove[0].name}"` : `${filesToMove.length} items`;
        
        toast.promise(
          Promise.all(fileIds.map(id => moveFileAsync({ id, newParentId: targetFolderId })))
            .finally(() => {
              if (fileIds.length > 1) clearSelection();
            }),
          {
            loading: `Moving ${nameDesc} to "${folderName}"...`,
            success: `Moved ${nameDesc}`,
            error: (err) => err.message
          }
        );
      }
    };
    
    window.addEventListener('move-file', handleMove);
    return () => window.removeEventListener('move-file', handleMove as EventListener);
  }, [moveFileAsync, displayedFiles, clearSelection]);

  const { multiSelect } = useFileStore();

  const handleClick = (e: React.MouseEvent, file: CloudFile) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    
    if (isCtrl || isShift) {
      multiSelect(file.id, isCtrl, isShift, displayedFiles.map(f => f.id));
    } else {
      multiSelect(file.id, false, false, displayedFiles.map(f => f.id));
    }
  };

  const handleDoubleClick = (file: CloudFile) => {
    if (file.isFolder) {
      searchParams.set('folder', file.id);
      setSearchParams(searchParams);
      clearSelection();
    }
  };

  const sortedFiles = React.useMemo(() => {
    return [...displayedFiles].sort((a, b) => {
      if (a.isFolder === b.isFolder) return 0;
      return a.isFolder ? -1 : 1;
    });
  }, [displayedFiles]);

  if (status === 'pending') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (displayedFiles.length === 0) {
    if (isSyncing) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-zinc-400 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <div className="text-center">
            <p className="text-zinc-200 font-medium">Organizing your files</p>
            <p className="text-sm">This might take a minute...</p>
          </div>
        </div>
      );
    }
    return <EmptyState icon={FolderX} message="This folder is empty." />;
  }

  return (
    <div 
      className="flex-1 overflow-y-auto h-full p-4 md:p-6"
      onClick={() => clearSelection()}
    >
      {viewMode === 'list' ? (
        <div className="max-w-5xl mx-auto">
          <FileGridHeader />
          <div className="pb-4">
            {sortedFiles.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                selected={file.id === selectedFileId || selectedFileIds.includes(file.id)}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto pb-8">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {sortedFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                selected={file.id === selectedFileId || selectedFileIds.includes(file.id)}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Infinite Scroll Trigger */}
      <div ref={ref} className="h-8 w-full flex items-center justify-center mt-4">
        {isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin text-blue-500" />}
      </div>
    </div>
  );
};
