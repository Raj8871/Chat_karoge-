import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  uniqueId: string;
  displayName: string;
  photoURL: string;
  bio: string;
  status: 'online' | 'offline';
  lastSeen: Timestamp | string;
  isTyping?: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  participantIds: string[];
  lastMessage?: string;
  lastTimestamp?: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Record<string, Timestamp>;
}

export interface Message {
  id: string;
  chatId: string;
  from: string;
  to: string;
  text?: string;
  type: 'text' | 'image' | 'document';
  image?: string;
  document?: {
    url: string;
    name: string;
    size: number;
    type: string;
  };
  replyTo?: Message;
  timestamp: Timestamp | string;
  status?: 'sent' | 'delivered' | 'read';
}

export interface Block {
  id: string;
  blocker: string;
  blocked: string;
  timestamp: Timestamp;
}

export interface ConnectionRequest {
  id: string;
  from: string;
  fromUniqueId: string;
  fromDisplayName: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: Timestamp;
}

export interface Friend {
  id: string;
  uids: string[];
  timestamp: Timestamp;
}
