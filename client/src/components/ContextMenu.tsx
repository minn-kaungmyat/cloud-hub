import { useEffect, useRef } from 'react';
import { Edit3, FolderInput, Share, Link as LinkIcon, Download, Trash2, Info } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useFileStore } from '../store/fileStore';
import { useFiles, useDeleteFile } from '../hooks/useFiles';
import { useAuthStore } from '../store/authStore';
import { useSearchParams } from 'react-router-dom';

export const ContextMenu = () => {
  const { contextMenuOpen, contextMenuPosition, contextMenuFileId, setContextMenu, openRename, openMove, openConfirm } = useUIStore();
  const { toggleInspector, clearSelection, bulkMode, selectedFileIds } = useFileStore();
  const [searchParams] = useSearchParams();
  const activeAccount = searchParams.get('account') || 'google-drive';
  const accountId = ['recent', 'favorites', 'large-files'].includes(activeAccount) ? undefined : activeAccount;
  const folderId = searchParams.get('folder') || 'root';
  const { data } = useFiles(accountId, folderId);
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

  const files = data?.pages.flatMap(p => p.files) ?? [];
  const file = files.find(f => f.id === contextMenuFileId);
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
    const targetFiles = data?.pages.flatMap(p => p.files).filter(f => targetIds.includes(f.id)) || [];

    targetFiles.forEach((f) => {
      const url = `${import.meta.env.VITE_API_URL}/api/files/${f.id}/download?token=${token}`;
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      
      // Clean up iframe after download starts
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 5000);
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
      
      {!bulkMode && (
        <>
          <ContextMenuItem icon={Share} label="Share" onClick={() => handleAction(() => {})} />
          <ContextMenuItem icon={LinkIcon} label="Copy Link" onClick={() => handleAction(() => {})} />
        </>
      )}
      
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
