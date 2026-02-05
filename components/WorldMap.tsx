
import React, { useState, useEffect, useRef } from 'react';
import { WorldTile, Party, WorldEntity } from '../types.ts';
import { TERRAIN_DATA, MAP_SIZE, VIEWPORT_WIDTH } from '../constants.tsx';

interface WorldMapProps {
  tiles: WorldTile[];
  party: Party;
  entities: WorldEntity[];
  onSetTarget: (x: number, y: number) => void;
}

const VISION_RADIUS = 6;

export const WorldMap: React.FC<WorldMapProps> = ({ tiles, party, entities, onSetTarget }) => {
  const [viewportWidth, setViewportWidth] = useState(VIEWPORT_WIDTH); 
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Camera State
  const cameraRef = useRef({ x: party.x, y: party.y });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const requestRef = useRef<number>(0);

  // Sync camera with party when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
        cameraRef.current = { x: party.x, y: party.y };
    }
  }, [party.x, party.y]);

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = Math.sign(e.deltaY) * 2;
      setViewportWidth(prev => {
          const next = prev + delta;
          return Math.max(10, Math.min(MAP_SIZE, next)); 
      });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const tilesPerPixel = viewportWidth / canvas.clientWidth;
      
      cameraRef.current.x = Math.max(0, Math.min(MAP_SIZE, cameraRef.current.x - dx * tilesPerPixel));
      cameraRef.current.y = Math.max(0, Math.min(MAP_SIZE, cameraRef.current.y - dy * tilesPerPixel));
      dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
      isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const aspectRatio = canvas.clientWidth / canvas.clientHeight;
      const viewportHeight = viewportWidth / aspectRatio;
      const tileSize = canvas.clientWidth / viewportWidth;
      
      const worldX = (clickX / tileSize) + (cameraRef.current.x - viewportWidth / 2);
      const worldY = (clickY / tileSize) + (cameraRef.current.y - viewportHeight / 2);

      onSetTarget(Math.floor(worldX), Math.floor(worldY));
  };

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const aspectRatio = rect.width / rect.height;
      const viewportHeight = viewportWidth / aspectRatio;
      const tileSize = rect.width / viewportWidth;

      const startX = Math.floor(cameraRef.current.x - viewportWidth / 2);
      const startY = Math.floor(cameraRef.current.y - viewportHeight / 2);
      const endX = startX + viewportWidth + 1;
      const endY = startY + viewportHeight + 1;

      // Draw Tiles
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) continue;

          const tile = tiles[y * MAP_SIZE + x];
          if (!tile) continue; 
          
          const screenX = (x - startX) * tileSize - ((cameraRef.current.x - viewportWidth / 2) % 1) * tileSize;
          const screenY = (y - startY) * tileSize - ((cameraRef.current.y - viewportHeight / 2) % 1) * tileSize;
          
          // 1. Draw Terrain Base (Always draw, fog covers it)
          const terrain = TERRAIN_DATA[tile.type];
          ctx.fillStyle = terrain.color;
          ctx.fillRect(Math.floor(screenX), Math.floor(screenY), Math.ceil(tileSize), Math.ceil(tileSize));
          
          // 2. Draw Features
          if (tile.type === 'ROAD') {
              ctx.fillStyle = '#8f7e63';
              ctx.beginPath();
              ctx.arc(screenX + tileSize/2, screenY + tileSize/2, tileSize * 0.25, 0, Math.PI * 2);
              ctx.fill();
          } 
          else if (tile.type === 'CITY') {
              ctx.fillStyle = '#ca8a04'; 
              ctx.font = `${tileSize * 0.8}px serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('🏯', screenX + tileSize/2, screenY + tileSize/2);
          }
          else if (tile.type === 'MOUNTAIN') {
               ctx.font = `${tileSize * 0.9}px serif`;
               ctx.textAlign = 'center';
               ctx.textBaseline = 'middle';
               ctx.fillStyle = '#aaa';
               ctx.fillText('⛰️', screenX + tileSize/2, screenY + tileSize/2);
          }
          else if (tile.type === 'FOREST') {
               ctx.font = `${tileSize * 0.7}px serif`;
               ctx.textAlign = 'center';
               ctx.textBaseline = 'middle';
               ctx.fillText('🌲', screenX + tileSize/2, screenY + tileSize/2);
          }

          // 3. Fog of War Logic
          const dist = Math.sqrt(Math.pow(x - party.x, 2) + Math.pow(y - party.y, 2));
          if (!tile.explored) {
               // Unexplored: Full Black
               ctx.fillStyle = '#000000';
               ctx.fillRect(Math.floor(screenX)-1, Math.floor(screenY)-1, Math.ceil(tileSize)+2, Math.ceil(tileSize)+2);
          } else if (dist > VISION_RADIUS) {
               // Explored but not visible: Dark shroud
               ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
               ctx.fillRect(Math.floor(screenX), Math.floor(screenY), Math.ceil(tileSize), Math.ceil(tileSize));
          } else {
               // Visible: Light grid
               ctx.strokeStyle = 'rgba(0,0,0,0.1)';
               ctx.lineWidth = 1;
               ctx.strokeRect(Math.floor(screenX), Math.floor(screenY), Math.ceil(tileSize), Math.ceil(tileSize));
          }
        }
      }

      const toScreen = (wx: number, wy: number) => ({
          x: (wx - (cameraRef.current.x - viewportWidth / 2)) * tileSize,
          y: (wy - (cameraRef.current.y - viewportHeight / 2)) * tileSize
      });

      // Entities (Only visible ones passed from parent)
      entities.forEach(ent => {
          const pos = toScreen(ent.x, ent.y);
          if (pos.x < -tileSize || pos.x > rect.width || pos.y < -tileSize || pos.y > rect.height) return;

          ctx.fillStyle = ent.faction === 'HOSTILE' ? '#7f1d1d' : '#334155';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, tileSize * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.font = `${tileSize * 0.5}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ent.type === 'NOMAD' ? '🐎' : ent.type === 'TRADER' ? '⚖️' : ent.type === 'ARMY' ? '🛡️' : '⚔️', pos.x, pos.y + tileSize * 0.05);
          
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(pos.x - tileSize*0.6, pos.y + tileSize*0.4, tileSize * 1.2, tileSize*0.25);
          
          ctx.fillStyle = ent.faction === 'HOSTILE' ? '#ef4444' : '#fbbf24'; 
          ctx.font = `bold ${tileSize * 0.15}px sans-serif`;
          ctx.fillText(ent.name, pos.x, pos.y + tileSize * 0.55);
      });

      // Player Army
      const pPos = toScreen(party.x, party.y);
      if (pPos.x > -tileSize && pPos.x < rect.width + tileSize && pPos.y > -tileSize && pPos.y < rect.height + tileSize) {
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
          
          ctx.fillStyle = '#b45309'; 
          ctx.beginPath();
          ctx.arc(pPos.x, pPos.y, tileSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = '#fcd34d'; 
          ctx.lineWidth = 2;
          ctx.stroke();
          
          ctx.shadowBlur = 0;

          ctx.fillStyle = '#fff'; 
          ctx.font = `bold ${tileSize * 0.5}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('伍', pPos.x, pPos.y);
      }

      // Target Marker
      if (party.targetX !== null && party.targetY !== null) {
          const tPos = toScreen(party.targetX, party.targetY);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.lineWidth = 3;
          const size = tileSize * 0.2;
          
          ctx.beginPath();
          ctx.moveTo(tPos.x - size, tPos.y - size);
          ctx.lineTo(tPos.x + size, tPos.y + size);
          ctx.moveTo(tPos.x + size, tPos.y - size);
          ctx.lineTo(tPos.x - size, tPos.y + size);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.setLineDash([5, 5]);
          ctx.moveTo(pPos.x, pPos.y);
          ctx.lineTo(tPos.x, tPos.y);
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.stroke();
          ctx.setLineDash([]);
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [tiles, party, entities, viewportWidth]);

  return (
    <div className="relative w-full h-full bg-[#111] overflow-hidden flex items-center justify-center select-none">
      <div className="absolute inset-0 bg-[#0e0e0e]" />
      <div className="relative shadow-2xl overflow-hidden bg-[#0a0a0a] border border-white/10" style={{ width: '90vw', height: '80vh' }}>
          <canvas 
            ref={canvasRef}
            className="w-full h-full cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleClick}
            onWheel={handleWheel}
          />
      </div>
      <div className="absolute bottom-10 right-10 z-50 text-right pointer-events-none">
        <div className="text-4xl font-bold text-amber-600 font-serif tracking-tighter drop-shadow-lg">
            第 {Math.floor(party.day)} 天
        </div>
      </div>
      {isDraggingRef.current && (
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-white/10 text-6xl">⚓</div>
      )}
    </div>
  );
};
