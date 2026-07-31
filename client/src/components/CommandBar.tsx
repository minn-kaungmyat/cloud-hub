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
  rightSlot?: React.ReactNode;
}

export const CommandBar = ({ segments, viewMode, onNavigate, onViewModeChange, rightSlot }: CommandBarProps) => {
  const { setSearchOpen } = useUIStore();

  return (
    <header className="h-12 flex items-center px-4 border-b border-zinc-800/60 shrink-0">
      {/* Left: Breadcrumbs */}
      <div className="flex-1 min-w-0 pr-4">
        <Breadcrumb segments={segments} onNavigate={onNavigate} />
      </div>

      {/* Center: Prominent Search Trigger */}
      <div className="flex-[2] max-w-2xl flex justify-center">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center h-[34px] bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-400 w-full max-w-[500px] cursor-pointer hover:bg-zinc-800 hover:border-zinc-700 hover:text-zinc-300 transition-all gap-3 shadow-sm group"
        >
          <Search size={16} className="shrink-0 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
          <span className="flex-1 text-left tracking-wide">Search across your cloud...</span>
          <div className="hidden sm:block">
            <KeyboardShortcut keys={['⌘', 'K']} />
          </div>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex-1 flex justify-end items-center gap-2 pl-4">
        <div className="flex items-center h-8 border border-zinc-800/80 rounded-md overflow-hidden bg-zinc-950">
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
        {rightSlot}
      </div>
    </header>
  );
};
