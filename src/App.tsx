/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gamepad2,
  Trophy,
  Timer,
  Volume2,
  VolumeX,
  Compass,
  Sparkles,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  Play,
  ArrowRight,
  RefreshCw,
  Award,
  Zap,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Smartphone
} from 'lucide-react';
import { generateMaze, findShortestPath, type MazeData, type Point } from './utils/maze';
import { soundManager } from './utils/sound';

// Mathematical size and limit progression
function getStageDimensions(stage: number): { width: number; height: number; limit: number } {
  let w = 11;
  let h = 11;
  if (stage % 2 === 1) {
    // Odd Stage: Square
    w = 11 + Math.floor(stage / 2) * 2;
    h = w;
  } else {
    // Even Stage: Horizontal / Vertical Rectangles
    w = 11 + Math.floor(stage / 2) * 4;
    h = 11 + Math.floor(stage / 2) * 2;
  }
  
  // Cap dimensions to keep text/graphics crisp and playable on mobile preview screens
  w = Math.min(w, 29);
  h = Math.min(h, 23);
  
  // Ensure both dimensions are strictly odd for standard randomized DFS carving
  if (w % 2 === 0) w += 1;
  if (h % 2 === 0) h += 1;

  // Set time limit: Stage 1 = 18s, Stage 2 = 22s, etc.
  const limit = Math.min(15 + stage * 3, 50);

  return { width: w, height: h, limit };
}

// Direction mappings for standard continuous keyboard steering
const keyToDir: { [key: string]: { dx: number; dy: number } } = {
  arrowup: { dx: 0, dy: -1 },
  w: { dx: 0, dy: -1 },
  arrowdown: { dx: 0, dy: 1 },
  s: { dx: 0, dy: 1 },
  arrowleft: { dx: -1, dy: 0 },
  a: { dx: -1, dy: 0 },
  arrowright: { dx: 1, dy: 0 },
  d: { dx: 1, dy: 0 }
};

