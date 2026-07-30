import React from 'react';

export interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  active?: boolean;
  suffix?: React.ReactNode;
  onClick?: () => void;
}

export const SidebarItem = ({ icon, label, sublabel, active, suffix, onClick }: SidebarItemProps) => (
  <div
    onClick={onClick}
    className={`group flex items-center px-3 py-1.5 cursor-pointer select-none rounded-sm mx-1 transition-colors gap-2 ${
      active
        ? 'bg-zinc-900 text-zinc-200'
        : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-300'
    }`}
  >
    <span className="w-4 h-4 shrink-0 flex items-center justify-center">{icon}</span>
    <div className="flex-1 min-w-0">
      <span className="text-sm truncate block leading-tight">{label}</span>
      {sublabel && <span className="text-[10px] text-zinc-600 truncate block leading-tight">{sublabel}</span>}
    </div>
    {suffix && <div className="shrink-0">{suffix}</div>}
  </div>
);
