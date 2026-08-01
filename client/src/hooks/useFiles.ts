import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { CloudFile } from '../types';

export interface FilesResponse {
  files: CloudFile[];
  nextCursor: string | null;
}

export const useFiles = (accountId?: string, folderId: string = 'root') => {
  return useInfiniteQuery<FilesResponse>({
    queryKey: ['files', accountId, folderId],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number | unknown> = { folderId, limit: 50 };
      if (accountId) params.accountId = accountId;
      if (pageParam) params.cursor = pageParam;
      
      const res = await api.get('/api/files', { params });
      return res.data.data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
};

export const useFolders = (accountId?: string, folderId: string = 'root') => {
  return useInfiniteQuery<FilesResponse>({
    queryKey: ['folders', accountId, folderId],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number | unknown> = { folderId, limit: 100, type: 'folder' };
      if (accountId) params.accountId = accountId;
      if (pageParam) params.cursor = pageParam;
      
      const res = await api.get('/api/files', { params });
      return res.data.data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
};

export const useSearchFiles = (query: string, accountId?: string) => {
  return useInfiniteQuery<FilesResponse>({
    queryKey: ['search', query, accountId],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number | unknown> = { q: query, limit: 50 };
      if (accountId) params.accountId = accountId;
      if (pageParam) params.cursor = pageParam;
      
      const res = await api.get('/api/files/search', { params });
      return res.data.data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: query.length > 0,
  });
};

export const useFolderPath = (folderId: string) => {
  return useQuery<{ id: string; label: string }[]>({
    queryKey: ['folderPath', folderId],
    queryFn: async () => {
      if (!folderId || folderId === 'root') return [];
      const res = await api.get(`/api/files/folder/${folderId}/path`);
      return res.data.data.path;
    },
    enabled: folderId !== 'root',
  });
};

export const useRenameFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, newName }: { id: string; newName: string }) => {
      const res = await api.patch(`/api/files/${id}/rename`, { name: newName });
      return res.data.data.file;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
    }
  });
};

export const useMoveFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, newParentId }: { id: string; newParentId: string }) => {
      const res = await api.patch(`/api/files/${id}/move`, { newParentId });
      return res.data.data;
    },
    onSuccess: () => {
      // Invalidate both files and folder paths to refresh UI immediately
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folderPath'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  });
};

export const useCreateFolder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, parentId, accountId }: { name: string; parentId: string; accountId: string }) => {
      const res = await api.post('/api/files/folder', { name, parentId, accountId });
      return res.data.data.folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  });
};

export const useDeleteFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  });
};

export const useRestoreFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/files/${id}/restore`);
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  });
};

export const usePermanentlyDeleteFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/files/${id}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  });
};

export const useEmptyTrash = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (providerNames: string[]) => {
      await api.post('/api/files/trash/empty', { providerNames });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useAdvancedBrowse = (filters: any) => {
  return useInfiniteQuery<FilesResponse>({
    queryKey: ['browse', filters],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number | unknown> = { limit: 50 };
      if (pageParam) params.cursor = pageParam;
      
      const res = await api.post('/api/files/browse', filters, { params });
      return res.data.data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
};

export const useFileFromCache = (fileId: string | null) => {
  const queryClient = useQueryClient();
  
  if (!fileId) return null;

  // Search through all queries that might contain files
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileQueries = queryClient.getQueriesData<any>({ 
    predicate: (query) => {
      const key = query.queryKey[0] as string;
      return ['files', 'search', 'browse'].includes(key);
    }
  });

  for (const [, data] of fileQueries) {
    if (!data || !data.pages) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allFiles = data.pages.flatMap((p: any) => p.files);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = allFiles.find((f: any) => f.id === fileId);
    if (found) return found as CloudFile;
  }
  
  return null;
};
