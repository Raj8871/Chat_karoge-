import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface LoaderProps {
  style?: 'spinner' | 'dots' | 'pulse';
  size?: number;
  className?: string;
}

export const Loader: React.FC<LoaderProps> = ({ style = 'spinner', size = 24, className = '' }) => {
  if (style === 'dots') {
    return (
      <div className={`flex gap-1 items-center justify-center ${className}`}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="bg-current rounded-full"
            style={{ width: size / 4, height: size / 4 }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    );
  }

  if (style === 'pulse') {
    return (
      <motion.div
        className={`bg-current rounded-full ${className}`}
        style={{ width: size, height: size }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
    );
  }

  return (
    <Loader2 
      className={`animate-spin ${className}`} 
      size={size} 
    />
  );
};
