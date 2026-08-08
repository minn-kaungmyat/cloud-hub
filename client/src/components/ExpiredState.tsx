import { Unplug } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface ExpiredStateProps {
  providerId: string;
}

export const ExpiredState = ({ providerId }: ExpiredStateProps) => {
  const { token } = useAuthStore();

  const handleReconnect = () => {
    window.location.assign(`${import.meta.env.VITE_API_URL}/api/cloud-accounts/auth/${providerId}?token=${token}`);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 min-h-0 bg-zinc-950">
      <div className="flex flex-col items-center max-w-sm text-center">
        <Unplug size={40} className="mb-4 text-zinc-700" strokeWidth={1} />
        <h3 className="text-zinc-300 font-medium mb-1">Connection Expired</h3>
        <p className="text-sm mb-6 leading-relaxed">
          Your authentication token has expired. Re-authenticate with your cloud provider to resume viewing and syncing files.
        </p>
        <button
          onClick={handleReconnect}
          className="px-4 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-sm hover:bg-zinc-700 hover:text-white transition-colors"
        >
          Reconnect Account
        </button>
      </div>
    </div>
  );
};
