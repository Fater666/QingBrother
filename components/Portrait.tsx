
import React from 'react';
import { Character, Item } from '../types.ts';

interface PortraitProps {
  character: Character;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Portrait: React.FC<PortraitProps> = ({ character, size = 'md', className = '' }) => {
  // Config based on size
  const dim = size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-16 h-16' : size === 'lg' ? 'w-24 h-24' : 'w-48 h-48';
  const fontSize = size === 'sm' ? 'text-lg' : size === 'md' ? 'text-3xl' : size === 'lg' ? 'text-5xl' : 'text-8xl';
  
  // Visual mappings based on Background
  const getBaseLook = (bg: string) => {
      // Map English keys or Chinese display names
      const normalizedBg = bg.includes('农') || bg === 'FARMER' ? 'FARMER' :
                           bg.includes('逃') || bg === 'DESERTER' ? 'DESERTER' :
                           bg.includes('猎') || bg === 'HUNTER' ? 'HUNTER' :
                           bg.includes('胡') || bg === 'NOMAD' ? 'NOMAD' :
                           bg.includes('士') || bg === 'NOBLE' ? 'NOBLE' :
                           bg.includes('方') || bg === 'MONK' ? 'MONK' :
                           'BANDIT';

      switch(normalizedBg) {
          case 'FARMER': return { bg: 'bg-[#5d4037]', face: '👦', style: 'sepia-[.4]' };
          case 'DESERTER': return { bg: 'bg-[#37474f]', face: '😒', style: 'grayscale-[.5]' };
          case 'HUNTER': return { bg: 'bg-[#33691e]', face: '🧔', style: '' };
          case 'NOMAD': return { bg: 'bg-[#bf360c]', face: '👺', style: 'contrast-125' }; 
          case 'NOBLE': return { bg: 'bg-[#4a148c]', face: '🤴', style: '' };
          case 'MONK': return { bg: 'bg-[#fbc02d]', face: '👴', style: '' };
          default: return { bg: 'bg-[#212121]', face: '😠', style: 'contrast-110' };
      }
  };

  const getHelmetLook = (helmet: Item | null) => {
      if (!helmet) return null;
      if (helmet.name.includes('巾') || helmet.name.includes('布')) return '👳';
      if (helmet.name.includes('冠')) return '👑';
      return '⛑️';
  };

  const getArmorLook = (armor: Item | null) => {
      if (!armor) return '👕';
      if (armor.name.includes('皮')) return '🧥';
      if (armor.name.includes('铁') || armor.name.includes('札')) return '👘';
      return '👔';
  };

  const look = getBaseLook(character.background);
  const helmetIcon = getHelmetLook(character.equipment.helmet);
  const armorIcon = getArmorLook(character.equipment.armor);

  return (
    <div className={`${dim} ${look.bg} relative overflow-hidden rounded-sm border-2 border-white/10 shadow-inner ${className} ${look.style}`}>
        {/* Background Texture */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]" />
        
        {/* Body/Armor (Lower Layer) */}
        <div className={`absolute -bottom-[10%] left-1/2 -translate-x-1/2 ${fontSize} scale-150 z-0 opacity-90`}>
            {armorIcon}
        </div>

        {/* Face (Middle Layer) */}
        <div className={`absolute top-[15%] left-1/2 -translate-x-1/2 ${fontSize} z-10 drop-shadow-md`}>
            {look.face}
        </div>

        {/* Helmet (Top Layer) */}
        {helmetIcon && (
            <div className={`absolute top-[-5%] left-1/2 -translate-x-1/2 ${fontSize} scale-110 z-20 drop-shadow-lg`}>
                {helmetIcon}
            </div>
        )}

        {/* Blood overlay if injured */}
        {character.hp < character.maxHp * 0.5 && (
            <div className="absolute inset-0 bg-red-900/30 pointer-events-none mix-blend-overlay" />
        )}
         {character.hp < character.maxHp * 0.2 && (
             <div className="absolute top-0 right-0 text-red-600 text-lg opacity-80 animate-pulse">🩸</div>
        )}
    </div>
  );
};
