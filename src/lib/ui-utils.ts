import { UISettings } from '../types';

export const applyUISettings = (settings: UISettings) => {
  const root = document.documentElement;
  
  // Theme
  root.classList.toggle('dark', settings.theme === 'dark');
  
  // Colors
  root.style.setProperty('--chat-bg', settings.chatBg);
  root.style.setProperty('--sent-bubble-color', settings.sentBubbleColor);
  root.style.setProperty('--received-bubble-color', settings.receivedBubbleColor);
  root.style.setProperty('--sent-text-color', settings.sentTextColor);
  root.style.setProperty('--received-text-color', settings.receivedTextColor);
  root.style.setProperty('--app-bg', settings.appBg);
  root.style.setProperty('--sidebar-color', settings.sidebarColor);
  root.style.setProperty('--header-color', settings.headerColor);
  
  // Typography
  root.style.setProperty('--font-family', settings.fontFamily);
  root.style.setProperty('--font-size', `${settings.fontSize}px`);
  root.style.setProperty('--font-weight', settings.fontWeight);
  root.style.setProperty('--text-color', settings.textColor);
  root.style.setProperty('--line-height', settings.lineHeight.toString());
  
  // Layout
  root.style.setProperty('--bubble-radius', `${settings.bubbleRadius}px`);
  root.style.setProperty('--message-spacing', `${settings.messageSpacing}px`);
  root.style.setProperty('--message-width', `${settings.messageWidth}%`);
  
  // Input
  root.style.setProperty('--input-bg', settings.inputBg);
  root.style.setProperty('--input-text-color', settings.inputTextColor);
  root.style.setProperty('--input-radius', `${settings.inputRadius}px`);
  root.style.setProperty('--input-height', `${settings.inputHeight}px`);
  
  // Animation
  root.style.setProperty('--animation-speed', `${settings.animationSpeed}s`);
};
