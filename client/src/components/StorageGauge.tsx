export interface StorageGaugeProps {
  used: number;
  total: number;
}

function formatStorage(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export const StorageGauge = ({ used, total }: StorageGaugeProps) => {
  const percent = Math.min((used / total) * 100, 100);

  return (
    <div className="px-4 py-2 text-xs font-mono text-zinc-500">
      <div className="flex justify-between mb-1.5 tabular-nums">
        <span>Storage</span>
        <span>{formatStorage(used)} / {formatStorage(total)}</span>
      </div>
      <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-zinc-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
