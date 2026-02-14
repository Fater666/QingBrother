
import React, { useState, useEffect, useRef } from 'react';
import { ContactModal } from './ContactModal';

interface MainMenuProps {
  onNewGame: () => void;
  onLoadGame: () => void;
  hasSaveData: boolean;
}

// 粒子系统 - 模拟战火余烬
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const QUOTES = [
  '"秦王扫六合，虎视何雄哉！"',
  '"风萧萧兮易水寒，壮士一去兮不复还。"',
  '"国虽大，好战必亡；天下虽安，忘战必危。"',
  '"兵者，国之大事，死生之地，存亡之道，不可不察也。"',
  '"善用兵者，役不再籍，粮不三载。"',
];

export const MainMenu: React.FC<MainMenuProps> = ({ onNewGame, onLoadGame, hasSaveData }) => {
  const [showContent, setShowContent] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [compactFontScale, setCompactFontScale] = useState(1);
  const [quoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Ember[]>([]);
  const animRef = useRef<number>(0);

  // 淡入动画序列
  useEffect(() => {
    const t1 = setTimeout(() => setShowContent(true), 300);
    const t2 = setTimeout(() => setShowQuote(true), 1200);
    const t3 = setTimeout(() => setShowButtons(true), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // 手机横屏统一判定 + DPR 归一化缩放
  useEffect(() => {
    const detect = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const landscape = vw > vh;
      const compact = coarse && landscape;
      const dpr = window.devicePixelRatio || 1;
      const BASELINE_DPR = 1.7;
      const shortest = Math.min(vw, vh);
      const scale = Math.max(0.72, Math.min(1.32, (shortest / 440) * (BASELINE_DPR / dpr)));

      setIsMobileLayout(coarse || vw < 1024);
      setIsCompactLandscape(compact);
      setCompactFontScale(scale);
    };

    detect();
    window.addEventListener('resize', detect);
    window.visualViewport?.addEventListener('resize', detect);
    return () => {
      window.removeEventListener('resize', detect);
      window.visualViewport?.removeEventListener('resize', detect);
    };
  }, []);

  // 余烬粒子效果
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnEmber = () => {
      embersRef.current.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(0.3 + Math.random() * 0.7),
        life: 1,
        maxLife: 3 + Math.random() * 4,
        size: 1 + Math.random() * 2,
      });
    };

    let lastSpawn = 0;
    const animate = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 每隔一段时间生成新粒子
      if (time - lastSpawn > 120) {
        spawnEmber();
        lastSpawn = time;
      }

      embersRef.current = embersRef.current.filter(e => {
        e.x += e.vx;
        e.y += e.vy;
        e.life -= 0.016;
        
        const alpha = Math.max(0, e.life / e.maxLife);
        const r = 200 + Math.floor(Math.random() * 55);
        const g = 120 + Math.floor(Math.random() * 60);
        const b = 30;
        
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.6})`;
        ctx.fill();
        
        // 光晕
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * alpha * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.1})`;
        ctx.fill();
        
        return e.life > 0;
      });

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const compactButtonWrapStyle = isCompactLandscape
    ? { width: `min(100%, ${Math.max(240, Math.round(360 * compactFontScale))}px)` }
    : undefined;

  const compactTitleStyle = isCompactLandscape
    ? { fontSize: `clamp(2.6rem, ${7.1 * compactFontScale}vw, 4rem)` }
    : undefined;

  const compactSubTitleStyle = isCompactLandscape
    ? { fontSize: `clamp(1.15rem, ${3.2 * compactFontScale}vw, 1.9rem)` }
    : undefined;

  const compactQuoteStyle = isCompactLandscape
    ? { fontSize: `clamp(0.64rem, ${1.45 * compactFontScale}vw, 0.8rem)` }
    : undefined;

  const compactRootStyle = isCompactLandscape
    ? {
        paddingLeft: `${Math.max(8, Math.round(14 * compactFontScale))}px`,
        paddingRight: `${Math.max(8, Math.round(14 * compactFontScale))}px`,
        paddingTop: `${Math.max(8, Math.round(10 * compactFontScale))}px`,
        paddingBottom: `${Math.max(8, Math.round(10 * compactFontScale))}px`,
      }
    : undefined;

  const compactPrimaryButtonTextStyle = isCompactLandscape
    ? { fontSize: `clamp(0.98rem, ${2.2 * compactFontScale}vw, 1.2rem)` }
    : undefined;

  const compactSecondaryButtonTextStyle = isCompactLandscape
    ? { fontSize: `clamp(0.84rem, ${1.8 * compactFontScale}vw, 1rem)` }
    : undefined;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none" style={{ fontFamily: "'Noto Serif SC', serif" }}>
      {/* 粒子画布 */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* 背景暗纹 - 竹简纹理 */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" 
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(139,69,19,0.5) 3px, rgba(139,69,19,0.5) 4px)' }} 
      />

      {/* 顶部淡入渐变 */}
      <div className={`absolute top-0 left-0 right-0 z-10 ${isCompactLandscape ? 'h-20' : 'h-40'}`}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
      />

      {/* 底部淡出渐变 */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 ${isCompactLandscape ? 'h-28' : 'h-60'}`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}
      />

      {/* 版本信息：固定左下角，不参与布局、不挡按钮 */}
      <div className={`fixed z-10 flex flex-col items-start gap-1 transition-all duration-[2000ms] delay-[2500ms] ${isCompactLandscape ? 'bottom-2 left-2' : 'bottom-4 left-4'} ${showButtons ? 'opacity-40' : 'opacity-0'} pointer-events-none`}>
        <p className={`${isCompactLandscape ? 'text-[9px] tracking-[0.22em]' : 'text-[10px] tracking-[0.3em]'} text-slate-600 uppercase`}>Version 1.0.0 — 战国项目组</p>
      </div>

      {/* 主内容区 */}
      <div
        className={`relative z-20 flex flex-col items-center justify-center h-full min-h-0 px-4 ${
          isCompactLandscape ? 'justify-center py-1 sm:px-5' : 'sm:px-8'
        } ${isMobileLayout && !isCompactLandscape ? 'py-6' : ''}`}
        style={compactRootStyle}
      >
        <div className={`w-full max-w-5xl min-h-0 flex flex-col items-center ${isCompactLandscape ? 'max-h-full justify-center overflow-hidden' : 'h-full'}`}>
          {/* 装饰性上边线 */}
          <div className={`transition-all duration-[2000ms] ease-out ${isCompactLandscape ? 'hidden' : ''} ${showContent ? 'opacity-100 w-52 sm:w-64' : 'opacity-0 w-0'}`}>
            <div className={`${isCompactLandscape ? 'mb-4' : 'mb-8'} h-px bg-gradient-to-r from-transparent via-amber-700/60 to-transparent`} />
          </div>

          {/* 游戏副标题 */}
          <div className={`transition-all duration-[1500ms] ease-out ${showContent ? 'opacity-70 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            <p
              className={`${isCompactLandscape ? 'mb-1.5 text-[12px] tracking-[0.66em]' : 'mb-4 text-sm tracking-[1em]'} text-amber-600/70 uppercase`}
            >
              Warring States
            </p>
          </div>

          {/* 游戏标题 */}
          <div className={`transition-all duration-[2000ms] ease-out ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}>
            <h1
              className={`${isCompactLandscape ? 'mb-0.5 tracking-[0.12em]' : 'mb-2 text-6xl md:text-7xl tracking-[0.15em]'} font-bold text-transparent bg-clip-text leading-tight text-center`}
              style={{
                ...compactTitleStyle,
                backgroundImage: 'linear-gradient(180deg, #d4a44a 0%, #b8860b 40%, #8b6508 100%)',
                textShadow: '0 0 80px rgba(212,164,74,0.3)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              战国
            </h1>
            <h2
              className={`${isCompactLandscape ? 'mt-0.5 tracking-[0.24em]' : 'mt-2 text-2xl md:text-3xl tracking-[0.5em]'} text-amber-600/90 text-center font-light`}
              style={{ ...compactSubTitleStyle, textShadow: '0 0 40px rgba(180,130,50,0.2)' }}
            >
              与伍同行
            </h2>
          </div>

          {/* 装饰性分隔线 */}
          <div className={`flex items-center gap-4 transition-all duration-[2000ms] ease-out ${isCompactLandscape ? 'hidden' : 'my-8 w-80'} ${showContent ? 'opacity-100' : 'opacity-0 w-0'}`}>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-800/40" />
            <div className="w-2 h-2 rotate-45 border border-amber-700/50" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-800/40" />
          </div>

          {/* 古诗引言 */}
          <div className={`transition-all duration-[2000ms] ease-out ${isCompactLandscape ? 'hidden' : 'mb-12'} ${showQuote ? 'opacity-60 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <p className={`${isCompactLandscape ? 'max-w-sm tracking-[0.16em]' : 'max-w-md text-sm tracking-widest'} text-amber-500/50 italic text-center`} style={compactQuoteStyle}>
              {QUOTES[quoteIndex]}
            </p>
          </div>

          {/* 菜单按钮区 */}
          <div className={`w-full flex items-center justify-center ${isCompactLandscape ? 'mt-2 pb-1' : ''}`}>
            <div className={`flex flex-col items-center gap-3 sm:gap-4 transition-all duration-[1500ms] ease-out ${isCompactLandscape ? 'gap-2.5' : ''} ${showButtons ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={compactButtonWrapStyle}>
              {/* 新战役 */}
              <button
                onClick={onNewGame}
                className={`group relative ${isCompactLandscape ? 'w-full py-2.5' : 'w-72 py-4'} text-center overflow-hidden`}
                style={isCompactLandscape ? { paddingTop: `${Math.max(7, Math.round(11 * compactFontScale))}px`, paddingBottom: `${Math.max(7, Math.round(11 * compactFontScale))}px` } : undefined}
              >
                <div className="absolute inset-0 border border-amber-700/40 group-hover:border-amber-500/80 transition-all duration-500" />
                <div className="absolute inset-0 bg-amber-900/0 group-hover:bg-amber-900/20 transition-all duration-500" />
                <div className="absolute inset-y-0 left-0 w-0 group-hover:w-full bg-gradient-to-r from-amber-800/10 to-transparent transition-all duration-700" />
                <span
                  className={`${isCompactLandscape ? 'tracking-[0.25em]' : 'text-lg tracking-[0.4em]'} relative text-amber-500 group-hover:text-amber-300 font-bold transition-colors duration-300`}
                  style={compactPrimaryButtonTextStyle}
                >
                  新 战 役
                </span>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 group-hover:w-3/4 h-px bg-gradient-to-r from-transparent via-amber-500 to-transparent transition-all duration-500" />
              </button>

              {/* 续读简牍 (读档) */}
              <button
                onClick={hasSaveData ? onLoadGame : undefined}
                disabled={!hasSaveData}
                className={`group relative ${isCompactLandscape ? 'w-full py-2' : 'w-72 py-3'} text-center overflow-hidden ${!hasSaveData ? 'cursor-not-allowed' : ''}`}
              >
                <div className={`absolute inset-0 border transition-all duration-500 ${hasSaveData ? 'border-amber-900/30 group-hover:border-amber-600/60' : 'border-slate-800/30'}`} />
                <div className={`absolute inset-0 transition-all duration-500 ${hasSaveData ? 'bg-amber-900/0 group-hover:bg-amber-900/10' : ''}`} />
                <span
                  className={`${isCompactLandscape ? 'tracking-[0.22em]' : 'text-sm tracking-[0.3em]'} relative transition-colors duration-300 ${hasSaveData ? 'text-amber-600/80 group-hover:text-amber-400' : 'text-slate-600/40'}`}
                  style={compactSecondaryButtonTextStyle}
                >
                  续 读 简 牍
                </span>
                {!hasSaveData && (
                  <span className={`${isCompactLandscape ? 'right-3 text-[9px]' : 'right-4 text-[10px]'} absolute top-1/2 -translate-y-1/2 text-slate-700/50 tracking-wider`}>无存档</span>
                )}
              </button>

              {/* 联系开发者 */}
              <button
                onClick={() => setShowContact(true)}
                className={`group relative ${isCompactLandscape ? 'w-full py-2' : 'w-72 py-3'} text-center overflow-hidden`}
              >
                <div className="absolute inset-0 border border-amber-900/20 group-hover:border-amber-700/40 transition-all duration-500" />
                <span
                  className={`${isCompactLandscape ? 'tracking-[0.22em]' : 'text-sm tracking-[0.3em]'} relative text-amber-700/60 group-hover:text-amber-500/80 transition-colors duration-300`}
                  style={compactSecondaryButtonTextStyle}
                >
                  联 系 开 发 者
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 联系开发者面板 */}
      {showContact && (
        <ContactModal onClose={() => setShowContact(false)} />
      )}
    </div>
  );
};
