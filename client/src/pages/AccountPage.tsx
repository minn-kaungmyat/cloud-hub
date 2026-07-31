import { CommandBar } from '../components/CommandBar';
import { FileActionBar } from '../components/FileActionBar';
import { FileList } from '../components/FileList';
import { UploadDropzone } from '../components/UploadDropzone';
import { useFileStore } from '../store/fileStore';
import { useUIStore } from '../store/uiStore';
import { useFolderPath } from '../hooks/useFiles';
import { useSearchParams } from 'react-router-dom';

const AccountPage = () => {
  const { viewMode, setViewMode } = useFileStore();
  const setDragOver = useUIStore((s) => s.setDragOver);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeAccount = searchParams.get('account') || 'google-drive';
  const folderId = searchParams.get('folder') || 'root';
  
  const accountId = ['recent', 'favorites', 'large-files'].includes(activeAccount) ? undefined : activeAccount;
  
  const { data: pathData = [] } = useFolderPath(folderId);

  const segments = [
    { id: 'root', label: accountId ? 'Account Root' : 'All Files' },
    ...pathData,
  ];

  return (
    <div 
      className="flex-1 flex flex-col min-h-0 relative"
      onDragEnter={(e) => { 
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault(); 
          setDragOver(true); 
        }
      }}
    >
      <CommandBar
        segments={segments}
        viewMode={viewMode}
        onNavigate={(id) => {
          if (id === 'root') {
            searchParams.delete('folder');
            setSearchParams(searchParams);
          } else {
            searchParams.set('folder', id);
            setSearchParams(searchParams);
          }
        }}
        onViewModeChange={setViewMode}
      />
      <FileActionBar />
      
      <div className="flex-1 overflow-y-auto relative">
        <FileList />
      </div>

      {/* Global Overlays */}
      <UploadDropzone />
    </div>
  );
};

export default AccountPage;
