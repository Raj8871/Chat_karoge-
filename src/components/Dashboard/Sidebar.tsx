import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MoreVertical, LogOut, User, X, Check, Copy, MessageSquare, Bot } from 'lucide-react';
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
    return profile.displayName.toLowerCase().includes(search.toLowerCase()) || 
           profile.uniqueId.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => {
    const chatA = chats[a.id];
    const chatB = chats[b.id];
    const timeA = chatA?.updatedAt instanceof Timestamp ? chatA.updatedAt.toMillis() : 0;
    const timeB = chatB?.updatedAt instanceof Timestamp ? chatB.updatedAt.toMillis() : 0;
    return timeB - timeA;
  });

  return (
    <div className="w-full md:w-[400px] h-full bg-white border-r border-gray-200 flex flex-col relative">
      {/* Header */}
      <div className="bg-[#f0f2f5] p-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800 px-2">Chats</h1>
        
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
      <div className="p-2 bg-white">
        <div className="bg-[#f0f2f5] rounded-lg flex items-center px-4 py-2 gap-4">
          <Search size={18} className="text-gray-500" />
          <input 
            type="text" 
            placeholder="Search or start new chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {/* Garud AI Entry */}
        <div 
          onClick={onOpenAIChat}
          className="flex items-center p-3 gap-3 hover:bg-[#f5f6f6] cursor-pointer transition-colors border-b border-gray-50 bg-[#f0f2f5]/30"
        >
          <div className="w-12 h-12 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-sm">
            <Bot size={28} />
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#00a884] truncate">Garud AI</span>
              <span className="text-[10px] bg-[#00a884]/10 text-[#00a884] px-1.5 py-0.5 rounded font-bold uppercase">AI</span>
            </div>
            <p className="text-sm text-gray-500 truncate italic">Ask me anything or generate images...</p>
          </div>
        </div>

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
              className="flex items-center p-3 gap-3 hover:bg-[#f5f6f6] cursor-pointer transition-colors border-b border-gray-50"
            >
              <div className="w-12 h-12 bg-gray-300 rounded-full overflow-hidden relative">
                <img src={otherUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                {otherUser.status === 'online' && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#25d366] rounded-full border-2 border-white" />
                )}
              </div>
              
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 truncate">{otherUser.displayName}</span>
                  <span className="text-xs text-gray-400">
                    {updatedAt instanceof Timestamp 
                      ? updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                      : ''}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">{lastMessage || 'No messages yet. Start chatting!'}</p>
              </div>
            </div>
          );
        })}
        {friends.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p className="text-sm">No chats yet. Add a friend using their unique ID to start chatting!</p>
          </div>
        )}
      </div>

    </div>
  );
};
