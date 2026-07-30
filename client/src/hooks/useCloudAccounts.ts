import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { CloudAccount } from '../types';

export const useCloudAccounts = () => {
  const queryClient = useQueryClient();
  return useQuery<CloudAccount[]>({
    queryKey: ['cloudAccounts'],
    queryFn: async () => {
      const res = await api.get('/api/cloud-accounts');
      const accounts = res.data.data.accounts as CloudAccount[];
      
      // Silently trigger background incremental sync for connected accounts
      accounts.forEach(acc => {
        if (acc.provider === 'google-drive' && acc.syncStatus === 'completed') {
          api.post(`/api/files/sync/incremental/${acc.id}`)
            .then((syncRes) => {
              if (syncRes.data?.data?.count > 0) {
                // Only invalidate files if new changes were actually found
                queryClient.invalidateQueries({ queryKey: ['files'] });
                queryClient.invalidateQueries({ queryKey: ['folders'] });
              }
            })
            .catch(console.error);
        }
      });
      
      return accounts;
    },
    refetchOnWindowFocus: true,
    staleTime: 1000 * 15, // 15 seconds buffer to prevent rapid alt-tab API spam
    refetchInterval: (query) => {
      const data = query.state?.data as CloudAccount[] | undefined;
      if (data && data.some(acc => acc.syncStatus === 'syncing')) {
        return 3000; // Poll every 3 seconds while initial full sync is running
      }
      return 1000 * 60 * 3; // Polling every 3 minutes for incremental background sync
    },
  });
};

export const useIncrementalSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const res = await api.post(`/api/files/sync/incremental/${accountId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['cloudAccounts'] });
    }
  });
};
