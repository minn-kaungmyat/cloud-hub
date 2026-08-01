import { useSearchParams } from 'react-router-dom';
import { X, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { useCloudAccounts } from '../hooks/useCloudAccounts';
import { ProviderIcon } from './ProviderIcon';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FilterDrawer = ({ isOpen, onClose }: FilterDrawerProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: accounts = [] } = useCloudAccounts();

  const currentType = searchParams.get('type') || '';
  const includeAccountsRaw = searchParams.getAll('includeAccounts');
  const includeAccounts = includeAccountsRaw.length === 1 && includeAccountsRaw[0] === 'NONE' ? [] : includeAccountsRaw;
  const isAllAccounts = includeAccountsRaw.length === 0;

  const isAccountIncluded = (id: string) => {
    if (isAllAccounts) return true;
    return includeAccounts.includes(id);
  };
  const sortBy = searchParams.get('sortBy') || 'date';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  const updateFilter = (key: string, value: string | null, isArray = false) => {
    const newParams = new URLSearchParams(searchParams);
    
    if (isArray) {
      // Toggle logic for arrays
      const currentValues = newParams.getAll(key);
      if (currentValues.includes(value!)) {
        // Remove it
        newParams.delete(key);
        currentValues.filter(v => v !== value).forEach(v => newParams.append(key, v));
      } else {
        // Add it
        newParams.append(key, value!);
      }
    } else {
      // Single value
      if (value === null) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    }
    
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const toggleAccount = (id: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('includeAccounts');
    
    let nextIncluded: string[];
    if (isAllAccounts) {
      nextIncluded = accounts.map(a => a.id).filter(aId => aId !== id);
    } else {
      if (includeAccounts.includes(id)) {
        nextIncluded = includeAccounts.filter(aId => aId !== id);
      } else {
        nextIncluded = [...includeAccounts, id];
      }
    }
    
    if (nextIncluded.length === accounts.length) {
      // Clear to mean ALL
    } else if (nextIncluded.length === 0) {
      newParams.append('includeAccounts', 'NONE');
    } else {
      nextIncluded.forEach(val => newParams.append('includeAccounts', val));
    }
    
    setSearchParams(newParams);
  };

  const toggleProvider = (provider: string) => {
    const providerAccounts = accounts.filter(a => a.provider === provider);
    const providerIds = providerAccounts.map(a => a.id);
    const allProviderIncluded = providerIds.every(id => isAccountIncluded(id));
    
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('includeAccounts');
    
    let nextIncluded: string[];
    if (isAllAccounts) {
      if (allProviderIncluded) {
        nextIncluded = accounts.map(a => a.id).filter(aId => !providerIds.includes(aId));
      } else {
        nextIncluded = [];
      }
    } else {
      if (allProviderIncluded) {
        nextIncluded = includeAccounts.filter(aId => !providerIds.includes(aId));
      } else {
        nextIncluded = Array.from(new Set([...includeAccounts, ...providerIds]));
      }
    }
    
    if (nextIncluded.length === accounts.length) {
      // leave empty
    } else if (nextIncluded.length === 0) {
      newParams.append('includeAccounts', 'NONE');
    } else {
      nextIncluded.forEach(val => newParams.append('includeAccounts', val));
    }
    
    setSearchParams(newParams);
  };

  // Group accounts by provider
  const accountsByProvider = accounts.reduce((acc, account) => {
    if (!acc[account.provider]) acc[account.provider] = [];
    acc[account.provider].push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  const fileTypes = [
    { id: '', label: 'All Types' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'document', label: 'Documents' },
    { id: 'audio', label: 'Audio' }
  ];

  const sortOptions = [
    { id: 'date', label: 'Date Modified' },
    { id: 'size', label: 'File Size' },
    { id: 'name', label: 'Name' },
  ];

  return (
    <div className={`bg-zinc-950 flex flex-col shrink-0 z-20 transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'w-[320px] border-l border-zinc-800/60 opacity-100' : 'w-0 border-transparent opacity-0'}`}>
      <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-800/60 shrink-0 w-[320px] font-medium text-sm text-zinc-200">
        Filters
        <div className="flex items-center gap-2">
          {searchParams.toString() !== '' && (
            <button 
              onClick={clearFilters}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1"
            >
              Clear
            </button>
          )}
          <button 
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 w-[320px]">
        
        {/* File Type */}
        <section>
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">File Type</h3>
          <div className="space-y-0.5">
            {fileTypes.map(type => {
              const isActive = currentType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => updateFilter('type', type.id ? type.id : null)}
                  className={`w-full flex items-center px-2 py-1.5 text-xs rounded-sm text-left transition-colors ${
                    isActive 
                      ? 'bg-zinc-800/80 text-zinc-200 font-medium' 
                      : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Sort By */}
        <section>
          <div className="flex items-center justify-between mb-2 px-2">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Sort By</h3>
            <button
              onClick={() => updateFilter('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc')}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors"
              title={sortOrder === 'desc' ? 'Descending (Click to change)' : 'Ascending (Click to change)'}
            >
              {sortOrder === 'desc' ? '↓ DESC' : '↑ ASC'}
            </button>
          </div>
          <div className="space-y-0.5">
            {sortOptions.map(opt => {
              const isActive = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => updateFilter('sortBy', opt.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-sm text-left transition-colors ${
                    isActive 
                      ? 'bg-zinc-800/80 text-zinc-200 font-medium' 
                      : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isActive && (
                    <span className="text-[10px] text-zinc-500 font-mono">ACTIVE</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Accounts Selection */}
        <section>
          <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">Cloud Accounts</h3>
          <div className="space-y-1">
            {Object.entries(accountsByProvider).map(([provider, providerAccounts]) => {
              const providerIds = providerAccounts.map(a => a.id);
              const includedCount = providerIds.filter(id => isAccountIncluded(id)).length;
              const allIncluded = includedCount === providerIds.length;
              const someIncluded = includedCount > 0 && includedCount < providerIds.length;

              return (
                <div key={provider} className="flex flex-col">
                  {/* Provider Header Row */}
                  <button
                    onClick={() => toggleProvider(provider)}
                    className="flex items-center gap-2 px-2 py-1.5 w-full text-left rounded-sm transition-colors hover:bg-zinc-800/40 group"
                  >
                    <div className="shrink-0 text-zinc-500 group-hover:text-zinc-400 transition-colors">
                      {allIncluded ? (
                        <CheckSquare size={14} className="text-zinc-300" />
                      ) : someIncluded ? (
                        <MinusSquare size={14} className="text-zinc-400" />
                      ) : (
                        <Square size={14} />
                      )}
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <ProviderIcon provider={provider as any} size={14} className="shrink-0 opacity-80" />
                    <span className={`text-xs font-medium truncate flex-1 ${allIncluded || someIncluded ? 'text-zinc-200' : 'text-zinc-400'}`}>
                      {provider.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </span>
                  </button>

                  {/* Account Child Rows */}
                  <div className="flex flex-col mt-0.5 space-y-0.5">
                    {providerAccounts.map(acc => {
                      const isIncluded = isAccountIncluded(acc.id);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => toggleAccount(acc.id)}
                          className="flex items-center gap-2 pr-2 py-1.5 w-full text-left rounded-sm transition-colors hover:bg-zinc-800/40 group"
                          style={{ paddingLeft: '34px' }}
                        >
                          <div className="shrink-0 text-zinc-500 group-hover:text-zinc-400 transition-colors">
                            {isIncluded ? (
                              <CheckSquare size={14} className="text-zinc-300" />
                            ) : (
                              <Square size={14} />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`text-xs truncate ${isIncluded ? 'text-zinc-300' : 'text-zinc-500'}`}>
                              {acc.email || acc.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
};
