import React, { useState, useEffect } from 'react';
import { UISettings } from '../../types';
import { DEFAULT_UI_SETTINGS } from '../../constants';
import { applyUISettings } from '../../lib/ui-utils';
import { Sun, Moon, RotateCcw, Save, Type, Layout, MousePointer2, Palette, Zap } from 'lucide-react';

interface ChatUIControlPanelProps {
  initialSettings?: UISettings;
  onSave: (settings: UISettings) => void;
}

export const ChatUIControlPanel: React.FC<ChatUIControlPanelProps> = ({ initialSettings, onSave }) => {
  const [settings, setSettings] = useState<UISettings>(initialSettings || DEFAULT_UI_SETTINGS);

  useEffect(() => {
    applyUISettings(settings);
  }, [settings]);

  const handleChange = (key: keyof UISettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setSettings(DEFAULT_UI_SETTINGS);
  };

  const fontFamilies = ['Inter', 'Roboto', 'Poppins', 'Arial', 'system-ui'];

  return (
    <div className="space-y-8 pb-10">
      {/* Theme Control */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-[#00a884] uppercase flex items-center gap-2">
          <Palette size={16} /> Theme Control
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleChange('theme', 'light')}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${settings.theme === 'light' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'}`}
          >
            <Sun size={18} /> Light
          </button>
          <button
            onClick={() => handleChange('theme', 'dark')}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${settings.theme === 'dark' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'}`}
          >
            <Moon size={18} /> Dark
          </button>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Chat Background</span>
            <input 
              type="color" 
              value={settings.chatBg} 
              onChange={(e) => handleChange('chatBg', e.target.value)}
              className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Sent Bubble</span>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={settings.sentBubbleColor} 
                onChange={(e) => handleChange('sentBubbleColor', e.target.value)}
                className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                title="Bubble Color"
              />
              <input 
                type="color" 
                value={settings.sentTextColor} 
                onChange={(e) => handleChange('sentTextColor', e.target.value)}
                className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                title="Text Color"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Received Bubble</span>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={settings.receivedBubbleColor} 
                onChange={(e) => handleChange('receivedBubbleColor', e.target.value)}
                className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                title="Bubble Color"
              />
              <input 
                type="color" 
                value={settings.receivedTextColor} 
                onChange={(e) => handleChange('receivedTextColor', e.target.value)}
                className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                title="Text Color"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Text & Font Control */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-[#00a884] uppercase flex items-center gap-2">
          <Type size={16} /> Text & Font
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">Font Family</label>
            <select 
              value={settings.fontFamily}
              onChange={(e) => handleChange('fontFamily', e.target.value)}
              className="w-full p-3 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-[#00a884] text-sm"
            >
              {fontFamilies.map(font => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
          </div>
          
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Font Size ({settings.fontSize}px)</label>
            </div>
            <input 
              type="range" min="12" max="24" step="1"
              value={settings.fontSize}
              onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">Font Weight</label>
            <select 
              value={settings.fontWeight}
              onChange={(e) => handleChange('fontWeight', e.target.value)}
              className="w-full p-3 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-[#00a884] text-sm"
            >
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="500">Medium</option>
              <option value="600">Semi-Bold</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Line Height ({settings.lineHeight})</label>
            </div>
            <input 
              type="range" min="1" max="2" step="0.1"
              value={settings.lineHeight}
              onChange={(e) => handleChange('lineHeight', parseFloat(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>
        </div>
      </section>

      {/* Chat Layout Control */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-[#00a884] uppercase flex items-center gap-2">
          <Layout size={16} /> Chat Layout
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Bubble Radius ({settings.bubbleRadius}px)</label>
            </div>
            <input 
              type="range" min="0" max="24" step="2"
              value={settings.bubbleRadius}
              onChange={(e) => handleChange('bubbleRadius', parseInt(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Message Spacing ({settings.messageSpacing}px)</label>
            </div>
            <input 
              type="range" min="4" max="32" step="2"
              value={settings.messageSpacing}
              onChange={(e) => handleChange('messageSpacing', parseInt(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Max Message Width ({settings.messageWidth}%)</label>
            </div>
            <input 
              type="range" min="50" max="95" step="5"
              value={settings.messageWidth}
              onChange={(e) => handleChange('messageWidth', parseInt(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>
        </div>
      </section>

      {/* Page Style Control */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-[#00a884] uppercase flex items-center gap-2">
          <Palette size={16} /> Page Style
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">App Background</span>
            <input 
              type="color" 
              value={settings.appBg} 
              onChange={(e) => handleChange('appBg', e.target.value)}
              className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Sidebar Color</span>
            <input 
              type="color" 
              value={settings.sidebarColor} 
              onChange={(e) => handleChange('sidebarColor', e.target.value)}
              className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Header Color</span>
            <input 
              type="color" 
              value={settings.headerColor} 
              onChange={(e) => handleChange('headerColor', e.target.value)}
              className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* Input Box Control */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-[#00a884] uppercase flex items-center gap-2">
          <MousePointer2 size={16} /> Input Control
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Input Background</span>
            <input 
              type="color" 
              value={settings.inputBg} 
              onChange={(e) => handleChange('inputBg', e.target.value)}
              className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Input Text Color</span>
            <input 
              type="color" 
              value={settings.inputTextColor} 
              onChange={(e) => handleChange('inputTextColor', e.target.value)}
              className="w-8 h-8 rounded-full overflow-hidden border-none p-0 cursor-pointer"
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Input Height ({settings.inputHeight}px)</label>
            </div>
            <input 
              type="range" min="32" max="80" step="4"
              value={settings.inputHeight}
              onChange={(e) => handleChange('inputHeight', parseInt(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>
        </div>
      </section>

      {/* Animation Control */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-[#00a884] uppercase flex items-center gap-2">
          <Zap size={16} /> Animation
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Animation Speed ({settings.animationSpeed}s)</label>
            </div>
            <input 
              type="range" min="0.1" max="1" step="0.1"
              value={settings.animationSpeed}
              onChange={(e) => handleChange('animationSpeed', parseFloat(e.target.value))}
              className="w-full accent-[#00a884]"
            />
          </div>
          
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">Loader Style</label>
            <select 
              value={settings.loaderStyle}
              onChange={(e) => handleChange('loaderStyle', e.target.value)}
              className="w-full p-3 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-[#00a884] text-sm"
            >
              <option value="spinner">Spinner</option>
              <option value="dots">Dots</option>
              <option value="pulse">Pulse</option>
            </select>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3 pt-4 sticky bottom-0 bg-[#f0f2f5] py-4 border-t border-gray-200">
        <button 
          onClick={handleReset}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-gray-600 rounded-xl font-bold border border-gray-100 hover:bg-gray-50 transition-all"
        >
          <RotateCcw size={18} /> Reset
        </button>
        <button 
          onClick={() => onSave(settings)}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#00a884] text-white rounded-xl font-bold hover:bg-[#008f6f] transition-all shadow-md"
        >
          <Save size={18} /> Save Settings
        </button>
      </div>
    </div>
  );
};
