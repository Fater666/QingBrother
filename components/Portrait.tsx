
import React, { useMemo } from 'react';
import { Character, Item } from '../types.ts';
import { ItemIcon } from './ItemIcon.tsx';

interface PortraitProps {
  character: Character;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showStatus?: boolean;
}

export const Portrait: React.FC<PortraitProps> = ({ character, size = 'md', className = '', showStatus = false }) => {
  // Config based on size
  const dim = size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-16 h-16' : size === 'lg' ? 'w-24 h-24' : 'w-48 h-48';
  
  // Colors
  const SKIN_TONE = "#e0c097"; // Standard Han skin tone
  const SKIN_TONE_SHADOW = "#c5a075";
  const HAIR_COLOR = "#171717"; // Black
  const CLOTH_COLOR = character.equipment.armor ? "#3f3f46" : "#78350f"; // Grey for armor, brown for peasant

  // Generate deterministic features based on ID/Name (Simple hash)
  const seed = useMemo(() => {
      let hash = 0;
      for (let i = 0; i < character.name.length; i++) {
          hash = character.name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return Math.abs(hash);
  }, [character.name]);

  const hasBeard = seed % 3 === 0;
  const hairStyle = seed % 2; // 0: Topknot, 1: Messy
  const eyeType = seed % 2; // 0: Normal, 1: Narrow

  const renderHelmet = () => {
      const helmet = character.equipment.helmet;
      if (!helmet) return null;

      if (helmet.name.includes('巾') || helmet.name.includes('布')) {
           return (
               <g>
                   <path d="M25,25 Q50,10 75,25 L78,40 L22,40 Z" fill="#57534e" stroke="#000" strokeWidth="1" />
                   <path d="M22,35 L78,35" stroke="#000" opacity="0.3" />
               </g>
           );
      }
      if (helmet.name.includes('冠') || helmet.name.includes('弁')) {
           return (
               <g>
                   <rect x="35" y="10" width="30" height="25" rx="2" fill="#78350f" stroke="#000" strokeWidth="1" />
                   <rect x="40" y="30" width="20" height="5" fill="#d97706" />
                   <circle cx="50" cy="20" r="3" fill="#d97706" />
               </g>
           );
      }
      // Metal Helm
      const color = helmet.name.includes('铜') ? '#d97706' : '#475569';
      return (
          <g>
              <path d="M25,40 Q50,5 75,40 L75,50 L25,50 Z" fill={color} stroke="#000" strokeWidth="1.5" />
              <rect x="48" y="10" width="4" height="20" fill="#b91c1c" />
              <path d="M25,45 L75,45" stroke="#000" opacity="0.3" />
          </g>
      );
  };

  const renderArmor = () => {
      const armor = character.equipment.armor;
      if (!armor) {
          // Peasant Clothes
          return (
              <g>
                  <path d="M20,80 Q50,75 80,80 L90,100 L10,100 Z" fill={CLOTH_COLOR} stroke="#000" strokeWidth="1" />
                  <path d="M50,80 L50,100" stroke="#000" strokeWidth="1" opacity="0.2" />
                  {/* Collar */}
                  <path d="M35,80 L50,90 L65,80" stroke="#d6d3d1" strokeWidth="2" fill="none" />
              </g>
          );
      }
      
      const isMetal = armor.name.includes('铁') || armor.name.includes('铜') || armor.name.includes('甲');
      const armorColor = isMetal ? (armor.name.includes('铜') ? '#b45309' : '#334155') : '#713f12';

      return (
          <g>
              {/* Shoulders */}
              <path d="M15,85 Q50,70 85,85 L95,100 L5,100 Z" fill={armorColor} stroke="#000" strokeWidth="1.5" />
              {/* Scale Pattern */}
              {isMetal && (
                   <path d="M20,90 L80,90 M25,95 L75,95" stroke="#000" strokeWidth="1" opacity="0.3" />
              )}
              {/* Collar/Neck Guard */}
              <rect x="35" y="80" width="30" height="10" fill={armorColor} stroke="#000" />
          </g>
      );
  };

  return (
    <div className={`${dim} relative bg-[#1c1917] border border-amber-900/40 shadow-md overflow-hidden rounded-sm ${className} select-none`}>
       {/* Background based on Class */}
       <div className={`absolute inset-0 opacity-40 ${
           character.background === 'FARMER' ? 'bg-emerald-900' :
           character.background === 'DESERTER' ? 'bg-slate-800' :
           character.background === 'NOBLE' ? 'bg-purple-900' :
           character.background === 'HUNTER' ? 'bg-lime-900' :
           character.background === 'BANDIT' ? 'bg-red-950' :
           'bg-stone-800'
       }`} />
       
       {/* Grain Texture */}
       <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]" />

       <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-sm">
           {/* Body/Armor */}
           {renderArmor()}

           {/* Neck */}
           <rect x="42" y="65" width="16" height="15" fill={SKIN_TONE_SHADOW} />

           {/* Head Base */}
           <ellipse cx="50" cy="50" rx="22" ry="26" fill={SKIN_TONE} stroke="#000" strokeWidth="1" />
           
           {/* Facial Features */}
           {/* Eyes */}
           {eyeType === 0 ? (
                <g fill="#1a1a1a">
                    <circle cx="42" cy="48" r="2.5" />
                    <circle cx="58" cy="48" r="2.5" />
                </g>
           ) : (
               <g stroke="#1a1a1a" strokeWidth="2">
                   <line x1="39" y1="49" x2="45" y2="47" />
                   <line x1="55" y1="47" x2="61" y2="49" />
               </g>
           )}
           {/* Eyebrows */}
           <path d="M38,42 L46,40 M54,40 L62,42" stroke="#262626" strokeWidth="1.5" />
           
           {/* Nose */}
           <path d="M50,48 L48,56 L52,56" fill="none" stroke="#a16207" strokeWidth="1" opacity="0.6" />
           
           {/* Mouth */}
           <path d="M45,65 Q50,68 55,65" fill="none" stroke="#574c4c" strokeWidth="1.5" />

           {/* Beard */}
           {hasBeard && (
               <path d="M35,60 Q50,85 65,60" fill="#1a1a1a" opacity="0.9" />
           )}

           {/* Hair (Behind Helmet check) */}
           {!character.equipment.helmet && (
               hairStyle === 0 ? (
                   // Topknot
                   <g>
                        <circle cx="50" cy="22" r="6" fill={HAIR_COLOR} stroke="#000" strokeWidth="1" />
                        <path d="M30,30 Q50,15 70,30" fill="none" stroke={HAIR_COLOR} strokeWidth="6" />
                   </g>
               ) : (
                   // Messy
                    <path d="M25,35 Q50,10 75,35 L80,50 L20,50 Z" fill={HAIR_COLOR} />
               )
           )}

           {/* Helmet (Top Layer) */}
           {renderHelmet()}
       </svg>
       
       {/* Injured Overlay */}
       {character.hp < character.maxHp * 0.5 && (
            <div className="absolute inset-0 bg-red-900/20 mix-blend-multiply pointer-events-none" />
       )}
       {/* Dead Overlay */}
       {character.hp <= 0 && (
           <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-none">
               <span className="text-red-600 text-3xl font-bold">☠</span>
           </div>
       )}

       {/* Status Indicators */}
       {showStatus && (
           <div className="absolute bottom-0 left-0 w-full flex flex-col gap-[1px]">
               <div className="h-1 bg-gray-800 w-full"><div className="h-full bg-red-600" style={{ width: `${(character.hp / character.maxHp) * 100}%` }} /></div>
           </div>
       )}
    </div>
  );
};
