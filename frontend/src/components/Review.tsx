'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Check, Volume2, Sparkles, Target, History, RotateCw, BookOpen, Gamepad2, RefreshCw, Trophy, Play } from 'lucide-react';
import { VocabReview, LevelConfig, GameSession, calcSoundThreshold, LevelStats } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import Title from './Title';
import WordMatchGame from './WordMatchGame';

const MATCH_GAME_LEVELS: LevelConfig[] = [
  { level: 1, difficulty: 'Easy',        timeLimit: 100, matchTarget: 15, mode: 'text' },
  { level: 2, difficulty: 'Medium-Easy', timeLimit: 100, matchTarget: 25, mode: 'mixed', soundThreshold: calcSoundThreshold(25) },
  { level: 3, difficulty: 'Medium',      timeLimit: 100, matchTarget: 35, mode: 'mixed', soundThreshold: calcSoundThreshold(35) },
  { level: 4, difficulty: 'Medium-Hard', timeLimit: 100, matchTarget: 45, mode: 'mixed', soundThreshold: calcSoundThreshold(45) },
  { level: 5, difficulty: 'Hard',        timeLimit: 100, matchTarget: 55, mode: 'mixed', soundThreshold: calcSoundThreshold(55) },
];

interface ReviewProps {
  onBack: () => void;
}

