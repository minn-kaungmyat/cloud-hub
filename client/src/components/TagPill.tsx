export interface TagPillProps {
  label: string;
  colorClass: string;
}

export const TagPill = ({ label, colorClass }: TagPillProps) => (
  <div className="flex items-center mt-1">
    <div className={`w-2 h-2 rounded-full mr-2 ${colorClass}`} />
    <span className="text-sm text-zinc-400">{label}</span>
  </div>
);
