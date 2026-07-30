import { Upload, Download, Trash2, Edit3, FolderInput, Share, Star, RefreshCw } from 'lucide-react';
import type { Activity } from '../types';

const iconMap = {
  upload: Upload,
  download: Download,
  delete: Trash2,
  rename: Edit3,
  move: FolderInput,
  share: Share,
  favorite: Star,
  sync: RefreshCw,
} as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const ActivityItem = ({ activity }: { activity: Activity }) => {
  const Icon = iconMap[activity.type as keyof typeof iconMap];
  return (
    <div className="flex items-start gap-3 py-2 px-4 text-sm border-b border-zinc-800/40">
      <div className="w-7 h-7 rounded-sm bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={13} className="text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        {activity.fileName && (
          <span className="text-zinc-200 font-medium truncate block">{activity.fileName}</span>
        )}
        <span className="text-zinc-500 text-xs">{activity.description}</span>
      </div>
      <span className="text-[11px] font-mono text-zinc-600 tabular-nums shrink-0">{timeAgo(activity.timestamp)}</span>
    </div>
  );
};
