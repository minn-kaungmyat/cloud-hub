import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
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
  const includeAccounts = searchParams.getAll('includeAccounts');
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
          <div className="space-y-0.5">
            {accounts.map(acc => {
              const isIncluded = includeAccounts.includes(acc.id);
              
              return (
                <button
                  key={acc.id} 
                  onClick={() => updateFilter('includeAccounts', acc.id, true)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm transition-colors text-left ${
                    isIncluded
                      ? 'bg-zinc-800/80' 
                      : 'hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <ProviderIcon provider={acc.provider} size={14} className="shrink-0 opacity-80" />
                    <div className="flex flex-col min-w-0">
                      <span className={`text-xs truncate ${isIncluded ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
                        {acc.label}
                      </span>
                      {acc.email && (
                        <span className="text-[10px] text-zinc-500 truncate -mt-0.5">
                          {acc.email}
                        </span>
                      )}
                    </div>
                  </div>
                  {isIncluded && <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
};
