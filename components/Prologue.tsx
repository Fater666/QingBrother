
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PrologueProps {
  onComplete: () => void;
}

interface NarrativeSegment {
  title: string;
  lines: string[];
}

const SEGMENTS: NarrativeSegment[] = [
  {
    title: '天下大势',
    lines: [
      '周室衰微，礼崩乐坏。',
      '七雄并立，烽火连天。',
      '秦据崤函之固，拥雍州之地，',
      '虎视天下，鲸吞六国。',
      '',
      '长平一役，白起坑杀赵卒四十万。',
      '自此，再无人敢言抗秦。',
    ]
  },
  {
    title: '乱世众生',
    lines: [
      '王侯争霸，苦的是百姓。',
      '良田化为焦土，城邑沦为废墟。',
      '流民塞道，饿殍遍野。',
      '',
      '在这乱世之中，',
      '有人为了一口粮食卖身为奴，',
      '有人拿起刀枪落草为寇，',
      '也有人——选择以刀为笔，以血为墨，',
      '在这天地间书写自己的篇章。',
    ]
  },
  {
    title: '伍',
    lines: [
      '古制，五人为"伍"。',
      '伍长者，率四人同生共死。',
      '',
      '而你，正是这样一支佣兵战团的首领。',
      '你们没有显赫的出身，',
      '没有王侯的庇护，',
      '有的只是手中的兵刃，',
      '和彼此之间用鲜血铸就的信任。',
      '',
      '在强秦扫六合的阴影之下，',
      '你将带领你的战团求生、壮大，',
      '在大国兴衰的洪流中，',
      '谱写属于"伍"的传奇……',
    ]
  }
];

const CHAR_INTERVAL = 50; // 每个字的间隔（毫秒）
const LINE_PAUSE = 300;   // 空行的额外停顿
const SEGMENT_FADE_DURATION = 800; // 段落切换淡入淡出

