import { useUIStore } from '../store/uiStore';

export const ConfirmDialog = () => {
  const { confirmOpen, confirmTitle, confirmMessage, confirmVariant, onConfirm, closeConfirm } = useUIStore();

  if (!confirmOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeConfirm}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-zinc-200 mb-2">{confirmTitle}</h3>
        <p className="text-sm text-zinc-400 mb-5">{confirmMessage}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={closeConfirm}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm?.();
              closeConfirm();
            }}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              confirmVariant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-accent text-zinc-950 hover:opacity-90'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
