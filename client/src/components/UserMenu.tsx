import { Settings, LogOut, User as UserIcon } from 'lucide-react';
import { DropdownMenu } from './DropdownMenu';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const UserMenu = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const items = [
    {
      id: 'profile',
      label: 'Profile',
      icon: <UserIcon size={14} />,
      onClick: () => navigate('/settings'),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={14} />,
      onClick: () => navigate('/settings'),
    },
    {
      id: 'signout',
      label: 'Sign out',
      icon: <LogOut size={14} />,
      danger: true,
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  if (!user) return null;

  return (
    <DropdownMenu
      align="left"
      direction="up"
      items={items}
      trigger={
        <div className="flex items-center gap-2.5 w-full hover:bg-zinc-900/50 p-2 rounded-md transition-colors">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-xs text-zinc-950 font-bold shrink-0">
            {user.avatar || user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-200 truncate">{user.name}</div>
            <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
          </div>
        </div>
      }
    />
  );
};
