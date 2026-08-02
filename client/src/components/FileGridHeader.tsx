import { useLocation } from 'react-router-dom';

export const FileGridHeader = () => {
  const location = useLocation();

  return (
    <div className="flex items-center h-8 px-4 border-b border-zinc-800/60 text-[11px] font-medium text-zinc-500 uppercase tracking-wide select-none sticky top-0 bg-zinc-950 z-10">
      <div className="flex-1">Name</div>
      {location.pathname === '/trash' && (
        <div className="w-32 shrink-0 text-left">Source</div>
      )}
      <div className="w-24 shrink-0 text-right">Size</div>
      <div className="w-36 shrink-0 text-right">Modified</div>
      <div className="w-8 shrink-0"></div>
    </div>
  );
};
