
import React from 'react';
import { Item } from '../types.ts';

interface ItemIconProps {
  item: Item | null;
  className?: string;
  showBackground?: boolean;
}

export const ItemIcon: React.FC<ItemIconProps> = ({ item, className = "", showBackground = true }) => {
  if (!item) {
    return (
      <div className={`w-full h-full flex items-center justify-center opacity-20 ${className}`}>
        <div className="w-1/2 h-1/2 border border-dashed border-slate-500 rounded-full" />
      </div>
    );
  }

  // --- Palette ---
  const C_BRONZE = "#d97706"; // Amber-600
  const C_BRONZE_LIGHT = "#f59e0b"; // Amber-500
  const C_IRON = "#64748b"; // Slate-500
  const C_IRON_DARK = "#334155"; // Slate-700
  const C_WOOD = "#78350f"; // Amber-900
  const C_LEATHER = "#92400e"; // Amber-800
  const C_CLOTH = "#57534e"; // Stone-500

  // --- Drawing Logic ---
  const renderIcon = () => {
    const isBronze = item.name.includes('青铜') || item.name.includes('戈') || item.name.includes('矛');
    const mainColor = isBronze ? C_BRONZE : C_IRON;
    const lightColor = isBronze ? C_BRONZE_LIGHT : "#94a3b8";

    // 1. WEAPONS
    if (item.type === 'WEAPON') {
      if (item.name.includes('剑')) {
        return (
          <g transform="rotate(-45, 50, 50)">
            {/* Blade */}
            <path d="M45,20 L55,20 L53,80 L50,85 L47,80 Z" fill={mainColor} stroke="#000" strokeWidth="2" />
            <path d="M50,20 L50,80" stroke={lightColor} strokeWidth="2" />
            {/* Guard */}
            <rect x="35" y="75" width="30" height="6" rx="2" fill={C_BRONZE_LIGHT} stroke="#000" strokeWidth="1" />
            {/* Hilt */}
            <rect x="47" y="80" width="6" height="15" fill={C_LEATHER} stroke="#000" strokeWidth="1" />
            {/* Pommel */}
            <circle cx="50" cy="95" r="4" fill={C_BRONZE} stroke="#000" />
          </g>
        );
      }
      if (item.name.includes('斧')) {
        return (
          <g transform="rotate(-15, 50, 50)">
            {/* Handle */}
            <rect x="46" y="10" width="8" height="80" fill={C_WOOD} stroke="#000" strokeWidth="1" />
            {/* Blade */}
            <path d="M54,20 Q85,10 85,35 Q85,60 54,50 Z" fill={mainColor} stroke="#000" strokeWidth="2" />
            <path d="M54,20 L54,50" stroke="#000" strokeWidth="1" />
          </g>
        );
      }
      if (item.name.includes('戈') || item.name.includes('戟')) {
        return (
          <g transform="rotate(15, 50, 50)">
             {/* Pole */}
            <rect x="46" y="5" width="6" height="90" fill={C_WOOD} stroke="#000" strokeWidth="1" />
            {/* Dagger-Axe Blade (Ge) */}
            <path d="M52,25 L90,20 L90,30 L52,35 Z" fill={mainColor} stroke="#000" strokeWidth="2" />
            {/* Rear Spike */}
            <path d="M46,28 L30,28 L30,24 L46,24 Z" fill={mainColor} stroke="#000" strokeWidth="2" />
            {/* Spear Tip (Ji) */}
            {item.name.includes('戟') && (
                 <path d="M44,5 L54,5 L49,-10 Z" transform="translate(0, 10)" fill={mainColor} stroke="#000" strokeWidth="1" />
            )}
            {/* Red Tassel */}
            <path d="M50,38 Q40,45 35,55" stroke="#b91c1c" strokeWidth="3" fill="none" />
          </g>
        );
      }
      if (item.name.includes('矛') || item.name.includes('枪')) {
        return (
          <g transform="rotate(45, 50, 50)">
            {/* Pole */}
            <rect x="47" y="5" width="6" height="90" fill={C_WOOD} stroke="#000" strokeWidth="1" />
            {/* Tip */}
            <path d="M44,25 L56,25 L50,5 Z" fill={mainColor} stroke="#000" strokeWidth="2" />
            <path d="M50,25 L50,5" stroke={lightColor} strokeWidth="1" />
            {/* Tassel */}
            <circle cx="50" cy="28" r="3" fill="#b91c1c" />
          </g>
        );
      }
      if (item.name.includes('弓') || item.name.includes('弩')) {
         if (item.name.includes('弩')) {
             return (
                 <g transform="rotate(-45, 50, 50)">
                     {/* Stock */}
                     <rect x="45" y="20" width="10" height="60" fill={C_WOOD} stroke="#000" strokeWidth="1" />
                     {/* Bow */}
                     <path d="M20,35 Q50,25 80,35" stroke={C_WOOD} strokeWidth="4" fill="none" />
                     {/* String */}
                     <line x1="20" y1="35" x2="80" y2="35" stroke="#ccc" strokeWidth="1" />
                     {/* Trigger */}
                     <rect x="45" y="70" width="10" height="5" fill={C_BRONZE} />
                 </g>
             )
         }
         return (
            <g transform="rotate(-45, 50, 50)">
                <path d="M20,20 Q50,10 80,20 L80,80 Q50,90 20,80 Z" stroke={C_WOOD} strokeWidth="3" fill="none" />
                <line x1="20" y1="20" x2="20" y2="80" stroke="#eee" strokeWidth="1" />
            </g>
         );
      }
      // Mace/Club
      return (
          <g transform="rotate(10, 50, 50)">
              <rect x="45" y="20" width="10" height="70" fill={C_WOOD} stroke="#000" strokeWidth="1" />
              <circle cx="50" cy="25" r="12" fill={C_IRON_DARK} stroke="#000" strokeWidth="2" />
              <path d="M50,13 L50,37 M38,25 L62,25" stroke="#000" strokeWidth="2" />
          </g>
      );
    }

    // 2. SHIELDS
    if (item.type === 'SHIELD') {
        if (item.name.includes('圆') || item.name.includes('藤')) {
            return (
                <g>
                    <circle cx="50" cy="50" r="35" fill={item.name.includes('藤') ? C_WOOD : C_LEATHER} stroke="#000" strokeWidth="3" />
                    <circle cx="50" cy="50" r="10" fill={C_BRONZE} stroke="#000" />
                    {/* Pattern */}
                    <circle cx="50" cy="50" r="25" fill="none" stroke="#000" strokeWidth="1" strokeDasharray="4 4" />
                </g>
            );
        }
        // Tower/Tall Shield
        return (
            <g>
                <path d="M30,20 L70,20 L70,80 Q50,95 30,80 Z" fill={C_IRON_DARK} stroke="#000" strokeWidth="2" />
                <path d="M30,20 L70,80 M70,20 L30,80" stroke="#000" strokeWidth="1" opacity="0.5" />
                <rect x="45" y="30" width="10" height="40" fill={C_BRONZE} stroke="#000" />
            </g>
        );
    }

    // 3. HELMETS
    if (item.type === 'HELMET') {
        if (item.name.includes('巾') || item.name.includes('布')) {
            return (
                <g>
                    <path d="M30,50 Q50,20 70,50 L70,60 L30,60 Z" fill={C_CLOTH} stroke="#000" strokeWidth="2" />
                    <path d="M25,55 L75,55" stroke="#000" strokeWidth="2" />
                </g>
            );
        }
        if (item.name.includes('弁') || item.name.includes('皮')) {
             return (
                <g>
                    <path d="M35,40 L65,40 L70,60 L30,60 Z" fill={C_LEATHER} stroke="#000" strokeWidth="2" />
                    <rect x="48" y="35" width="4" height="10" fill={C_BRONZE} />
                </g>
            );
        }
        // Metal Helmet
        return (
            <g>
                <path d="M25,60 Q50,10 75,60" fill={mainColor} stroke="#000" strokeWidth="2" />
                <rect x="48" y="15" width="4" height="20" fill="#b91c1c" />
                <path d="M30,60 L70,60 L70,75 L60,85 L40,85 L30,75 Z" fill={mainColor} stroke="#000" strokeWidth="2" />
            </g>
        );
    }

    // 4. ARMOR
    if (item.type === 'ARMOR') {
         if (item.name.includes('衣') || item.name.includes('袍')) {
             return (
                 <g>
                     <path d="M30,20 L70,20 L85,40 L80,85 L20,85 L15,40 Z" fill={C_CLOTH} stroke="#000" strokeWidth="2" />
                     <path d="M50,20 L50,85" stroke="#000" opacity="0.3" />
                     <path d="M30,20 L50,50 L70,20" stroke="#000" opacity="0.3" />
                 </g>
             );
         }
         // Lamellar/Scale
         return (
             <g>
                 <path d="M25,15 Q50,10 75,15 L85,30 L80,90 L20,90 L15,30 Z" fill={C_LEATHER} stroke="#000" strokeWidth="2" />
                 {/* Scales pattern */}
                 <defs>
                     <pattern id="scales" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                         <rect x="0" y="0" width="8" height="8" fill={mainColor} stroke="#000" strokeWidth="1" />
                     </pattern>
                 </defs>
                 <path d="M25,25 L75,25 L75,85 L25,85 Z" fill="url(#scales)" />
                 <rect x="40" y="15" width="20" height="10" fill={mainColor} stroke="#000" />
             </g>
         );
    }

    // Default Box
    return <rect x="20" y="20" width="60" height="60" fill={C_WOOD} stroke="#000" strokeWidth="2" />;
  };

  return (
    <div className={`relative ${className} select-none overflow-hidden`}>
       {/* Background Noise Texture */}
       {showBackground && <div className="absolute inset-0 bg-[#1c1917] opacity-100" />}
       {showBackground && <div className="absolute inset-0 opacity-10 bg-[url('/images/p6.png')]" />}
       
       <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
           {renderIcon()}
       </svg>
       
       {/* Inner Shadow/Highlight for "Card" feel */}
       {showBackground && <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />}
    </div>
  );
};
