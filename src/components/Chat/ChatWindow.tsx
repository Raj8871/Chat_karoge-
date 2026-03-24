import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MoreVertical, Phone, Video, Search, Check, CheckCheck, Trash2, Shield, ShieldOff, Image as ImageIcon, X, Send, Smile, Paperclip, Mic, FileText, Download } from 'lucide-react';
import { Message, UserProfile, Chat, Block } from '../../types';
import { db, auth } from '../../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDocs, where, setDoc, Timestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { Socket } from 'socket.io-client';
import EmojiPicker, { Theme } from 'emoji-picker-react';

interface ChatWindowProps {
  chat: Chat;
  otherUser: UserProfile;
  currentUser: UserProfile;
  socket: Socket | null;
  onBack: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, otherUser, currentUser, socket, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; size: number; type: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | undefined>(undefined);
  const [isBlocked, setIsBlocked] = useState(false);
  const [amIBlocked, setAmIBlocked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'chats', chat.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const msgs: Message[] = [];
        const deletedAt = chat.deletedAt?.[currentUser.uid];
        const deletedAtMillis = deletedAt instanceof Timestamp ? deletedAt.toMillis() : 0;

        snapshot.forEach((doc) => {
          const data = doc.data() as Message;
          const msgTimestamp = data.timestamp instanceof Timestamp ? data.timestamp.toMillis() : Date.now();
          
          if (msgTimestamp > deletedAtMillis) {
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
  }, [chat.id, otherUser.uid, currentUser.uid, socket]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if ((!text.trim() && !imagePreview && !documentPreview) || isBlocked || amIBlocked) return;

    const messageData: any = {
      chatId: chat.id,
      from: currentUser.uid,
      to: otherUser.uid,
      text: text.trim() || null,
      type: documentPreview ? 'document' : (imagePreview ? 'image' : 'text'),
      image: imagePreview || null,
      document: documentPreview || null,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, from: replyTo.from } : null,
      timestamp: serverTimestamp(),
      status: 'sent'
    };

    try {
      const path = `chats/${chat.id}/messages`;
      const docRef = await addDoc(collection(db, 'chats', chat.id, 'messages'), messageData);
      
      let lastMsg = text.trim();
      if (documentPreview) lastMsg = `📄 ${documentPreview.name}`;
      else if (imagePreview) lastMsg = '📷 Image';

      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: lastMsg,
        updatedAt: serverTimestamp(),
        [`deletedAt.${currentUser.uid}`]: null,
        [`deletedAt.${otherUser.uid}`]: null
      });

      if (socket) {
        socket.emit('message_sent', { id: docRef.id, to: otherUser.uid, ...messageData });
      }

      setText('');
      setImagePreview(null);
      setDocumentPreview(null);
      setReplyTo(undefined);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages`);
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
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    try {
      // Instead of deleting the chat document, we mark it as deleted for the current user
      // This hides the messages from the current user but keeps the connection
      await updateDoc(doc(db, 'chats', chat.id), {
        [`deletedAt.${currentUser.uid}`]: serverTimestamp(),
        // If we want to clear the last message for the user who deleted
        // we'd need to handle that in the UI (which we already do in Sidebar)
      });
      
      // Check if the other user has also deleted the chat
      // If both have deleted, we could optionally clear all messages from the subcollection
      // but the requirement says "Connection must still exist", which we've ensured.
      
      setShowDeleteConfirm(false);
      setShowOptions(false);
      onBack();
    } catch (err) {
      console.error('Failed to delete chat', err);
      handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File is too large. Please choose an image under 10MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimensions for chat images
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.6 quality to ensure it's well under 1MB
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setImagePreview(dataUrl);
          setDocumentPreview(null);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
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

  const onEmojiClick = (emojiData: any) => {
    setText(prev => prev + emojiData.emoji);
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#e5ddd5] relative overflow-hidden">
      {/* Header */}
      <div className="bg-[#f0f2f5] p-3 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-full transition-colors md:hidden">
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden border border-gray-200">
              <img src={otherUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-gray-800 leading-tight">{otherUser.displayName}</span>
              <span className="text-xs text-gray-500">
                {isTyping ? 'typing... ✍️' : (otherUser.status === 'online' ? 'online' : `last seen ${otherUser.lastSeen}`)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-gray-500">
          <button className="p-2 hover:bg-gray-200 rounded-full transition-colors"><Video size={20} /></button>
          <button className="p-2 hover:bg-gray-200 rounded-full transition-colors"><Phone size={20} /></button>
          <div className="relative">
            <button onClick={() => setShowOptions(!showOptions)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <MoreVertical size={20} />
            </button>
            <AnimatePresence>
              {showOptions && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50"
                >
                  <button onClick={handleBlock} className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 text-sm">
                    {isBlocked ? <ShieldOff size={16} /> : <Shield size={16} />}
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </button>
                  <button onClick={handleDeleteChat} className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 text-sm ${showDeleteConfirm ? 'text-red-600 font-bold' : 'text-red-500'}`}>
                    <Trash2 size={16} />
                    {showDeleteConfirm ? 'Click again to confirm' : 'Delete Chat'}
                  </button>
                  {showDeleteConfirm && (
                    <button 
                      onClick={() => setShowDeleteConfirm(false)}
                      className="w-full px-4 py-2 text-left text-xs text-gray-400 hover:bg-gray-50"
                    >
                      Cancel deletion
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 bg-whatsapp"
        style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}
      >
        {Object.entries(messageGroups).map(([date, msgs]) => (
          <div key={date} className="space-y-4">
            <div className="flex justify-center">
              <span className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-lg text-[10px] uppercase font-bold text-gray-500 shadow-sm border border-gray-100">
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
                  onDoubleClick={() => setReplyTo(msg)}
                >
                  <div className={`max-w-[85%] sm:max-w-[70%] rounded-lg p-2 shadow-sm relative group ${
                    isMe ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'
                  }`}>
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
                      <div className="mb-1">
                        <img src={msg.image} alt="Shared" className="rounded-md max-w-full h-auto object-cover max-h-80" />
                      </div>
                    )}

                    {msg.type === 'document' && msg.document && (
                      <div className={`mb-1 p-3 rounded-lg flex items-center gap-3 ${isMe ? 'bg-[#cfe9ba]' : 'bg-gray-50'}`}>
                        <div className="w-10 h-10 bg-white rounded flex items-center justify-center text-[#075e54]">
                          <FileText size={24} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-bold truncate">{msg.document.name}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{(msg.document.size / 1024).toFixed(1)} KB • {msg.document.type.split('/')[1]}</p>
                        </div>
                        <a href={msg.document.url} download={msg.document.name} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                          <Download size={18} className="text-gray-500" />
                        </a>
                      </div>
                    )}

                    {msg.text && <p className="text-sm text-gray-800 break-words pr-12">{msg.text}</p>}

                    <div className="flex items-center justify-end gap-1 mt-1 -mb-1">
                      <span className="text-[10px] text-gray-500">
                        {msg.timestamp instanceof Timestamp 
                          ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                          : 'Sending...'}
                      </span>
                      {isMe && (
                        <span className="text-gray-500">
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
      <div className="bg-[#f0f2f5] p-2 flex flex-col gap-2 border-t border-gray-200 relative">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-full left-0 mb-2 z-50 shadow-2xl"
            >
              <EmojiPicker 
                onEmojiClick={onEmojiClick} 
                theme={Theme.LIGHT}
                width={320}
                height={400}
              />
            </motion.div>
          )}
          
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white p-3 rounded-lg border-l-4 border-[#25d366] flex items-center justify-between shadow-sm mx-2"
            >
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-bold text-[#075e54]">{replyTo.from === currentUser.uid ? 'You' : otherUser.displayName}</span>
                <p className="text-sm text-gray-500 truncate">{replyTo.text || (replyTo.type === 'image' ? '📷 Image' : '📄 Document')}</p>
              </div>
              <button onClick={() => setReplyTo(undefined)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                <X size={18} />
              </button>
            </motion.div>
          )}

          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-4 rounded-xl flex flex-col gap-3 shadow-lg mx-2"
            >
              <div className="relative group">
                <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-contain mx-auto" />
                <button onClick={() => setImagePreview(null)} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={handleTyping}
                  placeholder="Add a caption..."
                  className="flex-1 p-3 bg-gray-50 rounded-lg outline-none text-sm"
                />
                <button onClick={handleSend} className="p-3 bg-[#25d366] text-white rounded-full shadow-md">
                  <Send size={24} />
                </button>
              </div>
            </motion.div>
          )}

          {documentPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-4 rounded-xl flex flex-col gap-3 shadow-lg mx-2"
            >
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="w-12 h-12 bg-[#00a884] rounded flex items-center justify-center text-white">
                  <FileText size={32} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="font-bold text-gray-800 truncate">{documentPreview.name}</p>
                  <p className="text-xs text-gray-400">{(documentPreview.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => setDocumentPreview(null)} className="p-2 hover:bg-gray-200 rounded-full text-gray-400">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={handleTyping}
                  placeholder="Add a caption..."
                  className="flex-1 p-3 bg-gray-50 rounded-lg outline-none text-sm"
                />
                <button onClick={handleSend} className="p-3 bg-[#25d366] text-white rounded-full shadow-md">
                  <Send size={24} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(isBlocked || amIBlocked) ? (
          <div className="bg-white/50 p-4 text-center text-sm text-gray-500 font-medium">
            {isBlocked ? 'You have blocked this user' : 'This user has blocked you'}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2">
            <div className="flex items-center gap-1 relative">
              <button 
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowAttachmentMenu(false);
                }}
                className={`p-2 hover:bg-gray-200 rounded-full transition-colors ${showEmojiPicker ? 'text-[#00a884] bg-gray-200' : 'text-gray-500'}`}
              >
                <Smile size={24} />
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowAttachmentMenu(!showAttachmentMenu);
                    setShowEmojiPicker(false);
                  }}
                  className={`p-2 hover:bg-gray-200 rounded-full transition-colors ${showAttachmentMenu ? 'text-[#00a884] bg-gray-200' : 'text-gray-500'}`}
                >
                  <Paperclip size={24} />
                </button>
                
