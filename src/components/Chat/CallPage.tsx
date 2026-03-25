import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, User, Clock, MoreVertical, Link as LinkIcon, ArrowLeft, Send, Video, VideoOff } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { UserProfile } from '../../types';

interface CallPageProps {
  socket: Socket | null;
  currentUser: UserProfile;
  onBack: () => void;
  initialRoomId?: string;
}

export const CallPage: React.FC<CallPageProps> = ({
  socket,
  currentUser,
  onBack,
  initialRoomId
}) => {
  const [roomId, setRoomId] = useState(initialRoomId || '');
  const [generatedCode, setGeneratedCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [duration, setDuration] = useState(0);
  
  const localStreamRef = useRef<MediaStream | null>(null);
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
    // Generate a unique code on mount if no initialRoomId
    if (!initialRoomId) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setGeneratedCode(code);
      setRoomId(code);
    } else {
      setGeneratedCode(initialRoomId);
      setRoomId(initialRoomId);
    }

    if (socket) {
      socket.on('user_joined_room', async () => {
        console.log('Another user joined the room.');
        // If I'm already in a call state, send an offer to the new user
        if (peerConnectionRef.current && localStreamRef.current) {
          try {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            socket.emit('room_signal', { roomId: roomId || generatedCode, signal: offer, from: currentUser.uid });
          } catch (e) {
            console.error('Error creating offer on user join', e);
          }
        }
      });

      socket.on('room_signal', async (data: { signal: any; from: string }) => {
        if (!peerConnectionRef.current) {
          // If we receive a signal but haven't started, we might need to ask for permission
          // but this will likely be blocked if not triggered by a click.
          // So we should ideally be in 'connecting' or 'active' state already.
          console.log('Received signal but call not started locally.');
        }
        
        if (data.signal.type === 'offer') {
          if (!localStreamRef.current) {
            console.error('Cannot answer offer: No local stream. User must click Start Call first.');
            return;
          }
          await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await peerConnectionRef.current?.createAnswer();
          await peerConnectionRef.current?.setLocalDescription(answer);
          socket.emit('room_signal', { roomId: roomId || generatedCode, signal: answer, from: currentUser.uid });
        } else if (data.signal.type === 'answer') {
          await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(data.signal));
        }
      });

      socket.on('room_ice_candidate', async (data: { candidate: any }) => {
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Error adding ice candidate', e);
          }
        }
      });

      socket.on('user_left_room', () => {
        endCall();
      });
    }

    return () => {
      cleanup();
      if (socket && (roomId || generatedCode)) {
        socket.emit('leave_call_room', roomId || generatedCode);
      }
    };
  }, [socket]);

  useEffect(() => {
    if (callStatus === 'active') {
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
  }, [callStatus]);

  const cleanup = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setCallStatus('idle');
  };

  const startCall = async (isInitiator: boolean) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported in this browser or context.');
      }

      // If we already have a stream, don't ask again
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: !isVideoOff 
        });
        localStreamRef.current = stream;
      }
      
      setCallStatus('connecting');

      const pc = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = pc;

      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));

      pc.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
        setCallStatus('active');
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('room_ice_candidate', { roomId: roomId || generatedCode, candidate: event.candidate });
        }
      };

      if (isInitiator && socket) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('room_signal', { roomId: roomId || generatedCode, signal: offer, from: currentUser.uid });
      }
    } catch (err: any) {
      console.error('Failed to start call:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied')) {
        alert('Permission Denied: Please allow microphone access in your browser settings. Look for a camera/mic icon in your address bar.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        alert('No microphone found. Please connect a microphone and try again.');
      } else {
        alert(`Call Error: ${err.message || 'Could not access microphone'}`);
      }
      cleanup();
    }
  };

  const handleStartButtonClick = async () => {
    if (!socket) {
      alert('Connecting to server... Please try again in a moment.');
      return;
    }
    
    if (!window.isSecureContext) {
      alert('Media devices are only available in secure contexts (HTTPS).');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Your browser does not support media devices or they are blocked by a policy.');
      return;
    }

    // Request permission IMMEDIATELY on click to preserve user gesture
    try {
      console.log('Requesting media permissions...');
      const constraints: MediaStreamConstraints = { audio: true };
      if (!isVideoOff) {
        constraints.video = true;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Media permissions granted');
      localStreamRef.current = stream;
      
      socket.emit('join_call_room', generatedCode);
      await startCall(true);
    } catch (err: any) {
      console.error('Permission error on start click:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied')) {
        alert('Microphone permission denied. Please click the camera/microphone icon in your browser address bar to allow access for this site.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        alert('No microphone found. Please connect a microphone and try again.');
      } else {
        alert(`Could not access microphone: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const joinRoom = async () => {
    if (!inputCode.trim() || !socket) return;
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Your browser does not support media devices.');
      return;
    }

    try {
      // Request permission IMMEDIATELY on click to preserve user gesture
      const constraints: MediaStreamConstraints = { audio: true };
      if (!isVideoOff) {
        constraints.video = true;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      const code = inputCode.trim().toUpperCase();
      setRoomId(code);
      setGeneratedCode(code);
      socket.emit('join_call_room', code);
      setShowJoinModal(false);
      
      // Start call as receiver (waiting for offer)
      await startCall(false);
    } catch (err: any) {
      console.error('Permission error during join:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission denied')) {
        alert('Microphone permission denied. Please allow access in your browser settings.');
      } else {
        alert('Microphone permission is required to join a call room.');
      }
    }
  };

  const endCall = () => {
    if (socket) {
      socket.emit('leave_call_room', roomId || generatedCode);
    }
    cleanup();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      } else if (isVideoOff) {
        // Try to add video track if it wasn't there
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          localStreamRef.current.addTrack(newVideoTrack);
          if (peerConnectionRef.current) {
            peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current);
            // Renegotiate
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            socket?.emit('room_signal', { roomId: roomId || generatedCode, signal: offer, from: currentUser.uid });
          }
          setIsVideoOff(false);
        } catch (e) {
          console.error("Could not start video", e);
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111b21] text-white relative overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between bg-[#202c33] shadow-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Call Room</h1>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <MoreVertical size={24} />
          </button>
          
          <AnimatePresence>
            {showOptionsMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                className="absolute right-0 mt-2 w-64 bg-[#233138] rounded-xl shadow-2xl border border-white/5 py-2 z-50"
              >
                <button 
                  onClick={() => {
                    setShowJoinModal(true);
                    setShowOptionsMenu(false);
                  }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  <LinkIcon size={18} className="text-[#00a884]" />
                  <span>Enter Secret Code / Link</span>
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCode);
                    alert('Code copied to clipboard!');
                    setShowOptionsMenu(false);
                  }}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  <Send size={18} className="text-blue-400" />
                  <span>Share My Code: {generatedCode}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        {/* Call Info */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-32 h-32 rounded-full bg-[#202c33] border-4 border-[#00a884] flex items-center justify-center mb-6 relative shadow-2xl">
            <User size={64} className="text-gray-400" />
            {callStatus === 'connecting' && (
              <motion.div 
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-full bg-[#00a884] -z-10"
              />
            )}
          </div>
          
          <h2 className="text-2xl font-bold mb-2">
            {callStatus === 'active' ? 'In Call' : (callStatus === 'connecting' ? 'Connecting...' : 'Room: ' + generatedCode)}
          </h2>
          
          {callStatus === 'active' && (
            <div className="flex items-center gap-2 text-[#00a884] font-mono text-xl">
              <Clock size={20} />
              <span>{formatDuration(duration)}</span>
            </div>
          )}
          
          {callStatus === 'idle' && (
            <div className="flex flex-col items-center">
              <p className="text-gray-400 text-center max-w-xs mt-4">
                Share your code <span className="text-white font-bold">{generatedCode}</span> with someone to start a call, or join an existing room via the menu.
              </p>
              <p className="text-[#00a884] text-sm mt-2 animate-pulse">
                Click the green button below to start your room
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-8">
          <button 
            onClick={toggleMute}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 shadow-lg shadow-red-500/20' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
          </button>
          
          {callStatus === 'idle' ? (
            <button 
              onClick={handleStartButtonClick}
              className="w-20 h-20 bg-[#00a884] rounded-full flex items-center justify-center hover:bg-[#008f6f] transition-all shadow-xl shadow-[#00a884]/20"
            >
              <Phone size={32} />
            </button>
          ) : (
            <button 
              onClick={endCall}
              className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
            >
              <PhoneOff size={32} />
            </button>
          )}

          <button 
            onClick={toggleVideo}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-gray-600' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {isVideoOff ? <VideoOff size={28} /> : <Video size={28} />}
          </button>
        </div>
      </div>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#233138] rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-white/10"
            >
              <h3 className="text-xl font-bold mb-6">Enter Call Code</h3>
              <input 
                type="text" 
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="e.g. ABCDEF"
                className="w-full bg-[#2a3942] border-none rounded-xl p-4 text-white placeholder-gray-500 mb-6 focus:ring-2 focus:ring-[#00a884] outline-none uppercase font-mono text-center text-2xl tracking-widest"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={joinRoom}
                  className="flex-1 py-3 bg-[#00a884] text-white rounded-xl font-bold hover:bg-[#008f6f] transition-colors shadow-lg shadow-[#00a884]/20"
                >
                  Join Room
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
};
