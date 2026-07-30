export interface KeyboardShortcutProps {
  keys: string[];
}

export const KeyboardShortcut = ({ keys }: KeyboardShortcutProps) => (
  <span className="flex items-center gap-0.5">
    {keys.map((key) => (
      <kbd
        key={key}
        className="bg-zinc-800 border border-zinc-700 rounded px-1 py-px text-[10px] leading-tight font-mono text-zinc-400 select-none"
      >
        {key}
      </kbd>
    ))}
  </span>
);
