import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MoreVertical, LogOut, User, X, Check, Copy, MessageSquare, Bot, Lock, Unlock, ArrowLeft } from 'lucide-react';
import { UserProfile, Chat, Friend } from '../../types';
import { db, logout } from '../../firebase';
import { collection, query, where, onSnapshot, getDocs, doc, setDoc, updateDoc, deleteDoc, Timestamp, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

interface SidebarProps {
  currentUser: UserProfile;
  onSelectChat: (chat: Chat, otherUser: UserProfile) => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenAIChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentUser, onSelectChat, onLogout, onOpenProfile, onOpenAIChat }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<Record<string, UserProfile>>({});
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [search, setSearch] = useState('');
  const [showLockedChats, setShowLockedChats] = useState(false);
  const [isLockedChatsUnlocked, setIsLockedChatsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    // Listen for friends
    const qFriends = query(collection(db, 'friends'), where('uids', 'array-contains', currentUser.uid));
    const unsubFriends = onSnapshot(qFriends, (snapshot) => {
      const friendList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Friend));
      setFriends(friendList);

      const friendUids = friendList.map(f => f.uids.find(uid => uid !== currentUser.uid)).filter(Boolean) as string[];
      if (friendUids.length > 0) {
        // Listen for friend profiles in real-time
        const usersQuery = query(collection(db, 'users'), where('uid', 'in', friendUids));
        onSnapshot(usersQuery, (userSnap) => {
          const usersMap: Record<string, UserProfile> = {};
          userSnap.forEach(doc => {
            const data = doc.data() as UserProfile;
            usersMap[data.uid] = data;
          });
          setFriendProfiles(usersMap);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'friend profiles');
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'friends');
    });

    // Listen for chats
    const qChats = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
    const unsubChats = onSnapshot(qChats, (snapshot) => {
      const chatsMap: Record<string, Chat> = {};
      snapshot.forEach(doc => {
        const data = doc.data() as Chat;
        chatsMap[doc.id] = { ...data, id: doc.id };
      });
      setChats(chatsMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => {
      unsubFriends();
      unsubChats();
    };
  }, [currentUser.uid]);

  const filteredFriends = friends.filter(f => {
    const otherUid = f.uids.find(uid => uid !== currentUser.uid);
    const profile = friendProfiles[otherUid || ''];
    if (!profile) return false;

    // Filter by search
    const matchesSearch = profile.displayName.toLowerCase().includes(search.toLowerCase()) || 
                         profile.uniqueId.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    // Filter out locked chats (unless we are in locked chats view)
    const chat = chats[f.id];
    if (chat?.lockedBy?.includes(currentUser.uid) && !showLockedChats) return false;
    if (!chat?.lockedBy?.includes(currentUser.uid) && showLockedChats) return false;

    // Filter out deleted chats (unless there's a new message OR searching)
    if (!search && chat?.deletedAt?.[currentUser.uid]) {
      const deletedAt = chat.deletedAt[currentUser.uid];
      const updatedAt = chat.updatedAt;
      
      const deletedAtMillis = deletedAt instanceof Timestamp ? deletedAt.toMillis() : 0;
      const updatedAtMillis = updatedAt instanceof Timestamp ? updatedAt.toMillis() : 0;

      // If deletedAt is more recent than updatedAt, hide it from the main list
      if (deletedAtMillis >= updatedAtMillis) return false;
    }

    return true;
  }).sort((a, b) => {
    const chatA = chats[a.id];
    const chatB = chats[b.id];
    const timeA = chatA?.updatedAt instanceof Timestamp ? chatA.updatedAt.toMillis() : 0;
    const timeB = chatB?.updatedAt instanceof Timestamp ? chatB.updatedAt.toMillis() : 0;
    return timeB - timeA;
  });

  const lockedChatsCount = friends.filter(f => chats[f.id]?.lockedBy?.includes(currentUser.uid)).length;

  const handleUnlockLockedChats = () => {
    // Simple verification using uniqueId as PIN for now
    if (pinInput.toUpperCase() === currentUser.uniqueId.toUpperCase()) {
      setIsLockedChatsUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
    }
  };

  return (
    <div className="w-full md:w-[400px] h-full border-r flex flex-col relative" style={{ backgroundColor: 'var(--sidebar-color)', borderColor: 'var(--sidebar-color)' }}>
      {/* Header */}
      <div className="p-3 flex items-center justify-between sticky top-0 z-10" style={{ backgroundColor: 'var(--header-color)' }}>
        <div className="flex items-center gap-2">
          {showLockedChats && (
            <button 
              onClick={() => {
                setShowLockedChats(false);
                setIsLockedChatsUnlocked(false);
                setPinInput('');
              }}
              className="p-1 hover:bg-black/5 rounded-full transition-colors"
              style={{ color: 'var(--text-color)' }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className="text-xl font-bold px-2" style={{ color: 'var(--text-color)' }}>
            {showLockedChats ? 'Locked Chats' : 'Chats'}
          </h1>
        </div>
        
        <button 
          onClick={onOpenProfile}
          className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm hover:opacity-80 transition-opacity"
        >
          <img 
            src={currentUser.photoURL} 
            alt="Profile" 
            className="w-full h-full object-cover"
          />
        </button>
      </div>

      {/* Search */}
      {!showLockedChats && (
        <div className="p-2" style={{ backgroundColor: 'var(--sidebar-color)' }}>
          <div className="rounded-lg flex items-center px-4 py-2 gap-4" style={{ backgroundColor: 'var(--header-color)' }}>
            <Search size={18} className="opacity-50" style={{ color: 'var(--text-color)' }} />
            <input 
              type="text" 
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full"
              style={{ color: 'var(--text-color)' }}
            />
          </div>
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {showLockedChats && !isLockedChatsUnlocked ? (
          <div className="flex flex-col items-center justify-center p-8 h-full text-center">
            <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 text-purple-500 rounded-full flex items-center justify-center mb-6">
              <Lock size={32} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-color)' }}>Locked Chats</h2>
            <p className="text-sm opacity-60 mb-6" style={{ color: 'var(--text-color)' }}>Enter your Unique ID to unlock</p>
            
            <div className={`flex flex-col gap-3 w-full max-w-[240px] transition-transform ${pinError ? 'animate-shake' : ''}`}>
              <input 
                type="text"
                placeholder="Enter Unique ID"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockLockedChats()}
                className="w-full px-4 py-3 rounded-xl border bg-transparent text-center font-mono tracking-widest outline-none focus:border-purple-500 transition-colors"
                style={{ color: 'var(--text-color)', borderColor: 'var(--sidebar-color)' }}
              />
              <button 
                onClick={handleUnlockLockedChats}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/20"
              >
                Unlock
              </button>
              {pinError && <p className="text-xs text-red-500 mt-1">Invalid Unique ID</p>}
            </div>
          </div>
        ) : (
          <>
            {/* Locked Chats Entry */}
            {!showLockedChats && lockedChatsCount > 0 && (
              <div 
                onClick={() => setShowLockedChats(true)}
                className="flex items-center p-4 gap-4 cursor-pointer hover:bg-black/5 border-b transition-colors group"
                style={{ borderColor: 'var(--sidebar-color)' }}
              >
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                  <Lock size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold" style={{ color: 'var(--text-color)' }}>Locked Chats</span>
                    <span className="bg-purple-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {lockedChatsCount}
                    </span>
                  </div>
                  <p className="text-sm opacity-60" style={{ color: 'var(--text-color)' }}>Locked and hidden chats</p>
                </div>
              </div>
            )}

            {/* Garud AI Entry */}
            {!showLockedChats && (
              <div 
                onClick={onOpenAIChat}
                className="flex items-center p-3 gap-3 cursor-pointer transition-colors border-b opacity-90"
                style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)' }}
              >
                <div className="w-12 h-12 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-sm">
                  <Bot size={28} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#00a884] truncate">Garud AI</span>
                    <span className="text-[10px] bg-[#00a884]/10 text-[#00a884] px-1.5 py-0.5 rounded font-bold uppercase">AI</span>
                  </div>
                  <p className="text-sm opacity-60 truncate italic" style={{ color: 'var(--text-color)' }}>Ask me anything or generate images...</p>
                </div>
              </div>
            )}

            {filteredFriends.map(friend => {
          const otherUid = friend.uids.find(uid => uid !== currentUser.uid);
          const otherUser = friendProfiles[otherUid || ''];
          if (!otherUser) return null;

          const chat = chats[friend.id];
          const hasDeleted = chat?.deletedAt?.[currentUser.uid];
          const lastMessage = hasDeleted ? null : chat?.lastMessage;
          const updatedAt = hasDeleted ? null : chat?.updatedAt;

          return (
            <div 
              key={friend.id}
              onClick={() => onSelectChat(chat || {
                id: friend.id,
                participants: friend.uids,
                participantIds: [], // Will be populated if needed
                updatedAt: Timestamp.now()
              }, otherUser)}
              className="flex items-center p-3 gap-3 cursor-pointer transition-colors border-b"
              style={{ borderColor: 'var(--sidebar-color)', color: 'var(--text-color)' }}
            >
              <div className="w-12 h-12 bg-gray-300 rounded-full overflow-hidden relative">
                <img src={otherUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                {otherUser.status === 'online' && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#25d366] rounded-full border-2 border-white" />
                )}
              </div>
              
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="font-semibold truncate">{otherUser.displayName}</span>
                  <span className="text-xs opacity-40">
                    {updatedAt instanceof Timestamp 
                      ? updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                      : ''}
                  </span>
                </div>
                <p className="text-sm opacity-60 truncate">{lastMessage || 'No messages yet. Start chatting!'}</p>
              </div>
            </div>
          );
        })}
        {friends.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center opacity-20" style={{ color: 'var(--text-color)' }}>
            <MessageSquare size={48} className="mb-4" />
            <p className="text-sm">No chats yet. Add a friend using their unique ID to start chatting!</p>
          </div>
        )}
          </>
        )}
      </div>

    </div>
  );
};
