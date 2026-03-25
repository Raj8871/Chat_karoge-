import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, User, Clock } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { UserProfile, CallSession } from '../../types';

interface CallInterfaceProps {
  socket: Socket | null;
  currentUser: UserProfile;
  callSession: CallSession | null;
  onEndCall: () => void;
  onAcceptCall: () => void;
  onRejectCall: () => void;
}

export const CallInterface: React.FC<CallInterfaceProps> = ({
  socket,
  currentUser,
  callSession,
  onEndCall,
  onAcceptCall,
  onRejectCall,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    if (callSession?.status === 'active') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setDuration(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callSession?.status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  if (!callSession || callSession.status === 'idle') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      >
        <div className="bg-[#111b21] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center p-8 text-white relative">
          {/* Background Decoration */}
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#00a884]/20 to-transparent" />
          
          <div className="relative z-10 flex flex-col items-center w-full">
            {/* User Avatar */}
            <div className="w-32 h-32 rounded-full border-4 border-[#00a884] p-1 mb-6 relative">
              <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden">
                <img 
                  src={callSession.status === 'incoming' ? 'https://ui-avatars.com/api/?name=' + callSession.callerName : 'https://ui-avatars.com/api/?name=' + (callSession.receiverId === currentUser.uid ? callSession.callerName : 'User')} 
                  alt="Avatar" 
                  className="w-full h-full object-cover"
                />
              </div>
              {callSession.status === 'calling' && (
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-full bg-[#00a884] -z-10"
                />
              )}
            </div>

            <h2 className="text-2xl font-bold mb-2">
              {callSession.status === 'incoming' ? callSession.callerName : (callSession.receiverId === currentUser.uid ? callSession.callerName : 'Calling...')}
            </h2>
            
            <div className="flex items-center gap-2 text-[#00a884] mb-8">
              {callSession.status === 'active' ? (
                <>
                  <Clock size={16} />
                  <span className="font-mono text-lg">{formatDuration(duration)}</span>
                </>
              ) : (
                <span className="animate-pulse capitalize">{callSession.status}...</span>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-8 mt-8">
              {callSession.status === 'incoming' ? (
                <>
                  <button 
                    onClick={onRejectCall}
                    className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    <PhoneOff size={28} />
                  </button>
                  <button 
                    onClick={onAcceptCall}
                    className="w-16 h-16 bg-[#00a884] rounded-full flex items-center justify-center hover:bg-[#008f6f] transition-colors shadow-lg shadow-[#00a884]/20"
                  >
                    <Phone size={28} />
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={toggleMute}
                    disabled={callSession.status !== 'active'}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-gray-600' : 'bg-white/10 hover:bg-white/20'} ${callSession.status !== 'active' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  <button 
                    onClick={onEndCall}
                    className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    <PhoneOff size={28} />
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Hidden Audio Element for Remote Stream */}
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
