export interface SidebarSectionProps {
  label: string;
}

export const SidebarSection = ({ label }: SidebarSectionProps) => (
  <div className="h-px bg-zinc-800/60 my-3 mx-4" aria-label={label} />
);
