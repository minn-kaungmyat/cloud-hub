export interface MetadataRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

export const MetadataRow = ({ label, value, mono = true }: MetadataRowProps) => (
  <div className="flex justify-between border-b border-zinc-800/40 pb-2">
    <span className="text-zinc-500">{label}</span>
    <span className={mono ? 'font-mono tabular-nums text-zinc-300' : 'text-zinc-300'}>
      {value}
    </span>
  </div>
);
