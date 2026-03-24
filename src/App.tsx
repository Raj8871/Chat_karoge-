import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { UserProfile, Chat } from './types';
import { Login } from './components/Auth/Login';
import { Sidebar } from './components/Dashboard/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import { RightSidebar } from './components/Dashboard/RightSidebar';
import { AIChat } from './components/AI/AIChat';
import { auth, db, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, User } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [selectedChat, setSelectedChat] = useState<{ chat: Chat; otherUser: UserProfile } | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          setCurrentUser(userData);
          
          // Initialize Socket
          const newSocket = io(window.location.origin);
          setSocket(newSocket);
          newSocket.emit('join', user.uid);

          // Update online status
          await updateDoc(doc(db, 'users', user.uid), {
            status: 'online',
            lastSeen: serverTimestamp()
          });
        }
      } else {
        setCurrentUser(null);
        if (socket) socket.close();
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (socket) socket.close();
    };
  }, []);

  const handleLogout = async () => {
    if (currentUser) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        status: 'offline',
        lastSeen: serverTimestamp()
      });
    }
    await logout();
    setCurrentUser(null);
    setSelectedChat(null);
    setIsRightSidebarOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f0f2f5]">
        <Loader2 className="animate-spin text-[#25d366]" size={48} />
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden relative">
      <div className={`flex-shrink-0 ${selectedChat ? 'hidden md:block' : 'w-full md:w-auto'}`}>
        <Sidebar 
          currentUser={currentUser} 
          onSelectChat={(chat, otherUser) => {
            setSelectedChat({ chat, otherUser });
            setShowAIChat(false);
          }}
          onLogout={handleLogout}
          onOpenProfile={() => setIsRightSidebarOpen(true)}
          onOpenAIChat={() => {
            setShowAIChat(true);
            setSelectedChat(null);
          }}
        />
      </div>

      <div className={`flex-1 ${!selectedChat && !showAIChat ? 'hidden md:flex' : 'flex'} flex-col bg-[#f0f2f5] relative`}>
        {showAIChat ? (
          <AIChat onBack={() => setShowAIChat(false)} />
        ) : selectedChat ? (
          <ChatWindow 
            chat={selectedChat.chat}
            otherUser={selectedChat.otherUser}
            currentUser={currentUser}
            socket={socket}
            onBack={() => setSelectedChat(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-6 text-gray-400">
              <img 
                src="https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png" 
                alt="WhatsApp" 
                className="w-full h-full object-cover opacity-20"
              />
            </div>
            <h2 className="text-2xl font-light text-gray-600 mb-2">WhatsApp Web Clone</h2>
            <p className="text-sm text-gray-400 max-w-md">
              Send and receive messages without keeping your phone online.<br />
              Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
            </p>
          </div>
        )}
      </div>

      <RightSidebar 
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
        activeChatId={selectedChat?.chat.id}
        onSelectChat={(chat, otherUser) => {
          setSelectedChat({ chat, otherUser });
          setShowAIChat(false);
          setIsRightSidebarOpen(false);
        }}
        onOpenImageGenerator={() => {
          setShowAIChat(true);
          setSelectedChat(null);
          setIsRightSidebarOpen(false);
        }}
      />
    </div>
  );
}
