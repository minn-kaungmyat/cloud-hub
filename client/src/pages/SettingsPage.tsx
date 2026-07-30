import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';
import { AccountCard } from '../components/AccountCard';
import { AddAccountButton } from '../components/AddAccountButton';
import { useCloudAccounts } from '../hooks/useCloudAccounts';

const SettingsPage = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: accounts = [], isLoading } = useCloudAccounts();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success) {
      toast.success('Account connected successfully!');
      navigate('/settings', { replace: true });
    } else if (error) {
      toast.error(`Connection failed: ${error}`);
      navigate('/settings', { replace: true });
    }
  }, [location, navigate]);

  if (!user) return null;

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-semibold text-zinc-100 mb-8">Settings</h1>

      <section className="mb-12">
        <h2 className="text-lg font-medium text-zinc-200 mb-4 pb-2 border-b border-zinc-800">Profile</h2>
        <div className="flex gap-8 items-start">
          <div className="w-20 h-20 rounded-md bg-accent flex items-center justify-center text-3xl text-zinc-950 font-bold shrink-0">
            {user.avatar || user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 space-y-4 max-w-sm">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Name</label>
              <input type="text" value={user.name} readOnly className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Email</label>
              <input type="text" value={user.email} readOnly className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-500 focus:outline-none" />
            </div>
            <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-md transition-colors">
              Update Profile
            </button>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-lg font-medium text-zinc-200 mb-4 pb-2 border-b border-zinc-800">Security</h2>
        <div className="max-w-sm space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Current Password</label>
            <input type="password" placeholder="••••••••" className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">New Password</label>
            <input type="password" placeholder="••••••••" className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-md transition-colors">
            Change Password
          </button>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800">
          <h2 className="text-lg font-medium text-zinc-200">Connected Accounts</h2>
          <div className="w-32"><AddAccountButton /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {isLoading ? (
            <div className="col-span-2 text-sm text-zinc-500">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="col-span-2 text-sm text-zinc-500">No cloud accounts connected yet.</div>
          ) : (
            accounts.map(account => (
              <AccountCard key={account.id} account={account} />
            ))
          )}
        </div>
      </section>
      
      <section>
        <h2 className="text-lg font-medium text-red-400 mb-4 pb-2 border-b border-red-500/20">Danger Zone</h2>
        <p className="text-sm text-zinc-400 mb-4">Permanently delete your CloudHub account and remove all connected providers. This action cannot be undone.</p>
        <button className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium rounded-md transition-colors">
          Delete Account
        </button>
      </section>
    </div>
  );
};

export default SettingsPage;
