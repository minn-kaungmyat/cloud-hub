import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';
import { FileCard } from './FileCard';
import { FileRow } from './FileRow';
import { FileGridHeader } from './FileGridHeader';
import type { CloudFile } from '../types';
import type { FilesResponse } from '../hooks/useFiles';
import { useFileStore } from '../store/fileStore';
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

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleClick = (e: React.MouseEvent, file: CloudFile) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      toggleFileSelection(file.id);
    } else {
      setSelectedFile(file.id);
    }
  };

  // const handleDoubleClick = (_file: CloudFile) => {
  //   // Handle preview or double click action if needed in Browse
  // };

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

  const allFiles = data?.pages.flatMap((page: FilesResponse) => page.files) || [];

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
                // onDoubleClick={handleDoubleClick}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-8">
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {allFiles.map((file: CloudFile) => (
                <FileCard 
                  key={file.id} 
                  file={file} 
                  selected={selectedFileIds.includes(file.id)} 
                  onClick={handleClick}
                />
              ))}
            </div>
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
