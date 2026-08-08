import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Star, FileSearch, RefreshCw, Home, Trash2, Unplug } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { SidebarItem } from './SidebarItem';
import { SidebarSection } from './SidebarSection';
import { AddAccountButton } from './AddAccountButton';
import { ProviderIcon } from './ProviderIcon';
import { StatusBadge } from './StatusBadge';
import { useCloudAccounts, useIncrementalSync } from '../hooks/useCloudAccounts';
import { useActiveAccount } from '../hooks/useActiveAccount';
import { useAuthStore } from '../store/authStore';

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: accounts = [], isLoading } = useCloudAccounts();
  const { mutate: incrementalSync, isPending: isSyncing, variables: syncingAccountId } = useIncrementalSync();
  const { token } = useAuthStore();
  
  const activeItem = useActiveAccount();

  useEffect(() => {
    if (location.pathname === '/drive' && accounts.length > 0) {
      const validCollections = ['recent', 'favorites', 'large-files'];
      if (!validCollections.includes(activeItem) && !accounts.some(a => a.id === activeItem)) {
        navigate('/', { replace: true });
      }
    }
  }, [location.pathname, accounts, activeItem, navigate]);

  return (
    <aside className="w-[260px] flex flex-col border-r border-zinc-800/60 bg-zinc-950 shrink-0">
      {/* Brand */}
      <div className="h-12 flex items-center px-4 border-b border-zinc-800/60 shrink-0">
        <div className="font-semibold text-zinc-200 flex items-center gap-2">
          <div className="w-5 h-5 bg-accent rounded flex items-center justify-center text-[10px] text-zinc-950 font-bold">
            C
          </div>
          CloudHub
        </div>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarItem
          icon={<Home size={14} />}
          label="Home"
          active={location.pathname === '/'}
          onClick={() => navigate('/')}
        />

        <SidebarSection label="Locations" />
        {isLoading ? (
          <div className="px-4 py-2 text-xs text-zinc-500">Loading accounts...</div>
        ) : (
          accounts.map((account) => (
            <SidebarItem
              key={account.id}
              icon={<ProviderIcon provider={account.provider} size={14} className="" />}
              label={account.label}
              sublabel={account.email}
              active={activeItem === account.id && location.pathname === '/drive'}
              suffix={
                <div className="flex items-center gap-1.5">
                  {account.syncStatus === 'failed' && account.syncError?.toLowerCase().includes('expired') ? (
                    <button
                      title="Connection expired. Click to reconnect."
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.assign(`${import.meta.env.VITE_API_URL}/api/cloud-accounts/auth/${account.provider}?token=${token}`);
                      }}
                      className="text-amber-500/70 hover:text-amber-400 p-1.5 rounded-sm hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Unplug size={12} />
                    </button>
                  ) : (
                    <button
                      title="Sync files"
                    onClick={(e) => {
                      e.stopPropagation();
                      incrementalSync(account.id);
                    }}
                    className={`text-zinc-500 hover:text-zinc-300 p-1.5 rounded-sm hover:bg-zinc-800 transition-colors ${
                      (isSyncing && syncingAccountId === account.id)
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <RefreshCw size={12} className={isSyncing && syncingAccountId === account.id ? "animate-spin text-accent" : ""} />
                  </button>
                  )}
                  <StatusBadge status={account.syncStatus === 'failed' && account.syncError?.toLowerCase().includes('expired') ? 'expired' : account.status} />
                </div>
              }
              onClick={() => navigate(`/drive?account=${account.id}`)}
            />
          ))
        )}
        <AddAccountButton />

        <SidebarSection label="Collections" />
        <SidebarItem
          icon={<Clock size={14} />}
          label="Recent"
          active={activeItem === 'recent' && location.pathname === '/drive'}
          onClick={() => navigate('/drive?account=recent')}
        />
        <SidebarItem
          icon={<Star size={14} />}
          label="Favorites"
          active={activeItem === 'favorites' && location.pathname === '/drive'}
          onClick={() => navigate('/drive?account=favorites')}
        />
        <SidebarItem
          icon={<FileSearch size={14} />}
          label="Large Files"
          active={activeItem === 'large-files' && location.pathname === '/drive'}
          onClick={() => navigate('/drive?account=large-files')}
        />
        <SidebarItem
          icon={<Trash2 size={14} />}
          label="Trash"
          active={location.pathname === '/trash'}
          onClick={() => navigate('/trash')}
        />
      </div>

      {/* Footer (User Profile) */}
      <div className="mt-auto border-t border-zinc-800/60 pt-2 pb-3 shrink-0 flex flex-col">
        <div className="px-2 mt-2">
          <UserMenu />
        </div>
        <div className="px-4 mt-3 flex justify-center text-[10px] text-zinc-600">
          <button onClick={() => navigate('/privacy')} className="hover:text-zinc-400 transition-colors">Privacy Policy</button>
        </div>
      </div>
    </aside>
  );
};
