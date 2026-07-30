import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useSearchFiles } from '../hooks/useFiles';
import { KeyboardShortcut } from './KeyboardShortcut';
import { ProviderIcon } from './ProviderIcon';
import type { Provider } from '../types';
import { useDebounce } from 'use-debounce';

const typeFilters = [
  { label: 'All', value: null },
  { label: 'Documents', value: 'document' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Spreadsheets', value: 'spreadsheet' },
  { label: 'Code', value: 'code' },
];

const providerFilters: { label: string; value: Provider | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Google Drive', value: 'google-drive' },
  { label: 'Dropbox', value: 'dropbox' },
  { label: 'OneDrive', value: 'onedrive' },
];

export const SearchModal = () => {
  const { searchOpen, setSearchOpen } = useUIStore();
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<Provider | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useSearchFiles(debouncedQuery);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [searchOpen, setSearchOpen]);

  const searchResults = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((page) => page.files);
  }, [data]);

  if (!searchOpen) return null;

  const filtered = searchResults.filter((f) => {
    if (providerFilter !== 'all' && f.provider !== providerFilter) return false;
    if (typeFilter) {
      const mime = f.mimeType.toLowerCase();
      if (typeFilter === 'document' && !mime.includes('pdf') && !mime.includes('document') && !mime.includes('text') && !mime.includes('markdown')) return false;
      if (typeFilter === 'image' && !mime.startsWith('image/')) return false;
      if (typeFilter === 'video' && !mime.startsWith('video/')) return false;
      if (typeFilter === 'spreadsheet' && !mime.includes('spreadsheet') && !mime.includes('excel')) return false;
      if (typeFilter === 'code' && !mime.includes('json') && !mime.includes('javascript') && !mime.includes('xml') && !mime.includes('html')) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60" onClick={() => setSearchOpen(false)}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center px-4 border-b border-zinc-800">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files across all providers..."
            className="flex-1 bg-transparent border-none py-3.5 px-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          {isFetching ? <Loader2 size={16} className="text-zinc-500 animate-spin mr-2" /> : null}
          <KeyboardShortcut keys={['ESC']} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60 overflow-x-auto">
          <span className="text-[11px] text-zinc-500 shrink-0">Type:</span>
          {typeFilters.map((f) => (
            <button
              key={f.label}
              onClick={() => setTypeFilter(f.value)}
              className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors shrink-0 ${
                typeFilter === f.value
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-zinc-800 mx-1">|</span>
          <span className="text-[11px] text-zinc-500 shrink-0">Provider:</span>
          {providerFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setProviderFilter(f.value)}
              className={`px-2 py-0.5 text-[11px] rounded-sm transition-colors shrink-0 flex items-center gap-1 ${
                providerFilter === f.value
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f.value !== 'all' && <ProviderIcon provider={f.value} size={10} className="" />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
              {query ? (isFetching ? 'Searching...' : 'No files match your search.') : 'Start typing to search...'}
            </div>
          ) : (
            filtered.map((file) => (
              <button
                key={file.id}
                onClick={() => setSearchOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-800/40 transition-colors text-left"
              >
                <ProviderIcon provider={file.provider} size={14} className="text-zinc-500 shrink-0" />
                <span className="flex-1 text-zinc-200 truncate">{file.name}</span>
                <span className="text-[11px] font-mono text-zinc-600 tabular-nums shrink-0">{file.provider}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/60 text-[11px] text-zinc-600">
          <span>{filtered.length} results</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><KeyboardShortcut keys={['↑', '↓']} /> Navigate</span>
            <span className="flex items-center gap-1"><KeyboardShortcut keys={['↵']} /> Open</span>
          </div>
        </div>
      </div>
    </div>
  );
};
