import React from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';

export const getEmojis = (str: string) => {
  if (!Intl.Segmenter) return str.split(''); // Fallback
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return Array.from(segmenter.segment(str), (s) => s.segment);
};

export const isOnlyEmojis = (str: string) => {
  if (!str || !str.trim()) return false;
  const emojis = getEmojis(str);
  // Basic emoji regex check for each grapheme
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/;
  return emojis.every(e => emojiRegex.test(e) || e.trim() === '');
};

const animations: Record<string, any> = {
  // Laughing
  '😂': { animate: { y: [0, -15, 0], rotate: [0, -10, 10, 0] }, transition: { repeat: Infinity, duration: 0.6 } },
  '🤣': { animate: { y: [0, -15, 0], rotate: [0, -20, 20, 0] }, transition: { repeat: Infinity, duration: 0.5 } },
  '😆': { animate: { scale: [1, 1.2, 1] }, transition: { repeat: Infinity, duration: 0.4 } },
  '😄': { animate: { scale: [1, 1.15, 1] }, transition: { repeat: Infinity, duration: 0.5 } },
  '😀': { animate: { scale: [1, 1.1, 1] }, transition: { repeat: Infinity, duration: 0.6 } },
  // Crying
  '😭': { animate: { y: [0, 5, 0], opacity: [1, 0.6, 1] }, transition: { repeat: Infinity, duration: 1 } },
  '😢': { animate: { y: [0, 3, 0], opacity: [1, 0.8, 1] }, transition: { repeat: Infinity, duration: 1.2 } },
  '🥺': { animate: { scale: [1, 1.1, 1], rotate: [-2, 2, -2] }, transition: { repeat: Infinity, duration: 2 } },
  // Love
  '❤️': { animate: { scale: [1, 1.3, 1] }, transition: { repeat: Infinity, duration: 0.7, ease: "easeInOut" } },
  '😍': { animate: { scale: [1, 1.2, 1], rotate: [-5, 5, -5] }, transition: { repeat: Infinity, duration: 1 } },
  '🥰': { animate: { scale: [1, 1.15, 1], x: [-2, 2, -2] }, transition: { repeat: Infinity, duration: 1.5 } },
  '😘': { animate: { x: [0, 10, 0], scale: [1, 1.2, 1] }, transition: { repeat: Infinity, duration: 1 } },
  // Angry
  '😠': { animate: { x: [-2, 2, -2, 2, 0] }, transition: { repeat: Infinity, duration: 0.2 } },
  '😡': { animate: { x: [-4, 4, -4, 4, 0], scale: [1, 1.1, 1] }, transition: { repeat: Infinity, duration: 0.15 } },
  '🤬': { animate: { x: [-5, 5, -5, 5, 0], rotate: [-5, 5, -5] }, transition: { repeat: Infinity, duration: 0.1 } },
  // Default
  'default': { animate: { scale: [1, 1.05, 1] }, transition: { repeat: Infinity, duration: 2 } }
};

export const AnimatedEmoji: React.FC<{ emoji: string; isBig: boolean }> = ({ emoji, isBig }) => {
  const anim = animations[emoji] || animations['default'];

  return (
    <motion.span
      style={{ display: 'inline-block' }}
      {...anim}
      className={isBig ? 'text-5xl' : 'text-sm'}
    >
      {emoji}
    </motion.span>
  );
};

export const triggerEmojiEffect = (emoji: string) => {
  if (['😭', '😢', '🥺'].includes(emoji)) {
    // Crying effect: rain of emojis from top
    const duration = 2 * 1000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 1,
        angle: 90,
        spread: 180,
        origin: { x: Math.random(), y: -0.1 },
        ticks: 200,
        gravity: 0.8,
        scalar: Math.random() * 2 + 1,
        shapes: ['text'],
        shapeOptions: {
          text: { value: [emoji] }
        }
      } as any);

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };
    frame();
    return;
  }

  if (['😂', '🤣', '😆', '😄'].includes(emoji)) {
    // Laughing effect: burst from bottom corners
    const duration = 2 * 1000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 },
        scalar: 2,
        shapes: ['text'],
        shapeOptions: { text: { value: [emoji] } }
      } as any);
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 },
        scalar: 2,
        shapes: ['text'],
        shapeOptions: { text: { value: [emoji] } }
      } as any);

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };
    frame();
    return;
  }

  if (['❤️', '💖', '💗', '💓', '💘'].includes(emoji)) {
    // Heart effect: floating up from center
    const duration = 2 * 1000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 1,
        angle: 90,
        spread: 45,
        origin: { x: 0.5, y: 1 },
        ticks: 200,
        gravity: 0.2,
        scalar: Math.random() * 2 + 1,
        shapes: ['text'],
        shapeOptions: { text: { value: [emoji] } }
      } as any);

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };
    frame();
    return;
  }

  const count = 40;
  const defaults = {
    origin: { y: 0.7 },
    spread: 360,
    ticks: 100,
    gravity: 0.5,
    decay: 0.94,
    startVelocity: 30,
    shapes: ['circle'],
    colors: ['#FFE233', '#FFD700']
  };

  const fire = (particleRatio: number, opts: any) => {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
      scalar: 2,
      shapes: ['text'],
      shapeOptions: {
        text: {
          value: [emoji],
        },
      },
    } as any);
  };

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 1.5 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
};
