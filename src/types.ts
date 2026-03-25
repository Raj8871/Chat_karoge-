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
  uiSettings?: UISettings;
}

export interface UISettings {
  theme: 'light' | 'dark';
  chatBg: string;
  sentBubbleColor: string;
  receivedBubbleColor: string;
  sentTextColor: string;
  receivedTextColor: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textColor: string;
  bubbleRadius: number;
  messageSpacing: number;
  messageWidth: number;
  lineHeight: number;
  inputBg: string;
  inputTextColor: string;
  inputRadius: number;
  inputHeight: number;
  appBg: string;
  sidebarColor: string;
  headerColor: string;
  loaderStyle: 'spinner' | 'dots' | 'pulse';
  animationSpeed: number;
  sendAnimation: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  participantIds: string[];
  lastMessage?: string;
  lastTimestamp?: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Record<string, Timestamp>;
  lockedBy?: string[];
}

export interface Message {
  id: string;
  chatId: string;
  from: string;
  to: string;
  text?: string;
  type: 'text' | 'image' | 'document' | 'video' | 'audio';
  image?: string;
  video?: string;
  audio?: string;
  document?: {
    url: string;
    name: string;
    size: number;
    type: string;
  };
  replyTo?: Message;
  timestamp: Timestamp | string;
  status?: 'sent' | 'delivered' | 'read';
  deletedFor?: string[];
  isDeleted?: boolean;
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

export interface CallSession {
  callerId: string;
  receiverId: string;
  callerName: string;
  status: 'idle' | 'calling' | 'incoming' | 'active' | 'ended';
  startTime?: number;
}
