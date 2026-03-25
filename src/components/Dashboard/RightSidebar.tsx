import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, Users, Bell, FileText, Settings, MoreHorizontal, 
  LogOut, Shield, ShieldOff, Check, Copy, Trash2, UserMinus,
  CheckCircle2, XCircle, Clock, ChevronRight, HelpCircle, Info,
  Download, UserPlus, MessageSquare, Upload, Image as ImageIcon, Bot
} from 'lucide-react';
import { UserProfile, ConnectionRequest, Friend, Chat, UISettings } from '../../types';
import { db, logout } from '../../firebase';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  deleteDoc, setDoc, serverTimestamp, Timestamp, getDocs,
  orderBy, getDoc, addDoc, writeBatch
} from 'firebase/firestore';
import { 
  ref, uploadBytesResumable, getDownloadURL, deleteObject 
} from 'firebase/storage';
import { storage } from '../../firebase';

import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';
import { ChatUIControlPanel } from './ChatUIControlPanel';
import { DEFAULT_UI_SETTINGS } from '../../constants';
import { applyUISettings } from '../../lib/ui-utils';
import { Palette as PaletteIcon } from 'lucide-react';

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onLogout: () => void;
  onOpenImageGenerator: () => void;
  onSelectChat: (chat: Chat, otherUser: UserProfile) => void;
  activeChatId?: string;
}

type SidebarView = 'main' | 'profile' | 'friends' | 'requests' | 'docs' | 'settings' | 'more' | 'connect' | 'blocked' | 'ui-control';

