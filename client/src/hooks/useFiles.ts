import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { CloudFile } from '../types';

interface FilesResponse {
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
    }
  });
};
