
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
    h: number;
    terrain: string; 
    prop: string | null;
    color: string;
}

export const CombatView: React.FC<CombatViewProps> = ({ initialState, onCombatEnd }) => {
  const [state, setState] = useState(initialState);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const cameraRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  
  const [hoveredHex, setHoveredHex] = useState<{q:number, r:number} | null>(null);
  const [hoveredSkill, setHoveredSkill] = useState<Ability | null>(null);
  const [hoveredBagItem, setHoveredBagItem] = useState<Item | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unitLayerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  
  const [selectedAbility, setSelectedAbility] = useState<Ability | null>(null);

  const activeUnit = state.units.find(u => u.id === state.turnOrder[state.currentUnitIndex]);
  const isPlayerTurn = activeUnit?.team === 'PLAYER';
  const processingAIRef = useRef(false);

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

  useEffect(() => {
      const handleGlobalMove = (e: MouseEvent) => {
          setMousePos({ x: e.clientX, y: e.clientY });
      };
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF') {
              if (activeUnit) focusUnit(activeUnit);
          }
          if (e.code === 'Space' && isPlayerTurn && activeUnit) {
              setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: 0 } : u) }));
              nextTurn();
          }
      };
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('mousemove', handleGlobalMove);
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [activeUnit, isPlayerTurn]);

  const gridRange = 9;
  const hexes: HexTile[] = useMemo(() => {
    const arr: HexTile[] = [];
    const noise = (x: number, y: number) => Math.sin(x * 0.5) * Math.cos(y * 0.5);
    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = Math.max(-gridRange, -q - gridRange); r <= Math.min(gridRange, -q + gridRange); r++) {
         let h = 0, prop = null, color = '#222';
         const nVal = noise(q, r), randomVal = Math.random(); 
         switch(initialState.terrainType) {
             case 'FOREST':
                 color = '#1a2e1a'; if (randomVal > 0.8) prop = '🌲'; else if (randomVal > 0.7) prop = '🌳'; h = nVal > 0.4 ? 1 : 0; break;
             case 'MOUNTAIN':
                 color = '#2f2f2f'; if (randomVal > 0.85) prop = '🪨'; h = nVal > 0 ? 2 : (nVal > -0.5 ? 1 : 0); break;
             case 'SNOW':
                 color = '#cbd5e1'; if (randomVal > 0.9) prop = '❄️'; h = nVal > 0.6 ? 1 : 0; break;
             case 'DESERT':
                 color = '#9a7b4f'; if (randomVal > 0.9) prop = '🌵'; h = nVal > 0.7 ? 1 : 0; break;
             case 'SWAMP':
                 color = '#1b2621'; h = -1; break;
             default: color = '#3d4a2a'; if (randomVal > 0.9) prop = '🌳'; h = nVal > 0.6 ? 1 : 0;
         }
         if (h === 1) color = lightenColor(color, 10);
         if (h === 2) color = lightenColor(color, 20);
         arr.push({ q, r, h, terrain: initialState.terrainType, prop, color });
      }
    }
    return arr;
  }, [initialState.terrainType]);

  const addFloatingText = (text: string, q: number, r: number, color: string) => {
      setFloatingTexts(prev => [...prev, { id: Date.now() + Math.random(), text, x: q, y: r, color }]);
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
        if (isNewRound) { u.hasWaited = false; u.freeSwapUsed = false; }
        if (u.id === prev.turnOrder[nextIndex]) { return { ...u, currentAP: 9, fatigue: Math.max(0, u.fatigue - 15) }; }
        return u;
      });
      return { ...prev, units: newUnits, currentUnitIndex: nextIndex, round: nextRound };
    });
    processingAIRef.current = false;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 0) { isDraggingRef.current = true; dragStartRef.current = { x: e.clientX, y: e.clientY }; }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDraggingRef.current) {
          const dx = (e.clientX - dragStartRef.current.x) / zoom;
          const dy = (e.clientY - dragStartRef.current.y) / zoom;
          cameraRef.current.x += dx;
          cameraRef.current.y += dy;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2, centerY = rect.height / 2;
      const worldX = (e.clientX - rect.left - centerX) / zoom - cameraRef.current.x;
      const worldY = (e.clientY - rect.top - centerY) / zoom - cameraRef.current.y;
      const r = Math.round(worldY / 52), q = Math.round((worldX - r * 30) / 60);
      if (hoveredHex?.q !== q || hoveredHex?.r !== r) setHoveredHex({ q, r });
  };

  const handleMouseUp = () => { isDraggingRef.current = false; };

  const handleClick = (e: React.MouseEvent) => {
      if (isDraggingRef.current && (Math.abs(e.clientX - dragStartRef.current.x) > 5 || Math.abs(e.clientY - dragStartRef.current.y) > 5)) return;
      if (!hoveredHex) return;
      const targetUnit = state.units.find(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r);
      handleHexAction(hoveredHex, targetUnit);
  };

  const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (!hoveredHex || !activeUnit) return;
      const moveAbility = ABILITIES['MOVE'];
      const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
      const apCost = dist * moveAbility.apCost, fatCost = dist * moveAbility.fatCost;
      if (activeUnit.currentAP < apCost) { addToLog("行动点不足！"); return; }
      executeMove(hoveredHex, apCost, fatCost);
  };

  const handleHexAction = (targetHex: {q: number, r: number}, targetUnit?: CombatUnit) => {
      if (!isPlayerTurn || !activeUnit || !selectedAbility) return;
      const dist = getHexDistance(activeUnit.combatPos, targetHex);
      if (dist < selectedAbility.range[0] || dist > selectedAbility.range[1]) { addToLog("目标超出范围！"); return; }
      if (selectedAbility.type === 'ATTACK' && targetUnit) handleAttack(targetUnit, selectedAbility);
  };

  const executeMove = (hex: {q:number, r:number}, apCost: number, fatCost: number) => {
      if (!activeUnit) return;
      if (state.units.some(u => !u.isDead && u.combatPos.q === hex.q && u.combatPos.r === hex.r)) { addToLog("目标位置已被占据！"); return; }
      setState(prev => ({
          ...prev,
          units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: hex, currentAP: u.currentAP - apCost, fatigue: u.fatigue + fatCost } : u)
      }));
  };

  const handleAttack = (target: CombatUnit, ability: Ability) => {
    if (!activeUnit) return;
    if (activeUnit.currentAP < ability.apCost) { addToLog("行动点不足！"); return; }
    if (activeUnit.fatigue + ability.fatCost > activeUnit.maxFatigue) { addToLog("体力已耗尽！"); return; }
    const attackerHex = hexes.find(h => h.q === activeUnit.combatPos.q && h.r === activeUnit.combatPos.r);
    const targetHex = hexes.find(h => h.q === target.combatPos.q && h.r === target.combatPos.r);
    const heightHitMod = Math.max(0, ((attackerHex?.h || 0) - (targetHex?.h || 0)) * 10); 
    const baseHitChance = (activeUnit.stats.meleeSkill + (activeUnit.equipment.mainHand?.hitChanceMod || 0)) - target.stats.meleeDefense + 50 + heightHitMod;
    const shieldBonus = target.equipment.offHand?.type === 'SHIELD' ? (target.equipment.offHand?.defenseBonus || 0) : 0;
    const finalHitChance = Math.max(5, Math.min(95, baseHitChance - shieldBonus));
    if (Math.random() * 100 < finalHitChance) {
        const isHeadHit = Math.random() < (0.25 + (ability.id === 'CHOP' ? 0.25 : 0)); 
        const weapon = activeUnit.equipment.mainHand, baseDmg = weapon?.damage || [10, 20];
        let rawDmg = Math.floor(baseDmg[0] + Math.random() * (baseDmg[1] - baseDmg[0]));
        let targetArmorItem = isHeadHit ? target.equipment.helmet : target.equipment.armor;
        let currentArmor = targetArmorItem?.durability || 0;
        const armorDmgMult = ability.id === 'SPLIT_SHIELD' ? 20.0 : (weapon?.armorDmg || 1.0); 
        const dmgToArmor = Math.floor(rawDmg * armorDmgMult);
        const newArmor = Math.max(0, currentArmor - dmgToArmor);
        let hpDmg = (currentArmor > 0 && ability.id !== 'PUNCTURE') ? Math.floor(Math.max(0, (rawDmg * (weapon?.armorPen || 0.1)) - (currentArmor * 0.1))) : rawDmg;
        if (isHeadHit) hpDmg = Math.floor(hpDmg * 1.5);
        setState(prev => ({
            ...prev,
            units: prev.units.map(u => {
                if (u.id === target.id) {
                    let nextEquip = { ...u.equipment };
                    if (isHeadHit && nextEquip.helmet) nextEquip.helmet = { ...nextEquip.helmet, durability: newArmor };
                    else if (!isHeadHit && nextEquip.armor) nextEquip.armor = { ...nextEquip.armor, durability: newArmor };
                    if (currentArmor - newArmor > 0) addFloatingText(`🛡️-${currentArmor - newArmor}`, u.combatPos.q, u.combatPos.r, 'gray');
                    if (hpDmg > 0) setTimeout(() => addFloatingText(`🩸-${hpDmg}`, u.combatPos.q, u.combatPos.r, 'red'), 200);
                    return { ...u, hp: Math.max(0, u.hp - hpDmg), isDead: u.hp - hpDmg <= 0, equipment: nextEquip };
                }
                if (u.id === activeUnit.id) return { ...u, currentAP: u.currentAP - ability.apCost, fatigue: u.fatigue + ability.fatCost };
                return u;
            })
        }));
        addToLog(`${activeUnit.name} 使用 ${ability.name} 命中 ${target.name}！(-${hpDmg} HP)`);
    } else {
        setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: u.currentAP - ability.apCost, fatigue: u.fatigue + ability.fatCost } : u) }));
        addFloatingText("未命中", target.combatPos.q, target.combatPos.r, 'white');
        addToLog(`${activeUnit.name} 的 ${ability.name} 被躲开了！`);
    }
  };

  const handleWait = () => {
      if (!activeUnit) return;
      if (activeUnit.hasWaited) {
          setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: 0 } : u) }));
          nextTurn();
      } else {
          setState(prev => {
              const newOrder = [...prev.turnOrder];
              const [movedId] = newOrder.splice(prev.currentUnitIndex, 1);
              newOrder.push(movedId);
              return { ...prev, turnOrder: newOrder, units: prev.units.map(u => u.id === activeUnit.id ? { ...u, hasWaited: true } : u) };
          });
          addToLog(`${activeUnit.name} 选择等待。`);
      }
  };

  const handleSkillClick = (skill: Ability) => {
      if (!isPlayerTurn || !activeUnit) return;
      if (skill.targetType === 'SELF') {
          if (activeUnit.currentAP < skill.apCost) { addToLog("行动点不足！"); return; }
          setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit.id ? { ...u, currentAP: u.currentAP - skill.apCost, fatigue: u.fatigue + skill.fatCost } : u) }));
          addToLog(`${activeUnit.name} 使用了 ${skill.name}！`);
          addFloatingText(skill.name, activeUnit.combatPos.q, activeUnit.combatPos.r, 'cyan');
      } else if (skill.id === 'WAIT') handleWait();
      else setSelectedAbility(skill);
  };

  useEffect(() => {
    if (!activeUnit || isPlayerTurn || activeUnit.isDead || processingAIRef.current) return;
    const performAiStep = async () => {
        processingAIRef.current = true;
        await new Promise(r => setTimeout(r, 50));
        const targets = state.units.filter(u => u.team === 'PLAYER' && !u.isDead);
        if (targets.length === 0) { nextTurn(); return; }
        let target = targets[0], minDist = 999;
        targets.forEach(t => { const d = getHexDistance(activeUnit.combatPos, t.combatPos); if (d < minDist) { minDist = d; target = t; } });
        const dist = getHexDistance(activeUnit.combatPos, target.combatPos);
        const aiAbilities = getUnitAbilities(activeUnit), attackSkill = aiAbilities.find(a => a.type === 'ATTACK') || aiAbilities[0];
        if (dist <= attackSkill.range[1] && dist >= attackSkill.range[0] && activeUnit.currentAP >= attackSkill.apCost) {
            const dmg = Math.floor(Math.random() * 10) + 10;
            setState(prev => ({ ...prev, units: prev.units.map(u => u.id === target.id ? { ...u, hp: u.hp - dmg, isDead: u.hp - dmg <= 0 } : u.id === activeUnit.id ? { ...u, currentAP: u.currentAP - attackSkill.apCost } : u) }));
            addToLog(`${activeUnit.name} 攻击了 ${target.name}！(-${dmg} HP)`);
            addFloatingText(`🩸-${dmg}`, target.combatPos.q, target.combatPos.r, 'red');
            setTimeout(nextTurn, 500); 
        } else if (activeUnit.currentAP >= 2) { 
             const neighbors = getHexNeighbors(activeUnit.combatPos.q, activeUnit.combatPos.r);
             let bestHex = null, bestHexDist = minDist; 
             for (const n of neighbors) {
                 if (!hexes.some(h => h.q === n.q && h.r === n.r)) continue;
                 if (state.units.some(u => !u.isDead && u.combatPos.q === n.q && u.combatPos.r === n.r)) continue;
                 const d = getHexDistance(n, target.combatPos);
                 if (d < bestHexDist) { bestHexDist = d; bestHex = n; }
             }
             if (bestHex) {
                 setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit.id ? { ...u, combatPos: bestHex!, currentAP: u.currentAP - 2 } : u) }));
                 processingAIRef.current = false;
             } else nextTurn();
        } else nextTurn();
    };
    performAiStep();
  }, [state.currentUnitIndex, state.units]);

  useEffect(() => {
      if (!state.units.some(u => u.team === 'ENEMY' && !u.isDead)) setTimeout(() => onCombatEnd(true, state.units.filter(u => u.team === 'PLAYER' && !u.isDead)), 1000);
      else if (!state.units.some(u => u.team === 'PLAYER' && !u.isDead)) setTimeout(() => onCombatEnd(false, []), 1000);
  }, [state.units]);

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      let animationFrameId: number;
      const render = () => {
          const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
          if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
              canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
              ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
          } else {
              ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
          }
          ctx.save();
          ctx.translate(rect.width / 2, rect.height / 2); ctx.scale(zoom, zoom); ctx.translate(cameraRef.current.x, cameraRef.current.y);
          hexes.forEach(h => {
              const px = h.q * 60 + h.r * 30, py = h.r * 52, heightOffset = h.h * -15;
              ctx.fillStyle = (hoveredHex && h.q === hoveredHex.q && h.r === hoveredHex.r) ? lightenColor(h.color, 20) : h.color;
              if (h.h > 0) {
                  ctx.beginPath(); ctx.fillStyle = '#0f0f0f';
                  ctx.fillRect(px - 30, py - 30 + heightOffset, 60, 60 + Math.abs(heightOffset));
                  ctx.fillStyle = (hoveredHex && h.q === hoveredHex.q && h.r === hoveredHex.r) ? lightenColor(h.color, 20) : h.color;
              }
              ctx.fillRect(px - 30, py - 30 + heightOffset, 60, 60);
              if (isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK') {
                  const dist = getHexDistance(activeUnit.combatPos, h);
                  if (dist >= selectedAbility.range[0] && dist <= selectedAbility.range[1]) {
                      ctx.strokeStyle = 'rgba(220, 38, 38, 0.5)'; ctx.lineWidth = 2; ctx.strokeRect(px - 29, py - 29 + heightOffset, 58, 58);
                  }
              }
              if (h.prop) { ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(h.prop, px, py + heightOffset); }
          });
          ctx.restore();
          animationFrameId = requestAnimationFrame(render);
      };
      render();
      return () => cancelAnimationFrame(animationFrameId);
  }, [hexes, hoveredHex, activeUnit, selectedAbility, state.currentUnitIndex, zoom]);

  const unitRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
      let animId: number;
      const syncLoop = () => {
          if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const cx = rect.width / 2, cy = rect.height / 2;
              state.units.forEach(u => {
                  const el = unitRefs.current.get(u.id);
                  if (el && !u.isDead) {
                      const px = u.combatPos.q * 60 + u.combatPos.r * 30;
                      const py = u.combatPos.r * 52;
                      const h = hexes.find(hex => hex.q === u.combatPos.q && hex.r === u.combatPos.r)?.h || 0;
                      const worldX = px, worldY = py + h * -15;
                      const screenX = cx + (worldX + cameraRef.current.x) * zoom - 25;
                      const screenY = cy + (worldY + cameraRef.current.y) * zoom - 25;
                      el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) scale(${zoom})`;
                  }
              });
          }
          animId = requestAnimationFrame(syncLoop);
      };
      syncLoop();
      return () => cancelAnimationFrame(animId);
  }, [state.units, zoom, hexes]);

  return (
    <div className="relative w-full h-full bg-[#111] overflow-hidden flex flex-col font-serif select-none" onContextMenu={(e) => e.preventDefault()}>
      <div className="h-16 bg-black/80 border-b border-amber-900/30 flex items-center px-4 gap-2 overflow-x-auto z-20 shrink-0">
          {state.turnOrder.map((uid, i) => {
              const u = state.units.find(unit => unit.id === uid);
              if (!u || u.isDead) return null;
              const isCurrent = i === state.currentUnitIndex;
              return (
                  <div key={uid} onClick={() => focusUnit(u)} className={`relative flex-shrink-0 transition-all duration-300 cursor-pointer ${isCurrent ? 'scale-110 z-10' : 'opacity-60 scale-75 hover:opacity-100 hover:scale-90'}`}>
                      <Portrait character={u} size="sm" className={u.team === 'ENEMY' ? 'border-red-500' : 'border-blue-500'} />
                      {isCurrent && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] bg-amber-600 text-white px-1 rounded">行动</div>}
                      {u.hasWaited && <div className="absolute -top-1 -right-1 text-[8px] bg-blue-600 text-white px-1 rounded-full">⌛</div>}
                  </div>
              );
          })}
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0c0c0c] cursor-move" onWheel={(e) => { e.stopPropagation(); setZoom(p => Math.max(0.5, Math.min(2, p - Math.sign(e.deltaY)*0.1))); }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onClick={handleClick} onContextMenu={handleRightClick}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 pointer-events-none" />
          <div ref={unitLayerRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                {state.units.map(u => {
                    if (u.isDead) return null;
                    const isActive = activeUnit?.id === u.id;
                    const isTargetable = isPlayerTurn && activeUnit && selectedAbility?.type === 'ATTACK' && u.team === 'ENEMY' && getHexDistance(activeUnit.combatPos, u.combatPos) <= selectedAbility.range[1];
                    const hPct = u.equipment.helmet ? (u.equipment.helmet.durability / u.equipment.helmet.maxDurability) * 100 : 0;
                    const aPct = u.equipment.armor ? (u.equipment.armor.durability / u.equipment.armor.maxDurability) * 100 : 0;
                    return (
                        <div key={u.id} ref={el => { if(el) unitRefs.current.set(u.id, el); else unitRefs.current.delete(u.id); }} className={`absolute w-[50px] h-[50px] pointer-events-auto ${isActive ? 'z-30' : 'z-20'}`} style={{ top: 0, left: 0, willChange: 'transform' }} onClick={(e) => { e.stopPropagation(); if (isPlayerTurn && u.team === 'ENEMY') handleHexAction(u.combatPos, u); }}>
                            <div className={`w-full h-full relative transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]' : ''} ${isTargetable ? 'cursor-crosshair scale-105 drop-shadow-[0_0_10px_rgba(220,38,38,0.6)]' : ''}`}>
                                <Portrait character={u} size="sm" className={`${u.team === 'PLAYER' ? 'border-blue-400' : 'border-red-600'} shadow-lg`} />
                                <div className="absolute -top-4 left-0 w-full flex flex-col gap-[1px]">
                                    {u.equipment.helmet && <div className="h-1 bg-black w-full"><div className="h-full bg-slate-400" style={{ width: `${hPct}%` }} /></div>}
                                    {u.equipment.armor && <div className="h-1 bg-black w-full"><div className="h-full bg-slate-200" style={{ width: `${aPct}%` }} /></div>}
                                    <div className="h-1 bg-black w-full"><div className="h-full bg-red-600" style={{ width: `${(u.hp / u.maxHp) * 100}%` }} /></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {floatingTexts.map(ft => {
                    const px = ft.x * 60 + ft.y * 30, py = ft.y * 52;
                    return (
                        <div key={ft.id} className="absolute text-2xl font-bold font-mono pointer-events-none animate-bounce z-50 whitespace-nowrap" style={{ transform: `translate3d(calc(50% + ${(px + cameraRef.current.x) * zoom}px), calc(50% + ${(py + cameraRef.current.y) * zoom}px - 60px), 0)`, left: 0, top: 0, color: ft.color, textShadow: '0 2px 0 #000' }}>{ft.text}</div>
                    )
                })}
          </div>
          {hoveredHex && activeUnit && isPlayerTurn && (() => {
              const dist = getHexDistance(activeUnit.combatPos, hoveredHex);
              if (dist > 0 && selectedAbility?.id !== 'ATTACK') {
                  const apCost = dist * 2, fatCost = dist * 2;
                  const canMove = activeUnit.currentAP >= apCost;
                  if (!state.units.some(u => !u.isDead && u.combatPos.q === hoveredHex.q && u.combatPos.r === hoveredHex.r)) {
                      return (
                          <div className={`absolute pointer-events-none px-2 py-1 rounded border text-xs font-mono font-bold z-50 flex flex-col items-center gap-1 ${canMove ? 'bg-black/80 border-white/50 text-white' : 'bg-red-900/80 border-red-500 text-red-200'}`} style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}>
                              <span>行动: {apCost} AP</span>
                              <span className="text-[10px] font-normal text-blue-300">疲劳: {fatCost}</span>
                              {!canMove && <span className="text-[10px] uppercase text-red-500">AP不足</span>}
                          </div>
                      );
                  }
              }
              return null;
          })()}
      </div>
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
          <div className="flex-1 flex flex-col justify-center items-center h-full">
                <div className="flex gap-2 items-end mb-2">
                    {isPlayerTurn && activeUnit && availableAbilities.map(skill => (
                        <button key={skill.id} onClick={() => handleSkillClick(skill)} onMouseEnter={() => setHoveredSkill(skill)} onMouseLeave={() => setHoveredSkill(null)} disabled={activeUnit.currentAP < skill.apCost || (activeUnit.fatigue + skill.fatCost > activeUnit.maxFatigue)} className={`relative w-14 h-14 border-2 flex flex-col items-center justify-center rounded-sm transition-all group ${selectedAbility?.id === skill.id ? 'border-amber-400 bg-amber-900/40 -translate-y-2 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'border-slate-700 bg-slate-900 hover:border-slate-500'} ${activeUnit.currentAP < skill.apCost ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer'}`}>
                            <div className="text-xl mb-1">{skill.icon}</div>
                            <div className="absolute top-1 right-1 text-[8px] font-mono text-amber-200">{skill.apCost}</div>
                        </button>
                    ))}
                </div>
                {isPlayerTurn && activeUnit && (
                    <div className="flex gap-1 bg-black/40 p-1 rounded border border-white/5">
                        {Array.from({length: 4}).map((_, i) => {
                            const isLocked = i >= 2 && !activeUnit.perks.includes('bags_and_belts');
                            const item = activeUnit.bag[i], swapCost = (activeUnit.perks.includes('quick_hands') && !activeUnit.freeSwapUsed) ? 0 : 4;
                            if (isLocked) return <div key={i} className="w-8 h-8 bg-black/50 border border-slate-800 flex items-center justify-center text-[10px] text-red-900 select-none">🔒</div>;
                            return (
                                <div key={i} onMouseEnter={() => setHoveredBagItem(item)} onMouseLeave={() => setHoveredBagItem(null)} className={`w-8 h-8 border flex items-center justify-center relative transition-all ${item ? 'cursor-pointer hover:border-amber-500 bg-slate-800' : 'border-slate-800 bg-black/20'}`}>{item && <ItemIcon item={item} showBackground={false} className="p-0.5" />}</div>
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
                <button onClick={() => { setState(prev => ({ ...prev, units: prev.units.map(u => u.id === activeUnit?.id ? { ...u, currentAP: 0 } : u) })); nextTurn(); }} className="px-6 py-2 bg-amber-900/20 border border-amber-600 text-amber-500 hover:bg-amber-600 hover:text-white rounded transition-all font-bold text-sm shadow-lg w-full">结束回合 (Space)</button>
              ) : ( <div className="text-amber-700 font-bold animate-pulse text-sm text-center w-full">敌方行动...</div> )}
          </div>
      </div>
      {hoveredSkill && (
          <div className="fixed bottom-36 left-1/2 -translate-x-1/2 w-64 bg-black border border-amber-600 p-3 z-[100] shadow-2xl pointer-events-none">
                <div className="font-bold text-amber-500 text-sm mb-1 border-b border-amber-900/50 pb-1">{hoveredSkill.name}</div>
                <div className="text-xs text-slate-300 mb-2 italic">“{hoveredSkill.description}”</div>
                <div className="text-[10px] text-slate-500 grid grid-cols-2 gap-y-1">
                    <span className="text-amber-200">行动消耗: {hoveredSkill.apCost}</span>
                    <span className="text-blue-200">体力消耗: {hoveredSkill.fatCost}</span>
                    <span className="text-emerald-500 col-span-2">Shift/F 聚焦视角</span>
                </div>
          </div>
      )}
    </div>
  );
};

function lightenColor(color: string, percent: number) {
    const num = parseInt(color.replace("#",""), 16), amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt, B = (num >> 8 & 0x00FF) + amt, G = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
}
