import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Download, Image as ImageIcon, Loader2, ArrowLeft, Trash2, Sparkles, Bot, User, Smile, Paperclip, X, FileText } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import EmojiPicker, { Theme } from 'emoji-picker-react';

interface AIChatProps {
  onBack: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'image';
  content: string;
  timestamp: Date;
}

export const AIChat: React.FC<AIChatProps> = ({ onBack }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string; size: number; type: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if ((!input.trim() && !imagePreview && !documentPreview) || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      type: imagePreview ? 'image' : 'text',
      content: imagePreview || input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = imagePreview;
    const currentDoc = documentPreview;
    
    setInput('');
    setImagePreview(null);
    setDocumentPreview(null);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      if (currentImage) {
        // Multimodal request
        const base64Data = currentImage.split(',')[1];
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
                { text: currentInput || "What is in this image?" }
              ]
            }
          ]
        });

        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          type: 'text',
          content: response.text || "I've received your image.",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
      } else if (currentDoc) {
        // Document request (simplified as text for now, or could use Gemini 1.5 Pro for PDF)
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          type: 'text',
          content: `I've received your document: **${currentDoc.name}**. (Document analysis is coming soon!)`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        // Simple logic to detect image generation intent
        const imageKeywords = ['generate', 'image', 'draw', 'create', 'picture', 'photo', 'sketch', 'paint'];
        const isImageRequest = imageKeywords.some(kw => currentInput.toLowerCase().includes(kw));

        if (isImageRequest) {
          // Use Image Generation Model
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
              parts: [{ text: currentInput }],
            },
          });

          let imageUrl = '';
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }

          if (imageUrl) {
            const aiMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'ai',
              type: 'image',
              content: imageUrl,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMessage]);
          } else {
            const textContent = response.text || "I couldn't generate that image. How else can I help?";
            const aiMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'ai',
              type: 'text',
              content: textContent,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMessage]);
          }
        } else {
          // Use Text Model for Q&A with multi-turn history
          const history = messages
            .filter(m => m.type === 'text')
            .map(m => ({
              role: m.role === 'user' ? 'user' : 'model',
              parts: [{ text: m.content }]
            }));

          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [...history, { role: 'user', parts: [{ text: currentInput }] }],
            config: {
              systemInstruction: "You are Garud AI, a helpful AI assistant integrated into a chat application. You can answer questions and help users. If they ask to generate an image, you should acknowledge it, though the system will automatically handle image generation if it detects keywords like 'generate image'. Keep your responses concise and friendly.",
            }
          });

          const aiMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'ai',
            type: 'text',
            content: response.text || "I'm sorry, I couldn't process that request.",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiMessage]);
        }
      }
    } catch (error) {
      console.error('AI Error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        type: 'text',
        content: "Sorry, I encountered an error. Please try again later.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
        setDocumentPreview(null);
        setShowAttachmentMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    setInput(prev => prev + emojiData.emoji);
  };

  const handleDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearHistory = () => {
    if (confirm('Clear chat history?')) {
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5]">
      {/* Header */}
      <div className="bg-[#f0f2f5] p-3 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white shadow-md">
              <Bot size={24} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-gray-800 leading-tight">Garud AI</span>
              <span className="text-xs text-[#00a884] font-medium flex items-center gap-1">
                <span className="w-2 h-2 bg-[#00a884] rounded-full animate-pulse" />
                Online
              </span>
            </div>
          </div>
        </div>
        
        {messages.length > 0 && (
          <button 
            onClick={clearHistory}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
            title="Clear History"
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-whatsapp"
        style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-[#00a884] shadow-xl mb-4">
              <Bot size={40} />
            </div>
            <h2 className="text-xl font-bold text-gray-700">Hello! I'm Garud AI</h2>
            <p className="text-sm text-gray-500 max-w-xs">
              You can ask me anything or request to generate images.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-sm">
              {[
                'Generate a space cat', 
                'Tell me a joke', 
                'Draw a sunset', 
                'How are you?'
              ].map(suggestion => (
                <button 
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                  }}
                  className="px-3 py-2 bg-white rounded-xl text-xs font-medium text-gray-600 border border-gray-100 hover:border-[#00a884] hover:text-[#00a884] transition-all shadow-sm text-left"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] md:max-w-[70%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-3 rounded-2xl shadow-sm relative ${
                msg.role === 'user' 
                  ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-none' 
                  : 'bg-white text-gray-800 rounded-tl-none'
              }`}>
                {msg.type === 'image' ? (
                  <div className="space-y-2">
                    <div className="relative group">
                      <img 
                        src={msg.content} 
                        alt="AI Generated" 
                        className="rounded-lg w-full h-auto object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button 
                        onClick={() => handleDownload(msg.content)}
                        className="absolute bottom-2 right-2 p-2 bg-[#00a884] text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm markdown-body prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-2 rounded-tl-none">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-gray-400 font-bold uppercase">AI is thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-[#f0f2f5] p-4 border-t border-gray-200 relative">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl"
            >
              <EmojiPicker 
                onEmojiClick={onEmojiClick} 
                theme={Theme.LIGHT}
                width={320}
                height={400}
              />
            </motion.div>
          )}

          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-4 rounded-xl flex flex-col gap-3 shadow-lg mb-4 max-w-md mx-auto"
            >
              <div className="relative group">
                <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-contain mx-auto" />
                <button onClick={() => setImagePreview(null)} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full">
                  <X size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {documentPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-4 rounded-xl flex flex-col gap-3 shadow-lg mb-4 max-w-md mx-auto"
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
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-4xl mx-auto flex items-center gap-3">
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
                      onClick={() => fileInputRef.current?.click()} 
                      className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
                    >
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-500">
                        <ImageIcon size={18} />
                      </div>
                      <span className="font-medium">Photos</span>
                    </button>
                    <button 
                      onClick={() => docInputRef.current?.click()} 
                      className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm transition-colors"
                    >
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
                        <FileText size={18} />
                      </div>
                      <span className="font-medium">Document</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
            <input type="file" ref={docInputRef} onChange={handleDocChange} accept=".pdf,.doc,.docx,.txt" className="hidden" />
          </div>

          <div className="flex-1 bg-white rounded-2xl shadow-sm flex items-center px-4 py-1 border border-gray-100 focus-within:ring-2 focus-within:ring-[#00a884]/20 transition-all">
            <input 
              type="text" 
              value={input}
              onFocus={() => {
                setShowEmojiPicker(false);
                setShowAttachmentMenu(false);
              }}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="flex-1 py-3 bg-transparent outline-none text-sm"
              disabled={isLoading}
            />
          </div>
          <button 
            onClick={handleSend}
            disabled={(!input.trim() && !imagePreview && !documentPreview) || isLoading}
            className={`p-4 rounded-2xl shadow-md transition-all ${
              (!input.trim() && !imagePreview && !documentPreview) || isLoading 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-[#00a884] text-white hover:bg-[#008f6f] active:scale-95'
            }`}
          >
            {isLoading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};
