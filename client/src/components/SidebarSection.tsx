export interface SidebarSectionProps {
  label: string;
}

export const SidebarSection = ({ label }: SidebarSectionProps) => (
  <div className="px-4 mt-6 mb-2 first:mt-0 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider select-none">
    {label}
  </div>
);