export const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onClose, currentUser, onLogout, onOpenImageGenerator, onSelectChat, activeChatId }) => {
  const [view, setView] = useState<SidebarView>('main');
  const [incomingRequests, setIncomingRequests] = useState<ConnectionRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ConnectionRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<Record<string, UserProfile>>({});
  const [blockedUsers, setBlockedUsers] = useState<UserProfile[]>([]);
  const [sharedDocs, setSharedDocs] = useState<any[]>([]);
  
  // Document Sharing State
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [docError, setDocError] = useState('');
  const [docSuccess, setDocSuccess] = useState('');
  const [myDocs, setMyDocs] = useState<any[]>([]);
  const [accessedDocs, setAccessedDocs] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Profile Edit State
  const [editName, setEditName] = useState(currentUser.displayName);
  const [editBio, setEditBio] = useState(currentUser.bio);
  const [editPhotoURL, setEditPhotoURL] = useState(currentUser.photoURL);
  const [editUniqueId, setEditUniqueId] = useState(currentUser.uniqueId);
  const [copied, setCopied] = useState(false);
  const [copiedURL, setCopiedURL] = useState(false);

  // Connect State
  const [targetId, setTargetId] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connectSuccess, setConnectSuccess] = useState('');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB raw limit for processing
        alert('Image file is too large. Please choose an image under 5MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimensions
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          
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
          
          // Compress to JPEG with 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setEditPhotoURL(dataUrl);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (view === 'profile') {
      setEditName(currentUser.displayName);
      setEditBio(currentUser.bio || '');
      setEditPhotoURL(currentUser.photoURL);
      setEditUniqueId(currentUser.uniqueId);
    }
  }, [view, currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    // Listen for incoming requests
    const qIncoming = query(collection(db, 'connectionRequests'), where('to', '==', currentUser.uid), where('status', '==', 'pending'));
    const unsubIncoming = onSnapshot(qIncoming, (snapshot) => {
      setIncomingRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ConnectionRequest)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'connectionRequests (incoming)');
    });

    // Listen for outgoing requests
    const qOutgoing = query(collection(db, 'connectionRequests'), where('from', '==', currentUser.uid));
    const unsubOutgoing = onSnapshot(qOutgoing, (snapshot) => {
      setOutgoingRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ConnectionRequest)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'connectionRequests (outgoing)');
    });

    // Listen for friends
    const qFriends = query(collection(db, 'friends'), where('uids', 'array-contains', currentUser.uid));
    const unsubFriends = onSnapshot(qFriends, (snapshot) => {
      const friendList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Friend));
      setFriends(friendList);

      const friendUids = friendList.map(f => f.uids.find(uid => uid !== currentUser.uid)).filter(Boolean) as string[];
      if (friendUids.length > 0) {
        // Listen for friend profiles in real-time
        const usersQuery = query(collection(db, 'users'), where('uid', 'in', friendUids));
        const unsubProfiles = onSnapshot(usersQuery, (userSnap) => {
          const usersMap: Record<string, UserProfile> = {};
          userSnap.forEach(doc => {
            const data = doc.data() as UserProfile;
            usersMap[data.uid] = data;
          });
          setFriendProfiles(usersMap);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'friend profiles');
        });
        return unsubProfiles;
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'friends');
    });

    return () => {
      unsubIncoming();
      unsubOutgoing();
      unsubFriends();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    // Listen for blocked users
    const qBlocked = query(collection(db, 'blocks'), where('blocker', '==', currentUser.uid));
    const unsubBlocked = onSnapshot(qBlocked, async (snapshot) => {
      try {
        const blockedUids = snapshot.docs.map(d => d.data().blocked);
        if (blockedUids.length > 0) {
          const usersQuery = query(collection(db, 'users'), where('uid', 'in', blockedUids));
          const usersSnap = await getDocs(usersQuery);
          const profiles = usersSnap.docs.map(d => d.data() as UserProfile);
          setBlockedUsers(profiles);
        } else {
          setBlockedUsers([]);
        }
      } catch (err) {
        console.error('Failed to fetch blocked users', err);
      }
    });

    return () => unsubBlocked();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    // Listen for my uploaded docs
    const qMyDocs = query(
      collection(db, 'sharedDocuments'),
      where('ownerId', '==', currentUser.uid),
      orderBy('uploadTime', 'desc')
    );
    const unsubMyDocs = onSnapshot(qMyDocs, (snapshot) => {
      setMyDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sharedDocuments (my docs)');
    });

    // Listen for docs accessed via code
    const qAccessed = query(
      collection(db, 'userDocumentAccess'),
      where('userId', '==', currentUser.uid),
      orderBy('accessTime', 'desc')
    );
    const unsubAccessed = onSnapshot(qAccessed, async (snapshot) => {
      const accessRecords = snapshot.docs.map(d => d.data());
      const docIds = accessRecords.map(r => r.documentId);
      
      if (docIds.length > 0) {
        // Fetch document details for each accessed doc
        // Firestore 'in' query limit is 10, but let's assume it's fine for now or handle in chunks
        const docsQuery = query(collection(db, 'sharedDocuments'), where('__name__', 'in', docIds));
        const docsSnap = await getDocs(docsQuery);
        const docsMap: Record<string, any> = {};
        docsSnap.forEach(d => {
          docsMap[d.id] = { id: d.id, ...d.data() };
        });
        
        // Map back to maintain access order
        const docs = accessRecords.map(r => docsMap[r.documentId]).filter(Boolean);
        setAccessedDocs(docs);
      } else {
        setAccessedDocs([]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'userDocumentAccess');
    });

    return () => {
      unsubMyDocs();
      unsubAccessed();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!activeChatId) {
      setSharedDocs([]);
      return;
    }

    const qDocs = query(
      collection(db, 'chats', activeChatId, 'messages'), 
      where('type', '==', 'document'),
      orderBy('timestamp', 'desc')
    );
    const unsubDocs = onSnapshot(qDocs, (snapshot) => {
      setSharedDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${activeChatId}/messages (docs)`);
    });

    return () => unsubDocs();
  }, [activeChatId]);

  const handleAcceptRequest = async (request: ConnectionRequest) => {
    try {
      // Update request status
      await updateDoc(doc(db, 'connectionRequests', request.id), { status: 'accepted' });
      
      // Create friendship
      const friendId = [request.from, request.to].sort().join('_');
      await setDoc(doc(db, 'friends', friendId), {
        uids: [request.from, request.to],
        timestamp: serverTimestamp()
      });

      // Create initial chat
      const chatId = friendId;
      await setDoc(doc(db, 'chats', chatId), {
        id: chatId,
        participants: [request.from, request.to],
        participantIds: [request.fromUniqueId, currentUser.uniqueId],
        updatedAt: serverTimestamp(),
        lastMessage: 'Connection accepted'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'connectionRequests/accept');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'connectionRequests', requestId), { status: 'rejected' });
    } catch (err) {
      console.error('Failed to reject request', err);
    }
  };

  const handleUnfriend = async (friendId: string) => {
    try {
      await deleteDoc(doc(db, 'friends', friendId));
      // Optionally delete chat too? Usually just unfriend.
    } catch (err) {
      console.error('Failed to unfriend', err);
    }
  };

  const handleUnblock = async (blockedUid: string) => {
    const blockId = `${currentUser.uid}_${blockedUid}`;
    try {
      await deleteDoc(doc(db, 'blocks', blockId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `blocks/${blockId}`);
    }
  };

  const handleConnect = async () => {
    if (!targetId.trim()) return;
    setConnectError('');
    setConnectSuccess('');
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uniqueId', '==', targetId.trim().toUpperCase()));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setConnectError('User not found');
        return;
      }

      const targetUser = snapshot.docs[0].data() as UserProfile;
      if (targetUser.uid === currentUser.uid) {
        setConnectError('Cannot add yourself');
        return;
      }

      // Check if already friends
      const friendId = [currentUser.uid, targetUser.uid].sort().join('_');
      const friendDoc = await getDoc(doc(db, 'friends', friendId));
      if (friendDoc.exists()) {
        setConnectError('You are already friends with this user');
        return;
      }

      // Check if request already sent
      const qReq = query(
        collection(db, 'connectionRequests'), 
        where('from', '==', currentUser.uid),
        where('to', '==', targetUser.uid),
        where('status', '==', 'pending')
      );
      const reqSnap = await getDocs(qReq);
      if (!reqSnap.empty) {
        setConnectError('Request already pending');
        return;
      }

      // Send connection request
      await setDoc(doc(collection(db, 'connectionRequests')), {
        from: currentUser.uid,
        fromUniqueId: currentUser.uniqueId,
        fromDisplayName: currentUser.displayName,
        to: targetUser.uid,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      setConnectSuccess('Connection request sent!');
      setTargetId('');
      setTimeout(() => setConnectSuccess(''), 3000);
    } catch (err) {
      setConnectError('Failed to send request');
      console.error(err);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: editName,
        bio: editBio,
        photoURL: editPhotoURL,
        uniqueId: editUniqueId.toUpperCase()
      });
      setView('main');
    } catch (err) {
      console.error('Failed to update profile', err);
    }
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    // Validate file size (e.g., 10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setDocError('File is too large (max 10MB)');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setDocError('');
    setDocSuccess('');

    try {
      const storageRef = ref(storage, `documents/${currentUser.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        }, 
        (error) => {
          setDocError('Upload failed: ' + error.message);
          setIsUploading(false);
          setUploadProgress(null);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const accessCode = await generateUniqueCode();
          
          await addDoc(collection(db, 'sharedDocuments'), {
            ownerId: currentUser.uid,
            fileURL: downloadURL,
            accessCode: accessCode,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            uploadTime: serverTimestamp()
          });

          setDocSuccess('Document uploaded successfully!');
          setGeneratedCode(accessCode);
          setIsUploading(false);
          setUploadProgress(null);
        }
      );
    } catch (err) {
      setDocError('Failed to upload document');
      setIsUploading(false);
    }
  };

  const handleAccessDocument = async () => {
    if (!accessCodeInput.trim() || !currentUser) return;
    setDocError('');
    setDocSuccess('');

    try {
      const q = query(collection(db, 'sharedDocuments'), where('accessCode', '==', accessCodeInput.trim().toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setDocError('Invalid access code');
        return;
      }

      const docData = snapshot.docs[0];
      const docId = docData.id;

      // Check if already has access
      const accessId = `${currentUser.uid}_${docId}`;
      const accessDoc = await getDoc(doc(db, 'userDocumentAccess', accessId));
      
      if (accessDoc.exists()) {
        setDocError('You already have access to this document');
        return;
      }

      await setDoc(doc(db, 'userDocumentAccess', accessId), {
        userId: currentUser.uid,
        documentId: docId,
        accessTime: serverTimestamp()
      });

      setDocSuccess('Document added to your collection!');
      setAccessCodeInput('');
    } catch (err) {
      setDocError('Failed to access document');
    }
  };

  const handleDeleteDocument = async (docId: string, fileURL: string) => {
    if (!window.confirm('Are you sure you want to delete this document? It will be removed for everyone.')) return;

    try {
      // 1. Delete from Storage
      const storageRef = ref(storage, fileURL);
      await deleteObject(storageRef);

      // 2. Delete access records
      const qAccess = query(collection(db, 'userDocumentAccess'), where('documentId', '==', docId));
      const accessSnap = await getDocs(qAccess);
      const batch = writeBatch(db);
      accessSnap.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // 3. Delete document metadata
      await deleteDoc(doc(db, 'sharedDocuments', docId));

      setDocSuccess('Document deleted successfully');
    } catch (err) {
      setDocError('Failed to delete document');
    }
  };

  const generateUniqueCode = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      attempts++;
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const fullCode = `DOC-${code}`;
      const q = query(collection(db, 'sharedDocuments'), where('accessCode', '==', fullCode));
      const snap = await getDocs(q);
      if (snap.empty) {
        isUnique = true;
        return fullCode;
      }
    }
    return `DOC-${code}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUser.uniqueId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyURL = () => {
    navigator.clipboard.writeText(editPhotoURL);
    setCopiedURL(true);
    setTimeout(() => setCopiedURL(false), 2000);
  };

  const handleSaveUISettings = async (settings: UISettings) => {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        uiSettings: settings
      });
      applyUISettings(settings);
      setView('settings');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const renderView = () => {
    switch (view) {
      case 'ui-control':
        return (
          <div className="p-4">
            <ChatUIControlPanel 
              initialSettings={currentUser.uiSettings || DEFAULT_UI_SETTINGS} 
              onSave={handleSaveUISettings} 
            />
          </div>
        );
      case 'profile':
        return (
          <div className="p-6 space-y-6">
            <div className="flex flex-col items-center">
              <div className="w-32 h-32 bg-gray-200 rounded-full overflow-hidden mb-4 shadow-inner relative group">
                <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <span className="text-white text-xs font-bold">Change</span>
                </div>
              </div>
              <div className="w-full space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Unique ID</label>
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 mt-1">
                    <code className="font-mono font-bold text-[#00a884]">{currentUser.uniqueId}</code>
                    <button onClick={handleCopy} className="p-1 hover:bg-gray-200 rounded transition-colors">
                      {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Profile Picture URL</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] font-bold text-[#00a884] hover:underline flex items-center gap-1"
                      >
                        <Upload size={10} /> Upload
                      </button>
                      {editPhotoURL && (
                        <button 
                          onClick={handleCopyURL}
                          className="text-[10px] font-bold text-gray-400 hover:underline flex items-center gap-1"
                        >
                          {copiedURL ? <Check size={10} className="text-green-500" /> : <Copy size={10} />} Copy URL
                        </button>
                      )}
                    </div>
                  </div>
                  <input 
                    type="text" 
                    value={editPhotoURL}
                    onChange={(e) => setEditPhotoURL(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:border-[#00a884]"
                  />
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePhotoUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <p className="text-[10px] text-gray-400 mt-1 italic">
                    You can paste a public URL or upload an image to generate a data URL.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:border-[#00a884] mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">About</label>
                  <textarea 
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:border-[#00a884] mt-1 resize-none h-24"
                  />
                </div>
                <button 
                  onClick={handleUpdateProfile}
                  className="w-full py-3 bg-[#00a884] text-white rounded-lg font-bold hover:bg-[#008f6f] transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        );
      case 'blocked':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-gray-700 px-2 flex items-center gap-2">
              <ShieldOff size={18} className="text-red-500" />
              Blocked Users ({blockedUsers.length})
            </h3>
            <div className="space-y-2">
              {blockedUsers.map(user => (
                <div key={user.uid} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <img src={user.photoURL} className="w-10 h-10 rounded-full object-cover" alt={user.displayName} />
                    <div>
                      <p className="font-semibold text-sm">{user.displayName}</p>
                      <p className="text-xs text-gray-400">@{user.uniqueId}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleUnblock(user.uid)}
                    className="px-3 py-1 text-xs font-bold text-[#00a884] hover:bg-[#00a884]/10 rounded-full transition-all border border-[#00a884]"
                  >
                    Unblock
                  </button>
                </div>
              ))}
              {blockedUsers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield size={48} className="text-gray-200 mb-4" />
                  <p className="text-gray-500 font-medium">No blocked users</p>
                  <p className="text-xs text-gray-400 mt-2">Users you block will appear here.</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'friends':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-gray-700 px-2">Connected Friends ({friends.length})</h3>
            <div className="space-y-2">
              {friends.map(f => {
                const otherUid = f.uids.find(uid => uid !== currentUser.uid);
                const profile = friendProfiles[otherUid || ''];
                if (!profile) return null;
                return (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <img src={profile.photoURL} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <p className="font-semibold text-sm">{profile.displayName}</p>
                        <p className="text-xs text-gray-400">@{profile.uniqueId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={async () => {
                          const chatDoc = await getDoc(doc(db, 'chats', f.id));
                          const chatData = chatDoc.exists() ? { ...chatDoc.data() as Chat, id: chatDoc.id } : {
                            id: f.id,
                            participants: f.uids,
                            participantIds: [],
                            updatedAt: Timestamp.now()
                          };
                          onSelectChat(chatData, profile);
                        }}
                        className="p-2 text-[#00a884] hover:bg-[#00a884]/10 rounded-full transition-all"
                        title="Message"
                      >
                        <MessageSquare size={18} />
                      </button>
                      <button onClick={() => handleUnfriend(f.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
                        <UserMinus size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {friends.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No friends connected yet.</p>}
            </div>
          </div>
        );
      case 'requests':
        return (
          <div className="p-4 space-y-6">
            <div>
              <h3 className="font-bold text-gray-700 px-2 mb-3 flex items-center gap-2">
                <Bell size={18} className="text-[#00a884]" />
                Incoming Requests
              </h3>
              <div className="space-y-2">
                {incomingRequests.map(req => (
                  <div key={req.id} className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-[#00a884]">
                        <User size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{req.fromDisplayName}</p>
                        <p className="text-xs text-gray-400">wants to connect • {req.fromUniqueId}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleAcceptRequest(req)}
                        className="flex-1 py-2 bg-[#00a884] text-white text-xs font-bold rounded-lg hover:bg-[#008f6f] flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 size={14} /> Accept
                      </button>
                      <button 
                        onClick={() => handleRejectRequest(req.id)}
                        className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-200 flex items-center justify-center gap-1"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
                {incomingRequests.length === 0 && <p className="text-center text-gray-400 py-4 text-xs">No pending incoming requests.</p>}
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-700 px-2 mb-3">Outgoing Requests</h3>
              <div className="space-y-2">
                {outgoingRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <Clock size={16} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-semibold">Request to {req.to}</p>
                        <p className="text-[10px] uppercase font-bold text-gray-400">{req.status}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteDoc(doc(db, 'connectionRequests', req.id))} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {outgoingRequests.length === 0 && <p className="text-center text-gray-400 py-4 text-xs">No outgoing requests.</p>}
              </div>
            </div>
          </div>
        );
      case 'docs':
        return (
          <div className="p-4 space-y-6 overflow-y-auto max-h-full pb-20">
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Share New Document</h4>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => document.getElementById('doc-upload')?.click()}
                    disabled={isUploading}
                    className="flex items-center justify-center gap-2 py-3 px-4 bg-[#00a884]/10 text-[#00a884] rounded-lg font-bold hover:bg-[#00a884]/20 transition-colors border-2 border-dashed border-[#00a884]/30"
                  >
                    <Upload size={18} />
                    {isUploading ? 'Uploading...' : 'Upload Document'}
                  </button>
                  <input 
                    type="file" 
                    id="doc-upload" 
                    className="hidden" 
                    onChange={handleUploadDocument}
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  />
                  
                  {uploadProgress !== null && (
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        className="bg-[#00a884] h-full"
                      />
                    </div>
                  )}

                  {generatedCode && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-100 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-green-600 font-bold uppercase">Share this code</span>
                        <code className="text-lg font-mono font-bold text-green-700">{generatedCode}</code>
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(generatedCode);
                          setDocSuccess('Code copied!');
                          setTimeout(() => setDocSuccess(''), 2000);
                        }}
                        className="p-2 hover:bg-green-200/50 rounded-full text-green-600 transition-colors"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Access with Code</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={accessCodeInput}
                    onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
                    placeholder="DOC-XXXXXX"
                    className="flex-1 p-3 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:border-[#00a884] font-mono font-bold"
                  />
                  <button 
                    onClick={handleAccessDocument}
                    disabled={!accessCodeInput.trim()}
                    className="px-4 bg-[#00a884] text-white rounded-lg font-bold hover:bg-[#008f6f] transition-colors disabled:opacity-50"
                  >
                    Access
                  </button>
                </div>
              </div>

              {docError && <p className="text-red-500 text-xs text-center font-medium bg-red-50 p-2 rounded-lg">{docError}</p>}
              {docSuccess && <p className="text-green-500 text-xs text-center font-medium bg-green-50 p-2 rounded-lg">{docSuccess}</p>}
            </div>

            <div className="space-y-6">
              {myDocs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">My Uploads</h4>
                  <div className="space-y-2">
                    {myDocs.map(doc => (
                      <div key={doc.id} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-50 rounded flex items-center justify-center text-[#00a884]">
                            <FileText size={20} />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-bold truncate">{doc.fileName}</p>
                            <p className="text-[10px] text-gray-400 uppercase">
                              {(doc.fileSize / 1024).toFixed(1)} KB • {doc.uploadTime?.toDate().toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <a href={doc.fileURL} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-100 rounded-full text-gray-400" title="Preview">
                              <Info size={16} />
                            </a>
                            <a href={doc.fileURL} download={doc.fileName} className="p-2 hover:bg-gray-100 rounded-full text-gray-400" title="Download">
                              <Download size={16} />
                            </a>
                            <button onClick={() => handleDeleteDocument(doc.id, doc.fileURL)} className="p-2 hover:bg-red-50 rounded-full text-red-400" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded-lg">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Access Code</span>
                          <code className="text-xs font-mono font-bold text-[#00a884]">{doc.accessCode}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {accessedDocs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Shared with Me</h4>
                  <div className="space-y-2">
                    {accessedDocs.map(doc => (
                      <div key={doc.id} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-50 rounded flex items-center justify-center text-blue-500">
                          <FileText size={20} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-bold truncate">{doc.fileName}</p>
                          <p className="text-[10px] text-gray-400 uppercase">
                            {(doc.fileSize / 1024).toFixed(1)} KB • {doc.uploadTime?.toDate().toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <a href={doc.fileURL} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-100 rounded-full text-gray-400" title="Preview">
                            <Info size={16} />
                          </a>
                          <a href={doc.fileURL} download={doc.fileName} className="p-2 hover:bg-gray-100 rounded-full text-gray-400" title="Download">
                            <Download size={16} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {myDocs.length === 0 && accessedDocs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText size={48} className="text-gray-200 mb-4" />
                  <p className="text-gray-500 font-medium">No documents yet</p>
                  <p className="text-xs text-gray-400 mt-2">Upload a document or enter a code to get started.</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="p-4 space-y-2">
            <button 
              onClick={() => setView('ui-control')}
              className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <PaletteIcon size={18} className="text-[#00a884]" />
                <span className="text-sm font-medium">Chat UI Control</span>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
              <span className="text-sm font-medium">Dark Mode</span>
              <div className="w-10 h-5 bg-gray-200 rounded-full relative">
                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
              <span className="text-sm font-medium">Notifications</span>
              <div className="w-10 h-5 bg-[#00a884] rounded-full relative">
                <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
              </div>
            </div>
            <button 
              onClick={onOpenImageGenerator}
              className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bot size={18} className="text-[#00a884]" />
                <span className="text-sm font-medium">Garud AI Assistant</span>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          </div>
        );
      case 'more':
        return (
          <div className="p-4 space-y-2">
            <button 
              onClick={() => setView('blocked')}
              className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-gray-400" />
                <span className="text-sm font-medium">Blocked Users</span>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <HelpCircle size={18} className="text-gray-400" />
                <span className="text-sm font-medium">Help & Support</span>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <Info size={18} className="text-gray-400" />
                <span className="text-sm font-medium">About App</span>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 p-4 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors mt-4"
            >
              <LogOut size={18} />
              <span className="text-sm font-bold">Logout</span>
            </button>
          </div>
        );
      case 'connect':
        return (
          <div className="p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-[#00a884]/10 rounded-full flex items-center justify-center mx-auto text-[#00a884]">
                <UserPlus size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800">Connect with Friends</h3>
              <p className="text-sm text-gray-500">Enter a unique ID to send a connection request</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Friend's Unique ID</label>
                <input 
                  type="text" 
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value.toUpperCase())}
                  placeholder="E.G. A1B2C3"
                  className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#00a884] font-mono font-bold text-lg text-center tracking-widest"
                />
                {connectError && <p className="text-red-500 text-xs mt-2 text-center font-medium">{connectError}</p>}
                {connectSuccess && <p className="text-green-500 text-xs mt-2 text-center font-medium">{connectSuccess}</p>}
              </div>
              
              <button 
                onClick={handleConnect}
                disabled={!targetId.trim() || !!connectSuccess}
                className="w-full py-4 bg-[#00a884] text-white rounded-xl font-bold text-lg hover:bg-[#008f6f] transition-colors shadow-md disabled:opacity-50"
              >
                Send Request
              </button>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p className="text-xs text-blue-600 leading-relaxed">
                <strong>Note:</strong> You can only chat with users after they accept your connection request. Share your ID with friends so they can find you!
              </p>
            </div>
          </div>
        );
      default:
        return (
          <div className="p-4 space-y-2">
            <MenuItem icon={<MessageSquare size={20} />} label="Messages / Chat Access" onClick={onClose} />
            <MenuItem icon={<User size={20} />} label="Profile Settings" onClick={() => setView('profile')} />
            <MenuItem icon={<UserPlus size={20} />} label="Connect with Friends" onClick={() => setView('connect')} />
            <MenuItem icon={<Users size={20} />} label="Friend Management" onClick={() => setView('friends')} />
            <MenuItem icon={<ShieldOff size={20} />} label="Blocked Users" onClick={() => setView('blocked')} />
            <MenuItem icon={<Bot size={20} />} label="Garud AI (Images & More)" onClick={onOpenImageGenerator} />
            <MenuItem 
              icon={<Bell size={20} />} 
              label="Chat Requests" 
              onClick={() => setView('requests')} 
              badge={incomingRequests.length > 0 ? incomingRequests.length : undefined}
            />
            <MenuItem icon={<FileText size={20} />} label="Document Sharing" onClick={() => setView('docs')} />
            <MenuItem icon={<Settings size={20} />} label="Settings" onClick={() => setView('settings')} />
            <MenuItem icon={<MoreHorizontal size={20} />} label="More Options" onClick={() => setView('more')} />
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[2px]"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full md:w-[400px] z-50 shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--sidebar-color)' }}
          >
            <div className="p-4 flex items-center gap-4 border-b" style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)' }}>
              <button 
                onClick={view === 'main' ? onClose : () => setView('main')} 
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
                style={{ color: 'var(--text-color)' }}
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold capitalize" style={{ color: 'var(--text-color)' }}>
                {view === 'main' ? 'Settings & Profile' : view.replace('-', ' ')}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderView()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; badge?: number }> = ({ icon, label, onClick, badge }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 rounded-xl border hover:opacity-90 transition-all group"
    style={{ backgroundColor: 'var(--header-color)', borderColor: 'var(--sidebar-color)', color: 'var(--text-color)' }}
  >
    <div className="flex items-center gap-4">
      <div className="opacity-50 group-hover:text-[#00a884] transition-colors">
        {icon}
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span className="bg-[#00a884] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      <ChevronRight size={16} className="opacity-30 group-hover:opacity-50" />
    </div>
  </button>
);
