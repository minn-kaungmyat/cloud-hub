import { ChevronRight } from 'lucide-react';
import type { BreadcrumbSegment } from '../types';

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate: (segmentId: string) => void;
}

export const Breadcrumb = ({ segments, onNavigate }: BreadcrumbProps) => (
  <nav className="flex items-center text-sm min-w-0">
    {segments.map((segment, i) => {
      const isLast = i === segments.length - 1;
      return (
        <span key={segment.id} className="flex items-center min-w-0">
          {i > 0 && <ChevronRight size={14} className="mx-1 text-zinc-600 shrink-0" />}
          <span
            onClick={() => onNavigate(segment.id)}
            onDragOver={(e) => {
              if (isLast) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              e.currentTarget.classList.add('bg-zinc-800/80', 'text-white', 'px-2', 'py-1', 'rounded-md', '-mx-2');
            }}
            onDragLeave={(e) => {
              if (isLast) return;
              e.currentTarget.classList.remove('bg-zinc-800/80', 'text-white', 'px-2', 'py-1', 'rounded-md', '-mx-2');
            }}
            onDrop={(e) => {
              if (isLast) return;
              e.preventDefault();
              e.currentTarget.classList.remove('bg-zinc-800/80', 'text-white', 'px-2', 'py-1', 'rounded-md', '-mx-2');
              try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.ids) {
                  window.dispatchEvent(new CustomEvent('move-file', { detail: { fileIds: data.ids.filter((id: string) => id !== segment.id), targetFolderId: segment.id, targetFolderName: segment.label } }));
                } else if (data.id && data.id !== segment.id) {
                  const event = new CustomEvent('move-file', { detail: { fileIds: [data.id], targetFolderId: segment.id, targetFolderName: segment.label } });
                  window.dispatchEvent(event);
                }
              } catch { }
            }}
            className={`truncate cursor-pointer transition-colors ${
              isLast
                ? 'text-zinc-200 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {segment.label}
          </span>
        </span>
      );
    })}
  </nav>
);
