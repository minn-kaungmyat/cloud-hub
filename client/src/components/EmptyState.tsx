import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
}

export const EmptyState = ({ icon: Icon, message }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500 select-none">
    <Icon size={40} strokeWidth={1} />
    <p className="text-sm">{message}</p>
  </div>
);
