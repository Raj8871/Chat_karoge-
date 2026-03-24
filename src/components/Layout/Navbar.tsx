import React from 'react';
import { auth, logout } from '../../firebase';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';

export const Navbar: React.FC = () => {
  const [user] = useAuthState(auth);

  if (!user) return null;

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
          <UserIcon size={24} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900">{user.displayName || 'User'}</span>
          <span className="text-xs text-gray-500">{user.email}</span>
        </div>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </nav>
  );
};
