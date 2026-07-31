import { useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Clock, Star, FileSearch, RefreshCw, Home } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { SidebarItem } from './SidebarItem';
import { SidebarSection } from './SidebarSection';
import { AddAccountButton } from './AddAccountButton';
import { ProviderIcon } from './ProviderIcon';
import { StatusBadge } from './StatusBadge';
import { useCloudAccounts, useIncrementalSync } from '../hooks/useCloudAccounts';

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: accounts = [], isLoading } = useCloudAccounts();
  const { mutate: incrementalSync, isPending: isSyncing, variables: syncingAccountId } = useIncrementalSync();
  
  const activeItem = searchParams.get('account') || 'google-drive';

  useEffect(() => {
    if (location.pathname === '/' && accounts.length > 0) {
      const validCollections = ['recent', 'favorites', 'large-files'];
      if (!validCollections.includes(activeItem) && !accounts.some(a => a.id === activeItem)) {
        navigate('/browse', { replace: true });
      }
    }
  }, [location.pathname, accounts, activeItem, setSearchParams, navigate]);

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
          active={location.pathname === '/browse'}
          onClick={() => navigate('/browse')}
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
              active={activeItem === account.id}
              suffix={
                <div className="flex items-center gap-1.5">
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
                  <StatusBadge status={account.status} />
                </div>
              }
              onClick={() => navigate(`/?account=${account.id}`)}
            />
          ))
        )}
        <AddAccountButton />

        <SidebarSection label="Collections" />
        <SidebarItem
          icon={<Clock size={14} />}
          label="Recent"
          active={activeItem === 'recent'}
          onClick={() => navigate('/?account=recent')}
        />
        <SidebarItem
          icon={<Star size={14} />}
          label="Favorites"
          active={activeItem === 'favorites'}
          onClick={() => navigate('/?account=favorites')}
        />
        <SidebarItem
          icon={<FileSearch size={14} />}
          label="Large Files"
          active={activeItem === 'large-files'}
          onClick={() => navigate('/?account=large-files')}
        />
      </div>

      {/* Footer (User Profile) */}
      <div className="mt-auto border-t border-zinc-800/60 pt-2 pb-3 shrink-0">
        <div className="px-2 mt-2">
          <UserMenu />
        </div>
      </div>
    </aside>
  );
};
