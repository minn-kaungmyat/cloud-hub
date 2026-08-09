import { create } from 'zustand';
import { api } from '../utils/api';
import { queryClient } from '../utils/queryClient';
import axios from 'axios';

export interface UploadItem {
  id: string;
  file: File;
  fileName: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  accountId: string;
  folderId: string;
  abortController?: AbortController;
}

interface UploadStore {
  uploads: UploadItem[];
  isExpanded: boolean;
  addUploads: (files: File[], accountId: string, folderId: string, folderIdMap?: Record<string, string>) => void;
  addFolderUploads: (files: File[], accountId: string, folderId: string) => Promise<void>;
  removeUpload: (id: string) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  dismissAllCompleted: () => void;
  cancelUpload: (id: string) => void;
  processQueue: () => void;
}

const MAX_CONCURRENT = 2;

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploads: [],
  isExpanded: true,
  
  addUploads: (files, accountId, folderId, folderIdMap) => {
    const newUploads = files.map((file) => {
      let targetFolderId = folderId;
      if (folderIdMap && file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split('/');
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/');
          targetFolderId = folderIdMap[parentPath] || folderId;
        }
      }

      return {
        id: Math.random().toString(36).substring(7),
        file,
        fileName: file.webkitRelativePath || file.name, // Show relative path if it's a folder upload
        size: file.size,
        progress: 0,
        status: 'pending' as const,
        accountId,
        folderId: targetFolderId,
      };
    });
    
    set((state) => ({
      uploads: [...state.uploads, ...newUploads],
      isExpanded: true, // Auto-expand when new uploads arrive
    }));
    
    get().processQueue();
  },

  addFolderUploads: async (files, accountId, folderId) => {
    // 1. Extract unique paths
    const uniquePaths = new Set<string>();
    files.forEach(f => {
      if (f.webkitRelativePath) {
        const parts = f.webkitRelativePath.split('/');
        if (parts.length > 1) {
          uniquePaths.add(parts.slice(0, -1).join('/'));
        }
      }
    });

    const pathsArray = Array.from(uniquePaths);

    // 2. If no paths (just files), fallback to normal addUploads
    if (pathsArray.length === 0) {
      get().addUploads(files, accountId, folderId);
      return;
    }

    try {
      // 3. Pre-flight batch request
      const res = await api.post('/api/files/folders/batch', {
        paths: pathsArray,
        parentId: folderId,
        accountId
      });

      const folderIdMap = res.data.data.folderMap;

      // 4. Dispatch with map
      get().addUploads(files, accountId, folderId, folderIdMap);
    } catch (error) {
      console.error('Failed to create folder tree', error);
      // Fallback: dump them into current folder if batch fails (or we could show an error)
      get().addUploads(files, accountId, folderId);
    }
  },
  
  removeUpload: (id) => {
    set((state) => ({
      uploads: state.uploads.filter((u) => u.id !== id),
    }));
  },
  
  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }));
  },
  
  setExpanded: (expanded) => {
    set({ isExpanded: expanded });
  },
  
  dismissAllCompleted: () => {
    set((state) => ({
      uploads: state.uploads.filter((u) => u.status !== 'complete' && u.status !== 'error'),
    }));
  },
  
  cancelUpload: (id) => {
    const { uploads } = get();
    const item = uploads.find(u => u.id === id);
    if (!item) return;
    
    if (item.abortController) {
      item.abortController.abort();
    }
    
    set((state) => ({
      uploads: state.uploads.map((u) => 
        u.id === id ? { ...u, status: 'error', error: 'Canceled by user' } : u
      ),
    }));
    
    get().processQueue();
  },
  
  processQueue: () => {
    const { uploads } = get();
    const activeCount = uploads.filter(u => u.status === 'uploading' || u.status === 'processing').length;
    const pending = uploads.filter(u => u.status === 'pending');
    
    if (activeCount < MAX_CONCURRENT && pending.length > 0) {
      const itemsToStart = pending.slice(0, MAX_CONCURRENT - activeCount);
      
      set(state => ({
        uploads: state.uploads.map(u => 
          itemsToStart.find(i => i.id === u.id) ? { ...u, status: 'uploading' } : u
        )
      }));
      
      itemsToStart.forEach(async (item) => {
        try {
          const abortController = new AbortController();
          
          set(state => ({
            uploads: state.uploads.map(u => 
              u.id === item.id ? { ...u, abortController } : u
            )
          }));
          
          // 1. Request Upload Session
            const sessionRes = await api.post(`/api/files/upload-session/${item.accountId}`, {
              name: item.file.name,
              mimeType: item.file.type || 'application/octet-stream',
              size: item.file.size,
              parentId: item.folderId
            }, { signal: abortController.signal });

            const sessionData = sessionRes.data.data;

            if (sessionData.direct && sessionData.uploadUrl) {
              // 2A. Direct Upload to Cloud Provider
              
              // Depending on the provider, they might require specific headers. Google Drive requires none, just the file payload.
              // OneDrive also accepts raw bytes.
              const directHeaders: any = {
                'Content-Type': item.file.type || 'application/octet-stream',
              };
              
              // OneDrive specific required headers for large files chunking if we used chunks, but we upload in one request.
              if (sessionData.provider === 'onedrive' && item.file.size > 0) {
                 directHeaders['Content-Length'] = item.file.size.toString();
                 directHeaders['Content-Range'] = `bytes 0-${item.file.size - 1}/${item.file.size}`;
              }

              const directRes = await axios.request({
                method: sessionData.method || 'PUT',
                url: sessionData.uploadUrl,
                data: item.file,
                signal: abortController.signal,
                headers: directHeaders,
                onUploadProgress: (progressEvent) => {
                  if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    set(state => ({
                      uploads: state.uploads.map(u => 
                        u.id === item.id ? { 
                          ...u, 
                          progress: percentCompleted,
                          status: percentCompleted === 100 ? 'processing' : 'uploading'
                        } : u
                      )
                    }));
                  }
                }
              });

              // 3. Notify backend to sync DB
              await api.post(`/api/files/upload-complete/${item.accountId}`, {
                providerFileId: directRes.data?.id,
                name: directRes.data?.name || item.file.name,
                mimeType: directRes.data?.mimeType || item.file.type,
                size: directRes.data?.size || item.file.size,
                parentId: item.folderId,
                modifiedTime: directRes.data?.modifiedTime || directRes.data?.lastModifiedDateTime || new Date().toISOString(),
                thumbnailLink: directRes.data?.thumbnailLink
              });

            } else {
              // 2B. Fallback to Proxy Upload (e.g., Dropbox)
              const formData = new FormData();
              formData.append('file', item.file);
              formData.append('parentId', item.folderId);
              
              const baseUrl = import.meta.env.VITE_DIRECT_BACKEND_URL || '';
              const uploadPath = `/api/files/upload/${item.accountId}`;
              const fullUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${uploadPath}` : uploadPath;
              
              await api.post(fullUrl, formData, {
                signal: abortController.signal,
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                  if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    
                    set(state => ({
                      uploads: state.uploads.map(u => 
                        u.id === item.id ? { 
                          ...u, 
                          progress: percentCompleted,
                          status: percentCompleted === 100 ? 'processing' : 'uploading'
                        } : u
                      )
                    }));
                  }
                }
              });
            }
          
          // On Success
          set(state => ({
            uploads: state.uploads.map(u => 
              u.id === item.id ? { ...u, status: 'complete', progress: 100 } : u
            )
          }));
          
          queryClient.invalidateQueries({ queryKey: ['files'] });
          queryClient.invalidateQueries({ queryKey: ['folders'] });
          
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          console.error(error);
          let errorMsg = 'Upload failed';
          
          if (axios.isCancel(error)) {
            errorMsg = 'Canceled by user';
          } else if (error.response?.data?.message) {
            errorMsg = error.response.data.message;
          } else if (error.response?.status === 403 || error.message?.toLowerCase().includes('quota')) {
            errorMsg = 'Upload failed: Not enough storage space.';
          }
          
          set(state => ({
            uploads: state.uploads.map(u => 
              u.id === item.id ? { ...u, status: 'error', error: errorMsg } : u
            )
          }));
        } finally {
          get().processQueue(); // Start next item in queue
        }
      });
    }
  },
}));
