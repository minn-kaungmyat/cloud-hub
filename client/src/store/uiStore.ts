import { create } from 'zustand';

interface UIStore {
  searchOpen: boolean;
  uploadOpen: boolean;
  newFolderOpen: boolean;
  connectAccountOpen: boolean;
  renameOpen: boolean;
  moveOpen: boolean;
  confirmOpen: boolean;
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
  dragOver: boolean;
  contextMenuOpen: boolean;
  contextMenuPosition: { x: number; y: number };
  contextMenuFileId: string | null;

  confirmTitle: string;
  confirmMessage: string;
  confirmVariant: 'default' | 'danger';
  onConfirm: (() => void) | null;

  renameTarget: { id: string; name: string } | null;
  moveTarget: { id: string; name: string } | null;

  setSearchOpen: (open: boolean) => void;
  setUploadOpen: (open: boolean) => void;
  setNewFolderOpen: (open: boolean) => void;
  setConnectAccountOpen: (open: boolean) => void;
  setDragOver: (over: boolean) => void;
  setContextMenu: (open: boolean, x?: number, y?: number, fileId?: string | null) => void;

  openRename: (id: string, name: string) => void;
  closeRename: () => void;
  openMove: (id: string, name: string) => void;
  closeMove: () => void;
  openConfirm: (title: string, message: string, variant: 'default' | 'danger', onConfirm: () => void) => void;
  closeConfirm: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  searchOpen: false,
  uploadOpen: false,
  newFolderOpen: false,
  connectAccountOpen: false,
  renameOpen: false,
  moveOpen: false,
  confirmOpen: false,
  previewOpen: false,
  dragOver: false,
  contextMenuOpen: false,
  contextMenuPosition: { x: 0, y: 0 },
  contextMenuFileId: null,

  confirmTitle: '',
  confirmMessage: '',
  confirmVariant: 'default',
  onConfirm: null,

  renameTarget: null,
  moveTarget: null,

  setSearchOpen: (open) => set({ searchOpen: open }),
  setUploadOpen: (open) => set({ uploadOpen: open }),
  setNewFolderOpen: (open) => set({ newFolderOpen: open }),
  setConnectAccountOpen: (open) => set({ connectAccountOpen: open }),
  setPreviewOpen: (open) => set({ previewOpen: open }),
  setDragOver: (over) => set({ dragOver: over }),
  setContextMenu: (open, x = 0, y = 0, fileId = null) => 
    set({ contextMenuOpen: open, contextMenuPosition: { x, y }, contextMenuFileId: fileId }),

  openRename: (id, name) => set({ renameOpen: true, renameTarget: { id, name } }),
  closeRename: () => set({ renameOpen: false, renameTarget: null }),
  openMove: (id, name) => set({ moveOpen: true, moveTarget: { id, name } }),
  closeMove: () => set({ moveOpen: false, moveTarget: null }),
  openConfirm: (title, message, variant, onConfirm) =>
    set({ confirmOpen: true, confirmTitle: title, confirmMessage: message, confirmVariant: variant, onConfirm }),
  closeConfirm: () => set({ confirmOpen: false, onConfirm: null }),
}));
