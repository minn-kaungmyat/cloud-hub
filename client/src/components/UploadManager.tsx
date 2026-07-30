import { ChevronDown, ChevronUp, CheckCircle, AlertCircle, Loader2, X, Clock } from 'lucide-react';
import { useUploadStore } from '../store/uploadStore';
import { formatFileSize } from '../utils/format';

export const UploadManager = () => {
  const { uploads, isExpanded, toggleExpanded, dismissAllCompleted, cancelUpload } = useUploadStore();

  if (uploads.length === 0) return null;

  const activeCount = uploads.filter(u => u.status === 'uploading' || u.status === 'processing' || u.status === 'pending').length;
  const completedCount = uploads.filter(u => u.status === 'complete').length;
  const allComplete = activeCount === 0;

  const headerText = allComplete 
    ? `${completedCount} upload${completedCount !== 1 ? 's' : ''} complete`
    : `Uploading ${activeCount} item${activeCount !== 1 ? 's' : ''}`;

  const subText = allComplete
    ? null
    : `Uploading to cloud...`;

  return (
    <div className="fixed bottom-0 right-8 z-50 w-80 bg-zinc-900 border border-zinc-800/60 rounded-t-md border-b-0 shadow-none flex flex-col overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-2 min-h-10 bg-zinc-950 border-b border-zinc-800/60 cursor-pointer select-none"
        onClick={toggleExpanded}
      >
        <div className="flex flex-col justify-center">
          <span className="text-sm font-medium text-zinc-200">{headerText}</span>
          {subText && <span className="text-[10px] text-zinc-500 leading-none mt-1">{subText}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 hover:bg-zinc-800 rounded-sm text-zinc-400 transition-colors">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {allComplete && (
            <button 
              className="p-1 hover:bg-zinc-800 rounded-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                dismissAllCompleted();
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="max-h-64 overflow-y-auto bg-zinc-900">
          {uploads.map((item) => (
            <div key={item.id} className="relative group px-4 py-3 border-b border-zinc-800/40 last:border-b-0 hover:bg-zinc-800/20 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-zinc-200 truncate pr-4" title={item.fileName}>
                  {item.fileName}
                </span>
                <div className="w-5 shrink-0 flex items-center justify-end">
                  {item.status === 'complete' && <CheckCircle size={14} className="text-emerald-500" />}
                  {item.status === 'error' && <AlertCircle size={14} className="text-red-500" />}
                  {item.status === 'processing' && <Loader2 size={14} className="text-blue-400 animate-spin" />}
                  {(item.status === 'uploading' || item.status === 'pending') && (
                    <button 
                      onClick={() => cancelUpload(item.id)}
                      className="group/cancel flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Cancel upload"
                    >
                      {item.status === 'uploading' ? (
                        <>
                          <Loader2 size={14} className="text-accent animate-spin group-hover/cancel:hidden" />
                          <X size={14} className="hidden group-hover/cancel:block" />
                        </>
                      ) : (
                        <>
                          <Clock size={14} className="group-hover/cancel:hidden" />
                          <X size={14} className="hidden group-hover/cancel:block" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                {item.status === 'error' ? (
                  <span className="text-red-400 truncate pr-2">{item.error || 'Upload failed'}</span>
                ) : item.status === 'processing' ? (
                  <span className="text-blue-400">Processing...</span>
                ) : item.status === 'pending' ? (
                  <span className="text-zinc-500">Waiting in queue...</span>
                ) : (
                  <span className="text-zinc-500">{formatFileSize(item.size)}</span>
                )}
                
                {item.status === 'uploading' && (
                  <span className="text-accent">{item.progress}%</span>
                )}
              </div>
              
              {/* Micro progress bar */}
              {(item.status === 'uploading' || item.status === 'processing') && (
                <div className="absolute bottom-0 left-0 h-[2px] bg-accent/80 transition-all duration-300" style={{ width: `${item.status === 'processing' ? 100 : item.progress}%` }} />
              )}
              {item.status === 'error' && (
                <div className="absolute bottom-0 left-0 h-[2px] bg-red-500/50 w-full" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
