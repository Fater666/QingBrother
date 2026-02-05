
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CombatState, CombatUnit, MoraleStatus, Ability, Item } from '../types.ts';
import { getHexNeighbors, getHexDistance, getUnitAbilities, ABILITIES } from '../constants.tsx';
import { Portrait } from './Portrait.tsx';
import { ItemIcon } from './ItemIcon.tsx';

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
    prop: string | null; // Prop decoration
    color: string;
}

export const CombatView: React.FC<CombatViewProps> = ({ initialState, onCombatEnd }) => {
  const [state, setState] = useState(initialState);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // Local state for tooltip
  
  // Camera & Interaction
  const cameraRef = useRef({ x: 0, y: 0 });
  const [hoveredHex, setHoveredHex] = useState<{q:number, r:number} | null>(null);
  const [hoveredSkill, setHoveredSkill] = useState<Ability | null>(null);
  const [hoveredBagItem, setHoveredBagItem] = useState<Item | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  
  const [zoom, setZoom] = useState(1);
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);

  const activeUnit = state.units.find(u => u.id === state.turnOrder[state.currentUnitIndex]);
  const isPlayerTurn = activeUnit?.team === 'PLAYER';
  const processingAIRef = useRef(false);

  // Filter out MOVE from abilities as right-click is primary
  const availableAbilities = useMemo(() => {
      if (activeUnit) return getUnitAbilities(activeUnit).filter(a => a.id !== 'MOVE');
      return [];
  }, [activeUnit?.id, activeUnit?.equipment]);

  useEffect(() => {
      if (isPlayerTurn && availableAbilities.length > 0 && !selectedAbility) {
          const defaultAttack = availableAbilities.find(a => a.type === 'ATTACK');
          setSelectedAbility(defaultAttack || null);
      }
  }, [isPlayerTurn, activeUnit?.id, availableAbilities]);

  // Track global mouse for tooltip
  useEffect(() => {
      const handleGlobalMove = (e: MouseEvent) => {
          setMousePos({ x: e.clientX, y: e.clientY });
      };
      window.addEventListener('mousemove', handleGlobalMove);
      return () => window.removeEventListener('mousemove', handleGlobalMove);
  }, []);

  // Map Generation (Memoized data structure, drawing happens in Canvas)
  const gridRange = 9;
  const hexes: HexTile[] = useMemo(() => {
    const arr: HexTile[] = [];
    const noise = (x: number, y: number) => Math.sin(x * 0.5) * Math.cos(y * 0.5);

    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = Math.max(-gridRange, -q - gridRange); r <= Math.min(gridRange, -q + gridRange); r++) {
         let h = 0;
         let prop = null;
         let color = '#222';
         
         const nVal = noise(q, r);
         const randomVal = Math.random(); 

         switch(initialState.terrainType) {
             case 'FOREST':
                 color = '#1a2e1a'; 
                 if (randomVal > 0.8) prop = '🌲';
                 else if (randomVal > 0.7) prop = '🌳';
                 else if (randomVal > 0.65) prop = '🪵';
                 else if (randomVal > 0.6) prop = '🍄';
                 h = nVal > 0.4 ? 1 : 0;
                 break;
             case 'MOUNTAIN':
                 color = '#2f2f2f';
                 if (randomVal > 0.85) prop = '🪨';
                 else if (randomVal > 0.8) prop = '⛰️';
                 h = nVal > 0 ? 2 : (nVal > -0.5 ? 1 : 0);
                 break;
             case 'SNOW':
                 color = '#cbd5e1'; 
                 if (randomVal > 0.9) prop = '❄️';
                 else if (randomVal > 0.85) prop = '🧊';
                 else if (randomVal > 0.8) prop = '☃️';
                 h = nVal > 0.6 ? 1 : 0;
                 break;
             case 'DESERT':
                 color = '#9a7b4f'; 
                 if (randomVal > 0.9) prop = '🌵';
                 else if (randomVal > 0.85) prop = '🌴';
                 else if (randomVal > 0.8) prop = '💀';
                 else if (randomVal < 0.05) prop = '🦂';
                 h = nVal > 0.7 ? 1 : 0;
                 break;
             case 'SWAMP':
                 color = '#1b2621'; 
                 if (randomVal > 0.85) prop = '🌿';
                 else if (randomVal > 0.8) prop = '🌾';
                 else if (randomVal < 0.05) prop = '🐊';
                 else if (randomVal < 0.1) prop = '🫧';
                 h = -1; 
                 break;
             case 'CITY':
             case 'RUINS':
                 color = '#4a4a4a'; 
                 if (randomVal > 0.9) prop = '🧱';
                 else if (randomVal > 0.85) prop = '🏚️';
                 else if (randomVal > 0.8) prop = '🏺';
                 else if (randomVal > 0.75) prop = '🪵';
                 h = nVal > 0.5 ? 1 : 0;
                 break;
             default: // PLAINS
                 color = '#3d4a2a'; 
                 if (randomVal > 0.9) prop = '🌳';
                 else if (randomVal > 0.85) prop = '🪨';
                 else if (randomVal > 0.8) prop = '🌻';
                 h = nVal > 0.6 ? 1 : 0;
         }
         
         if (h === 1) color = lightenColor(color, 10);
         if (h === 2) color = lightenColor(color, 20);

         arr.push({ q, r, h, terrain: initialState.terrainType, prop, color });
      }
    }
    return arr;
  }, [initialState.terrainType]);

  const addFloatingText = (text: string, q: number, r: number, color: string) => {
      // Calculate screen position for text based on current camera
      const px = q * 60 + r * 30;
      const py = r * 52;
      
      setFloatingTexts(prev => [...prev, { id: Date.now() + Math.random(), text, x: px, y: py, color }]);
      setTimeout(() => setFloatingTexts(prev => prev.slice(1)), 1500);
  };

  const focusUnit = (unit: CombatUnit) => {
      const px = unit.combatPos.q * 60 + unit.combatPos.r * 30;
      const py = unit.combatPos.r * 52;
      cameraRef.current = { x: -px, y: -py };
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
            u.freeSwapUsed = false;
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

  // --- Interaction Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 0) {
          isDraggingRef.current = true;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      // 1. Pan Camera
      if (isDraggingRef.current) {
          const dx = e.clientX - dragStartRef.current.x;
          const dy = e.clientY - dragStartRef.current.y;
          cameraRef.current.x += dx;
          cameraRef.current.y += dy;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      }

      // 2. Hover Logic (Screen -> Hex)
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width/2 - cameraRef.current.x;
      const mouseY = e.clientY - rect.top - rect.height/2 - cameraRef.current.y;

      const r = Math.round(mouseY / 52);
      const q = Math.round((mouseX - r * 30) / 60);
      
      if (hoveredHex?.q !== q || hoveredHex?.r !== r) {
          setHoveredHex({ q, r });
      }
  };

  const handleMouseUp = () => {
      isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
      if (isDraggingRef.current && (Math.abs(e.clientX - dragStartRef.current.x) > 5 || Math.abs(e.clientY - dragStartRef.current.y) > 5)) return; // Ignore drag release
      if (!hoveredHex) return;
      
      // Find unit at hex
      const targetUnit = state.units.find(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r);
      handleHexAction(hoveredHex, targetUnit);
  };

  const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (!hoveredHex || !activeUnit) return;
      
      const moveAbility = ABILITIES['MOVE'];
      const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
      const apCost = dist * moveAbility.apCost;
      const fatCost = dist * moveAbility.fatCost;

      if (activeUnit.currentAP < apCost) { addToLog("行动点不足！"); return; }
      executeMove(hoveredHex, apCost, fatCost);
  };

  // --- Game Action Logic ---

  const handleHexAction = (targetHex: {q: number, r: number}, targetUnit?: CombatUnit) => {
      if (!isPlayerTurn || !activeUnit || !selectedAbility) return;

      const dist = getHexDistance(activeUnit.combatPos, targetHex);
      
      if (dist < selectedAbility.range[0] || dist > selectedAbility.range[1]) {
          addToLog("目标超出范围！"); return;
      }

      if (selectedAbility.type === 'ATTACK') {
          if (targetUnit) handleAttack(targetUnit, selectedAbility);
      } 
  };

  const handleBagSwap = (bagIndex: number) => {
      if (!isPlayerTurn || !activeUnit) return;
      
      const bagItem = activeUnit.bag[bagIndex];
      if (!bagItem) return;

      const hasQuickHands = activeUnit.perks.includes('quick_hands');
      const apCost = (hasQuickHands && !activeUnit.freeSwapUsed) ? 0 : 4;

      if (activeUnit.currentAP < apCost) {
          addToLog("行动点不足以切换装备！");
          return;
      }

      const isShield = bagItem.type === 'SHIELD';
      const targetSlot = isShield ? 'offHand' : 'mainHand';
      const itemInHand = activeUnit.equipment[targetSlot];

      setState(prev => ({
          ...prev,
          units: prev.units.map(u => {
              if (u.id === activeUnit.id) {
                  const newBag = [...u.bag];
                  newBag[bagIndex] = itemInHand;
                  const newEquip = { ...u.equipment, [targetSlot]: bagItem };
                  
                  return {
                      ...u,
                      equipment: newEquip,
                      bag: newBag,
                      currentAP: u.currentAP - apCost,
                      freeSwapUsed: hasQuickHands ? true : u.freeSwapUsed
                  };
              }
              return u;
          })
      }));
      addToLog(`${activeUnit.name} 切换了装备。`);
  };

  const handleSkillClick = (skill: Ability) => {
      if (!isPlayerTurn || !activeUnit) return;
      if (skill.targetType === 'SELF') {
          handleSelfSkill(skill);
      } else if (skill.id === 'WAIT') {
          handleWait();
      } else {
          setSelectedAbility(skill);
      }
  };

  const executeMove = (hex: {q:number, r:number}, apCost: number, fatCost: number) => {
      if (!activeUnit) return;
      // Check collision
      if (state.units.some(u => !u.isDead && u.combatPos.q === hex.q && u.combatPos.r === hex.r)) {
          addToLog("目标位置已被占据！"); return;
      }

      setState(prev => ({
          ...prev,
          units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: hex, currentAP: u.currentAP - apCost, fatigue: u.fatigue + fatCost } : u)
      }));
  };

  const handleSelfSkill = (ability: Ability) => {
      if (!activeUnit) return;
      if (activeUnit.currentAP < ability.apCost) { addToLog("行动点不足！"); return; }
      
      setState(prev => ({
          ...prev,
          units: prev.units.map(u => u.id === activeUnit.id ? { 
              ...u, 
              currentAP: u.currentAP - ability.apCost, 
              fatigue: u.fatigue + ability.fatCost 
          } : u)
      }));
      addToLog(`${activeUnit.name} 使用了 ${ability.name}！`);
      addFloatingText(ability.name, activeUnit.combatPos.q, activeUnit.combatPos.r, 'cyan');
  };

  const handleAttack = (target: CombatUnit, ability: Ability) => {
    if (!activeUnit) return;
    if (activeUnit.currentAP < ability.apCost) { addToLog("行动点不足！"); return; }
    if (activeUnit.fatigue + ability.fatCost > activeUnit.maxFatigue) { addToLog("体力已耗尽！"); return; }

    const attackerHex = hexes.find(h => h.q === activeUnit.combatPos.q && h.r === activeUnit.combatPos.r);
    const targetHex = hexes.find(h => h.q === target.combatPos.q && h.r === target.combatPos.r);
    const heightDiff = (attackerHex?.h || 0) - (targetHex?.h || 0);
    const heightHitMod = Math.max(0, heightDiff * 10); 
    
    const baseHitChance = (activeUnit.stats.meleeSkill + (activeUnit.equipment.mainHand?.hitChanceMod || 0)) - target.stats.meleeDefense + 50 + heightHitMod;
    const shieldBonus = target.equipment.offHand?.type === 'SHIELD' ? (target.equipment.offHand?.defenseBonus || 0) : 0;
    const finalHitChance = Math.max(5, Math.min(95, baseHitChance - shieldBonus));

    const roll = Math.random() * 100;

    if (roll < finalHitChance) {
        const isHeadHit = Math.random() < (0.25 + (ability.id === 'CHOP' ? 0.25 : 0)); 
        const weapon = activeUnit.equipment.mainHand;
        const baseDmg = weapon?.damage || [10, 20];
        let rawDmg = Math.floor(baseDmg[0] + Math.random() * (baseDmg[1] - baseDmg[0]));
        
        const armorPen = ability.id === 'PUNCTURE' ? 1.0 : (weapon?.armorPen || 0);
        const armorDmgMult = ability.id === 'SPLIT_SHIELD' ? 20.0 : (weapon?.armorDmg || 1.0); 

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
            hpDmg = ability.id === 'PUNCTURE' ? rawDmg : rawDmg; 
            if (isHeadHit) hpDmg = Math.floor(hpDmg * 1.5);
        }

        setState(prev => {
            const nextUnits = prev.units.map(u => {
                if (u.id === target.id) {
                    const nextHp = Math.max(0, u.hp - hpDmg);
                    let nextEquip = { ...u.equipment };
                    if (isHeadHit && nextEquip.helmet) nextEquip.helmet = { ...nextEquip.helmet, durability: newArmor };
                    else if (!isHeadHit && nextEquip.armor) nextEquip.armor = { ...nextEquip.armor, durability: newArmor };

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

        addToLog(`${activeUnit.name} 使用 ${ability.name} 命中 ${target.name}！(生命:-${hpDmg})`);
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

  const handleWait = () => {
      if (!activeUnit) return;
      if (activeUnit.hasWaited) {
          setState(prev => ({
              ...prev,
              units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: 0 } : u)
          }));
          nextTurn();
      } else {
          setState(prev => {
              const newOrder = [...prev.turnOrder];
              const [movedId] = newOrder.splice(prev.currentUnitIndex, 1);
              newOrder.push(movedId);
              return {
                  ...prev,
                  turnOrder: newOrder,
                  units: prev.units.map(u => u.id === activeUnit.id ? { ...u, hasWaited: true } : u),
              };
          });
          addToLog(`${activeUnit.name} 选择等待。`);
      }
  };

  // --- Improved AI Logic ---
  useEffect(() => {
    if (!activeUnit || isPlayerTurn || activeUnit.isDead || processingAIRef.current) return;
    
    // AI Loop function
    const performAiStep = async () => {
        processingAIRef.current = true;
        
        await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for pacing

        // 1. Identify Target
        const targets = state.units.filter(u => u.team === 'PLAYER' && !u.isDead);
        if (targets.length === 0) {
            nextTurn();
            return;
        }
        
        // Find closest target
        let target = targets[0];
        let minDist = 999;
        targets.forEach(t => {
            const d = getHexDistance(activeUnit.combatPos, t.combatPos);
            if (d < minDist) { minDist = d; target = t; }
        });
        const dist = getHexDistance(activeUnit.combatPos, target.combatPos);

        // 2. Select Weapon/Skill
        const aiAbilities = getUnitAbilities(activeUnit);
        const attackSkill = aiAbilities.find(a => a.type === 'ATTACK') || aiAbilities[0];

        // 3. Action Logic
        // Can Attack?
        if (dist <= attackSkill.range[1] && dist >= attackSkill.range[0]) {
            if (activeUnit.currentAP >= attackSkill.apCost) {
                // Execute Attack
                const dmg = Math.floor(Math.random() * 10) + 10; // Simple AI damage
                
                setState(prev => ({
                     ...prev,
                     units: prev.units.map(u => u.id === target.id ? { ...u, hp: u.hp - dmg, isDead: u.hp - dmg <= 0 } : 
                                            u.id === activeUnit.id ? { ...u, currentAP: u.currentAP - attackSkill.apCost } : u)
                }));
                addToLog(`${activeUnit.name} 攻击了 ${target.name}！(HP -${dmg})`);
                addFloatingText(`🩸-${dmg}`, target.combatPos.q, target.combatPos.r, 'red');
                
                setTimeout(nextTurn, 500); 
                return;
            } else {
                nextTurn();
                return;
            }
        } 
        
        // Can Move?
        if (activeUnit.currentAP >= 2) { 
             const neighbors = getHexNeighbors(activeUnit.combatPos.q, activeUnit.combatPos.r);
             let bestHex = null;
             let bestHexDist = minDist; 
             
             // Find neighbor that reduces distance to target
             for (const n of neighbors) {
                 if (!hexes.some(h => h.q === n.q && h.r === n.r)) continue;
                 if (state.units.some(u => !u.isDead && u.combatPos.q === n.q && u.combatPos.r === n.r)) continue;
                 
                 const d = getHexDistance(n, target.combatPos);
                 if (d < bestHexDist) { 
                     bestHexDist = d; 
                     bestHex = n; 
                 }
             }

             if (bestHex) {
                 // Move one step
                 setState(prev => ({
                    ...prev,
                    units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: bestHex!, currentAP: u.currentAP - 2 } : u)
                 }));
                 // IMPORTANT: Reset processingAIRef false so loop continues in next useEffect cycle
                 processingAIRef.current = false;
             } else {
                 nextTurn();
             }
        } else {
            nextTurn();
        }
    };

    performAiStep();

  }, [state.currentUnitIndex, state.units]); // Re-run on unit update (e.g. after move)

  // Win/Loss Check
  useEffect(() => {
      const enemiesAlive = state.units.some(u => u.team === 'ENEMY' && !u.isDead);
      const playersAlive = state.units.some(u => u.team === 'PLAYER' && !u.isDead);
      if (!enemiesAlive) setTimeout(() => onCombatEnd(true, state.units.filter(u => u.team === 'PLAYER' && !u.isDead)), 1000);
      else if (!playersAlive) setTimeout(() => onCombatEnd(false, []), 1000);
  }, [state.units]);


  // --- Canvas Rendering Loop ---
  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let animationFrameId: number;

      const render = () => {
          // 1. Setup Canvas
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          
          if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
              canvas.width = rect.width * dpr;
              canvas.height = rect.height * dpr;
              ctx.scale(dpr, dpr);
          }

          const centerX = rect.width / 2 + cameraRef.current.x;
          const centerY = rect.height / 2 + cameraRef.current.y;

          ctx.clearRect(0, 0, rect.width, rect.height);
          
          // 2. Draw Hexes
          hexes.forEach(h => {
              const px = centerX + h.q * 60 + h.r * 30;
              const py = centerY + h.r * 52;
              const heightOffset = h.h * -15;
              
              // Culling
              if (px < -100 || px > rect.width + 100 || py < -100 || py > rect.height + 100) return;

              // Draw Base
              ctx.fillStyle = h.color;
              
              // Highlight Logic
              const isHovered = hoveredHex && h.q === hoveredHex.q && h.r === hoveredHex.r;
              let isTargetable = false;
              
              // Range Highlights
              if (isPlayerTurn && activeUnit) {
                  const dist = getHexDistance(activeUnit.combatPos, h);
                  if (selectedAbility?.type === 'ATTACK') {
                      if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
                          ctx.strokeStyle = 'rgba(220, 38, 38, 0.5)'; // Red outline for range
                          ctx.lineWidth = 2;
                          isTargetable = true;
                      }
                  } else {
                      // Move Highlight (simplified circle)
                      if (dist * 2 <= activeUnit.currentAP) {
                          // ctx.fillStyle = lightenColor(h.color, 5); // Subtle highlight
                      }
                  }
              }

              if (isHovered) ctx.fillStyle = lightenColor(h.color, 20);

              // 3D Block effect
              if (h.h > 0) {
                  ctx.beginPath();
                  ctx.fillStyle = '#0f0f0f'; // Dark side
                  ctx.fillRect(px - 30, py - 30 + heightOffset, 60, 60 + Math.abs(heightOffset));
                  
                  // Restore Top Color
                  ctx.fillStyle = isHovered ? lightenColor(h.color, 20) : h.color;
              }

              // Draw Top Face
              ctx.fillRect(px - 30, py - 30 + heightOffset, 60, 60);
              
              if (isTargetable) {
                  ctx.strokeRect(px - 29, py - 29 + heightOffset, 58, 58);
              }

              // Prop
              if (h.prop) {
                  ctx.font = '24px serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = '#fff';
                  ctx.fillText(h.prop, px, py + heightOffset);
              }
          });
          
          animationFrameId = requestAnimationFrame(render);
      };
      
      render();
      return () => cancelAnimationFrame(animationFrameId);
  }, [hexes, hoveredHex, activeUnit, selectedAbility, state.currentUnitIndex]);

  // Helper to sync Unit DOM positions
  const getUnitStyle = (u: CombatUnit) => {
      const px = u.combatPos.q * 60 + u.combatPos.r * 30;
      const py = u.combatPos.r * 52;
      const h = hexes.find(hex => hex.q === u.combatPos.q && hex.r === u.combatPos.r)?.h || 0;
      
      return {
          left: `calc(50% + ${px}px - 30px)`, 
          top: `calc(50% + ${py}px - 40px + ${h * -15}px)`
      };
  };
  
  // Container Ref for Pan
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Sync DOM container with Camera Ref via Animation Frame
  useEffect(() => {
      let animId: number;
      const syncLoop = () => {
          if (mapContainerRef.current) {
              mapContainerRef.current.style.transform = `translate(${cameraRef.current.x}px, ${cameraRef.current.y}px)`;
          }
          animId = requestAnimationFrame(syncLoop);
      };
      syncLoop();
      return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="relative w-full h-full bg-[#111] overflow-hidden flex flex-col font-serif select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* HUD: Turn Order */}
      <div className="h-16 bg-black/80 border-b border-amber-900/30 flex items-center px-4 gap-2 overflow-x-auto z-20 shrink-0">
          {state.turnOrder.map((uid, i) => {
              const u = state.units.find(unit => unit.id === uid);
              if (!u || u.isDead) return null;
              const isCurrent = i === state.currentUnitIndex;
              return (
                  <div 
                    key={uid} 
                    onClick={() => focusUnit(u)}
                    className={`relative flex-shrink-0 transition-all duration-300 cursor-pointer ${isCurrent ? 'scale-110 z-10' : 'opacity-60 scale-75 hover:opacity-100 hover:scale-90'}`}
                  >
                      <Portrait character={u} size="sm" className={u.team === 'ENEMY' ? 'border-red-500' : 'border-blue-500'} />
                      {isCurrent && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] bg-amber-600 text-white px-1 rounded">行动</div>}
                      {u.hasWaited && <div className="absolute -top-1 -right-1 text-[8px] bg-blue-600 text-white px-1 rounded-full">⌛</div>}
                  </div>
              );
          })}
      </div>

      {/* Main Battlefield */}
      <div 
        className="flex-1 relative overflow-hidden bg-[#0c0c0c] cursor-move" 
        onWheel={(e) => { e.stopPropagation(); setZoom(p => Math.max(0.5, Math.min(2, p - Math.sign(e.deltaY)*0.1))); }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onContextMenu={handleRightClick}
      >
          <div className="absolute inset-0 transition-transform duration-100 ease-out" style={{ transform: `scale(${zoom})` }}>
             {/* 1. Canvas Layer (Map) */}
             <canvas 
                ref={canvasRef}
                className="absolute inset-0 w-full h-full z-0 pointer-events-none"
             />

             {/* 2. DOM Layer (Units) - Transformed by Ref for performance sync */}
             <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                {/* Center Offset Wrapper to match Canvas center logic */}
                <div className="absolute top-1/2 left-1/2 w-0 h-0 overflow-visible">
                    {state.units.map(u => {
                        if (u.isDead) return null;
                        const isActive = activeUnit?.id === u.id;
                        const isTargetable = isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK' && u.team === 'ENEMY' &&
                                             getHexDistance(activeUnit.combatPos, u.combatPos) <= selectedAbility.range[1];

                        const headArmorPct = u.equipment.helmet ? (u.equipment.helmet.durability / u.equipment.helmet.maxDurability) * 100 : 0;
                        const bodyArmorPct = u.equipment.armor ? (u.equipment.armor.durability / u.equipment.armor.maxDurability) * 100 : 0;

                        return (
                            <div 
                                key={u.id}
                                className={`absolute w-[50px] h-[50px] transition-all duration-300 ease-out pointer-events-auto
                                    ${isActive ? 'scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] z-20' : 'z-10'}
                                    ${isTargetable ? 'cursor-crosshair scale-105 drop-shadow-[0_0_10px_rgba(220,38,38,0.6)]' : ''}
                                `}
                                style={getUnitStyle(u)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isPlayerTurn && u.team === 'ENEMY') handleHexAction(u.combatPos, u);
                                }}
                            >
                                <Portrait character={u} size="sm" className={`${u.team === 'PLAYER' ? 'border-blue-400' : 'border-red-600'} shadow-lg`} />
                                
                                <div className="absolute -top-4 left-0 w-full flex flex-col gap-[1px]">
                                    {u.equipment.helmet && <div className="h-1 bg-black w-full"><div className="h-full bg-slate-400" style={{ width: `${headArmorPct}%` }} /></div>}
                                    {u.equipment.armor && <div className="h-1 bg-black w-full"><div className="h-full bg-slate-200" style={{ width: `${bodyArmorPct}%` }} /></div>}
                                    <div className="h-1 bg-black w-full"><div className="h-full bg-red-600" style={{ width: `${(u.hp / u.maxHp) * 100}%` }} /></div>
                                </div>
                            </div>
                        );
                    })}

                    {floatingTexts.map(ft => (
                        <div key={ft.id} className="absolute text-2xl font-bold font-mono pointer-events-none animate-bounce z-50 whitespace-nowrap" style={{ left: ft.x, top: ft.y - 60, color: ft.color, textShadow: '0 2px 0 #000' }}>
                            {ft.text}
                        </div>
                    ))}
                </div>
             </div>
          </div>
          
          {/* AP Cost Tooltip Cursor Follower */}
          {hoveredHex && activeUnit && isPlayerTurn && (
              (() => {
                  const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
                  if (dist > 0 && selectedAbility?.id !== 'ATTACK') { // Don't show move cost if aiming attack
                      const moveAbility = ABILITIES['MOVE'];
                      const apCost = dist * moveAbility.apCost;
                      const fatCost = dist * moveAbility.fatCost;
                      const canMove = activeUnit.currentAP >= apCost && dist <= moveAbility.range[1];
                      
                      // Only show if empty tile
                      if (!state.units.some(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r)) {
                          return (
                              <div 
                                className={`absolute pointer-events-none px-2 py-1 rounded border text-xs font-mono font-bold z-50 flex flex-col items-center gap-1
                                    ${canMove ? 'bg-black/80 border-white/50 text-white' : 'bg-red-900/80 border-red-500 text-red-200'}
                                `}
                                style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}
                              >
                                  <span>行动: {apCost} AP</span>
                                  <span className="text-[10px] font-normal text-blue-300">疲劳: {fatCost}</span>
                                  {!canMove && <span className="text-[10px] uppercase text-red-500">{activeUnit.currentAP < apCost ? 'AP不足' : '距离过远'}</span>}
                              </div>
                          );
                      }
                  }
                  return null;
              })()
          )}
      </div>

      {/* Skill Bar & HUD */}
      <div className="h-32 bg-[#0a0a0a] border-t border-amber-900/30 flex items-center px-4 justify-between z-20 shrink-0 relative">
          
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
          
          {/* Middle: Skills + Bag */}
          <div className="flex-1 flex flex-col justify-center items-center h-full">
                {/* Active Skills */}
                <div className="flex gap-2 items-end mb-2">
                    {isPlayerTurn && activeUnit && availableAbilities.map(skill => {
                        const canAfford = activeUnit.currentAP >= skill.apCost && (activeUnit.fatigue + skill.fatCost <= activeUnit.maxFatigue);
                        const isActive = selectedAbility?.id === skill.id;
                        const isInstant = skill.targetType === 'SELF' || skill.id === 'WAIT';
                        
                        return (
                            <button
                                key={skill.id}
                                onClick={() => handleSkillClick(skill)}
                                onMouseEnter={() => setHoveredSkill(skill)}
                                onMouseLeave={() => setHoveredSkill(null)}
                                disabled={!canAfford}
                                className={`
                                    relative w-14 h-14 border-2 flex flex-col items-center justify-center rounded-sm transition-all group
                                    ${isActive ? 'border-amber-400 bg-amber-900/40 -translate-y-2 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}
                                    ${!canAfford ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'}
                                `}
                            >
                                <div className="text-xl mb-1">{skill.icon}</div>
                                <div className="absolute top-1 right-1 text-[8px] font-mono text-amber-200">{skill.apCost}</div>
                                {isInstant && <div className="absolute bottom-0 right-1 text-[8px] text-emerald-500">⚡</div>}
                            </button>
                        );
                    })}
                </div>

                {/* Bag Slots (Mini) */}
                {isPlayerTurn && activeUnit && (
                    <div className="flex gap-1 bg-black/40 p-1 rounded border border-white/5">
                        {Array.from({length: 4}).map((_, i) => {
                            const hasBagPerk = activeUnit.perks.includes('bags_and_belts');
                            const isLocked = i >= 2 && !hasBagPerk;
                            const item = activeUnit.bag[i];
                            const hasQuickHands = activeUnit.perks.includes('quick_hands');
                            const swapCost = (hasQuickHands && !activeUnit.freeSwapUsed) ? 0 : 4;
                            const canAffordSwap = activeUnit.currentAP >= swapCost;

                            if (isLocked) return <div key={i} className="w-8 h-8 bg-black/50 border border-slate-800 flex items-center justify-center text-[10px] text-red-900 select-none">🔒</div>;

                            return (
                                <div 
                                    key={i}
                                    onClick={() => item && canAffordSwap && handleBagSwap(i)}
                                    onMouseEnter={() => setHoveredBagItem(item)}
                                    onMouseLeave={() => setHoveredBagItem(null)}
                                    className={`w-8 h-8 border flex items-center justify-center relative transition-all
                                        ${item ? (canAffordSwap ? 'cursor-pointer hover:border-amber-500 bg-slate-800' : 'cursor-not-allowed opacity-50 bg-slate-900 border-red-900') : 'border-slate-800 bg-black/20'}
                                    `}
                                >
                                    {item && <ItemIcon item={item} showBackground={false} className="p-0.5" />}
                                    {item && <div className="absolute -bottom-2 -right-2 text-[8px] text-amber-500 bg-black px-1 rounded border border-slate-700">{swapCost}AP</div>}
                                </div>
                            );
                        })}
                    </div>
                )}
          </div>

          <div className="flex flex-col gap-2 w-48 items-end">
               <div className="flex flex-col-reverse w-full h-12 overflow-hidden text-[9px] text-slate-500 space-y-0.5 space-y-reverse text-right mb-1">
                  {state.combatLog.map((log, i) => <div key={i}>{log}</div>)}
              </div>
              {isPlayerTurn ? (
                <button onClick={() => { setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit?.id ? { ...u, currentAP: 0 } : u) })); nextTurn(); }} className="px-6 py-2 bg-amber-900/20 border border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-white rounded transition-all font-bold text-sm shadow-lg w-full">
                    结束回合 (Space)
                </button>
              ) : (
                <div className="text-amber-700 font-bold animate-pulse text-sm text-center w-full">敌方行动...</div>
              )}
          </div>
      </div>
      
      {/* Skill Tooltip */}
      {hoveredSkill && (
          <div className="fixed bottom-36 left-1/2 -translate-x-1/2 w-64 bg-black border border-amber-600 p-3 z-[100] shadow-2xl pointer-events-none">
                <div className="font-bold text-amber-500 text-sm mb-1 border-b border-amber-900/50 pb-1">{hoveredSkill.name}</div>
                <div className="text-xs text-slate-300 leading-relaxed mb-2 italic">“{hoveredSkill.description}”</div>
                <div className="text-[10px] text-slate-500 grid grid-cols-2 gap-y-1">
                    <span className="text-amber-200">行动消耗: {hoveredSkill.apCost}</span>
                    <span className="text-blue-200">体力消耗: {hoveredSkill.fatCost}</span>
                    <span>距离: {hoveredSkill.range[0]}-{hoveredSkill.range[1]}</span>
                    <span>类型: {hoveredSkill.type}</span>
                    {hoveredSkill.targetType === 'SELF' && <span className="text-emerald-500 col-span-2">点击图标直接释放</span>}
                    <span className="text-emerald-500 col-span-2">右键地块可移动</span>
                </div>
          </div>
      )}

      {/* Bag Item Tooltip */}
      {hoveredBagItem && (
          <div className="fixed bottom-36 left-1/2 ml-20 w-48 bg-black border border-slate-600 p-2 z-[100] shadow-xl pointer-events-none">
                <div className="font-bold text-white text-xs mb-1">{hoveredBagItem.name}</div>
                <div className="text-[10px] text-slate-400 italic">点击切换 (AP消耗取决于技能)</div>
          </div>
      )}
    </div>
  );
};

// Helper for color lightness
function lightenColor(color: string, percent: number) {
    const num = parseInt(color.replace("#",""), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    B = (num >> 8 & 0x00FF) + amt,
    G = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
}
