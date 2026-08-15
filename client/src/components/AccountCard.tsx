import { MoreHorizontal, RefreshCw, Unlink, HardDriveDownload } from 'lucide-react';
import { ProviderIcon, getProviderLabel } from './ProviderIcon';
import { StatusBadge } from './StatusBadge';
import { StorageGauge } from './StorageGauge';
import { DropdownMenu } from './DropdownMenu';
import type { CloudAccount } from '../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';
import { useFullSync } from '../hooks/useCloudAccounts';

export const AccountCard = ({ account }: { account: CloudAccount }) => {
  const queryClient = useQueryClient();
  const { token } = useAuthStore();

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/cloud-accounts/${account.id}`);
    },
    onSuccess: () => {
      toast.success(`${account.label} disconnected`);
      queryClient.invalidateQueries({ queryKey: ['cloudAccounts'] });
    },
    onError: () => {
      toast.error('Failed to disconnect account');
    }
  });

  const { mutate: fullSync } = useFullSync();

  const items = [
    { 
      id: 'resync', 
      label: 'Full Resync', 
      icon: <HardDriveDownload size={14} />, 
      onClick: () => {
        if (confirm('This will re-download your entire file index from the cloud provider. Continue?')) {
          toast.info('Full resync started. This may take a minute...');
          fullSync(account.id, {
            onSuccess: () => toast.success('Full resync complete'),
            onError: () => toast.error('Full resync failed')
          });
        }
      }
    },
    { 
      id: 'refresh', 
      label: 'Refresh Auth', 
      icon: <RefreshCw size={14} />, 
      onClick: () => {
        window.location.assign(`${import.meta.env.VITE_API_URL}/api/cloud-accounts/auth/${account.provider}?token=${token}`);
      }
    },
    { 
      id: 'disconnect', 
      label: 'Disconnect', 
      icon: <Unlink size={14} />, 
      danger: true, 
      onClick: () => {
        if (confirm('Are you sure you want to disconnect this account? This will immediately wipe your encrypted tokens and all synced metadata from our database permanently.')) {
          disconnectMutation.mutate();
        }
      } 
    },
  ];

  return (
    <div className="border border-zinc-800 rounded-md bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
            <ProviderIcon provider={account.provider} size={16} className="text-zinc-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-200 truncate">{account.label}</div>
            <div className="text-[11px] text-zinc-500 truncate">{account.email}</div>
          </div>
        </div>
        <DropdownMenu trigger={<MoreHorizontal size={16} className="text-zinc-500 hover:text-zinc-300 transition-colors" />} items={items} align="right" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-zinc-500">{getProviderLabel(account.provider)}</span>
        <StatusBadge status={account.status} />
      </div>

      <StorageGauge used={account.storageUsed} total={account.storageTotal} />
    </div>
  );
};

