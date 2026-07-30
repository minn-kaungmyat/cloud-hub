import { Search, LayoutList, LayoutGrid } from 'lucide-react';
import { Breadcrumb } from './Breadcrumb';
import { KeyboardShortcut } from './KeyboardShortcut';
import type { BreadcrumbSegment, ViewMode } from '../types';
import { useUIStore } from '../store/uiStore';

export interface CommandBarProps {
  segments: BreadcrumbSegment[];
  viewMode: ViewMode;
  onNavigate: (segmentId: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export const CommandBar = ({ segments, viewMode, onNavigate, onViewModeChange }: CommandBarProps) => {
  const { setSearchOpen } = useUIStore();

  return (
    <header className="h-12 flex items-center px-4 border-b border-zinc-800/60 gap-4 shrink-0 justify-between">
      <div className="flex-1 min-w-0">
        <Breadcrumb segments={segments} onNavigate={onNavigate} />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center h-8 border border-zinc-800/80 rounded-md overflow-hidden">
          <button
            onClick={() => onViewModeChange('list')}
            className={`flex items-center justify-center w-8 h-full transition-colors ${viewMode === 'list' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <LayoutList size={14} />
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`flex items-center justify-center w-8 h-full transition-colors ${viewMode === 'grid' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <LayoutGrid size={14} />
          </button>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center h-8 bg-zinc-900 border border-zinc-800/80 rounded-md px-2.5 text-xs text-zinc-500 w-56 cursor-text hover:border-zinc-700 transition-colors gap-2"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left">Search files...</span>
          <KeyboardShortcut keys={['⌘', 'K']} />
        </button>
      </div>
    </header>
  );
};
