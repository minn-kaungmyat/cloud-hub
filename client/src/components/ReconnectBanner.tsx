import { Unplug } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface ReconnectBannerProps {
  expiredAccounts: { id: string; provider: string }[];
}

export const ReconnectBanner = ({ expiredAccounts }: ReconnectBannerProps) => {
  const { token } = useAuthStore();

  if (!expiredAccounts || expiredAccounts.length === 0) return null;

  return (
    <div className="flex flex-col border-b border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center space-x-2 mb-1.5">
        <Unplug size={14} className="text-amber-500" strokeWidth={2} />
        <span className="text-sm text-zinc-300 font-medium">Connection Expired</span>
      </div>
      <p className="text-[13px] text-zinc-500 mb-3 leading-relaxed">
        Authentication tokens have expired for some providers. Reconnect to resume viewing and syncing files.
      </p>
      <div className="flex gap-2">
        {expiredAccounts.map(account => (
          <button
            key={account.id}
            onClick={() => {
              window.location.assign(`${import.meta.env.VITE_API_URL}/api/cloud-accounts/auth/${account.provider}?token=${token}`);
            }}
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-sm hover:bg-zinc-700 hover:text-white transition-colors capitalize"
          >
            Reconnect {account.provider.replace('-', ' ')}
          </button>
        ))}
      </div>
    </div>
  );
};
