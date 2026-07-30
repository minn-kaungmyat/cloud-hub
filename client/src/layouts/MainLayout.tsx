import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Inspector } from '../components/Inspector';
import { ContextMenu } from '../components/ContextMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ConnectAccountModal } from '../components/ConnectAccountModal';
import { UploadManager } from '../components/UploadManager';
import { NewFolderModal } from '../components/NewFolderModal';
import { SearchModal } from '../components/SearchModal';
import { RenameModal } from '../components/RenameModal';
import { MoveModal } from '../components/MoveModal';
import { useFileStore } from '../store/fileStore';

const MainLayout = () => {
  const inspectorOpen = useFileStore((s) => s.inspectorOpen);

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-300 overflow-hidden font-sans">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <Outlet />
      </main>

      {inspectorOpen && <Inspector />}
      <ContextMenu />

      {/* Global Modals */}
      <ConfirmDialog />
      <ConnectAccountModal />
      <UploadManager />
      <NewFolderModal />
      <SearchModal />
      <RenameModal />
      <MoveModal />
    </div>
  );
};

export default MainLayout;
