import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { UserProfile, Chat, CallSession } from './types';
import { Login } from './components/Auth/Login';
import { Sidebar } from './components/Dashboard/Sidebar';
import { ChatWindow } from './components/Chat/ChatWindow';
import { RightSidebar } from './components/Dashboard/RightSidebar';
import { AIChat } from './components/AI/AIChat';
import { CallInterface } from './components/Chat/CallInterface';
import { CallPage } from './components/Chat/CallPage';
import { auth, db, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Loader } from './components/UI/Loader';
import { ErrorBoundary } from './components/ErrorBoundary';

import { applyUISettings } from './lib/ui-utils';
import { DEFAULT_UI_SETTINGS } from './constants';

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
  const [showCallPage, setShowCallPage] = useState(false);
  const [callRoomId, setCallRoomId] = useState<string | undefined>(undefined);
  
  // Call State
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const cleanupCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setCallSession(null);
  };

  const handleEndCall = () => {
    if (socket && callSession) {
      const targetId = callSession.callerId === currentUser?.uid ? callSession.receiverId : callSession.callerId;
      socket.emit('end_call', { to: targetId });
    }
    cleanupCall();
  };

  const handleRejectCall = () => {
    if (socket && callSession) {
      socket.emit('reject_call', { to: callSession.callerId });
    }
    cleanupCall();
  };

  const handleAcceptCall = async () => {
    if (!socket || !callSession) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play();
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', { to: callSession.callerId, candidate: event.candidate });
        }
      };

      // Set remote description from the offer (signal)
      // We need to store the offer signal in the callSession
      // I'll update the incoming_call listener to include the signal
    } catch (err) {
      console.error('Failed to accept call:', err);
      handleRejectCall();
    }
  };

  useEffect(() => {
    if (socket) {
      socket.on('incoming_call', async (data: { from: string; callerName: string; signal: any }) => {
        setCallSession({
          callerId: data.from,
          receiverId: currentUser?.uid || '',
          callerName: data.callerName,
          status: 'incoming'
        });
        
        // Store the offer signal for later use when accepting
        (window as any)._pendingCallSignal = data.signal;
      });

      socket.on('call_accepted', async (data: { signal: any }) => {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
          setCallSession(prev => prev ? { ...prev, status: 'active', startTime: Date.now() } : null);
        }
      });

      socket.on('call_rejected', () => {
        alert('Call was rejected');
        cleanupCall();
      });

      socket.on('call_ended', () => {
        cleanupCall();
      });

      socket.on('ice_candidate', async (data: { candidate: any }) => {
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Error adding ice candidate', e);
          }
        }
      });
    }
  }, [socket, currentUser]);

  const initiateCall = async (otherUser: UserProfile) => {
    // Open Call Page instead of direct call
    // Permission will be requested inside CallPage when user interacts
    setCallRoomId(undefined); // Let it generate a new one
    setShowCallPage(true);
  };

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

  useEffect(() => {
    if (currentUser?.uiSettings) {
      applyUISettings(currentUser.uiSettings);
    } else {
      applyUISettings(DEFAULT_UI_SETTINGS);
    }
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f0f2f5]">
        <Loader 
          style={currentUser?.uiSettings?.loaderStyle || 'spinner'} 
          size={48} 
          className="text-[#00a884]" 
        />
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="flex justify-center bg-[#f0f2f5] min-h-screen overflow-x-hidden">
      <div className="flex h-screen w-full max-w-[1600px] bg-[#f0f2f5] overflow-hidden relative shadow-2xl">
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

      <div className={`flex-1 ${!selectedChat && !showAIChat && !showCallPage ? 'hidden md:flex' : 'flex'} flex-col bg-[#f0f2f5] relative`}>
        {showCallPage ? (
          <CallPage 
            socket={socket}
            currentUser={currentUser}
            onBack={() => setShowCallPage(false)}
            initialRoomId={callRoomId}
          />
        ) : showAIChat ? (
          <AIChat onBack={() => setShowAIChat(false)} />
        ) : selectedChat ? (
          <ChatWindow 
            chat={selectedChat.chat}
            otherUser={selectedChat.otherUser}
            currentUser={currentUser}
            socket={socket}
            onBack={() => setSelectedChat(null)}
            onCall={initiateCall}
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
      
      {currentUser && (
        <CallInterface 
          socket={socket}
          currentUser={currentUser}
          callSession={callSession}
          onEndCall={handleEndCall}
          onAcceptCall={async () => {
            if (!socket || !callSession) return;
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStreamRef.current = stream;
              const pc = new RTCPeerConnection(iceServers);
              peerConnectionRef.current = pc;
              stream.getTracks().forEach(track => pc.addTrack(track, stream));
              pc.ontrack = (event) => {
                const remoteStream = event.streams[0];
                const audio = new Audio();
                audio.srcObject = remoteStream;
                audio.play();
              };
              pc.onicecandidate = (event) => {
                if (event.candidate) {
                  socket.emit('ice_candidate', { to: callSession.callerId, candidate: event.candidate });
                }
              };
              const offer = (window as any)._pendingCallSignal;
              await pc.setRemoteDescription(new RTCSessionDescription(offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('answer_call', { to: callSession.callerId, signal: answer });
              setCallSession(prev => prev ? { ...prev, status: 'active', startTime: Date.now() } : null);
            } catch (err) {
              console.error('Failed to accept call:', err);
              handleRejectCall();
            }
          }}
          onRejectCall={handleRejectCall}
        />
      )}
    </div>
  );
}
