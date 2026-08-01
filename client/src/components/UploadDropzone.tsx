import { Upload } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useUploadStore } from '../store/uploadStore';
import { useSearchParams } from 'react-router-dom';
import { useActiveAccount } from '../hooks/useActiveAccount';

export const UploadDropzone = () => {
  const { dragOver, setDragOver } = useUIStore();
  const addFolderUploads = useUploadStore((s) => s.addFolderUploads);
  
  const [searchParams] = useSearchParams();
  const activeAccount = useActiveAccount();
  const folderId = searchParams.get('folder') || 'root';
  const isCollection = ['recent', 'favorites', 'large-files'].includes(activeAccount);
  const accountId = isCollection ? '' : activeAccount;

  if (!dragOver || isCollection) return null;

  return (
    <div
      className="absolute inset-0 z-40 bg-zinc-950/80 flex items-center justify-center"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        if (isCollection) return;

        const files: File[] = [];
        const items = e.dataTransfer.items;

        if (items) {
          // Recursively read items
          const traverse = async (entry: FileSystemEntry, path: string = '') => {
            if (entry.isFile) {
              const fileEntry = entry as FileSystemFileEntry;
              await new Promise<void>((resolve) => {
                fileEntry.file((file) => {
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: path + file.name,
                    writable: false
                  });
                  files.push(file);
                  resolve();
                });
              });
            } else if (entry.isDirectory) {
              const dirEntry = entry as FileSystemDirectoryEntry;
              const dirReader = dirEntry.createReader();
              await new Promise<void>((resolve) => {
                dirReader.readEntries(async (entries) => {
                  for (let i = 0; i < entries.length; i++) {
                    await traverse(entries[i], path + entry.name + '/');
                  }
                  resolve();
                });
              });
            }
          };

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry();
              if (entry) await traverse(entry);
            }
          }
        } else {
          // Fallback
          files.push(...Array.from(e.dataTransfer.files));
        }

        if (files.length > 0) {
          addFolderUploads(files, accountId, folderId);
        }
      }}
    >
      <div className="flex flex-col items-center gap-3 pointer-events-none">
        <div className="w-16 h-16 rounded-md border-2 border-dashed border-accent/60 flex items-center justify-center">
          <Upload size={28} className="text-accent" />
        </div>
        <span className="text-sm text-zinc-300 font-medium">Drop files here to upload</span>
        <span className="text-xs text-zinc-500">Files will be uploaded to the current location</span>
      </div>
    </div>
  );
};