export const Prologue: React.FC<PrologueProps> = ({ onComplete }) => {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [displayedText, setDisplayedText] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [segmentFade, setSegmentFade] = useState<'in' | 'out' | 'visible'>('in');
  const [isTyping, setIsTyping] = useState(true);
  const [showContinue, setShowContinue] = useState(false);
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [compactFontScale, setCompactFontScale] = useState(1);

  const timerRef = useRef<number | null>(null);
  const skipRef = useRef(false);

  const segment = SEGMENTS[Math.min(currentSegment, SEGMENTS.length - 1)];

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
      const scale = Math.max(0.58, Math.min(1.08, (shortest / 440) * (BASELINE_DPR / dpr)));
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

  // 清理定时器
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 完成当前段落所有文字
  const completeSegment = useCallback(() => {
    clearTimer();
    setDisplayedText(segment.lines);
    setCurrentLineIndex(segment.lines.length);
    setCurrentCharIndex(0);
    setIsTyping(false);
    setShowContinue(true);
  }, [segment, clearTimer]);

  // 逐字显示逻辑
  useEffect(() => {
    if (segmentFade !== 'visible' || !isTyping) return;

    const lines = segment.lines;
    if (currentLineIndex >= lines.length) {
      setIsTyping(false);
      setShowContinue(true);
      return;
    }

    const currentLine = lines[currentLineIndex];

    // 空行处理
    if (currentLine === '') {
      timerRef.current = window.setTimeout(() => {
        setDisplayedText(prev => [...prev, '']);
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, LINE_PAUSE);
      return;
    }

    if (currentCharIndex === 0) {
      // 新行开始
      setDisplayedText(prev => [...prev, '']);
    }

    if (currentCharIndex < currentLine.length) {
      const delay = skipRef.current ? 5 : CHAR_INTERVAL;
      timerRef.current = window.setTimeout(() => {
        setDisplayedText(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = currentLine.substring(0, currentCharIndex + 1);
          return updated;
        });
        setCurrentCharIndex(prev => prev + 1);
      }, delay);
    } else {
      // 当前行结束，进入下一行
      timerRef.current = window.setTimeout(() => {
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, skipRef.current ? 20 : 200);
    }

    return () => clearTimer();
  }, [currentSegment, currentLineIndex, currentCharIndex, segmentFade, isTyping, segment, clearTimer]);

  // 段落淡入效果
  useEffect(() => {
    if (segmentFade === 'in') {
      const t = setTimeout(() => setSegmentFade('visible'), 100);
      return () => clearTimeout(t);
    }
  }, [segmentFade]);

  // 处理继续/下一段
  const handleContinue = useCallback(() => {
    if (segmentFade === 'out') return; // 防止淡出动画期间重复点击

    if (isTyping) {
      // 如果正在打字，快速完成当前段
      skipRef.current = true;
      completeSegment();
      return;
    }

    if (currentSegment < SEGMENTS.length - 1) {
      // 切换到下一段
      setSegmentFade('out');
      setTimeout(() => {
        setCurrentSegment(prev => prev + 1);
        setDisplayedText([]);
        setCurrentLineIndex(0);
        setCurrentCharIndex(0);
        setIsTyping(true);
        setShowContinue(false);
        skipRef.current = false;
        setSegmentFade('in');
      }, SEGMENT_FADE_DURATION);
    } else {
      // 所有段落完毕
      setSegmentFade('out');
      setTimeout(() => onComplete(), SEGMENT_FADE_DURATION);
    }
  }, [isTyping, currentSegment, segmentFade, completeSegment, onComplete]);

  // 跳过全部
  const handleSkip = useCallback(() => {
    clearTimer();
    setSegmentFade('out');
    setTimeout(() => onComplete(), 400);
  }, [clearTimer, onComplete]);

  const fadeClass = segmentFade === 'out' ? 'opacity-0' :
                    segmentFade === 'in' ? 'opacity-0' : 'opacity-100';

  return (
    <div
      className="w-full h-full bg-black flex flex-col items-center justify-center relative overflow-hidden select-none cursor-pointer"
      onClick={handleContinue}
    >
      {/* 背景氛围 */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse 600px 400px at 50% 50%, rgba(139, 90, 43, 0.4), transparent)`
        }}
      />

      {/* 段落标题 */}
      <div className={`absolute transition-all duration-[800ms] ${isCompactLandscape ? 'top-4' : 'top-[12%]'} ${fadeClass}`}>
        <div className={`flex items-center ${isCompactLandscape ? 'gap-2' : 'gap-4'}`}>
          <div className={`${isCompactLandscape ? 'w-10' : 'w-16'} h-px bg-gradient-to-r from-transparent to-amber-800/40`} />
          <span
            className={`${isCompactLandscape ? 'text-[10px] tracking-[0.28em]' : 'text-xs tracking-[0.5em]'} text-amber-800/60 uppercase font-serif`}
            style={isCompactLandscape ? { fontSize: `clamp(0.56rem, ${1.15 * compactFontScale}vw, 0.66rem)` } : undefined}
          >
            {segment.title}
          </span>
          <div className={`${isCompactLandscape ? 'w-10' : 'w-16'} h-px bg-gradient-to-l from-transparent to-amber-800/40`} />
        </div>
      </div>

      {/* 段落进度指示 */}
      <div className={`absolute transition-all duration-[800ms] ${isCompactLandscape ? 'top-3 right-4' : 'top-[10%] right-12'} ${fadeClass}`}>
        <div className={`flex ${isCompactLandscape ? 'gap-1.5' : 'gap-2'}`}>
          {SEGMENTS.map((_, i) => (
            <div
              key={i}
              className={`${isCompactLandscape ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full transition-all duration-500 ${
                i === currentSegment ? 'bg-amber-600' :
                i < currentSegment ? 'bg-amber-900/60' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 叙事文字区域 */}
      <div className={`absolute inset-0 flex items-center justify-center px-2 ${fadeClass}`}>
        <div
          className={`transition-all duration-[800ms] ${isCompactLandscape ? 'w-full max-w-[95vw] px-4' : 'max-w-2xl px-8'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${isCompactLandscape ? 'space-y-1.5 max-h-[58vh] overflow-y-auto pr-1' : 'space-y-2'}`}>
          {displayedText.map((line, i) => (
            <p
              key={`${currentSegment}-${i}`}
              className={`${isCompactLandscape ? 'text-[14px] leading-relaxed tracking-[0.08em]' : 'text-lg leading-loose tracking-[0.15em]'} font-serif transition-opacity duration-300 ${
                line === '' ? (isCompactLandscape ? 'h-2' : 'h-4') : 'text-amber-100/80'
              }`}
              style={{
                textShadow: '0 0 20px rgba(217, 119, 6, 0.1)',
                fontSize: isCompactLandscape ? `clamp(0.76rem, ${1.9 * compactFontScale}vw, 0.95rem)` : undefined,
              }}
            >
              {line}
              {/* 打字光标 */}
              {i === displayedText.length - 1 && isTyping && line !== '' && (
                <span className={`inline-block w-px bg-amber-500 ml-1 animate-pulse ${isCompactLandscape ? 'h-4' : 'h-5'}`} />
              )}
            </p>
          ))}
          </div>
        </div>
      </div>

      {/* 继续提示 */}
      {showContinue && (
        <div className={`absolute animate-pulse ${isCompactLandscape ? 'bottom-[14%]' : 'bottom-[20%]'}`}>
          <p className={`${isCompactLandscape ? 'text-[10px] tracking-[0.22em]' : 'text-xs tracking-[0.3em]'} text-amber-700/60`}>
            {currentSegment < SEGMENTS.length - 1 ? '— 点击继续 —' : '— 点击开始你的征途 —'}
          </p>
        </div>
      )}

      {/* 跳过按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); handleSkip(); }}
        className={`absolute text-slate-700 hover:text-slate-500 transition-colors duration-300 z-10 ${
          isCompactLandscape ? 'bottom-3 right-3 text-[10px] tracking-[0.2em]' : 'bottom-8 right-8 text-xs tracking-widest'
        }`}
      >
        跳过 →
      </button>
    </div>
  );
};
