import { useEffect, useRef } from 'react';
import { Edit3, FolderInput, Download, Trash2, Info } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';
import { useDeleteFile, useFileFromCache } from '../hooks/useFiles';
import { useAuthStore } from '../store/authStore';


export const ContextMenu = () => {
  const { contextMenuOpen, contextMenuPosition, contextMenuFileId, setContextMenu, openRename, openMove, openConfirm } = useUIStore();
  const { toggleInspector, clearSelection, bulkMode, selectedFileIds } = useFileStore();
  const file = useFileFromCache(contextMenuFileId);
  const { mutateAsync: deleteFileAsync } = useDeleteFile();
  const { token } = useAuthStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (contextMenuOpen && e.key === 'Escape') setContextMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [contextMenuOpen, setContextMenu]);

  if (!contextMenuOpen || !contextMenuFileId) return null;

  if (!file) return null;

  // Ensure menu doesn't flow off screen
  const menuWidth = 220;
  const menuHeight = 280;
  const x = Math.min(contextMenuPosition.x, window.innerWidth - menuWidth - 10);
  const y = Math.min(contextMenuPosition.y, window.innerHeight - menuHeight - 10);

  const handleAction = (action: () => void) => {
    action();
    setContextMenu(false);
  };


  const handleDownload = () => {
    if (!token) return;
    const targetIds = bulkMode ? selectedFileIds : (file ? [file.id] : []);
    
    // Fallback: If downloading multiple files, we should probably resolve them all via cache if possible,
    // but for now, ContextMenu is usually initiated from a view where the file exists.
    // If bulk mode is active, we just download the selected file IDs. 
    // We don't necessarily need the full CloudFile object for download since backend might just take IDs.
    // However, the current logic uses targetFiles to open windows. Let's fix that.
    
    targetIds.forEach((id, index) => {
      setTimeout(() => {
        const url = `${import.meta.env.VITE_API_URL}/api/files/${id}/download?token=${token}`;
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 10000);
      }, index * 500);
    });
    
    setContextMenu(false);
  };

  const handleDelete = () => {
    const targetIds = bulkMode ? selectedFileIds : (file ? [file.id] : []);
    Promise.all(targetIds.map(id => deleteFileAsync(id))).finally(() => {
      clearSelection();
    });
  };

  const count = bulkMode ? selectedFileIds.length : 1;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[220px] bg-zinc-900 border border-zinc-700/60 rounded-md py-1.5 flex flex-col text-sm text-zinc-300 backdrop-blur-xl"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!bulkMode && (
        <>
          <ContextMenuItem icon={Info} label="Details" onClick={() => handleAction(toggleInspector)} />
          <div className="h-px bg-zinc-800/80 my-1.5 mx-2" />
          <ContextMenuItem icon={Edit3} label="Rename" onClick={() => handleAction(() => openRename(file.id, file.name))} />
        </>
      )}
      
      <ContextMenuItem icon={FolderInput} label={bulkMode ? `Move ${count} items` : "Move"} onClick={() => handleAction(() => {
        // We'll update openMove to handle array of targets or bulkMode. For now we just pass the first file's info or a generic name.
        openMove(file.id, bulkMode ? `${count} items` : file.name);
      })} />
      
      <div className="h-px bg-zinc-800/80 my-1.5 mx-2" />
      

      
      <ContextMenuItem icon={Download} label={bulkMode ? `Download ${count} items` : "Download"} onClick={handleDownload} />
      
      <div className="h-px bg-zinc-800/80 my-1.5 mx-2" />
      <ContextMenuItem 
        icon={Trash2} 
        label={bulkMode ? `Delete ${count} items` : "Delete"} 
        danger 
        onClick={() => handleAction(() => openConfirm(
          'Delete items', 
          `Are you sure you want to delete ${bulkMode ? count + ' items' : '"' + file.name + '"'}?`, 
          'danger', 
          handleDelete
        ))} 
      />
    </div>
  );
};

const ContextMenuItem = ({ icon: Icon, label, onClick, danger }: { icon: React.ElementType, label: string, onClick: () => void, danger?: boolean }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-1.5 mx-1.5 rounded-md transition-colors ${
      danger ? 'text-red-400 hover:bg-red-500/10' : 'hover:bg-zinc-800/80 hover:text-zinc-100'
    }`}
  >
    <Icon size={14} />
    {label}
  </button>
);
