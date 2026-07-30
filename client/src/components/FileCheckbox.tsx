export interface FileCheckboxProps {
  checked: boolean;
  onChange: (e: React.MouseEvent) => void;
}

export const FileCheckbox = ({ checked, onChange }: FileCheckboxProps) => (
  <button
    onClick={onChange}
    className={`w-4 h-4 shrink-0 rounded-sm border transition-colors flex items-center justify-center ${
      checked
        ? 'bg-accent border-accent text-zinc-950'
        : 'border-zinc-600 hover:border-zinc-400'
    }`}
  >
    {checked && (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </button>
);
