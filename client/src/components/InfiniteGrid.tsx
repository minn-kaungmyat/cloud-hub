import { useEffect, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';
import { FileCard } from './FileCard';
import { FileRow } from './FileRow';
import { FileGridHeader } from './FileGridHeader';
import type { CloudFile } from '../types';
import type { FilesResponse } from '../hooks/useFiles';
import { useFileStore } from '../store/fileStore';
import { useUIStore } from '../store/uiStore';
import type { InfiniteData } from '@tanstack/react-query';

interface InfiniteGridProps {
  data: InfiniteData<FilesResponse> | undefined;
  status: 'pending' | 'error' | 'success';
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

export const InfiniteGrid = ({ data, status, fetchNextPage, hasNextPage, isFetchingNextPage }: InfiniteGridProps) => {
  const { ref, inView } = useInView({ rootMargin: '400px' }); // Pre-fetch before they hit bottom
  const { selectedFileIds, toggleFileSelection, clearSelection, setSelectedFile, viewMode } = useFileStore();
  const setPreviewOpen = useUIStore(s => s.setPreviewOpen);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { multiSelect } = useFileStore();

  const handleClick = (e: React.MouseEvent, file: CloudFile, forceToggle: boolean = false) => {
    e.stopPropagation();
    const isCtrl = e.ctrlKey || e.metaKey || forceToggle;
    const isShift = e.shiftKey;
    const allIds = allFiles.map(f => f.id);
    
    if (isCtrl || isShift) {
      multiSelect(file.id, isCtrl, isShift, allIds);
    } else {
      multiSelect(file.id, false, false, allIds);
    }
  };

  const handleDoubleClick = (file: CloudFile) => {
    if (!file.isFolder) {
      setPreviewOpen(true);
    }
  };

  const allFilesRaw = data?.pages.flatMap((page: FilesResponse) => page.files) || [];
  
  const allFiles = useMemo(() => {
    return [...allFilesRaw].sort((a, b) => {
      if (a.isFolder === b.isFolder) return 0;
      return a.isFolder ? -1 : 1;
    });
  }, [allFilesRaw]);

  if (status === 'pending') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 h-64">
        <Loader2 className="animate-spin mb-4" size={24} />
        <p>Loading files...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-red-500 h-64">
        <p>Error loading files.</p>
      </div>
    );
  }

  if (allFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 h-64">
        <p>No files match your filters.</p>
      </div>
    );
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
            {allFiles.map((file: CloudFile) => (
              <FileRow
                key={file.id}
                file={file}
                selected={selectedFileIds.includes(file.id)}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto pb-8">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {allFiles.map((file: CloudFile) => (
              <FileCard 
                key={file.id} 
                file={file} 
                selected={selectedFileIds.includes(file.id)} 
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              />
            ))}
          </div>
        </div>
      )}

      <div ref={ref} className="h-8 w-full flex items-center justify-center mt-4">
        {isFetchingNextPage && (
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        )}
      </div>
    </div>
  );
};
