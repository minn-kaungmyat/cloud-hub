import type { LucideIcon } from 'lucide-react';

export interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  variant?: 'default' | 'danger';
  onClick?: () => void;
}

export const IconButton = ({ icon: Icon, label, variant = 'default', onClick }: IconButtonProps) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-1 p-2 rounded-sm transition-colors focus:outline-none focus:ring-1 focus:ring-accent ${
      variant === 'danger'
        ? 'text-zinc-400 hover:bg-red-950 hover:text-red-400'
        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
    }`}
  >
    <Icon size={16} />
    <span className="text-[10px]">{label}</span>
  </button>
);