const ClayWordCard = ({ 
  review,
  index,
  onRefresh
}: { 
  review: VocabReview; 
  index: number;
  onRefresh?: (vocabId: number, data: { meaning?: string; phonetic?: string; audio_url?: string }) => void;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAutoFlipped, setIsAutoFlipped] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (!isFlipped) {
      hoverTimerRef.current = setTimeout(() => {
        setIsFlipped(true);
        setIsAutoFlipped(true);
      }, 1000);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (isAutoFlipped) {
      setIsFlipped(false);
      setIsAutoFlipped(false);
    }
  };

  const handleCardClick = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsFlipped(!isFlipped);
    setIsAutoFlipped(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAutoFlipped && review.word) {
      if (review.word_id) {
        const audio = new Audio(`${api.defaults.baseURL}/api/audio/${review.word_id}`);
        audio.play().catch(() => fallbackSpeak(review.word));
      } else if (review.audio_url) {
        const audio = new Audio(review.audio_url);
        audio.play().catch(() => fallbackSpeak(review.word));
      } else {
        fallbackSpeak(review.word);
      }
    }
  }, [isAutoFlipped, review.word, review.audio_url, review.word_id]);

  const speak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (review.word_id) {
      const audio = new Audio(`${api.defaults.baseURL}/api/audio/${review.word_id}`);
      audio.play().catch(() => fallbackSpeak(review.word));
    } else if (review.audio_url) {
      const audio = new Audio(review.audio_url);
      audio.play().catch(() => fallbackSpeak(review.word));
    } else {
      fallbackSpeak(review.word);
    }
  };

  const fallbackSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const response = await api.get('/api/dict', {
        params: {
          word: review.word,
          force_refresh: true,
          skip_lemma: true,
        },
      });
      const data = response.data;
      onRefresh?.(review.vocab_id, {
        meaning: data.meaning,
        phonetic: data.phonetic,
        audio_url: data.audio_url,
      });
    } catch (error) {
      console.error('Error refreshing word:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Modern "Cool" palette for cards
  const colors = [
    'from-indigo-500/20 to-blue-500/20 text-indigo-700 border-indigo-100',
    'from-purple-500/20 to-pink-500/20 text-purple-700 border-purple-100',
    'from-emerald-500/20 to-teal-500/20 text-emerald-700 border-emerald-100',
    'from-orange-500/20 to-yellow-500/20 text-orange-700 border-orange-100',
    'from-blue-500/20 to-cyan-500/20 text-blue-700 border-blue-100',
  ];
  const cardStyle = colors[index % colors.length];

  const getMeaningHeight = (meaning: string | undefined | null) => {
    const baseHeight = 60;
    const text = meaning || '';
    const newlineCount = (text.match(/\n/g) || []).length;
    const extraHeight = Math.max(0, (text.length - 80) / 2) + (newlineCount * 20);
    return baseHeight + Math.min(extraHeight, 150);
  };

  const getSentenceHeight = (sentence: string | undefined | null) => {
    if (!sentence) return 0;
    const baseHeight = 70;
    const text = sentence;
    const newlineCount = (text.match(/\n/g) || []).length;
    const extraHeight = Math.max(0, (text.length - 40) / 1.8) + (newlineCount * 24);
    return baseHeight + Math.min(extraHeight, 180);
  };

  return (
    <motion.div 
      layout
      className="relative perspective-1000 cursor-pointer group break-inside-avoid w-full"
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      animate={{ 
        height: isFlipped ? 280 + getMeaningHeight(review.meaning || '') + getSentenceHeight(review.sentence) : 200 
      }}
      transition={{ 
        type: "spring", 
        stiffness: 150, 
        damping: 20,
        mass: 0.8,
        layout: { type: "spring", stiffness: 150, damping: 25 }
      }}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 150, 
          damping: 20,
          mass: 0.8
        }}
        className="w-full h-full preserve-3d relative"
      >
        {/* Front of Card - Glass-Clay Hybrid */}
        <div className={`absolute inset-0 backface-hidden rounded-[32px] p-4 flex flex-col items-center justify-center text-center border-2 bg-gradient-to-br backdrop-blur-md shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,0.7),inset_0_-4px_8px_rgba(0,0,0,0.05)] ${cardStyle}`}>
          <div className="absolute top-0 left-0 w-full h-1/2 bg-white/30 rounded-t-[32px] pointer-events-none" style={{ clipPath: 'ellipse(100% 100% at 50% 0%)' }} />
          
          <button
            onClick={speak}
            onMouseEnter={() => {
              if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
              }
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-white/80 text-indigo-500 hover:scale-110 active:scale-90 transition-all flex items-center justify-center shadow-sm border border-white/50 z-10"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          
          <h3 className="text-2xl md:text-3xl font-black mb-1 break-words w-full drop-shadow-sm font-baloo">
            {review.word}
          </h3>
          <p className="font-bold text-[10px] opacity-60">
            {review.phonetic || '/.../'}
          </p>
          
          <div className="mt-4 opacity-20 group-hover:opacity-100 group-hover:text-indigo-500 transition-all duration-500 scale-75 group-hover:scale-100">
            <RotateCw className="w-5 h-5" />
          </div>
        </div>

        {/* Back of Card - Tactile Clean Design */}
        <div 
          className="absolute inset-0 backface-hidden rounded-[32px] bg-white p-4 flex flex-col rotate-y-180 border-2 border-slate-100 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,1)] overflow-hidden"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <button
            onClick={handleRefresh}
            className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 hover:scale-110 active:scale-90 transition-all flex items-center justify-center shadow-sm border border-indigo-100 z-10"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            <div className="text-center pt-1">
              <h4 className="text-lg font-black text-slate-800 leading-tight font-baloo">{review.word}</h4>
              <p className="text-indigo-400">{review.phonetic}</p>
            </div>
            
            <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-100 to-transparent w-full" />
            
            <div className="space-y-1">
              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest px-2 py-0.5 bg-indigo-50 rounded-full">Meaning</span>
              <p className="text-slate-700 font-semibold text-base leading-relaxed italic px-1 whitespace-pre-line">
                {review.meaning}
              </p>
            </div>

            {review.sentence && (
              <div className="pt-2">
                <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <History className="w-3 h-3 text-indigo-300" />
                  Context
                </h5>
                <div className="p-3 rounded-xl bg-slate-50/50 border border-slate-100 italic text-sm text-slate-500 leading-relaxed relative">
                  &quot;{review.sentence}&quot;
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-2 pt-2 border-t border-slate-50 flex flex-col items-center">
            <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
              FLIP BACK
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default function Review({ onBack }: ReviewProps) {
  const [reviews, setReviews] = useState<VocabReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'wall' | 'game'>('wall');
  const [gameSession, setGameSession] = useState<GameSession>({
    currentLevel: 1,
    cumulativeScore: 0,
    status: 'idle',
  });
  const [columns, setColumns] = useState(2);
  const [mounted, setMounted] = useState(false);
  const fetchedRef = useRef(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/vocab/all');
      setReviews(response.data);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWordRefresh = useCallback((vocabId: number, data: { meaning?: string; phonetic?: string; audio_url?: string }) => {
    setReviews(prev => prev.map(r => 
      r.vocab_id === vocabId 
        ? { ...r, meaning: data.meaning ?? r.meaning, phonetic: data.phonetic ?? r.phonetic, audio_url: data.audio_url ?? r.audio_url }
        : r
    ));
  }, []);

  useEffect(() => {
    setMounted(true);
    const updateColumns = () => {
      if (window.innerWidth >= 1024) setColumns(4);
      else if (window.innerWidth >= 768) setColumns(3);
      else setColumns(2);
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchReviews();
    fetchedRef.current = true;
  }, [fetchReviews]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 gap-6">
      <div className="relative">
        <div className="w-20 h-20 border-8 border-green-100 border-t-green-500 rounded-full animate-spin shadow-inner" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-green-400 animate-pulse" />
        </div>
      </div>
      <p className="text-xl font-black text-green-600 font-baloo tracking-tight">Summoning your Word Wall...</p>
    </div>
  );

  if (reviews.length === 0) {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-8 animate-in zoom-in-95 duration-700">
        <div className="relative inline-block">
          <div className="w-32 h-32 rounded-[40px] bg-white shadow-clay-lg border-2 border-green-50 flex items-center justify-center text-green-500">
            <Check className="w-16 h-16" />
          </div>
          <motion.div 
            animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="absolute -top-4 -right-4 w-12 h-12 rounded-2xl bg-yellow-400 flex items-center justify-center text-white shadow-lg"
          >
            <Sparkles className="w-6 h-6" />
          </motion.div>
        </div>
        <div>
          <h2 className="text-4xl font-black text-slate-800 mb-4 font-baloo">
            <span className="bg-gradient-to-r from-green-600 to-teal-500 bg-clip-text text-transparent">Pure Magic!</span> ✨
          </h2>
          <p className="text-green-600 text-xl font-medium px-8">Your Word Wall is waiting for its first collection. Start reading to find magical words!</p>
        </div>
        <button onClick={onBack} className="clay-button clay-primary w-full py-5 text-xl shadow-xl">
          Start Reading Adventure
        </button>
      </div>
    );
  }

  if (mode === 'game') {
    const resetSession = () => {
      setGameSession({ currentLevel: 1, cumulativeScore: 0, status: 'idle' });
    };

    const handleLevelComplete = (level: number, score: number, stats: LevelStats) => {
      const newCumulative = gameSession.cumulativeScore + score;
      setGameSession({
        currentLevel: level,
        cumulativeScore: newCumulative,
        status: level >= 5 ? 'all-complete' : 'level-stats',
        levelStats: stats,
      });
    };

    if (gameSession.status === 'level-stats' && gameSession.levelStats) {
      const stats = gameSession.levelStats;
      const nextLevel = gameSession.currentLevel + 1;
      const totalLevels = MATCH_GAME_LEVELS.length;
      const currentLevelNum = gameSession.currentLevel;
      const levelsRemaining = totalLevels - currentLevelNum;
      
      return (
        <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-green-200 rounded-full blur-3xl opacity-40 animate-levitate pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-40 animate-levitate delay-200 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-radial from-indigo-100/50 to-transparent rounded-full pointer-events-none" />
          
          <div className="relative flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="relative"
            >
              <div className="w-28 h-28 rounded-[36px] flex items-center justify-center text-white shadow-2xl bg-gradient-to-br from-green-400 to-emerald-500">
                <Trophy className="w-14 h-14" />
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
                className="absolute -top-2 -right-2 w-10 h-10 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg"
              >
                <Sparkles className="w-5 h-5 text-white" />
              </motion.div>
            </motion.div>
            
            <div className="text-center space-y-1">
              <h2 className="text-3xl font-black text-slate-800">Level {currentLevelNum} Complete!</h2>
              <p className="text-base font-medium text-slate-500">
                {levelsRemaining > 0 ? `${levelsRemaining} more level${levelsRemaining > 1 ? 's' : ''} to go!` : 'All levels completed!'}
              </p>
            </div>
            
            <div className="w-full max-w-sm">
              <div className="flex items-center justify-between">
                {Array.from({ length: totalLevels }, (_, i) => i + 1).map((level, index) => (
                  <div key={level} className="flex items-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        level <= currentLevelNum
                          ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-200'
                          : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {level <= currentLevelNum ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        level
                      )}
                    </motion.div>
                    {index < totalLevels - 1 && (
                      <div className={`w-8 h-1 mx-1 rounded ${level < currentLevelNum ? 'bg-green-400' : 'bg-slate-200'}`} />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-xs font-semibold text-slate-400 mt-2">
                {currentLevelNum} / {totalLevels} completed
              </p>
            </div>
            
            <div className="flex gap-4 w-full max-w-md">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
                className="flex-1 rounded-2xl bg-white/20 backdrop-blur-2xl border border-white/30 shadow-[0_8px_32px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.4)] p-4 text-center flex flex-col justify-center relative overflow-hidden hover:scale-[1.02] hover:-translate-y-1 transition-all duration-150 ease-out cursor-default"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-indigo-500/10" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1 whitespace-nowrap">Best Streak</p>
                <p className="text-3xl font-black text-indigo-700 leading-none">{stats.bestStreak}</p>
                <p className="text-xs text-indigo-500 mt-1">consecutive</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
                className="flex-1 rounded-2xl bg-white/20 backdrop-blur-2xl border border-white/30 shadow-[0_8px_32px_rgba(16,185,129,0.15),inset_0_1px_0_rgba(255,255,255,0.4)] p-4 text-center flex flex-col justify-center relative overflow-hidden hover:scale-[1.02] hover:-translate-y-1 transition-all duration-150 ease-out cursor-default"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-emerald-500/10" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 whitespace-nowrap">Avg Speed</p>
                <p className="text-3xl font-black text-emerald-700 leading-none">{stats.avgSecondsPerMatch.toFixed(1)}s</p>
                <p className="text-xs text-emerald-500 mt-1">per match</p>
              </motion.div>
            </div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-slate-500 font-medium"
            >
              {stats.totalMatches} matches in {stats.timeUsed}s
            </motion.div>
            
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setGameSession(prev => ({ ...prev, currentLevel: nextLevel, status: 'playing' }))}
              className="px-8 py-3 rounded-2xl font-bold text-base bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105 active:scale-95 transition-all duration-150 ease-out group"
            >
              <div className="flex items-center">
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-150" />
                <span>Level {nextLevel}</span>
              </div>
            </motion.button>
          </div>
        </div>
      );
    }

    if (gameSession.status === 'all-complete') {
      const totalTarget = MATCH_GAME_LEVELS.reduce((sum, l) => sum + l.matchTarget, 0);
      const totalLevels = MATCH_GAME_LEVELS.length;
      const scorePercent = Math.min((gameSession.cumulativeScore / totalTarget) * 100, 100);
      
      return (
        <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-green-200 rounded-full blur-3xl opacity-50 animate-levitate pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-50 animate-levitate delay-200 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-amber-100/60 to-transparent rounded-full pointer-events-none" />
          
          <div className="relative flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="relative"
            >
              <div className="w-32 h-32 rounded-[40px] flex items-center justify-center text-white shadow-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500">
                <Trophy className="w-16 h-16" />
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: 'spring' }}
                className="absolute -top-3 -right-3"
              >
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-r from-yellow-300 to-amber-400 rounded-full flex items-center justify-center shadow-lg">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 bg-yellow-300 rounded-full blur-md"
                  />
                </div>
              </motion.div>
            </motion.div>
            
            <div className="text-center space-y-3">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl font-black text-slate-800"
              >
                All Levels Complete!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-bold text-slate-500"
              >
                Final Score: {gameSession.cumulativeScore} / {totalTarget}
              </motion.p>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="w-full max-w-sm"
            >
              <div className="flex justify-between text-xs font-semibold text-slate-400 mb-2">
                <span>All {totalLevels} Levels</span>
                <span>{Math.round(scorePercent)}%</span>
              </div>
              <div className="h-4 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scorePercent}%` }}
                  transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-full relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
                  <motion.div
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
                  />
                </motion.div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2 text-slate-500">
                <Target className="w-5 h-5 text-indigo-500" />
                <span className="font-medium">{totalLevels} Levels</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span className="font-medium">{gameSession.cumulativeScore} Points</span>
              </div>
            </motion.div>
            
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setMode('wall'); resetSession(); }}
              className="px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 transition-all relative overflow-hidden group"
            >
              <span className="relative z-10">Return to Word Wall</span>
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.button>
          </div>
        </div>
      );
    }

    const cfg = MATCH_GAME_LEVELS[gameSession.currentLevel - 1];
    return (
      <WordMatchGame
        key={gameSession.currentLevel}
        reviews={reviews}
        onBack={() => { setMode('wall'); resetSession(); }}
        onLevelComplete={handleLevelComplete}
        mode={cfg.mode}
        level={cfg.level}
        timeLimit={cfg.timeLimit}
        matchTarget={cfg.matchTarget}
        soundThreshold={cfg.soundThreshold}
        cumulativeScore={gameSession.cumulativeScore}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full">
      {reviews.length >= 5 && (
        <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-20">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setGameSession({ currentLevel: 1, cumulativeScore: 0, status: 'playing' });
              setMode('game');
            }}
            className="px-5 py-2.5 rounded-2xl font-bold transition-all text-base bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 hover:scale-105 group"
          >
            <div className="flex items-center">
              <Gamepad2 className="w-7 h-7 mr-2 group-hover:rotate-12 group-hover:scale-125 transition-transform" />
              <span>Play Match Game</span>
            </div>
          </motion.button>
        </div>
      )}
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Title 
          title="Word Wall" 
          subtitle="Your magical word collection!"
          icon={<BookOpen className="w-8 h-8 text-white drop-shadow-lg" />}
          badge={{ icon: <Target className="w-5 h-5 text-white" />, text: `${reviews.length} words collected!` }}
        />

        <div className="flex gap-6 md:gap-8 pb-20 items-start">
          {mounted ? (
            Array.from({ length: columns }).map((_, colIdx) => (
              <div key={colIdx} className="flex-1 flex flex-col gap-6 md:gap-8">
                <AnimatePresence mode="popLayout">
                  {reviews.filter((_, idx) => idx % columns === colIdx).map((review) => {
                    const originalIndex = reviews.findIndex(r => r.vocab_id === review.vocab_id);
                    return (
                      <motion.div
                        key={review.vocab_id}
                        layout
                        initial={{ opacity: 0, y: 30, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ 
                          type: "spring", 
                          stiffness: 100, 
                          damping: 20,
                          delay: originalIndex * 0.05 
                        }}
                      >
                        <ClayWordCard 
                          review={review} 
                          index={originalIndex}
                          onRefresh={handleWordRefresh}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8 w-full">
              {reviews.map((review, idx) => (
                <div key={review.vocab_id}>
                  <ClayWordCard review={review} index={idx} onRefresh={handleWordRefresh} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
