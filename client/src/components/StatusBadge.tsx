import type { CloudAccount } from '../types';

const statusConfig = {
  connected: { label: 'Connected', dotClass: 'bg-green-500' },
  syncing: { label: 'Syncing', dotClass: 'bg-amber-500 animate-pulse' },
  error: { label: 'Error', dotClass: 'bg-red-500' },
  expired: { label: 'Expired', dotClass: 'bg-amber-500/50' },
} as const;

export const StatusBadge = ({ status }: { status: CloudAccount['status'] }) => {
  const config = statusConfig[status];
  return (
    <span 
      className="inline-flex items-center justify-center shrink-0 w-4 h-4" 
      title={config.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
    </span>
  );
};