export default function App() {
  // Game state
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'STAGE_CLEAR' | 'GAME_OVER'>('START');
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [highStage, setHighStage] = useState(1);
  
  // Maze and player configurations
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [playerPos, setPlayerPos] = useState<Point>({ x: 0, y: 0 });
  const [playerDir, setPlayerDir] = useState<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>('DOWN');
  const [pathTraversed, setPathTraversed] = useState<Point[]>([]);
  const [isAutoMoving, setIsAutoMoving] = useState(false);
  const [stepsCount, setStepsCount] = useState(0);
  
  // Challenge features
  const [fogOfWar, setFogOfWar] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [usedHintThisStage, setUsedHintThisStage] = useState(false);
  
  // Audio preferences
  const [soundMuted, setSoundMuted] = useState(false);

  // Preferred operation/control scheme mode
  const [controlMode, setControlMode] = useState<'SWIPE' | 'DPAD'>('DPAD');

  // Stats for the clear panel
  const [stageStats, setStageStats] = useState({
    timeBonus: 0,
    hintBonus: 0,
    thisStageScore: 0,
  });

  // Countdown timer references
  const [timeLeft, setTimeLeft] = useState(25.0);
  const timerIntervalRef = useRef<number | null>(null);
  const lastTickSecRef = useRef<number>(5);
  const autoMoveTimeoutRef = useRef<number | null>(null);

  // Swipe capture references
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Continuous keyboard movement references
  const pressedKeysStackRef = useRef<string[]>([]);
  const continuousMoveIntervalRef = useRef<number | null>(null);
  const attemptMoveRef = useRef<((dx: number, dy: number) => boolean) | null>(null);

  // Sync attemptMove ref on every render
  useEffect(() => {
    attemptMoveRef.current = attemptMove;
  });

  const stopContinuousMoveLoop = () => {
    if (continuousMoveIntervalRef.current) {
      clearInterval(continuousMoveIntervalRef.current);
      continuousMoveIntervalRef.current = null;
    }
  };

  const startContinuousMoveLoop = () => {
    if (continuousMoveIntervalRef.current) return;
    
    continuousMoveIntervalRef.current = window.setInterval(() => {
      const stack = pressedKeysStackRef.current;
      if (stack.length > 0) {
        const activeKey = stack[stack.length - 1];
        const dir = keyToDir[activeKey];
        if (dir && attemptMoveRef.current) {
          attemptMoveRef.current(dir.dx, dir.dy);
        }
      } else {
        stopContinuousMoveLoop();
      }
    }, 230); // 230ms speed intervals (3 frames faster)
  };

  // Load Highscore from localStorage on mount
  useEffect(() => {
    const savedScore = localStorage.getItem('maze_highscore');
    const savedStage = localStorage.getItem('maze_highstage');
    if (savedScore) setHighScore(parseInt(savedScore, 10));
    if (savedStage) setHighStage(parseInt(savedStage, 10));
  }, []);

  // Update sound status based on component state
  useEffect(() => {
    soundManager.setMute(soundMuted);
  }, [soundMuted]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopAutoMove();
      stopContinuousMoveLoop();
    };
  }, []);

  // Set up a new stage
  const setupStage = (stageNum: number) => {
    stopAutoMove();
    stopTimer();
    
    const { width, height, limit } = getStageDimensions(stageNum);
    const newMaze = generateMaze(width, height);
    
    setMaze(newMaze);
    setPlayerPos(newMaze.start);
    setPlayerDir('DOWN');
    setPathTraversed([newMaze.start]);
    setTimeLeft(limit);
    setIsAutoMoving(false);
    setStepsCount(0);
    setShowSolution(false);
    setUsedHintThisStage(false);
    lastTickSecRef.current = 5;

    // Trigger starting synth tune
    if (gameState !== 'START') {
      soundManager.playStageStart();
    }
  };

  // Start the ticking timer
  const startTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    const updateRate = 50; // Update every 50ms for sub-second precision
    const tickPeriod = updateRate / 1000;

    timerIntervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        const nextTime = Math.max(0, prev - tickPeriod);
        
        // Tick warnings when time goes down below 5 seconds
        const currentSec = Math.floor(nextTime);
        if (nextTime <= 5.0 && nextTime > 0) {
          if (currentSec !== lastTickSecRef.current) {
            soundManager.playClockTick();
            lastTickSecRef.current = currentSec;
          }
        }

        // Time's up!
        if (nextTime === 0) {
          stopTimer();
          triggerGameOver();
        }
        return nextTime;
      });
    }, updateRate);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Trigger game start
  const handleStartGame = () => {
    // Unlock Web Audio Context via brief pitch chime
    soundManager.playClick();
    setStage(1);
    setScore(0);
    setHintsLeft(3);
    setupStage(1);
    setGameState('PLAYING');
    soundManager.playStageStart();
    
    // Start countdown timer briefly after sound
    setTimeout(() => {
      startTimer();
    }, 200);
  };

  // Trigger next stage navigation
  const handleNextStage = () => {
    soundManager.playClick();
    const nextS = stage + 1;
    setStage(nextS);
    setupStage(nextS);
    setGameState('PLAYING');
    
    setTimeout(() => {
      startTimer();
    }, 200);
  };

  // Trigger re-play on Game Over
  const handleRestart = () => {
    soundManager.playClick();
    handleStartGame();
  };

  // Handle stage achievement clearing
  const handleStageClear = () => {
    stopTimer();
    stopAutoMove();

    soundManager.playGoal();

    // Score calculations
    const rawTimeLeft = timeLeft;
    const baseScore = stage * 1000;
    const timeBonus = Math.floor(rawTimeLeft * 100);
    const hintBonus = usedHintThisStage ? 0 : stage * 500;
    const thisStageScore = baseScore + timeBonus + hintBonus;
    
    const nextScore = score + thisStageScore;
    setScore(nextScore);

    // Save persistent score benchmarks
    if (nextScore > highScore) {
      setHighScore(nextScore);
      localStorage.setItem('maze_highscore', nextScore.toString());
    }
    if (stage > highStage) {
      setHighStage(stage);
      localStorage.setItem('maze_highstage', stage.toString());
    }

    setStageStats({
      timeBonus,
      hintBonus,
      thisStageScore
    });

    setGameState('STAGE_CLEAR');
  };

  // Trigger Time Out game over
  const triggerGameOver = () => {
    stopAutoMove();
    soundManager.playGameOver();
    setGameState('GAME_OVER');
  };

  // Manage player movement logic (returns true if moved successfully)
  const attemptMove = (dx: number, dy: number): boolean => {
    if (gameState !== 'PLAYING' || !maze) return false;

    const nextX = playerPos.x + dx;
    const nextY = playerPos.y + dy;

    // Boundary limits check
    if (nextX < 0 || nextX >= maze.width || nextY < 0 || nextY >= maze.height) return false;

    // Solid wall collision query (0 = path, 1 = wall)
    if (maze.grid[nextY][nextX] === 1) return false;

    // Set directions for rendering orientation
    if (dx > 0) setPlayerDir('RIGHT');
    else if (dx < 0) setPlayerDir('LEFT');
    else if (dy > 0) setPlayerDir('DOWN');
    else if (dy < 0) setPlayerDir('UP');

    // Register coordinates and track breadcrumbs
    const nextPt = { x: nextX, y: nextY };
    setPlayerPos(nextPt);
    setStepsCount((prev) => prev + 1);
    soundManager.playMove();

    setPathTraversed((prev) => {
      // Avoid looping visual crumbs endlessly if repeating same cell path
      if (prev.length > 1 && prev[prev.length - 2].x === nextPt.x && prev[prev.length - 2].y === nextPt.y) {
        return prev.slice(0, -1);
      }
      return [...prev, nextPt];
    });

    // Check if player reaches the goal corner
    if (nextX === maze.goal.x && nextY === maze.goal.y) {
      handleStageClear();
    }

    return true;
  };

  // Navigation handlers (D-pad or keyboard keys)
  const goUp = () => { stopAutoMove(); attemptMove(0, -1); };
  const goLeft = () => { stopAutoMove(); attemptMove(-1, 0); };
  const goDown = () => { stopAutoMove(); attemptMove(0, 1); };
  const goRight = () => { stopAutoMove(); attemptMove(1, 0); };

  // Listen for keyboard controls and continuous movement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space key actions for game state transitions
      if (e.key === ' ' || e.code === 'Space') {
        if (gameState === 'START') {
          e.preventDefault();
          handleStartGame();
          return;
        } else if (gameState === 'STAGE_CLEAR') {
          e.preventDefault();
          handleNextStage();
          return;
        } else if (gameState === 'GAME_OVER') {
          e.preventDefault();
          handleRestart();
          return;
        }
      }

      if (gameState !== 'PLAYING') return;
      if (e.repeat) return; // Prevent OS key-repeat from triggering multiple additions

      const key = e.key.toLowerCase();
      
      if (keyToDir[key]) {
        e.preventDefault(); // Prevents page scrolling when tapping arrow keys in sandboxed elements
        stopAutoMove();
        
        // Push to stack if not present
        if (!pressedKeysStackRef.current.includes(key)) {
          pressedKeysStackRef.current.push(key);
        }
        
        // Execute immediate move
        const dir = keyToDir[key];
        if (attemptMoveRef.current) {
          attemptMoveRef.current(dir.dx, dir.dy);
        }
        
        // Start the continuous motion tick
        startContinuousMoveLoop();
      } else if (key === 'h') {
        triggerHint();
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (keyToDir[key]) {
        // Remove key from stack
        pressedKeysStackRef.current = pressedKeysStackRef.current.filter((k) => k !== key);
        if (pressedKeysStackRef.current.length === 0) {
          stopContinuousMoveLoop();
        }
      }
    };

    const handleBlur = () => {
      pressedKeysStackRef.current = [];
      stopContinuousMoveLoop();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [gameState]);

  // Handle active stack cleanups when gameState becomes non-playing
  useEffect(() => {
    if (gameState !== 'PLAYING') {
      pressedKeysStackRef.current = [];
      stopContinuousMoveLoop();
    }
  }, [gameState]);

  // Handle Swipe Gesture capturing
  const handleTouchStart = (e: React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (gameState !== 'PLAYING' || !touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    
    const swipeThreshold = 35; // Sensitivity margin in px

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX > 0) goRight();
        else goLeft();
      }
    } else {
      if (Math.abs(deltaY) > swipeThreshold) {
        if (deltaY > 0) goDown();
        else goUp();
      }
    }
    
    touchStartRef.current = null;
  };

  // BFS solver action for clicking cells or showing hint path
  const handleCellClick = (x: number, y: number) => {
    if (gameState !== 'PLAYING' || !maze || isAutoMoving) return;

    // If clicking target cell that is a wall, cancel
    if (maze.grid[y][x] === 1) return;

    // Calculate path BFS
    const path = findShortestPath(maze.grid, playerPos, { x, y });
    if (path.length <= 1) return;

    // Trigger auto-move sequence
    setIsAutoMoving(true);
    let currentIdx = 1;

    const performStep = () => {
      if (currentIdx >= path.length || gameState !== 'PLAYING') {
        setIsAutoMoving(false);
        return;
      }
      
      const stepTarget = path[currentIdx];
      const dx = stepTarget.x - playerPos.x;
      const dy = stepTarget.y - playerPos.y;

      const success = attemptMove(dx, dy);
      if (!success) {
        setIsAutoMoving(false);
        return;
      }

      // Sync positions
      setPlayerPos(stepTarget);

      currentIdx++;
      autoMoveTimeoutRef.current = window.setTimeout(performStep, 70); // snappy pacing
    };

    autoMoveTimeoutRef.current = window.setTimeout(performStep, 70);
  };

  const stopAutoMove = () => {
    if (autoMoveTimeoutRef.current) {
      clearTimeout(autoMoveTimeoutRef.current);
      autoMoveTimeoutRef.current = null;
    }
    setIsAutoMoving(false);
  };

  // Brief hints solver overlay (2 seconds, costs slightly or has limit metrics)
  const triggerHint = () => {
    if (gameState !== 'PLAYING' || !maze || showSolution || hintsLeft <= 0) return;
    
    soundManager.playClick();
    setHintsLeft((prev) => Math.max(0, prev - 1));
    setUsedHintThisStage(true);
    setShowSolution(true);

    // Fade the hint out after 2.5 seconds
    setTimeout(() => {
      setShowSolution(false);
    }, 2500);
  };

  // Render the current path solution if 'showSolution' is active
  const solverPathPoints = maze ? findShortestPath(maze.grid, playerPos, maze.goal) : [];

  return (
    <div className="min-h-screen text-slate-100 flex flex-col font-sans select-none overflow-x-hidden antialiased relative" style={{ background: 'radial-gradient(circle at center, #e2e8f0 0%, #f1f5f9 100%)' }}>
      {/* Dynamic Background decor lines for Sleek Interface */}
      <div className="absolute inset-0 bg-radial from-slate-800 to-slate-950 pointer-events-none z-0" style={{ background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)' }} />

      {/* Main Container */}
      <header className="relative w-full z-10 border-b border-slate-700/60 bg-slate-900/90 backdrop-blur-md px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo Name & Design Title */}
          <div className="flex items-center gap-2.5">
            <div className="bg-slate-800 p-2 rounded-xl border border-slate-700 flex items-center justify-center shadow-lg shadow-black/30">
              <Gamepad2 className="w-5 h-5 text-sky-400" id="game-logo-icon" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-[#94a3b8] block font-extrabold">
                Sector 07-B • 迷路脱出タイムアタック
              </span>
            </div>
          </div>

          {/* Quick Settings */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundMuted(!soundMuted)}
              className={`p-2 rounded-lg border transition-all text-slate-300 hover:text-white ${
                soundMuted
                  ? 'bg-rose-950/20 border-rose-900/40 text-rose-400'
                  : 'bg-slate-800/80 border-slate-750/70 hover:bg-slate-700 shadow-md'
              }`}
              style={soundMuted ? {} : { borderColor: '#334155' }}
              title={soundMuted ? 'ミュート解除' : 'ミュート設定'}
              id="sound-toggle"
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setFogOfWar(!fogOfWar)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                fogOfWar
                  ? 'bg-slate-800 border-sky-500/60 text-sky-355 shadow-md shadow-sky-500/5'
                  : 'bg-slate-850/80 hover:bg-slate-800 border-[#334155] text-slate-400 hover:text-white'
              }`}
              id="fog-toggle"
              title="視界制限（霧）を有効/無効化します"
            >
              {fogOfWar ? <EyeOff className="w-3.5 h-3.5 text-sky-400" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{fogOfWar ? '視界：制限中' : '視界：全開'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Interactive Screen Router */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 flex flex-col justify-center relative z-10">
        <AnimatePresence mode="wait">
          {gameState === 'START' && (
            <motion.div
              key="start-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="max-w-md w-full mx-auto text-center bg-slate-900/90 border border-[#334155] p-8 rounded-2xl backdrop-blur-md shadow-2xl"
              id="start-screen-card"
            >
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-sky-500 rounded-full blur-xl scale-125 opacity-25 animate-pulse" />
                  <div className="bg-slate-850 border border-slate-700 w-16 h-16 rounded-2xl flex items-center justify-center relative">
                    <Compass className="w-8 h-8 text-sky-400 animate-spin" style={{ animationDuration: '8s' }} />
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-white mb-6">
                CHRONOS MAZE
              </h2>

              {/* High Score Panel */}
              {(highScore > 0 || highStage > 1) && (
                <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 mb-6 flex items-center justify-around shadow-inner">
                  <div>
                    <div className="text-[10px] text-slate-400 font-mono tracking-wider">最高到達ステージ</div>
                    <div className="text-lg font-bold text-sky-400 flex items-center justify-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                      STAGE {highStage}
                    </div>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-mono tracking-wider">ハイスコア</div>
                    <div className="text-lg font-bold text-amber-500">
                      {highScore.toLocaleString()} <span className="text-xs text-slate-400 font-normal">pts</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Game Manual */}
              <div className="text-left bg-slate-950/60 border border-[#334155] p-4 rounded-xl mb-6 text-xs text-slate-350">
                <span className="font-bold text-slate-200 block mb-1">🎮 コントロール手法:</span>
                <ul className="space-y-1.5 ml-1 pl-1 list-none text-slate-400">
                  <li className="flex items-center gap-1">⌨️ <strong className="text-sky-300">キーボード:</strong> 矢印キー 又は <strong className="text-sky-300">WASD</strong></li>
                </ul>
              </div>

              <button
                onClick={handleStartGame}
                className="w-full py-4 px-6 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-extrabold rounded-xl shadow-lg shadow-sky-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-md border border-sky-400/20"
                id="btn-play-start"
              >
                <Play className="w-5 h-5 fill-current text-sky-200" />
                ゲームを開始する
              </button>
            </motion.div>
          )}

          {gameState === 'PLAYING' && maze && (
            <motion.div
              key="playing-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            >
              {/* Left Column: Game State Badges (Styled as Sleek Sidebar components - ultra compact for 16:9 viewports) */}
              <div className="lg:col-span-3 space-y-2.5">
                
                {/* Stage & Score Unified Card */}
                <div className="bg-[#1e293b] border border-[#334155] p-3.5 rounded-xl shadow-xl">
                  <div className="grid grid-cols-2 gap-2 divide-x divide-slate-700/60">
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-[#94a3b8] uppercase font-bold mb-0.5">STAGE</div>
                      <div className="text-2xl font-black text-[#f8fafc] tracking-tight">
                        {stage < 10 ? `0${stage}` : stage} <span className="text-xs text-slate-500 font-semibold">/ 20</span>
                      </div>
                    </div>
                    <div className="pl-2.5">
                      <div className="text-[10px] font-mono tracking-widest text-[#94a3b8] uppercase font-bold mb-0.5">SCORE</div>
                      <div className="text-2xl font-black text-[#f8fafc] tracking-tight">
                        {score.toLocaleString()} <span className="text-[10px] text-[#94a3b8] font-mono">pts</span>
                      </div>
                    </div>
                  </div>
                  {highScore > 0 && (
                    <div className="text-[9px] text-slate-400 mt-2 font-mono flex justify-between items-center bg-slate-950/40 py-1 px-1.5 rounded border border-slate-800">
                      <span>HIGH RECORD:</span>
                      <span className="text-amber-500 font-bold">{highScore.toLocaleString()}</span>
                    </div>
                  )}
                  <p className="text-[9px] font-mono text-slate-400 mt-1.5 uppercase tracking-wide leading-none text-center">
                    {maze.width === maze.height ? 'SQUARE' : 'RECTANGLE'} MAZE ({maze.width}x{maze.height})
                  </p>
                </div>

                {/* Timer Box (High Emphasis Progress Bar - Compact) */}
                <div className="bg-[#1e293b] border border-[#334155] p-3.5 rounded-xl shadow-xl relative overflow-hidden">
                  {/* Danger Glow backing when low time */}
                  {timeLeft <= 5.0 && (
                    <div className="absolute inset-0 bg-rose-500/10 animate-pulse pointer-events-none" />
                  )}
                  
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[10px] font-mono tracking-widest font-bold uppercase ${timeLeft <= 5.0 ? 'text-rose-400 animate-pulse' : 'text-[#94a3b8]'}`}>
                      TIME REMAINING
                    </span>
                    <Timer className={`w-3.5 h-3.5 ${timeLeft <= 5.0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-black font-mono tracking-tight ${timeLeft <= 5.0 ? 'text-red-450' : 'text-slate-100'}`}>
                      {timeLeft < 10 ? `0${timeLeft.toFixed(1)}` : timeLeft.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Seconds</span>
                  </div>

                  {/* Visual Progress Bar matching design style */}
                  <div className="w-full bg-slate-950/80 h-1.5 rounded-full overflow-hidden mt-2">
                    <motion.div
                      className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${Math.max(0, (timeLeft / getStageDimensions(stage).limit) * 100)}%`,
                        backgroundColor: timeLeft <= 5.0 ? '#fb7185' : '#38bdf8'
                      }}
                      transition={{ ease: 'linear' }}
                    />
                  </div>
                </div>

                {/* Stats Summary Panel */}
                <div className="bg-[#1e293b] border border-[#334155] p-3 rounded-xl shadow-xl space-y-1.5 text-[11px] font-mono text-slate-350 hidden lg:block">
                  <div className="flex justify-between border-b border-slate-700/60 pb-1">
                    <span className="text-[#94a3b8] font-bold">MOVES MADE:</span>
                    <span className="text-slate-100 font-bold">{stepsCount} steps</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-700/60 pb-1">
                    <span className="text-[#94a3b8] font-bold">HINT BONUS:</span>
                    <span className={usedHintThisStage ? "text-rose-400" : "text-sky-400 font-bold"}>
                      {usedHintThisStage ? "USED (0)" : "ELIGIBLE"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8] font-bold">SOLVER USES:</span>
                    <span className={hintsLeft > 0 ? "text-amber-500 font-bold" : "text-slate-500"}>
                      {hintsLeft} LEFT
                    </span>
                  </div>
                </div>

              </div>

              {/* Middle Column: Maze canvas board explicitly centered on Slate-800 box container */}
              <div className="lg:col-span-6 flex flex-col items-center">
                
                {/* SVG Board container built around maze-container styles */}
                <div
                  className="maze-container w-full max-w-sm lg:max-w-[390px] aspect-square mx-auto"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  id="maze-canvas-window"
                >
                  <svg
                    viewBox={`0 0 ${maze.width * 40} ${maze.height * 40}`}
                    className="w-full h-full object-contain bg-[#1e293b] rounded-lg"
                  >
                    {/* Render Grid cells */}
                    {maze.grid.map((row, y) =>
                      row.map((cell, x) => {
                        // Compute distance for Fog Of War
                        const dist = Math.abs(x - playerPos.x) + Math.abs(y - playerPos.y);
                        
                        // Visibility thresholding
                        let opacityClass = "opacity-100";
                        if (fogOfWar) {
                          if (dist <= 2) {
                            opacityClass = "opacity-100";
                          } else if (dist === 3) {
                            opacityClass = "opacity-40";
                          } else {
                            opacityClass = "opacity-0";
                          }
                        }

                        // Fog Of War blockout
                        if (fogOfWar && dist > 3) {
                          return (
                            <rect
                              key={`cell-${x}-${y}`}
                              x={x * 40}
                              y={y * 40}
                              width={40}
                              height={40}
                              fill="#0f172a" // Pitch black cell matching body bg #0f172a
                            />
                          );
                        }

                        if (cell === 1) {
                          // Wall segment: #0f172a / Wall texture
                          return (
                            <g key={`cell-${x}-${y}`} className={`transition-opacity duration-300 ${opacityClass}`}>
                              <rect
                                x={x * 40 + 1}
                                y={y * 40 + 1}
                                width={38}
                                height={38}
                                rx={4}
                                fill="#0f172a"
                                stroke="#1e293b"
                                strokeWidth={1}
                              />
                            </g>
                          );
                        } else {
                          // Passage cell: background represents #334155 design cell
                          const isStart = x === maze.start.x && y === maze.start.y;
                          const isGoal = x === maze.goal.x && y === maze.goal.y;

                          return (
                            <g
                              key={`cell-${x}-${y}`}
                              className={`transition-opacity duration-300 ${opacityClass}`}
                              onClick={() => handleCellClick(x, y)}
                            >
                              {/* Background tile color - Passage base is #334155 in Sleek design */}
                              <rect
                                x={x * 40}
                                y={y * 40}
                                width={40}
                                height={40}
                                fill="#334155"
                                className="hover:fill-slate-655 cursor-pointer transition-colors"
                              />

                              {/* Tiny subtle center dots mapping passage crumbs */}
                              {!isStart && !isGoal && (
                                <circle
                                  cx={x * 40 + 20}
                                  cy={y * 40 + 20}
                                  r={2.5}
                                  fill="#475569"
                                />
                              )}

                              {/* Origin / Start Point: #38bdf8 with glow */}
                              {isStart && (
                                <g>
                                  <rect
                                    x={x * 40 + 3}
                                    y={y * 40 + 3}
                                    width={34}
                                    height={34}
                                    rx={4}
                                    fill="#38bdf8"
                                    opacity={0.3}
                                    filter="url(#skyGlow)"
                                  />
                                  <rect
                                    x={x * 40 + 3}
                                    y={y * 40 + 3}
                                    width={34}
                                    height={34}
                                    rx={4}
                                    fill="#38bdf8"
                                    stroke="#e0f2fe"
                                    strokeWidth={1}
                                  />
                                  <text
                                    x={x * 40 + 20}
                                    y={y * 40 + 24}
                                    fill="#0f172a"
                                    fontSize="8"
                                    fontWeight="black"
                                    textAnchor="middle"
                                    className="font-sans"
                                  >
                                    START
                                  </text>
                                </g>
                              )}

                              {/* Extraction / Goal Point: #f59e0b with glow */}
                              {isGoal && (
                                <g>
                                  <rect
                                    x={x * 40 + 3}
                                    y={y * 40 + 3}
                                    width={34}
                                    height={34}
                                    rx={4}
                                    fill="#f59e0b"
                                    opacity={0.4}
                                    filter="url(#amberGlow)"
                                    className="animate-pulse"
                                  />
                                  <rect
                                    x={x * 40 + 3}
                                    y={y * 40 + 3}
                                    width={34}
                                    height={34}
                                    rx={4}
                                    fill="#f59e0b"
                                    stroke="#fef3c7"
                                    strokeWidth={1.5}
                                  />
                                  <text
                                    x={x * 40 + 20}
                                    y={y * 40 + 25}
                                    fill="#0f172a"
                                    fontSize="14"
                                    fontWeight="black"
                                    textAnchor="middle"
                                  >
                                    ★
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        }
                      })
                    )}

                    {/* Gradient & Sleek Glow Definitions */}
                    <defs>
                      <filter id="skyGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                      <filter id="amberGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                      <filter id="playerGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Path traversed (Crumb trails) styled as player-trail (#075985) */}
                    {pathTraversed.length > 1 && (
                      <path
                        d={`M ${pathTraversed.map((p) => `${p.x * 40 + 20} ${p.y * 40 + 20}`).join(' L ')}`}
                        fill="none"
                        stroke="#075985"
                        strokeWidth={7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.7}
                      />
                    )}

                    {/* Hint overlay path from solver */}
                    {showSolution && solverPathPoints.length > 0 && (
                      <path
                        d={`M ${solverPathPoints.map((p) => `${p.x * 40 + 20} ${p.y * 40 + 20}`).join(' L ')}`}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#amberGlow)"
                        className="animate-pulse"
                      />
                    )}

                    {/* Player Character disk piece styled beautifully for the Sleek Interface */}
                    {maze && (
                      <g className="transition-all duration-75">
                        {/* Outer Glow ring under player */}
                        <circle
                          cx={playerPos.x * 40 + 20}
                          cy={playerPos.y * 40 + 20}
                          r={15}
                          fill="rgba(56, 189, 248, 0.25)"
                          filter="url(#playerGlow)"
                        />
                        {/* Player sphere (Glowing sharp Cyan) */}
                        <circle
                          cx={playerPos.x * 40 + 20}
                          cy={playerPos.y * 40 + 20}
                          r={10.5}
                          fill="#38bdf8"
                          stroke="#e0f2fe"
                          strokeWidth={1.5}
                        />
                        {/* Interactive face direction indicators */}
                        {playerDir === 'DOWN' && (
                          <g>
                            <circle cx={playerPos.x * 40 + 16.5} cy={playerPos.y * 40 + 21.5} r={1.5} fill="#0f172a" />
                            <circle cx={playerPos.x * 40 + 23.5} cy={playerPos.y * 40 + 21.5} r={1.5} fill="#0f172a" />
                          </g>
                        )}
                        {playerDir === 'UP' && (
                          <g>
                            <circle cx={playerPos.x * 40 + 16.5} cy={playerPos.y * 40 + 18.5} r={1.5} fill="#0f172a" />
                            <circle cx={playerPos.x * 40 + 23.5} cy={playerPos.y * 40 + 18.5} r={1.5} fill="#0f172a" />
                          </g>
                        )}
                        {playerDir === 'LEFT' && (
                          <g>
                            <circle cx={playerPos.x * 40 + 15.5} cy={playerPos.y * 40 + 16.5} r={1.5} fill="#0f172a" />
                            <circle cx={playerPos.x * 40 + 15.5} cy={playerPos.y * 40 + 23.5} r={1.5} fill="#0f172a" />
                          </g>
                        )}
                        {playerDir === 'RIGHT' && (
                          <g>
                            <circle cx={playerPos.x * 40 + 24.5} cy={playerPos.y * 40 + 16.5} r={1.5} fill="#0f172a" />
                            <circle cx={playerPos.x * 40 + 24.5} cy={playerPos.y * 40 + 23.5} r={1.5} fill="#0f172a" />
                          </g>
                        )}
                        {/* Jewel core node */}
                        <circle
                          cx={playerPos.x * 40 + 20}
                          cy={playerPos.y * 40 + 20}
                          r={3.5}
                          fill="#ffffff"
                        />
                      </g>
                    )}
                  </svg>
                </div>

                {/* Legend indicator in the layout matching design styles */}
                <div className="flex gap-4 justify-center items-center mt-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 px-1 h-3 rounded-sm bg-[#38bdf8] shadow shadow-sky-500/50" />
                    <span className="text-[10px] font-mono text-[#94a3b8] font-bold">ORIGIN</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 px-1 h-3 rounded-sm bg-[#f59e0b] shadow shadow-amber-500/50" />
                    <span className="text-[10px] font-mono text-[#94a3b8] font-bold">EXTRACTION</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 px-1 h-3 rounded-sm bg-[#0f172a] border border-[#1e293b]" />
                    <span className="text-[10px] font-mono text-[#94a3b8] font-bold">DATA WALL</span>
                  </div>
                </div>

                {/* On-screen control panel under the maze matching 'DPAD' controlMode - visible on mobile, hidden on desktop */}
                {controlMode === 'DPAD' && (
                  <div className="mt-4 w-full max-w-xs mx-auto bg-[#1e293b] border border-[#334155] p-2.5 rounded-xl flex lg:hidden flex-col items-center gap-2 shadow-lg relative z-20">
                    <div className="text-[10px] font-mono tracking-widest text-[#94a3b8] font-bold uppercase">
                      ON-SCREEN D-PAD CONTROLLER
                    </div>
                    
                    {/* Compact Dpad buttons */}
                    <div className="grid grid-cols-3 gap-1.5 w-32">
                      <div />
                      <button
                        onClick={goUp}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-300 hover:text-[#0f172a] shadow"
                        id="onscreen-btn-up"
                        title="上へ"
                      >
                        <ChevronUp className="w-5 h-5" />
                      </button>
                      <div />

                      <button
                        onClick={goLeft}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-300 hover:text-[#0f172a] shadow"
                        id="onscreen-btn-left"
                        title="左へ"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="w-10 h-10 bg-[#0f172a] border border-slate-800 rounded-lg flex items-center justify-center">
                        <Gamepad2 className="w-4 h-4 text-sky-400" />
                      </div>
                      <button
                        onClick={goRight}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-300 hover:text-[#0f172a] shadow"
                        id="onscreen-btn-right"
                        title="右へ"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>

                      <div />
                      <button
                        onClick={goDown}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-300 hover:text-[#0f172a] shadow"
                        id="onscreen-btn-down"
                        title="下へ"
                      >
                        <ChevronDown className="w-5 h-5" />
                      </button>
                      <div />
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Sleek Tech controller controls */}
              <div className="lg:col-span-3 space-y-2.5">
                
                {/* Control Hub details: Objective display */}
                <div className="bg-[#1e293b] border border-[#334155] p-3 rounded-xl shadow-xl">
                  <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold font-mono">OBJECTIVE</div>
                  <p className="text-xs leading-relaxed mt-1 text-slate-300">
                    Neural net escape: reach <span className="colors-amber font-bold text-amber-400">Extraction Node (*)</span> at the outer perimeter.
                  </p>
                </div>

                {/* Solvers & Helpers Control Card */}
                <div className="bg-[#1e293b] border border-[#334155] p-3 rounded-xl shadow-xl">
                  <h3 className="text-[10px] font-mono tracking-wider font-bold text-[#94a3b8] mb-2 uppercase flex items-center gap-1.5 border-b border-slate-700/60 pb-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    NAVIGATION HINT
                  </h3>
                  
                  <button
                    onClick={triggerHint}
                    disabled={hintsLeft <= 0 || showSolution}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-750 disabled:bg-slate-900/40 border border-[#334155] disabled:border-slate-800 text-amber-300 disabled:text-slate-500 font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs active:scale-95 disabled:active:scale-100 shadow-md"
                    title="2秒間ゴールまでの最短ルートを表示します"
                    id="btn-reveal-path"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current text-amber-400" />
                    GENERATE HINT PATH
                  </button>

                  <div className="flex justify-between items-center mt-2 px-0.5 text-[10px] font-mono">
                    <span className="text-slate-400">AMPLIFIERS LEFT:</span>
                    <span className="text-amber-400 font-extrabold">{hintsLeft} x</span>
                  </div>
                </div>

                {/* Virtual D-pad controller - visible on desktop DPAD mode, hidden in swipe mode */}
                {controlMode === 'DPAD' && (
                  <div className="bg-[#1e293b] border border-[#334155] p-3.5 rounded-xl shadow-xl flex flex-col items-center">
                    <span className="text-[10px] font-mono tracking-wider text-[#94a3b8] mb-3 uppercase font-bold">
                      MANUAL STEERING
                    </span>
                    
                    {/* Visual Layout dpad block */}
                    <div className="grid grid-cols-3 gap-1.5 w-32">
                      <div />
                      <button
                        onClick={goUp}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-350 hover:text-[#0f172a] group shadow-md"
                        id="dpad-up"
                      >
                        <ChevronUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                      </button>
                      <div />

                      <button
                        onClick={goLeft}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-350 hover:text-[#0f172a] group shadow-md"
                        id="dpad-left"
                      >
                        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                      </button>
                      <div className="w-10 h-10 bg-[#0f172a]/80 border border-slate-800 rounded-lg flex items-center justify-center">
                        <Compass className="w-4 h-4 text-slate-500" />
                      </div>
                      <button
                        onClick={goRight}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-350 hover:text-[#0f172a] group shadow-md"
                        id="dpad-right"
                      >
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                      </button>

                      <div />
                      <button
                        onClick={goDown}
                        className="w-10 h-10 bg-slate-800 hover:bg-[#38bdf8] border border-[#334155] hover:border-sky-305 rounded-lg flex items-center justify-center active:scale-90 transition-all text-slate-350 hover:text-[#0f172a] group shadow-md"
                        id="dpad-down"
                      >
                        <ChevronDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                      </button>
                      <div />
                    </div>

                    {/* Navigation key hints */}
                    <div className="control-hint mt-3 pt-2 text-center w-full border-t border-slate-700/40">
                      <div className="text-[9px] uppercase tracking-widest text-[#94a3b8] mb-1.5 font-bold font-mono">HOTKEYS</div>
                      <div className="flex flex-wrap gap-1 justify-center scale-90">
                        <span className="key font-mono">W</span>
                        <span className="key font-mono">A</span>
                        <span className="key font-mono">S</span>
                        <span className="key font-mono">D</span>
                        <span className="key font-mono">↑</span>
                        <span className="key font-mono">←</span>
                        <span className="key font-mono">↓</span>
                        <span className="key font-mono">→</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}

          {gameState === 'STAGE_CLEAR' && (
            <motion.div
              key="stage-clear-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="max-w-md w-full mx-auto text-center bg-[#1e293b] border border-[#334155] p-8 rounded-2xl shadow-2xl relative"
              id="clear-screen-card"
            >
              {/* Confetti simulation overlays */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[20%] left-[20%] w-2 h-2 bg-sky-400 rounded-full animate-ping" />
                <div className="absolute top-[40%] right-[30%] w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
                <div className="absolute top-[15%] right-[15%] w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />
              </div>

              <div className="flex justify-center mb-4">
                <div className="bg-sky-955/20 border border-sky-500/30 w-16 h-16 rounded-2xl flex items-center justify-center animate-bounce">
                  <Sparkles className="w-8 h-8 text-sky-400" />
                </div>
              </div>

              <h2 className="text-2xl font-black tracking-tight text-[#f8fafc] mb-1 uppercase">
                STAGE CLEAR
              </h2>
              <span className="text-xs font-mono uppercase tracking-widest text-[#94a3b8] mb-6 block">
                ステージ {stage} 突破！
              </span>

              {/* Score Recap Panel */}
              <div className="bg-slate-900/60 border border-[#334155] rounded-xl p-5 mb-8 text-left space-y-3 font-mono">
                <div className="flex justify-between items-center text-sm border-b border-slate-800 pb-2">
                  <span className="text-slate-400">基本ステージ点:</span>
                  <span className="text-white font-bold">+{(stage * 1000).toLocaleString()} pts</span>
                </div>
                
                <div className="flex justify-between items-center text-sm border-b border-slate-800 pb-2">
                  <span className="text-slate-400">残り時間ボーナス ({timeLeft.toFixed(1)}秒):</span>
                  <span className="text-sky-400 font-bold">+{stageStats.timeBonus.toLocaleString()} pts</span>
                </div>

                <div className="flex justify-between items-center text-sm border-b border-slate-800 pb-2">
                  <span className="text-slate-400 flex items-center gap-1">
                    ノーヒントボーナス:
                  </span>
                  <span className={stageStats.hintBonus > 0 ? "text-amber-500 font-bold" : "text-slate-500"}>
                    {stageStats.hintBonus > 0 ? `+${stageStats.hintBonus.toLocaleString()} pts` : "ヒント使用 (0 pts)"}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1 text-md font-sans">
                  <span className="text-sky-400 font-black">
                    今回獲得スコア:
                  </span>
                  <span className="text-sky-400 font-black text-lg">
                    +{stageStats.thisStageScore.toLocaleString()} <span className="text-xs text-slate-400 font-normal">pts</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <button
                onClick={handleNextStage}
                className="w-full py-4 px-6 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-md border border-sky-400/20"
                id="btn-next-stage"
              >
                次のステージへ進む
                <ArrowRight className="w-5 h-5 text-sky-200" />
              </button>
            </motion.div>
          )}

          {gameState === 'GAME_OVER' && (
            <motion.div
              key="game-over-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="max-w-md w-full mx-auto text-center bg-[#1e293b] border border-[#334155] p-8 rounded-2xl shadow-2xl"
              id="gameover-screen-card"
            >
              <div className="flex justify-center mb-4">
                <div className="bg-rose-950/40 border border-rose-500/30 w-16 h-16 rounded-2xl flex items-center justify-center">
                  <Timer className="w-8 h-8 text-[#fb7185] animate-pulse" />
                </div>
              </div>

              <h2 className="text-2xl font-black tracking-tight text-[#fb7185] mb-1 uppercase">
                TIME LIMIT OVER
              </h2>
              <span className="text-xs font-mono uppercase tracking-widest text-[#94a3b8] mb-6 block">
                タイムアップ
              </span>

              <p className="text-slate-350 text-sm mb-6 leading-relaxed">
                脱出失敗。制限時間内に出口を見つけることができませんでした。
              </p>

              {/* Statistics Panel */}
              <div className="bg-slate-900/60 border border-[#334155] rounded-xl p-5 mb-8 text-left space-y-2.5 font-mono text-sm">
                <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-1.5">
                  <span>到達ステージ:</span>
                  <span className="text-white font-bold">STAGE {stage}</span>
                </div>
                
                <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-1.5">
                  <span>獲得スコア:</span>
                  <span className="text-sky-400 font-bold">{score.toLocaleString()} pts</span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>ハイスコア記録:</span>
                  <span className="text-amber-500 font-bold">{highScore.toLocaleString()} pts</span>
                </div>
              </div>

              {/* Retry button */}
              <button
                onClick={handleRestart}
                className="w-full py-4 px-6 bg-slate-850 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg border border-[#334155] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-md"
                id="btn-play-again"
              >
                <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" style={{ animationDuration: '6s' }} />
                最初からやり直す
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Styled Footer for Sleek Interface */}
      <footer className="w-full border-t border-slate-850 bg-slate-950 px-4 py-3.5 text-center transition-all z-10">
        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
          ENCRYPTION SYSTEM V4.2 • CHRONOS MAZE ESCAPE PROTOCOL
        </p>
      </footer>
    </div>
  );
}
