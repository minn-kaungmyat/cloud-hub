import { X, HardDrive, Cloud, Database, ShieldCheck } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';

const providers = [
  { id: 'google-drive', name: 'Google Drive', icon: HardDrive, description: 'Connect your Google Drive account' },
  { id: 'dropbox', name: 'Dropbox', icon: Cloud, description: 'Connect your Dropbox account' },
  { id: 'onedrive', name: 'OneDrive', icon: Database, description: 'Connect your Microsoft OneDrive account' },
] as const;

export const ConnectAccountModal = () => {
  const { connectAccountOpen, setConnectAccountOpen } = useUIStore();
  const { token } = useAuthStore();

  const handleConnect = (providerId: string) => {
    if (providerId === 'google-drive' || providerId === 'onedrive' || providerId === 'dropbox') {
      window.location.assign(`${import.meta.env.VITE_API_URL}/api/cloud-accounts/auth/${providerId}?token=${token}`);
    } else {
      // Placeholder for others
      alert(`${providerId} integration is coming soon!`);
    }
  };

  if (!connectAccountOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConnectAccountOpen(false)}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">Connect Cloud Account</h3>
          <button onClick={() => setConnectAccountOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-2">
          <p className="text-xs text-zinc-500 mb-4">Select a cloud provider to connect. You can add multiple accounts for the same provider.</p>
          
          <div className="mb-6 p-4 bg-zinc-950/50 border border-zinc-800/60 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={16} className="text-zinc-400" />
              <h4 className="text-xs font-medium text-zinc-300">Private & Secure</h4>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              We use AES-256 encryption to protect your connection. CloudHub acts as a secure proxy—we never see your passwords, and your actual files never touch our servers.
            </p>
          </div>

          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => handleConnect(p.id)}
              className="w-full flex items-center gap-3 p-3 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                <p.icon size={20} className="text-zinc-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-200">{p.name}</div>
                <div className="text-xs text-zinc-500">{p.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
