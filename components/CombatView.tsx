
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CombatState, CombatUnit, MoraleStatus, Ability } from '../types.ts';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES } from '../constants.tsx';
import { Portrait } from './Portrait.tsx';

interface CombatViewProps {
  initialState: CombatState;
  onCombatEnd: (victory: boolean, survivors: CombatUnit[]) => void;
}

interface FloatingText {
    id: number;
    text: string;
    x: number;
    y: number;
    color: string;
}

interface HexTile {
    q: number;
    r: number;
    h: number; // Height
    terrain: string; 
}

export const CombatView: React.FC<CombatViewProps> = ({ initialState, onCombatEnd }) => {
  const [state, setState] = useState(initialState);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [zoom, setZoom] = useState(1);
  const [hoveredHex, setHoveredHex] = useState<{q:number, r:number} | null>(null);
  
  // New: Active Ability Selection
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);

  const activeUnit = state.units.find(u => u.id === state.turnOrder[state.currentUnitIndex]);
  const isPlayerTurn = activeUnit?.team === 'PLAYER';
  const processingAIRef = useRef(false);

  const availableAbilities = useMemo(() => {
      if (activeUnit) return getUnitAbilities(activeUnit);
      return [];
  }, [activeUnit?.id]); // Re-calc when unit changes

  // Auto-select first ability on turn start
  useEffect(() => {
      if (isPlayerTurn && availableAbilities.length > 0) {
          setSelectedAbility(availableAbilities[0]);
      }
  }, [isPlayerTurn, activeUnit?.id]);


  // Map Generation with Terrain & Height
  const gridRange = 9;
  const hexes: HexTile[] = useMemo(() => {
    const arr = [];
    // Noise function approximation for height
    const noise = (x: number, y: number) => Math.sin(x * 0.5) * Math.cos(y * 0.5);

    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = Math.max(-gridRange, -q - gridRange); r <= Math.min(gridRange, -q + gridRange); r++) {
         // Generate height based on coordinates for cohesion (Hill shapes)
         let h = 0;
         const nVal = noise(q, r);
         if (initialState.terrainType === 'MOUNTAIN') h = nVal > 0 ? 2 : (nVal > -0.5 ? 1 : 0);
         else if (initialState.terrainType === 'FOREST') h = Math.random() > 0.7 ? 1 : 0;
         else h = nVal > 0.6 ? 1 : 0; // Plains have slight hills

         arr.push({ q, r, h, terrain: initialState.terrainType });
      }
    }
    return arr;
  }, [initialState.terrainType]);

  const addFloatingText = (text: string, q: number, r: number, color: string) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2 - 20;
      
      const x = centerX + q * 60 + r * 30;
      const y = centerY + r * 52;
      const id = Date.now() + Math.random();
      setFloatingTexts(prev => [...prev, { id, text, x, y, color }]);
      setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1500);
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = Math.sign(e.deltaY) * -0.1;
      setZoom(prev => Math.max(0.5, Math.min(2.0, prev + delta)));
  };

  const addToLog = (msg: string) => {
    setState(prev => ({ ...prev, combatLog: [msg, ...prev.combatLog].slice(0, 5) }));
  };

  const nextTurn = () => {
    setState(prev => {
      const nextIndex = (prev.currentUnitIndex + 1) % prev.turnOrder.length;
      const isNewRound = nextIndex === 0;
      const nextRound = isNewRound ? prev.round + 1 : prev.round;
      
      const newUnits = prev.units.map(u => {
        if (isNewRound) {
            u.hasWaited = false;
        }
        if (u.id === prev.turnOrder[nextIndex]) {
          return { ...u, currentAP: 9, fatigue: Math.max(0, u.fatigue - 15) };
        }
        return u;
      });

      return { ...prev, units: newUnits, currentUnitIndex: nextIndex, round: nextRound };
    });
    processingAIRef.current = false;
  };

  const handleRetreat = () => {
      if (!window.confirm("确定要撤退吗？撤退可能导致队员受伤，且无法获得战利品。")) return;
      const survivors = state.units.filter(u => u.team === 'PLAYER' && !u.isDead).map(u => {
           if (Math.random() < 0.3) u.hp = Math.max(1, Math.floor(u.hp * 0.8)); // Injury
           return u;
      });
      onCombatEnd(false, survivors);
  };

  // --- Combat Logic ---
  
  const handleAction = (targetHex: {q: number, r: number}, targetUnit?: CombatUnit) => {
      if (!activeUnit || !selectedAbility) return;

      // 1. Cost Check
      if (activeUnit.currentAP < selectedAbility.apCost) {
          addToLog("行动点不足！"); return;
      }
      if (activeUnit.fatigue + selectedAbility.fatCost > activeUnit.maxFatigue) {
          addToLog("体力已耗尽！"); return;
      }

      // 2. Range Check
      const dist = getHexDistance(activeUnit.combatPos, targetHex);
      if (dist < selectedAbility.range[0] || dist > selectedAbility.range[1]) {
          addToLog("目标超出范围！"); return;
      }

      // 3. Logic Branch
      if (selectedAbility.id === 'MOVE') {
          handleMove(targetHex);
      } else if (selectedAbility.type === 'ATTACK') {
          if (targetUnit) handleAttack(targetUnit, selectedAbility);
      } else if (selectedAbility.id === 'WAIT') {
          handleWait();
      } else if (selectedAbility.type === 'SKILL' && selectedAbility.targetType === 'SELF') {
          // Self Buffs like Shieldwall
          handleSelfSkill(selectedAbility);
      }
  };

  const handleSelfSkill = (ability: Ability) => {
      if (!activeUnit) return;
      // Consume costs
      setState(prev => ({
          ...prev,
          units: prev.units.map(u => u.id === activeUnit.id ? { 
              ...u, 
              currentAP: u.currentAP - ability.apCost, 
              fatigue: u.fatigue + ability.fatCost 
          } : u)
      }));
      addToLog(`${activeUnit.name} 使用了 ${ability.name}！`);
      // Visual feedback
      addFloatingText(ability.name, activeUnit.combatPos.q, activeUnit.combatPos.r, 'cyan');
  };

  const handleAttack = (target: CombatUnit, ability: Ability) => {
    if (!activeUnit) return;
    
    // --- Height Bonus ---
    const attackerHex = hexes.find(h => h.q === activeUnit.combatPos.q && h.r === activeUnit.combatPos.r);
    const targetHex = hexes.find(h => h.q === target.combatPos.q && h.r === target.combatPos.r);
    const heightDiff = (attackerHex?.h || 0) - (targetHex?.h || 0);
    
    // +10% Hit chance per height level advantage
    const heightHitMod = Math.max(0, heightDiff * 10); 
    
    const baseHitChance = (activeUnit.stats.meleeSkill + (activeUnit.equipment.mainHand?.hitChanceMod || 0)) - target.stats.meleeDefense + 50 + heightHitMod;
    const shieldBonus = target.equipment.offHand?.type === 'SHIELD' ? (target.equipment.offHand?.defenseBonus || 0) : 0;
    const finalHitChance = Math.max(5, Math.min(95, baseHitChance - shieldBonus));

    const roll = Math.random() * 100;

    if (roll < finalHitChance) {
        // HIT logic (Simplified from before but reusing equipment stats)
        const isHeadHit = Math.random() < (0.25 + (ability.id === 'CHOP' ? 0.25 : 0)); // Chop increases head hit
        const weapon = activeUnit.equipment.mainHand;
        const baseDmg = weapon?.damage || [10, 20];
        let rawDmg = Math.floor(baseDmg[0] + Math.random() * (baseDmg[1] - baseDmg[0]));
        
        // Puncture ignores armor logic
        const armorPen = ability.id === 'PUNCTURE' ? 1.0 : (weapon?.armorPen || 0);
        const armorDmgMult = ability.id === 'SPLIT_SHIELD' ? 20.0 : (weapon?.armorDmg || 1.0); // Split shield destroys armor

        let targetArmorItem = isHeadHit ? target.equipment.helmet : target.equipment.armor;
        let currentArmor = targetArmorItem?.durability || 0;
        
        const dmgToArmor = Math.floor(rawDmg * armorDmgMult);
        const newArmor = Math.max(0, currentArmor - dmgToArmor);
        const armorLost = currentArmor - newArmor;

        let hpDmg = 0;
        if (currentArmor > 0 && ability.id !== 'PUNCTURE') {
            const penetrationDmg = Math.max(0, (rawDmg * armorPen) - (currentArmor * 0.1));
            hpDmg = Math.floor(penetrationDmg);
        } else {
            hpDmg = ability.id === 'PUNCTURE' ? rawDmg : rawDmg; // Full damage
            if (isHeadHit) hpDmg = Math.floor(hpDmg * 1.5);
        }

        // Update State
        setState(prev => {
            const nextUnits = prev.units.map(u => {
                if (u.id === target.id) {
                    const nextHp = Math.max(0, u.hp - hpDmg);
                    let nextEquip = { ...u.equipment };
                    if (isHeadHit && nextEquip.helmet) nextEquip.helmet = { ...nextEquip.helmet, durability: newArmor };
                    else if (!isHeadHit && nextEquip.armor) nextEquip.armor = { ...nextEquip.armor, durability: newArmor };

                    // Visuals
                    if (armorLost > 0) addFloatingText(`🛡️-${armorLost}`, u.combatPos.q, u.combatPos.r, 'gray');
                    if (hpDmg > 0) setTimeout(() => addFloatingText(`🩸-${hpDmg}`, u.combatPos.q, u.combatPos.r, 'red'), 200);

                    return { ...u, hp: nextHp, isDead: nextHp <= 0, equipment: nextEquip };
                }
                if (u.id === activeUnit.id) {
                    return { ...u, currentAP: u.currentAP - ability.apCost, fatigue: u.fatigue + ability.fatCost };
                }
                return u;
            });
            return { ...prev, units: nextUnits };
        });

        addToLog(`${activeUnit.name} 使用 ${ability.name} 命中 ${target.name}！(HP:-${hpDmg})`);
    } else {
        setState(prev => ({
            ...prev,
            units: prev.units.map(u => u.id === activeUnit.id ? { 
                ...u, 
                currentAP: u.currentAP - ability.apCost, 
                fatigue: u.fatigue + ability.fatCost 
            } : u)
        }));
        addFloatingText("未命中", target.combatPos.q, target.combatPos.r, 'white');
        addToLog(`${activeUnit.name} 的 ${ability.name} 被躲开了！`);
    }
  };

  const handleMove = (hex: {q:number, r:number}) => {
      if (!activeUnit || !selectedAbility) return;
      const dist = getHexDistance(activeUnit.combatPos, hex);
      const cost = dist * selectedAbility.apCost; // Usually 2 per tile
      
      setState(prev => ({
          ...prev,
          units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: hex, currentAP: u.currentAP - cost, fatigue: u.fatigue + cost } : u)
      }));
  };

  const handleWait = () => {
      if (activeUnit) {
          setState(prev => ({
              ...prev,
              units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: 0, hasWaited: true } : u)
          }));
          nextTurn();
      }
  };

  // --- AI Logic (Simple) ---
  useEffect(() => {
    if (!activeUnit || isPlayerTurn || activeUnit.isDead || processingAIRef.current) return;
    processingAIRef.current = true; 

    const aiTimer = setTimeout(() => {
        // 1. Pick Ability (AI just attacks mostly)
        const aiAbilities = getUnitAbilities(activeUnit);
        const attackSkill = aiAbilities.find(a => a.type === 'ATTACK') || aiAbilities[0];
        
        // 2. Find Target
        const targets = state.units.filter(u => u.team === 'PLAYER' && !u.isDead);
        if (targets.length === 0) { nextTurn(); return; }
        
        // Simple AI: Closest
        let target = targets[0];
        let minDist = 999;
        targets.forEach(t => {
            const d = getHexDistance(activeUnit.combatPos, t.combatPos);
            if (d < minDist) { minDist = d; target = t; }
        });
        const dist = getHexDistance(activeUnit.combatPos, target.combatPos);

        // 3. Act
        // Set ability temporarily active for calculation
        // In real app, AI should evaluate best skill. Here we cheat and use generic params.
        
        if (dist <= attackSkill.range[1] && activeUnit.currentAP >= attackSkill.apCost) {
             // Hack: Directly call attack since we can't 'select' ability for AI in React state easily without effects
             // But we reused handleAttack logic which needs state selection? 
             // Refactor: handleAttack expects selectedAbility. 
             // We will mock it for AI calls or refactor handleAttack. 
             // For safety, we just manual update state for AI attack here to avoid complex state refactor.
             
             // ... AI Attack Logic (Simplified Copy of HandleAttack) ...
             const roll = Math.random() * 100;
             const hitChance = 60; // AI dumb
             if (roll < hitChance) {
                 const dmg = 15;
                 setState(prev => ({
                     ...prev,
                     units: prev.units.map(u => u.id === target.id ? { ...u, hp: u.hp - dmg, isDead: u.hp - dmg <= 0 } : 
                                            u.id === activeUnit.id ? { ...u, currentAP: u.currentAP - attackSkill.apCost } : u)
                 }));
                 addToLog(`${activeUnit.name} 攻击了 ${target.name}！(HP:-${dmg})`);
                 addFloatingText(`🩸-${dmg}`, target.combatPos.q, target.combatPos.r, 'red');
             } else {
                 setState(prev => ({
                     ...prev,
                     units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: u.currentAP - attackSkill.apCost } : u)
                 }));
                 addToLog(`${activeUnit.name} 攻击失误！`);
                 addFloatingText("未命中", target.combatPos.q, target.combatPos.r, 'white');
             }
             
             setTimeout(nextTurn, 800);
        } else {
             // Move
             const neighbors = getHexNeighbors(activeUnit.combatPos.q, activeUnit.combatPos.r);
             let bestHex = null;
             let bestHexDist = minDist;
             for (const n of neighbors) {
                 if (!hexes.some(h => h.q === n.q && h.r === n.r)) continue;
                 if (state.units.some(u => !u.isDead && u.combatPos.q === n.q && u.combatPos.r === n.r)) continue;
                 const d = getHexDistance(n, target.combatPos);
                 if (d < bestHexDist) { bestHexDist = d; bestHex = n; }
             }

             if (bestHex && activeUnit.currentAP >= 2) {
                 setState(prev => ({
                    ...prev,
                    units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: bestHex!, currentAP: u.currentAP - 2 } : u)
                 }));
                 setTimeout(nextTurn, 800);
             } else {
                 // Wait
                 setState(prev => ({
                    ...prev,
                    units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: 0 } : u)
                 }));
                 nextTurn();
             }
        }
    }, 600); 
    return () => clearTimeout(aiTimer);
  }, [state.currentUnitIndex, state.units]);

  // Win/Loss
  useEffect(() => {
      const enemiesAlive = state.units.some(u => u.team === 'ENEMY' && !u.isDead);
      const playersAlive = state.units.some(u => u.team === 'PLAYER' && !u.isDead);
      if (!enemiesAlive) setTimeout(() => onCombatEnd(true, state.units.filter(u => u.team === 'PLAYER' && !u.isDead)), 1000);
      else if (!playersAlive) setTimeout(() => onCombatEnd(false, []), 1000);
  }, [state.units]);


  return (
    <div className="relative w-full h-full bg-[#111] overflow-hidden flex flex-col font-serif">
      {/* HUD: Turn Order */}
      <div className="h-16 bg-black/80 border-b border-amber-900/30 flex items-center px-4 gap-2 overflow-x-auto z-20 shrink-0">
          {state.turnOrder.map((uid, i) => {
              const u = state.units.find(unit => unit.id === uid);
              if (!u || u.isDead) return null;
              const isCurrent = i === state.currentUnitIndex;
              return (
                  <div key={uid} className={`relative flex-shrink-0 transition-all duration-300 ${isCurrent ? 'scale-110 z-10' : 'opacity-60 scale-75'}`}>
                      <Portrait character={u} size="sm" className={u.team === 'ENEMY' ? 'border-red-500' : 'border-blue-500'} />
                      {isCurrent && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] bg-amber-600 text-white px-1 rounded">行动</div>}
                  </div>
              );
          })}
      </div>

      {/* Main Battlefield */}
      <div className="flex-1 relative overflow-hidden bg-[#0c0c0c] cursor-crosshair" onWheel={handleWheel}>
          <div className="absolute inset-0 transition-transform duration-100 ease-out" style={{ transform: `scale(${zoom})` }}>
             <div className="absolute inset-0">
                {hexes.map((h, i) => {
                    const px = h.q * 60 + h.r * 30;
                    const py = h.r * 52;
                    // Height visual offset: Higher tiles are drawn "higher" (negative Y)
                    const heightOffset = h.h * -15; 
                    
                    // Terrain Colors
                    let bgColor = 'rgba(255,255,255,0.02)';
                    if (h.h === 1) bgColor = '#2c2c2c'; // High ground
                    if (h.h === 2) bgColor = '#4a4a4a'; // Peak
                    
                    let apCost = null;
                    let isReachable = false;
                    const isOccupied = state.units.some(u => !u.isDead && u.combatPos.q === h.q && u.combatPos.r === h.r);
                    let isTargetInRange = false;

                    // Interaction Logic
                    if (isPlayerTurn && activeUnit && selectedAbility) {
                        const dist = getHexDistance(activeUnit.combatPos, h);
                        const inRange = dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1];
                        
                        if (selectedAbility.id === 'MOVE' && !isOccupied && hoveredHex?.q === h.q && hoveredHex?.r === h.r) {
                             apCost = dist * 2;
                             isReachable = activeUnit.currentAP >= apCost;
                        }

                        if (selectedAbility.type === 'ATTACK' && inRange) {
                            // Highlight valid targets in Red if ability is attack
                            isTargetInRange = true;
                        }
                    }

                    return (
                        <React.Fragment key={i}>
                            {/* Shadow/Side for 3D effect */}
                            {h.h > 0 && (
                                <div 
                                    className="absolute w-[60px] h-[60px]"
                                    style={{ 
                                        left: `calc(50% + ${px}px)`, 
                                        top: `calc(50% + ${py}px - 40px + ${heightOffset + 5}px)`, // Shifted down slightly
                                        marginLeft: '-30px', marginTop: '-30px',
                                        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', 
                                        backgroundColor: '#0a0a0a', // Dark side color
                                        zIndex: 0
                                    }}
                                />
                            )}
                            
                            {/* Top Face */}
                            <div 
                                onClick={() => isPlayerTurn && !isOccupied && selectedAbility?.id === 'MOVE' && handleAction(h)}
                                onMouseEnter={() => setHoveredHex(h)}
                                onMouseLeave={() => setHoveredHex(null)}
                                className={`absolute w-[60px] h-[60px] flex items-center justify-center transition-colors z-0
                                    ${hoveredHex?.q === h.q && hoveredHex?.r === h.r ? 'bg-white/10' : ''}
                                    ${isTargetInRange && isOccupied ? 'bg-red-900/20' : ''} 
                                `}
                                style={{ 
                                    left: `calc(50% + ${px}px)`, 
                                    top: `calc(50% + ${py}px - 40px + ${heightOffset}px)`,
                                    marginLeft: '-30px',
                                    marginTop: '-30px',
                                    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', 
                                    border: isTargetInRange ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.1)', 
                                    backgroundColor: isTargetInRange && isOccupied ? 'rgba(127, 29, 29, 0.4)' : bgColor,
                                }}
                            >
                                {apCost !== null && (
                                    <div className={`text-lg font-bold drop-shadow-md z-50 ${isReachable ? 'text-white' : 'text-red-600'}`} style={{transform: 'translateZ(10px)'}}>
                                        {apCost}
                                    </div>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}

                {/* Units */}
                {state.units.map(u => {
                    if (u.isDead) return null;
                    const tile = hexes.find(h => h.q === u.combatPos.q && h.r === u.combatPos.r);
                    const heightOffset = (tile?.h || 0) * -15;

                    const px = u.combatPos.q * 60 + u.combatPos.r * 30;
                    const py = u.combatPos.r * 52;
                    const isActive = activeUnit?.id === u.id;
                    const isEnemy = u.team === 'ENEMY';
                    
                    // Highlight logic
                    let isTargetable = false;
                    if (isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK' && isEnemy) {
                        const dist = getHexDistance(activeUnit.combatPos, u.combatPos);
                        if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
                            isTargetable = true;
                        }
                    }

                    const headArmorPct = u.equipment.helmet ? (u.equipment.helmet.durability / u.equipment.helmet.maxDurability) * 100 : 0;
                    const bodyArmorPct = u.equipment.armor ? (u.equipment.armor.durability / u.equipment.armor.maxDurability) * 100 : 0;

                    return (
                        <div 
                            key={u.id}
                            onClick={() => isPlayerTurn && isEnemy && handleAction(u.combatPos, u)}
                            onMouseEnter={() => setHoveredHex(u.combatPos)}
                            className={`absolute w-[50px] h-[50px] transition-all duration-300 ease-out z-10 
                                ${isActive ? 'scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]' : ''}
                                ${isTargetable ? 'cursor-crosshair scale-105 drop-shadow-[0_0_10px_rgba(220,38,38,0.6)]' : ''}
                            `}
                            style={{ 
                                left: `calc(50% + ${px + 5}px)`, 
                                top: `calc(50% + ${py + 5}px - 40px + ${heightOffset}px)`,
                                marginLeft: '-30px',
                                marginTop: '-30px'
                            }}
                        >
                            <Portrait character={u} size="sm" className={`${u.team === 'PLAYER' ? 'border-blue-400' : 'border-red-600'} shadow-lg`} />
                            
                            {/* Status Bars */}
                            <div className="absolute -top-4 left-0 w-full flex flex-col gap-[1px]">
                                {u.equipment.helmet && <div className="h-1 bg-black w-full"><div className="h-full bg-slate-400" style={{ width: `${headArmorPct}%` }} /></div>}
                                {u.equipment.armor && <div className="h-1 bg-black w-full"><div className="h-full bg-slate-200" style={{ width: `${bodyArmorPct}%` }} /></div>}
                                <div className="h-1 bg-black w-full"><div className="h-full bg-red-600" style={{ width: `${(u.hp / u.maxHp) * 100}%` }} /></div>
                            </div>

                            {/* Hit Chance Tooltip */}
                            {isTargetable && hoveredHex?.q === u.combatPos.q && hoveredHex?.r === u.combatPos.r && (
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded border border-white/20 whitespace-nowrap z-50">
                                    点击攻击
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Floating Texts - Z-Index 50 to stay on top */}
                {floatingTexts.map(ft => (
                    <div key={ft.id} className="absolute text-2xl font-bold font-mono pointer-events-none animate-bounce z-50" style={{ left: ft.x, top: ft.y - 40, color: ft.color, textShadow: '0 2px 0 #000' }}>
                        {ft.text}
                    </div>
                ))}
             </div>
          </div>
      </div>

      {/* Skill Bar (New Feature) */}
      <div className="h-32 bg-[#0a0a0a] border-t border-amber-900/30 flex items-center px-4 justify-between z-20 shrink-0 relative">
          
          {/* Active Unit Info */}
          <div className="flex items-center gap-4 w-48 shrink-0">
              {activeUnit && (
                  <>
                    <Portrait character={activeUnit} size="md" className="border-amber-500" />
                    <div>
                        <div className="text-lg font-bold text-amber-500 leading-none">{activeUnit.name}</div>
                        <div className="flex flex-col text-[10px] text-slate-400 font-mono mt-2 gap-1">
                            <div className="flex justify-between w-full"><span>行动点</span> <span className="text-white">{activeUnit.currentAP}</span></div>
                            <div className="flex justify-between w-full"><span>体力</span> <span className="text-white">{activeUnit.fatigue}/{activeUnit.maxFatigue}</span></div>
                            <div className="flex justify-between w-full"><span>生命</span> <span className="text-red-400">{activeUnit.hp}</span></div>
                        </div>
                    </div>
                  </>
              )}
          </div>
          
          {/* Skills Grid */}
          <div className="flex-1 flex justify-center items-center gap-3 h-full px-4 overflow-x-auto">
             {isPlayerTurn && activeUnit && availableAbilities.map(skill => {
                 const canAfford = activeUnit.currentAP >= skill.apCost && (activeUnit.fatigue + skill.fatCost <= activeUnit.maxFatigue);
                 const isActive = selectedAbility?.id === skill.id;
                 return (
                     <button
                        key={skill.id}
                        onClick={() => setSelectedAbility(skill)}
                        disabled={!canAfford}
                        className={`
                            relative w-16 h-16 border-2 flex flex-col items-center justify-center rounded-sm transition-all group
                            ${isActive ? 'border-amber-400 bg-amber-900/40 -translate-y-2 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}
                            ${!canAfford ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'}
                        `}
                     >
                        <div className="text-2xl mb-1">{skill.icon}</div>
                        <div className="absolute top-1 right-1 text-[8px] font-mono text-amber-200">{skill.apCost}</div>
                        
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 bg-black border border-amber-600 p-2 z-50 text-left pointer-events-none">
                            <div className="font-bold text-amber-500 text-sm mb-1">{skill.name}</div>
                            <div className="text-[10px] text-slate-300 leading-tight mb-2">{skill.description}</div>
                            <div className="text-[9px] text-slate-500 grid grid-cols-2">
                                <span>行动消耗: {skill.apCost}</span>
                                <span>体力消耗: {skill.fatCost}</span>
                                <span>距离: {skill.range[0]}-{skill.range[1]}</span>
                                <span>类型: {skill.type}</span>
                            </div>
                        </div>
                     </button>
                 );
             })}
          </div>

          {/* Turn End & Log */}
          <div className="flex flex-col gap-2 w-48 items-end">
               <div className="flex flex-col-reverse w-full h-12 overflow-hidden text-[9px] text-slate-500 space-y-0.5 space-y-reverse text-right mb-1">
                  {state.combatLog.map((log, i) => <div key={i}>{log}</div>)}
              </div>
              {isPlayerTurn ? (
                <button onClick={() => { setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit?.id ? { ...u, currentAP: 0 } : u) })); nextTurn(); }} className="px-6 py-2 bg-amber-900/20 border border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-white rounded transition-all font-bold text-sm shadow-lg w-full">
                    结束回合
                </button>
              ) : (
                <div className="text-amber-700 font-bold animate-pulse text-sm text-center w-full">敌方行动...</div>
              )}
          </div>
      </div>
    </div>
  );
};
