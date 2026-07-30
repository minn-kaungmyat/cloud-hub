import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode } from '../types';

interface FileStore {
  selectedFileId: string | null;
  selectedFileIds: string[];
  lastSelectedFileId: string | null;
  viewMode: ViewMode;
  bulkMode: boolean;
  inspectorOpen: boolean;

  setSelectedFile: (id: string | null) => void;
  toggleFileSelection: (id: string) => void;
  multiSelect: (id: string, isCtrl: boolean, isShift: boolean, allFileIds: string[]) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setBulkMode: (on: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleInspector: () => void;
}

export const useFileStore = create<FileStore>()(
  persist(
    (set, get) => ({
      selectedFileId: null,
      selectedFileIds: [],
      lastSelectedFileId: null,
      viewMode: 'list',
      bulkMode: false,
      inspectorOpen: false,

      setSelectedFile: (id) => set({ selectedFileId: id, selectedFileIds: id ? [id] : [], lastSelectedFileId: id, bulkMode: false }),

      toggleFileSelection: (id) => {
        const current = get().selectedFileIds;
        const next = current.includes(id)
          ? current.filter((fid) => fid !== id)
          : [...current, id];
        set({ selectedFileIds: next, bulkMode: next.length > 0, lastSelectedFileId: id });
      },

      multiSelect: (id, isCtrl, isShift, allFileIds) => {
        const current = get().selectedFileIds;
        const lastSelected = get().lastSelectedFileId;

        if (isShift && lastSelected && allFileIds.includes(lastSelected) && allFileIds.includes(id)) {
          const startIndex = allFileIds.indexOf(lastSelected);
          const endIndex = allFileIds.indexOf(id);
          const min = Math.min(startIndex, endIndex);
          const max = Math.max(startIndex, endIndex);
          const range = allFileIds.slice(min, max + 1);
          
          // If ctrl is also pressed, add range to current selection. Otherwise, range IS the selection.
          const next = isCtrl ? Array.from(new Set([...current, ...range])) : range;
          set({ selectedFileIds: next, bulkMode: true });
          // Note: shift click usually doesn't update the last selected pivot, but we can leave it as is.
        } else if (isCtrl) {
          const next = current.includes(id)
            ? current.filter((fid) => fid !== id)
            : [...current, id];
          set({ selectedFileIds: next, bulkMode: next.length > 0, lastSelectedFileId: id });
        } else {
          set({ selectedFileIds: [id], selectedFileId: id, bulkMode: false, lastSelectedFileId: id });
        }
      },

      selectAll: (ids) => {
        set({ selectedFileIds: ids, bulkMode: true });
      },

      clearSelection: () => set({ selectedFileId: null, selectedFileIds: [], lastSelectedFileId: null, bulkMode: false }),

      setBulkMode: (on) => set({ bulkMode: on, selectedFileIds: on ? get().selectedFileIds : [] }),

      setViewMode: (mode) => set({ viewMode: mode }),

      toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
    }),
    {
      name: 'file-store-settings',
      partialize: (state) => ({ viewMode: state.viewMode, inspectorOpen: state.inspectorOpen }),
    }
  )
);
