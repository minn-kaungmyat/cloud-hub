import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, X } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useSearchFiles, useFolderPath } from '../hooks/useFiles';
import { useCloudAccounts } from '../hooks/useCloudAccounts';
import { KeyboardShortcut } from './KeyboardShortcut';
import { ProviderIcon } from './ProviderIcon';
import type { Provider, CloudFile } from '../types';
import { useDebounce } from 'use-debounce';
import { FileIcon } from './FileRow';
import { formatFileSize, formatDate } from '../utils/format';
import { useFileStore } from '../store/fileStore';

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

const SearchFileRow = ({ file }: { file: CloudFile }) => {
  const { data: pathSegments } = useFolderPath(file.parentId || 'root');
  const pathString = pathSegments 
    ? pathSegments.map(s => s.label).join(' / ') 
    : ((!file.parentId || file.parentId === 'root') ? 'Account Root' : 'Loading...');
    
  const setContextMenu = useUIStore((s) => s.setContextMenu);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const { setSelectedFile, setInspectorOpen } = useFileStore();
  const { data: accounts } = useCloudAccounts();
  const account = accounts?.find(a => a.id === file.cloudAccountId);
  const navigate = useNavigate();

  const handleJumpToLocation = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 1 & 2. Switch account context & Navigate to Parent Folder
    const targetFolderId = file.parentId || 'root';
    const params = new URLSearchParams();
    params.set('account', file.cloudAccountId);
    params.set('folder', targetFolderId);
    
    // Use navigate with state for auto-scroll
    navigate(`/?${params.toString()}`, { state: { scrollToId: file.id } });
    
    // 3. Highlight specific file
    setSelectedFile(file.id);
    
    // 4. Slide open the inspector
    setInspectorOpen(true);
    
    // 5. Close the search overlay
    setSearchOpen(false);
  };

  return (
    <div 
      className="flex items-center px-6 py-3 border-b border-zinc-800/40 hover:bg-zinc-800/40 cursor-pointer transition-colors group"
      onClick={handleJumpToLocation}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedFile(file.id);
        setContextMenu(true, e.clientX, e.clientY, file.id);
      }}
    >
      {/* 1. File Name & Icon */}
      <div className="flex-[2] flex items-center gap-3 min-w-0 pr-4">
        <FileIcon mimeType={file.mimeType} isFolder={file.isFolder} size={18} className="text-zinc-500 shrink-0 group-hover:text-zinc-400 transition-colors" />
        <span className="truncate text-zinc-200">{file.name}</span>
      </div>
      
      {/* 2. File Path / Location */}
      <div className="flex-[2] flex items-center min-w-0 pr-4 text-zinc-400 text-sm">
        <span className="truncate">{pathString}</span>
      </div>
      
      {/* 3. Provider & Account */}
      <div className="flex-[1.5] flex items-center gap-3 min-w-0 pr-4">
        <ProviderIcon provider={file.provider} size={16} className="shrink-0 text-zinc-400" />
        <div className="flex flex-col min-w-0">
          <span className="truncate text-zinc-300 text-sm capitalize leading-tight">{file.provider.replace('-', ' ')}</span>
          {account && <span className="truncate text-zinc-500 text-[11px] leading-tight mt-0.5">{account.email}</span>}
        </div>
      </div>
      
      {/* 4. Modified Date & Size */}
      <div className="flex-1 flex items-center justify-end text-zinc-500 font-mono text-xs tabular-nums pr-4">
        {formatDate(file.modifiedTime)}
      </div>
      <div className="w-24 flex items-center justify-end text-zinc-500 font-mono text-xs tabular-nums">
        {formatFileSize(file.size)}
      </div>
    </div>
  );
};

export const SearchOverlay = () => {
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
    } else {
      setTimeout(() => {
        setQuery('');
        setTypeFilter(null);
        setProviderFilter('all');
      }, 0);
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

  const filtered = searchResults.filter((f) => {
    if (providerFilter !== 'all' && f.provider !== providerFilter) return false;
    if (typeFilter) {
      const mime = f.mimeType.toLowerCase();
      if (typeFilter === 'document' && !mime.includes('pdf') && !mime.includes('document') && !mime.includes('text') && !mime.includes('markdown')) return false;
      if (typeFilter === 'image' && !mime.startsWith('image/')) return false;
      if (typeFilter === 'video' && !mime.startsWith('video/') && !(/\.ts$/i.test(f.name) && f.size > 5 * 1024 * 1024)) return false;
      if (typeFilter === 'spreadsheet' && !mime.includes('spreadsheet') && !mime.includes('excel')) return false;
      if (typeFilter === 'code' && !mime.includes('json') && !mime.includes('javascript') && !mime.includes('xml') && !mime.includes('html')) return false;
    }
    return true;
  });

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div 
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-md flex flex-col items-center pt-[10vh]"
        >
          <div className="w-full max-w-5xl px-8 flex flex-col gap-6 h-full pb-8">
        
        {/* Massive Search Input */}
        <div className="relative flex items-center">
          <Search size={20} className="absolute left-4 text-zinc-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all your cloud storage..."
            className="w-full bg-transparent border-b border-zinc-700 focus:border-accent py-2 pl-12 pr-24 text-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors font-medium"
          />
          <div className="absolute right-4 flex items-center gap-2">
            {isFetching && <Loader2 size={18} className="text-zinc-500 animate-spin mr-2" />}
            <div className="hidden sm:block">
              <KeyboardShortcut keys={['ESC']} />
            </div>
            <button 
              onClick={() => setSearchOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Horizontal Filters */}
        <div className="flex flex-col gap-3 px-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium tracking-wide uppercase mr-2">Type</span>
            {typeFilters.map((f) => (
              <button
                key={f.label}
                onClick={() => setTypeFilter(f.value)}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors border ${
                  typeFilter === f.value
                    ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium tracking-wide uppercase mr-2">Provider</span>
            {providerFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setProviderFilter(f.value)}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors border flex items-center gap-1.5 ${
                  providerFilter === f.value
                    ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {f.value !== 'all' && <ProviderIcon provider={f.value} size={12} className="" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results List View */}
        <div className="flex-1 overflow-y-auto mt-4 min-h-0 border border-zinc-800/50 rounded-lg bg-zinc-900/20">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
              <Search size={48} className="opacity-20 mb-2" />
              <p className="text-lg font-medium text-zinc-400">
                {query ? (isFetching ? 'Searching the cloud...' : 'No files found') : 'Start typing to explore'}
              </p>
              {query && !isFetching && <p className="text-sm">Try adjusting your filters or search terms.</p>}
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Header Row */}
              <div className="flex items-center px-6 py-3 border-b border-zinc-800/80 bg-zinc-900/50 sticky top-0 z-10 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider select-none">
                <div className="flex-[2] pr-4">Name</div>
                <div className="flex-[2] pr-4">Location</div>
                <div className="flex-[1.5] pr-4">Account</div>
                <div className="flex-1 text-right pr-4">Modified</div>
                <div className="w-24 text-right">Size</div>
              </div>
              
              {/* Results */}
              <div className="flex flex-col pb-4">
                {filtered.map((file) => (
                  <SearchFileRow key={file.id} file={file} />
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
