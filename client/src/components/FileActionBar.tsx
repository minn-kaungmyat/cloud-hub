import { Upload, FolderPlus, Download, Trash2, X } from 'lucide-react';
import { useFileStore } from '../store/fileStore';
import { useUIStore } from '../store/uiStore';
import { useDeleteFile } from '../hooks/useFiles';

import { useAuthStore } from '../store/authStore';
import { useRef, useState, useEffect } from 'react';
import { useUploadStore } from '../store/uploadStore';
import { useSearchParams } from 'react-router-dom';
import { useActiveAccount } from '../hooks/useActiveAccount';

export const FileActionBar = () => {
  const { selectedFileIds, clearSelection } = useFileStore();
  const { setNewFolderOpen, openConfirm } = useUIStore();
  const { mutateAsync: deleteFile } = useDeleteFile();
  const { token } = useAuthStore();

  const count = selectedFileIds.length;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const addUploads = useUploadStore((s) => s.addUploads);
  const addFolderUploads = useUploadStore((s) => s.addFolderUploads);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [searchParams] = useSearchParams();
  const activeAccount = useActiveAccount();
  const folderId = searchParams.get('folder') || 'root';
  const isCollection = ['recent', 'favorites', 'large-files'].includes(activeAccount);
  const accountId = isCollection ? '' : activeAccount;

  return (
    <div className="h-10 flex items-center px-4 border-b border-zinc-800/40 gap-1 shrink-0 bg-zinc-950">
      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        className="hidden" 
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && !isCollection) {
            addUploads(Array.from(e.target.files), accountId, folderId);
          }
          e.target.value = '';
        }}
      />
     
      <input 
        type="file" 
        multiple 
        webkitdirectory="true" 
        directory="true"
        ref={folderInputRef} 
        className="hidden" 
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && !isCollection) {
            addFolderUploads(Array.from(e.target.files), accountId, folderId);
          }
          e.target.value = '';
        }}
      />
      
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => {
            if (!isCollection) setDropdownOpen(!dropdownOpen);
          }}
          disabled={isCollection}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-sm transition-colors ${
            isCollection
              ? 'text-zinc-600 cursor-not-allowed'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Upload size={14} />
          <span>New</span>
        </button>

        {dropdownOpen && !isCollection && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-zinc-900 border border-neutral-800 rounded-sm shadow-none z-50 py-1">
            <DropdownItem 
              icon={<FolderPlus size={14} />} 
              label="New folder" 
              onClick={() => {
                setDropdownOpen(false);
                setNewFolderOpen(true);
              }} 
            />
            <div className="h-px bg-neutral-800 my-1 mx-2" />
            <DropdownItem 
              icon={<Upload size={14} />} 
              label="File upload" 
              onClick={() => {
                setDropdownOpen(false);
                fileInputRef.current?.click();
              }} 
            />
            <DropdownItem 
              icon={<Upload size={14} className="opacity-70" />} 
              label="Folder upload" 
              onClick={() => {
                setDropdownOpen(false);
                folderInputRef.current?.click();
              }} 
            />
          </div>
        )}
      </div>

      {count > 0 && (
        <>
          <div className="w-px h-4 bg-zinc-800 mx-2" />
          <span className="text-xs text-zinc-400 mr-2 font-mono tabular-nums">{count} selected</span>
          <ActionBtn icon={<Download size={14} />} label="Download" onClick={() => {
            selectedFileIds.forEach((id, index) => {
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
            clearSelection();
          }} />
          <ActionBtn
            icon={<Trash2 size={14} />}
            label="Delete"
            danger
            onClick={() =>
              openConfirm(
                'Delete files',
                `Are you sure you want to delete ${count} file(s)?`,
                'danger',
                () => {
                  Promise.all(selectedFileIds.map(id => deleteFile(id))).finally(() => {
                    clearSelection();
                  });
                },
              )
            }
          />
        </>
      )}
      
      <div className="flex-1" />
      
      {count > 0 && (
        <button onClick={clearSelection} className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors">
          <X size={14} />
        </button>
      )}
    </div>
  );
};

const DropdownItem = ({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors text-left"
  >
    <span className="text-zinc-400">{icon}</span>
    {label}
  </button>
);

const ActionBtn = ({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-sm transition-colors ${
      disabled
        ? 'text-zinc-600 cursor-not-allowed'
        : danger
        ? 'text-red-400 hover:bg-red-500/10'
        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
    }`}
  >
    {icon}
    {label}
  </button>
);
