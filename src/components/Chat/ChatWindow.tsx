import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MoreVertical, Phone, Video, Search, Check, CheckCheck, Trash2, Shield, ShieldOff, Image as ImageIcon, X, Send, Smile, Paperclip, Mic, FileText, Download, Lock, Unlock } from 'lucide-react';
import { Message, UserProfile, Chat, Block } from '../../types';
import { db, auth } from '../../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDocs, where, setDoc, Timestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { Socket } from 'socket.io-client';
import { Loader } from '../UI/Loader';
import { CustomEmojiPicker } from './CustomEmojiPicker';
import { isOnlyEmojis, getEmojis, AnimatedEmoji, triggerEmojiEffect } from './EmojiEffects';

interface ChatWindowProps {
  chat: Chat;
  otherUser: UserProfile;
  currentUser: UserProfile;
  socket: Socket | null;
  onBack: () => void;
  onCall?: (user: UserProfile) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, otherUser, currentUser, socket, onBack, onCall }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChat, setActiveChat] = useState<Chat>(chat);
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; size: number; type: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [replyTo, setReplyTo] = useState<Message | undefined>(undefined);
  const [isBlocked, setIsBlocked] = useState(false);
  const [amIBlocked, setAmIBlocked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSecretDeleteModal, setShowSecretDeleteModal] = useState(false);
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  const [fullScreenFile, setFullScreenFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [messageContextMenu, setMessageContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const attachmentButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (showOptions && optionsMenuRef.current && !optionsMenuRef.current.contains(target) && !optionsButtonRef.current?.contains(target)) {
        setShowOptions(false);
      }
      if (showAttachmentMenu && attachmentMenuRef.current && !attachmentMenuRef.current.contains(target) && !attachmentButtonRef.current?.contains(target)) {
        setShowAttachmentMenu(false);
      }
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(target) && !emojiButtonRef.current?.contains(target)) {
        setShowEmojiPicker(false);
      }
      if (messageContextMenu && contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setMessageContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOptions, showAttachmentMenu, showEmojiPicker, messageContextMenu]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.id !== lastMessageIdRef.current) {
        lastMessageIdRef.current = lastMsg.id;
        // Only trigger effect for single emoji messages
        if (lastMsg.text && isOnlyEmojis(lastMsg.text)) {
          const emojis = getEmojis(lastMsg.text);
          if (emojis.length === 1) {
            triggerEmojiEffect(emojis[0]);
          }
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    const chatRef = doc(db, 'chats', chat.id);
    const unsubChat = onSnapshot(chatRef, (doc) => {
      if (doc.exists()) {
        setActiveChat({ ...doc.data({ serverTimestamps: 'estimate' }), id: doc.id } as Chat);
      }
    });
    return () => unsubChat();
  }, [chat.id]);

  useEffect(() => {
    const q = query(collection(db, 'chats', chat.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const msgs: Message[] = [];
        const deletedAt = activeChat.deletedAt?.[currentUser.uid];
        const deletedAtMillis = deletedAt instanceof Timestamp ? deletedAt.toMillis() : (deletedAt ? Date.now() : 0);

        snapshot.forEach((doc) => {
          const data = doc.data({ serverTimestamps: 'estimate' }) as Message;
          const msgTimestamp = data.timestamp instanceof Timestamp ? data.timestamp.toMillis() : Date.now();
          
          const isDeletedForMe = data.deletedFor?.includes(currentUser.uid);
          const isDeletedForEveryone = data.isDeleted;

          if (msgTimestamp > deletedAtMillis && !isDeletedForMe && !isDeletedForEveryone) {
            msgs.push({ ...data, id: doc.id });
          }
        });
        setMessages(msgs);
        
        // Mark as read
        msgs.forEach(msg => {
          if (msg.to === currentUser.uid && msg.status !== 'read') {
            updateDoc(doc(db, 'chats', chat.id, 'messages', msg.id), { status: 'read' })
              .catch(err => handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}/messages/${msg.id}`));
          }
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chats/${chat.id}/messages`);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
    });

    // Presence & Typing
    if (socket) {
      socket.on('user_typing', ({ from, isTyping }) => {
        if (from === otherUser.uid) setIsTyping(isTyping);
      });

      socket.on('new_message', (data) => {
        if (data.chatId === chat.id && data.from === otherUser.uid) {
          // Check if message is already in list (to avoid duplicates with onSnapshot)
          setMessages(prev => {
            if (prev.find(m => m.id === data.id)) return prev;
            return [...prev, { ...data, timestamp: Timestamp.now(), status: 'delivered' }];
          });
        }
      });
    }

    // Check Block Status (Real-time)
    const blocksRef = collection(db, 'blocks');
    const q1 = query(blocksRef, where('blocker', '==', currentUser.uid), where('blocked', '==', otherUser.uid));
    const q2 = query(blocksRef, where('blocker', '==', otherUser.uid), where('blocked', '==', currentUser.uid));
    
    const unsub1 = onSnapshot(q1, (snap) => setIsBlocked(!snap.empty));
    const unsub2 = onSnapshot(q2, (snap) => setAmIBlocked(!snap.empty));

    return () => {
      unsubscribe();
      unsub1();
      unsub2();
    };
  }, [chat.id, otherUser.uid, currentUser.uid, socket, activeChat.deletedAt]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const messageText = text.trim();
    const img = imagePreview;
    const vid = videoPreview;
    const aud = audioPreview;
    const docData = documentPreview;
    const reply = replyTo;

    if ((!messageText && !img && !vid && !aud && !docData) || isBlocked || amIBlocked) return;

    // Clear inputs immediately for better UX and to prevent double sends
    setText('');
    setImagePreview(null);
    setVideoPreview(null);
    setAudioPreview(null);
    setDocumentPreview(null);
    setReplyTo(undefined);
    setShowEmojiPicker(false);
    setShowAttachmentMenu(false);
    
    // Clear file inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (docInputRef.current) docInputRef.current.value = '';
    
    // Focus back to input
    textareaRef.current?.focus();

    const messageData: any = {
      chatId: chat.id,
      from: currentUser.uid,
      to: otherUser.uid,
      text: messageText || null,
      type: docData ? 'document' : (img ? 'image' : (vid ? 'video' : (aud ? 'audio' : 'text'))),
      image: img || null,
      video: vid || null,
      audio: aud || null,
      document: docData || null,
      replyTo: reply ? { id: reply.id, text: reply.text, from: reply.from } : null,
      timestamp: serverTimestamp(),
      status: 'sent'
    };

    try {
      const docRef = await addDoc(collection(db, 'chats', chat.id, 'messages'), messageData);
      
      let lastMsg = messageText;
      if (docData) lastMsg = `📄 ${docData.name}`;
      else if (img) lastMsg = '📷 Image';
      else if (vid) lastMsg = '🎥 Video';
      else if (aud) lastMsg = '🎤 Voice Message';

      await setDoc(doc(db, 'chats', chat.id), {
        id: chat.id,
        participants: chat.participants || [currentUser.uid, otherUser.uid],
        participantIds: chat.participantIds || [currentUser.uniqueId, otherUser.uniqueId],
        lastMessage: lastMsg,
        updatedAt: serverTimestamp(),
        [`deletedAt.${currentUser.uid}`]: null,
        [`deletedAt.${otherUser.uid}`]: null
      }, { merge: true });

      if (socket) {
        socket.emit('message_sent', { id: docRef.id, to: otherUser.uid, ...messageData });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setText(e.target.value);
    if (!socket) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing', { from: currentUser.uid, to: otherUser.uid, isTyping: true });
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { from: currentUser.uid, to: otherUser.uid, isTyping: false });
    }, 2000);
  };

  const handleScreenClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTimeRef.current < 500) {
      clickCountRef.current += 1;
      if (clickCountRef.current >= 4) {
        setShowSecretDeleteModal(true);
        clickCountRef.current = 0;
      }
    } else {
      clickCountRef.current = 1;
    }
    lastClickTimeRef.current = now;
    setMessageContextMenu(null);
  };

  const handleBlock = async () => {
    const blockId = `${currentUser.uid}_${otherUser.uid}`;
    try {
      if (isBlocked) {
        await deleteDoc(doc(db, 'blocks', blockId));
        setIsBlocked(false);
      } else {
        await setDoc(doc(db, 'blocks', blockId), {
          blocker: currentUser.uid,
          blocked: otherUser.uid,
          timestamp: serverTimestamp()
        });
        setIsBlocked(true);
      }
      setShowOptions(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `blocks/${blockId}`);
    }
  };

  const handleDeleteChat = async () => {
    try {
      console.log('Deleting chat for user:', currentUser.uid, 'chatId:', chat.id);
      // Instead of deleting the chat document, we mark it as deleted for the current user
      // This hides the messages from the current user but keeps the connection
      await setDoc(doc(db, 'chats', chat.id), {
        id: chat.id,
        participants: chat.participants || [currentUser.uid, otherUser.uid],
        participantIds: chat.participantIds || [currentUser.uniqueId, otherUser.uniqueId],
        [`deletedAt.${currentUser.uid}`]: serverTimestamp(),
      }, { merge: true });
      
      console.log('Chat deleted successfully in Firestore');
      setShowOptions(false);
      onBack();
    } catch (err) {
      console.error('Failed to delete chat', err);
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
    }
  };

  const handleClearChat = async () => {
    try {
      console.log('Clearing chat for user:', currentUser.uid, 'chatId:', chat.id);
      // Mark chat as deleted for me to clear messages
      await setDoc(doc(db, 'chats', chat.id), {
        id: chat.id,
        participants: chat.participants || [currentUser.uid, otherUser.uid],
        participantIds: chat.participantIds || [currentUser.uniqueId, otherUser.uniqueId],
        [`deletedAt.${currentUser.uid}`]: serverTimestamp(),
      }, { merge: true });
      console.log('Chat cleared successfully in Firestore');
      setShowOptions(false);
    } catch (err) {
      console.error('Failed to clear chat', err);
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
    }
  };

  const handleCopyChat = async () => {
    const chatText = messages.map(m => {
      const sender = m.from === currentUser.uid ? 'You' : otherUser.displayName;
      const time = m.timestamp instanceof Timestamp ? m.timestamp.toDate().toLocaleTimeString() : '';
      return `[${time}] ${sender}: ${m.text || (m.type === 'image' ? '📷 Image' : '📄 Document')}`;
    }).join('\n');
    
    try {
      await navigator.clipboard.writeText(chatText);
      alert('Chat copied to clipboard!');
      setShowOptions(false);
    } catch (err) {
      console.error('Failed to copy chat', err);
    }
  };

  const handleLockChat = async () => {
    try {
      const isCurrentlyLocked = activeChat.lockedBy?.includes(currentUser.uid);
      const newLockedBy = isCurrentlyLocked 
        ? (activeChat.lockedBy || []).filter(uid => uid !== currentUser.uid)
        : [...(activeChat.lockedBy || []), currentUser.uid];

      await setDoc(doc(db, 'chats', chat.id), {
        lockedBy: newLockedBy
      }, { merge: true });
      
      setShowOptions(false);
      if (!isCurrentlyLocked) {
        onBack(); // Go back to sidebar after locking
      }
    } catch (err) {
      console.error('Failed to lock chat', err);
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
    }
  };

  const handleDeleteMessage = async (messageId: string, forEveryone: boolean) => {
    try {
      console.log('Deleting message:', messageId, 'forEveryone:', forEveryone);
      if (forEveryone) {
        await updateDoc(doc(db, 'chats', chat.id, 'messages', messageId), {
          isDeleted: true
        });
      } else {
        const msg = messages.find(m => m.id === messageId);
        const deletedFor = [...(msg?.deletedFor || []), currentUser.uid];
        await updateDoc(doc(db, 'chats', chat.id, 'messages', messageId), {
          deletedFor
        });
      }
      console.log('Message deleted successfully');
      setMessageContextMenu(null);
    } catch (err) {
      console.error('Failed to delete message', err);
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}/messages/${messageId}`);
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert('File is too large. Please choose a file under 20MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (file.type.startsWith('image/')) {
          setImagePreview(result);
          setVideoPreview(null);
          setAudioPreview(null);
          setDocumentPreview(null);
        } else if (file.type.startsWith('video/')) {
          setVideoPreview(result);
          setImagePreview(null);
          setAudioPreview(null);
          setDocumentPreview(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioPreview(reader.result as string);
          setImagePreview(null);
          setVideoPreview(null);
          setDocumentPreview(null);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Firestore document limit is 1MB. Base64 adds ~33% overhead.
      // So we should limit raw file size to around 700KB.
      if (file.size > 700 * 1024) {
        alert('Document is too large. Maximum allowed size is 700KB for direct sharing.');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocumentPreview({
          url: reader.result as string,
          name: file.name,
          size: file.size,
          type: file.type
        });
        setImagePreview(null);
        setShowAttachmentMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const onEmojiClick = (emoji: string) => {
    setText(prev => prev + emoji);
  };

  const groupMessagesByDate = () => {
    const groups: Record<string, Message[]> = {};
    messages.forEach(msg => {
      const date = msg.timestamp && typeof msg.timestamp !== 'string' 
        ? msg.timestamp.toDate().toLocaleDateString([], { day: 'numeric', month: 'long' })
        : 'Today';
      
      const today = new Date().toLocaleDateString([], { day: 'numeric', month: 'long' });
      const label = date === today ? 'Today' : date;
      
      if (!groups[label]) groups[label] = [];
      groups[label].push(msg);
    });
    return groups;
  };

  const messageGroups = groupMessagesByDate();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleLongPressStart = (e: React.TouchEvent, messageId: string) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      setMessageContextMenu({ id: messageId, x: touch.clientX, y: touch.clientY });
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleContextMenu = (e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    setMessageContextMenu({ id: messageId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[var(--chat-bg)] text-[var(--text-color)]"
         style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--font-size)', fontWeight: 'var(--font-weight)' as any }}>
      {/* Header */}
      <div className="bg-[var(--header-color)] p-3 flex items-center justify-between shadow-sm z-10 border-b border-gray-200/10 transition-colors">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-2 rounded-full transition-colors md:hidden hover:bg-black/5">
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden border border-gray-200">
              <img src={otherUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold leading-tight text-[var(--text-color)]">{otherUser.displayName}</span>
              <span className="text-xs opacity-60 flex items-center gap-1">
                {isTyping ? (
                  <>
                    <Loader style={currentUser.uiSettings?.loaderStyle || 'dots'} size={12} />
                    typing...
                  </>
                ) : (otherUser.status === 'online' ? 'online' : `last seen ${otherUser.lastSeen}`)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 opacity-70">
          <button className="p-2 rounded-full transition-colors hover:bg-black/5"><Video size={20} /></button>
          <button 
            onClick={() => otherUser && onCall?.(otherUser)}
            className="p-2 rounded-full transition-colors hover:bg-black/5"
          >
            <Phone size={20} />
          </button>
          <div className="relative">
            <button 
              ref={optionsButtonRef}
              onClick={() => setShowOptions(!showOptions)} 
              className={`p-2 rounded-full transition-colors ${showOptions ? 'bg-black/5' : ''} hover:bg-black/5`}
            >
              <MoreVertical size={20} />
            </button>
            <AnimatePresence>
              {showOptions && (
                <motion.div 
                  ref={optionsMenuRef}
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  className="absolute right-0 mt-2 w-56 rounded-xl shadow-2xl border z-50 py-2 bg-[var(--sidebar-color)] border-gray-200/10"
                >
                  <button onClick={handleCopyChat} className="w-full px-4 py-3 text-left flex items-center gap-3 text-sm hover:bg-black/5 text-[var(--text-color)] transition-colors">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-500">
                      <FileText size={16} />
                    </div>
                    <span>Copy Chat</span>
                  </button>
                  <button onClick={handleLockChat} className="w-full px-4 py-3 text-left flex items-center gap-3 text-sm hover:bg-black/5 text-[var(--text-color)] transition-colors">
                    <div className={`w-8 h-8 ${activeChat.lockedBy?.includes(currentUser.uid) ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-500' : 'bg-gray-100 dark:bg-gray-900/30 text-gray-500'} rounded-full flex items-center justify-center`}>
                      {activeChat.lockedBy?.includes(currentUser.uid) ? <Unlock size={16} /> : <Lock size={16} />}
                    </div>
                    <span>{activeChat.lockedBy?.includes(currentUser.uid) ? 'Unlock Chat' : 'Lock Chat'}</span>
                  </button>
                  <button onClick={handleBlock} className="w-full px-4 py-3 text-left flex items-center gap-3 text-sm hover:bg-black/5 text-[var(--text-color)] transition-colors">
                    <div className={`w-8 h-8 ${isBlocked ? 'bg-green-100 dark:bg-green-900/30 text-green-500' : 'bg-gray-100 dark:bg-gray-900/30 text-gray-500'} rounded-full flex items-center justify-center`}>
                      {isBlocked ? <ShieldOff size={16} /> : <Shield size={16} />}
                    </div>
                    <span>{isBlocked ? 'Unblock User' : 'Block User'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 bg-whatsapp relative"
        style={{ 
          backgroundColor: 'var(--chat-bg)',
          lineHeight: 'var(--line-height)'
        }}
        onClick={handleScreenClick}
      >
        {Object.entries(messageGroups).map(([date, msgs]) => (
          <div key={date} className="space-y-4">
            <div className="flex justify-center">
              <span className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-lg text-[10px] uppercase font-bold shadow-sm border border-white/10 text-[var(--text-color)] opacity-70">
                {date}
              </span>
            </div>
            
            {msgs.map((msg) => {
              const isMe = msg.from === currentUser.uid;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  style={{ marginBottom: 'var(--message-spacing)' }}
                  onDoubleClick={() => setReplyTo(msg)}
                  onContextMenu={(e) => handleContextMenu(e, msg.id)}
                  onTouchStart={(e) => handleLongPressStart(e, msg.id)}
                  onTouchEnd={handleLongPressEnd}
                >
                  <div 
                    className={`max-w-[var(--message-width)] p-2 shadow-sm relative group`}
                    style={{ 
                      borderRadius: 'var(--bubble-radius)',
                      marginBottom: 'var(--message-spacing)',
                      backgroundColor: isMe ? 'var(--sent-bubble-color)' : 'var(--received-bubble-color)',
                      color: isMe ? 'var(--sent-text-color)' : 'var(--received-text-color)',
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--font-size)',
                      fontWeight: 'var(--font-weight)' as any,
                      lineHeight: 'var(--line-height)'
                    }}
                  >
                    {msg.replyTo && (
                      <div className={`mb-2 p-2 rounded-md text-xs border-l-4 ${
                        isMe ? 'bg-[#cfe9ba] border-[#075e54]' : 'bg-gray-100 border-[#25d366]'
                      } opacity-80`}>
                        <p className="font-bold text-[#075e54] mb-1">
                          {msg.replyTo.from === currentUser.uid ? 'You' : otherUser.displayName}
                        </p>
                        <p className="truncate">{msg.replyTo.text || (msg.replyTo.type === 'image' ? '📷 Image' : '📄 Document')}</p>
                      </div>
                    )}

                    {msg.type === 'image' && msg.image && (
                      <div className="mb-1 cursor-pointer overflow-hidden rounded-md" onClick={() => setFullScreenFile({ url: msg.image!, name: 'Image', type: 'image' })}>
                        <img src={msg.image} alt="Shared" className="rounded-md max-w-full h-auto object-cover max-h-80 hover:scale-105 transition-transform duration-300" />
                      </div>
                    )}

                    {msg.type === 'video' && msg.video && (
                      <div className="mb-1">
                        <video src={msg.video} controls className="rounded-md max-w-full h-auto object-cover max-h-80" />
                      </div>
                    )}

                    {msg.type === 'audio' && msg.audio && (
                      <div className="mb-1 p-2 bg-black/5 rounded-lg flex items-center gap-2 min-w-[200px]">
                        <div className="w-8 h-8 bg-[#00a884] rounded-full flex items-center justify-center text-white shrink-0">
                          <Mic size={16} />
                        </div>
                        <audio src={msg.audio} controls className="h-8 flex-1" />
                      </div>
                    )}

                    {msg.type === 'document' && msg.document && (
                      <div className={`mb-1 p-3 rounded-lg flex items-center gap-3 cursor-pointer ${isMe ? 'bg-[#cfe9ba]' : 'bg-gray-50'}`} onClick={() => setFullScreenFile({ url: msg.document!.url, name: msg.document!.name, type: msg.document!.type })}>
                        <div className="w-10 h-10 bg-white rounded flex items-center justify-center text-[#075e54]">
                          <FileText size={24} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-bold truncate">{msg.document.name}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{(msg.document.size / 1024).toFixed(1)} KB • {msg.document.type.split('/')[1]}</p>
                        </div>
                        <a 
                          href={msg.document.url} 
                          download={msg.document.name} 
                          className="p-2 hover:bg-black/5 rounded-full transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download size={18} className="text-gray-500" />
                        </a>
                      </div>
                    )}

                    {msg.text && (
                      <div className={`break-words pr-12 ${isOnlyEmojis(msg.text) ? 'py-2' : 'text-sm text-gray-800'}`}>
                        {isOnlyEmojis(msg.text) ? (
                          <div className="flex flex-wrap gap-1">
                            {getEmojis(msg.text).map((e, i) => (
                              <AnimatedEmoji key={i} emoji={e} isBig={getEmojis(msg.text).length <= 3} />
                            ))}
                          </div>
                        ) : (
                          msg.text
                        )}
                      </div>
                    )}

                    <div className={`flex items-center justify-end gap-1 mt-1 -mb-1 ${msg.text && isOnlyEmojis(msg.text) && getEmojis(msg.text).length <= 3 ? 'opacity-70 bg-white/40 px-1 rounded-full' : ''}`}>
                      <span className="text-[10px] opacity-60">
                        {msg.timestamp instanceof Timestamp 
                          ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                          : 'Sending...'}
                      </span>
                      {isMe && (
                        <span className="opacity-60">
                          {msg.status === 'read' ? (
                            <CheckCheck size={12} className="text-blue-500" />
                          ) : msg.status === 'delivered' ? (
                            <CheckCheck size={12} />
                          ) : (
                            <Check size={12} />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}

        {/* Full Screen File Viewer */}
      <AnimatePresence>
        {fullScreenFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-4"
          >
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent z-10">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setFullScreenFile(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ArrowLeft size={24} />
                </button>
                <span className="text-white font-medium truncate max-w-[200px] md:max-w-md">
                  {fullScreenFile.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={fullScreenFile.url} 
                  download={fullScreenFile.name}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-2 px-4"
                >
                  <Download size={20} />
                  <span className="hidden sm:inline text-sm">Download</span>
                </a>
                <button 
                  onClick={() => setFullScreenFile(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="w-full h-full flex items-center justify-center overflow-hidden pt-16">
              {fullScreenFile.type.startsWith('image/') || fullScreenFile.type === 'image' ? (
                <motion.img 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  src={fullScreenFile.url} 
                  alt={fullScreenFile.name}
                  className="max-w-full max-h-full object-contain shadow-2xl"
                />
              ) : fullScreenFile.type === 'application/pdf' ? (
                <iframe 
                  src={fullScreenFile.url} 
                  className="w-full h-full border-none rounded-lg bg-white"
                  title={fullScreenFile.name}
                />
              ) : (
                <div className="flex flex-col items-center gap-4 text-white">
                  <FileText size={80} className="opacity-50" />
                  <p className="text-xl">Preview not available for this file type</p>
                  <a 
                    href={fullScreenFile.url} 
                    download={fullScreenFile.name}
                    className="bg-[#00a884] px-6 py-3 rounded-xl font-bold hover:bg-[#008f6f] transition-colors"
                  >
                    Download to View
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Secret Delete Confirmation Modal */}
      <AnimatePresence>
        {showSecretDeleteModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[var(--sidebar-color)] rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200/10"
            >
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-center mb-2" style={{ color: 'var(--text-color)' }}>Delete All Chat?</h3>
              <p className="text-sm opacity-60 text-center mb-6" style={{ color: 'var(--text-color)' }}>
                Are you sure you want to delete the entire chat history from start to end? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSecretDeleteModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold hover:bg-black/5 transition-colors"
                  style={{ color: 'var(--text-color)' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    await handleClearChat();
                    setShowSecretDeleteModal(false);
                  }}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Message Context Menu */}
        <AnimatePresence>
          {messageContextMenu && (
            <motion.div
              ref={contextMenuRef}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[100] w-48 rounded-lg shadow-2xl border py-1 bg-[var(--sidebar-color)] border-gray-200/10"
              style={{ left: Math.min(messageContextMenu.x, window.innerWidth - 200), top: Math.min(messageContextMenu.y, window.innerHeight - 100) }}
            >
              <button 
                onClick={() => handleDeleteMessage(messageContextMenu.id, false)}
                className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-black/5 text-[var(--text-color)]"
              >
                <Trash2 size={14} />
                Delete for me
              </button>
              {messages.find(m => m.id === messageContextMenu.id)?.from === currentUser.uid && (
                <button 
                  onClick={() => handleDeleteMessage(messageContextMenu.id, true)}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 text-red-500 hover:bg-black/5"
                >
                  <Trash2 size={14} />
                  Delete for everyone
                </button>
              )}
              <button 
                onClick={() => {
                  const msg = messages.find(m => m.id === messageContextMenu.id);
                  if (msg?.text) navigator.clipboard.writeText(msg.text);
                  setMessageContextMenu(null);
                }}
                className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-black/5 text-[var(--text-color)]"
              >
                <FileText size={14} />
                Copy text
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-start mb-4"
          >
            <div className="bg-white rounded-lg p-3 shadow-sm rounded-tl-none flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-500 font-medium italic">
                {otherUser.displayName} is typing... ✍️
              </span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="bg-[var(--header-color)] p-2 pb-12 md:pb-2 flex flex-col gap-2 border-t border-gray-200/10 relative transition-colors">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              ref={emojiPickerRef}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-full left-0 mb-2 z-50 shadow-2xl"
            >
              <CustomEmojiPicker onEmojiClick={onEmojiClick} />
            </motion.div>
          )}
          
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-[var(--sidebar-color)] p-3 rounded-lg border-l-4 border-[#00a884] flex items-center justify-between shadow-sm mx-2"
            >
              <div className="flex flex-col overflow-hidden text-[var(--text-color)]">
                <span className="text-xs font-bold text-[#00a884]">{replyTo.from === currentUser.uid ? 'You' : otherUser.displayName}</span>
                <p className="text-sm truncate opacity-60">{replyTo.text || (replyTo.type === 'image' ? '📷 Image' : '📄 Document')}</p>
              </div>
              <button onClick={() => setReplyTo(undefined)} className="p-1 rounded-full hover:bg-black/5 opacity-60">
                <X size={18} />
              </button>
            </motion.div>
          )}

          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[var(--sidebar-color)] p-4 rounded-xl flex flex-col gap-3 shadow-lg mx-2 border border-gray-200/10"
            >
              <div className="relative group">
                <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-contain mx-auto" />
                <button onClick={() => {
                  setImagePreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={handleTyping}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a caption..."
                  className="flex-1 p-3 rounded-lg outline-none text-sm bg-[var(--input-bg)] text-[var(--input-text-color)] placeholder-gray-400"
                />
                <button onClick={handleSend} className="p-3 bg-[#00a884] text-white rounded-full shadow-md">
                  <Send size={24} />
                </button>
              </div>
            </motion.div>
          )}

          {videoPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="p-4 rounded-xl flex flex-col gap-3 shadow-lg mx-2 border"
              style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)' }}
            >
              <div className="relative group">
                <video src={videoPreview} controls className="max-h-48 rounded-lg mx-auto" />
                <button onClick={() => {
                  setVideoPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={handleTyping}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a caption..."
                  className="flex-1 p-3 rounded-lg outline-none text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-text-color)', borderRadius: 'var(--input-border-radius)' }}
                />
                <button onClick={handleSend} className="p-3 bg-[#00a884] text-white rounded-full shadow-md">
                  <Send size={24} />
                </button>
              </div>
            </motion.div>
          )}

          {audioPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="p-4 rounded-xl flex flex-col gap-3 shadow-lg mx-2 border"
              style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)' }}
            >
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-[#111b21] rounded-lg border border-gray-100 dark:border-[#313d45]">
                <div className="w-12 h-12 bg-[#00a884] rounded flex items-center justify-center text-white">
                  <Mic size={32} />
                </div>
                <div className="flex-1">
                  <audio src={audioPreview} controls className="w-full h-8" />
                </div>
                <button onClick={() => {
                  setAudioPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }} className="p-2 rounded-full hover:bg-black/5 opacity-60">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSend} className="w-full py-3 bg-[#00a884] text-white rounded-lg font-bold shadow-md flex items-center justify-center gap-2">
                  <Send size={20} /> Send Voice Message
                </button>
              </div>
            </motion.div>
          )}

          {documentPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="p-4 rounded-xl flex flex-col gap-3 shadow-lg mx-2 border"
              style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)' }}
            >
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-[#111b21] rounded-lg border border-gray-100 dark:border-[#313d45]">
                <div className="w-12 h-12 bg-[#00a884] rounded flex items-center justify-center text-white">
                  <FileText size={32} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="font-bold truncate" style={{ color: 'var(--text-color)' }}>{documentPreview.name}</p>
                  <p className="text-xs opacity-60" style={{ color: 'var(--text-color)' }}>{(documentPreview.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => {
                  setDocumentPreview(null);
                  if (docInputRef.current) docInputRef.current.value = '';
                }} className="p-2 rounded-full hover:bg-black/5 opacity-60">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={handleTyping}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a caption..."
                  className="flex-1 p-3 rounded-lg outline-none text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', color: 'var(--input-text-color)', borderRadius: 'var(--input-border-radius)' }}
                />
                <button onClick={handleSend} className="p-3 bg-[#00a884] text-white rounded-full shadow-md">
                  <Send size={24} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(isBlocked || amIBlocked) ? (
          <div className="p-4 text-center text-sm font-medium opacity-60" style={{ backgroundColor: 'var(--header-color)', color: 'var(--text-color)' }}>
            {isBlocked ? 'You have blocked this user' : 'This user has blocked you'}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2">
            <div className="flex items-center gap-1 relative">
              <button 
                ref={emojiButtonRef}
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowAttachmentMenu(false);
                }}
                className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'text-[#00a884] bg-gray-200 dark:bg-[#313d45]' : 'opacity-60 hover:bg-black/5'}`}
                style={{ color: showEmojiPicker ? '#00a884' : 'var(--text-color)' }}
              >
                <Smile size={24} />
              </button>
              
              <div className="relative">
                <button 
                  ref={attachmentButtonRef}
                  onClick={() => {
                    setShowAttachmentMenu(!showAttachmentMenu);
                    setShowEmojiPicker(false);
                  }}
                  className={`p-2 rounded-full transition-colors ${showAttachmentMenu ? 'text-[#00a884] bg-gray-200 dark:bg-[#313d45]' : 'opacity-60 hover:bg-black/5'}`}
                  style={{ color: showAttachmentMenu ? '#00a884' : 'var(--text-color)' }}
                >
                  <Paperclip size={24} />
                </button>
                
                <AnimatePresence>
                  {showAttachmentMenu && (
                    <motion.div 
                      ref={attachmentMenuRef}
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute bottom-full left-0 mb-4 flex flex-col rounded-xl shadow-2xl border py-2 w-48 z-50 overflow-hidden"
                      style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)' }}
                    >
                      <button 
                        onClick={() => {
                          fileInputRef.current?.click();
                          setShowAttachmentMenu(false);
                        }} 
                        className="px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-black/5"
                        style={{ color: 'var(--text-color)' }}
                      >
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-500">
                          <ImageIcon size={18} />
                        </div>
                        <span className="font-medium">Photos & Videos</span>
                      </button>
                      <button 
                        onClick={() => {
                          docInputRef.current?.click();
                          setShowAttachmentMenu(false);
                        }} 
                        className="px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-black/5"
                        style={{ color: 'var(--text-color)' }}
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
                          <FileText size={18} />
                        </div>
                        <span className="font-medium">Document (PDF)</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <input type="file" ref={fileInputRef} onChange={handleMediaChange} accept="image/*,video/*" className="hidden" />
              <input type="file" ref={docInputRef} onChange={handleDocChange} accept=".pdf,.doc,.docx,.txt" className="hidden" />
            </div>

            <div className="flex-1 flex items-center rounded-full px-4 py-2 border shadow-sm" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--sidebar-color)', height: 'var(--input-height)' }}>
              <textarea
                ref={textareaRef}
                value={text}
                onFocus={() => {
                  setShowEmojiPicker(false);
                  setShowAttachmentMenu(false);
                }}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                placeholder="Type a message"
                rows={1}
                className="flex-1 outline-none resize-none text-sm max-h-32 py-1 bg-transparent"
                style={{ color: 'var(--input-text-color)', fontFamily: 'var(--font-family)' }}
              />
            </div>

            <button 
              onMouseDown={text.trim() || imagePreview || videoPreview || audioPreview || documentPreview ? undefined : startRecording}
              onMouseUp={text.trim() || imagePreview || videoPreview || audioPreview || documentPreview ? undefined : stopRecording}
              onTouchStart={text.trim() || imagePreview || videoPreview || audioPreview || documentPreview ? undefined : startRecording}
              onTouchEnd={text.trim() || imagePreview || videoPreview || audioPreview || documentPreview ? undefined : stopRecording}
              onClick={() => {
                if (text.trim() || imagePreview || videoPreview || audioPreview || documentPreview) {
                  handleSend();
                  setShowEmojiPicker(false);
                  setShowAttachmentMenu(false);
                }
              }}
              className={`p-3 rounded-full transition-all shadow-md ${
                text.trim() || imagePreview || videoPreview || audioPreview || documentPreview ? 'bg-[#00a884] text-white' : (isRecording ? 'bg-red-500 text-white animate-pulse scale-110' : 'bg-[#00a884] text-white')
              }`}
            >
              {text.trim() || imagePreview || videoPreview || audioPreview || documentPreview ? <Send size={24} /> : <Mic size={24} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
