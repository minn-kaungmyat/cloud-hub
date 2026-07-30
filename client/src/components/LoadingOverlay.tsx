import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  label?: string;
}

export const LoadingOverlay = ({ label = 'Loading...' }: LoadingOverlayProps) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm transition-all duration-300">
      <div className="flex flex-col items-center gap-4 bg-zinc-900 border border-zinc-800/60 p-6 rounded-md">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
        <span className="text-sm font-medium text-zinc-300">{label}</span>
      </div>
    </div>
  );
};