                <AnimatePresence>
                  {showAttachmentMenu && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute bottom-full left-0 mb-4 flex flex-col bg-white rounded-xl shadow-xl border border-gray-100 py-2 w-48 z-50 overflow-hidden"
                    >
                      <button 
                        onClick={() => {
                          fileInputRef.current?.click();
                          setShowAttachmentMenu(false);
                        }} 
                        className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
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
                        className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
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
              
              <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
              <input type="file" ref={docInputRef} onChange={handleDocChange} accept=".pdf,.doc,.docx,.txt" className="hidden" />
            </div>

            <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center border border-gray-100 shadow-sm">
              <textarea
                value={text}
                onFocus={() => {
                  setShowEmojiPicker(false);
                  setShowAttachmentMenu(false);
                }}
                onChange={handleTyping}
                placeholder="Type a message"
                rows={1}
                className="flex-1 outline-none resize-none text-sm max-h-32 py-1"
              />
            </div>

            <button 
              onClick={() => {
                handleSend();
                setShowEmojiPicker(false);
                setShowAttachmentMenu(false);
              }}
              className={`p-3 rounded-full transition-all shadow-md ${
                text.trim() || imagePreview || documentPreview ? 'bg-[#25d366] text-white' : 'bg-gray-400 text-white cursor-not-allowed'
              }`}
            >
              {text.trim() || imagePreview || documentPreview ? <Send size={24} /> : <Mic size={24} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
