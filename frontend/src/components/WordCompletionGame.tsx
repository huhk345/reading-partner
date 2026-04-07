'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { VocabReview, LevelStats } from '../types';
import { cn } from '../lib/utils';
import { Timer, Trophy, Gamepad2, Volume2, LogOut } from 'lucide-react';

interface WordCompletionGameProps {
  reviews: VocabReview[];
  onBack: () => void;
  onRestart?: () => void;
  onLevelComplete?: (level: number, score: number, stats: LevelStats) => void;
  level?: number;
  timeLimit?: number;
  bonusTime?: number;
  matchTarget?: number;
  cumulativeScore?: number;
}

// Audio feedback using Web Audio API
const playFeedback = (type: 'correct' | 'wrong') => {
  try {
    const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn('Audio feedback failed', e);
  }
};

function fallbackSpeak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

async function speakWord(word: string, wordId?: number, audio_url?: string, onStart?: () => void, onEnd?: () => void) {
  const playAudio = (url: string) => {
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      onStart?.();
      audio.onended = () => {
        onEnd?.();
        resolve(true);
      };
      audio.onerror = () => {
        onEnd?.();
        resolve(false);
      };
      audio.play().catch(() => {
        onEnd?.();
        resolve(false);
      });
      // Safety timeout
      setTimeout(() => {
        onEnd?.();
        resolve(false);
      }, 5000);
    });
  };

  if (wordId) {
    const success = await playAudio(`${api.defaults.baseURL}/api/audio/${wordId}`);
    if (success) return;
  }

  if (audio_url) {
    const success = await playAudio(audio_url);
    if (success) return;
  }
  try {
    const res = await api.post('/api/tts/light', null, {
      params: { text: word },
    });
    if (res.data.audio_url) {
      await playAudio(res.data.audio_url);
    } else {
      fallbackSpeak(word);
    }
  } catch {
    fallbackSpeak(word);
  }
}

function getBlanksForWord(word: string, count: number): number[] {
  const letters = word.split('').map((char, index) => ({ char, index })).filter(item => /[a-zA-Z]/.test(item.char));
  if (letters.length === 0) return [];
  
  const actualCount = Math.min(count, Math.max(1, letters.length - 1));
  
  const shuffled = letters.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, actualCount).map(item => item.index).sort((a, b) => a - b);
}

function getOptionsForBlank(correctLetter: string, count: number): string[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const options = [correctLetter.toLowerCase()];
  while (options.length < count) {
    const randomLetter = alphabet[Math.floor(Math.random() * 26)];
    if (!options.includes(randomLetter)) {
      options.push(randomLetter);
    }
  }
  return options.sort(() => Math.random() - 0.5);
}

function getMeaningBeforeDefinition(meaning: string): string {
  if (!meaning) return '';
  const parts = meaning.split('【Definition】');
  return parts[0].trim();
}

export default function WordCompletionGame({ 
  reviews, 
  onBack, 
  onRestart,
  onLevelComplete, 
  level = 1, 
  timeLimit = 60, 
  bonusTime = 0,
  matchTarget = 5,
  cumulativeScore = 0 
}: WordCompletionGameProps) {
  
  // Level Config
  const totalTimeLimit = timeLimit + bonusTime;
  const blanksPerWord = level === 1 ? 1 : level === 2 ? 2 : (level >= 3 ? 3 : 2);
  const optionsCount = level >= 5 ? 3 : 2;
  const isSoundMode = level >= 4;

  const buildInitial = useCallback(() => {
    const valid = reviews.filter(r => r.word && r.word.length > 1 && /[a-zA-Z]/.test(r.word));
    const shuffled = [...valid].sort(() => Math.random() - 0.5);
    let initialBlanks: number[] = [];
    let initialOptions: string[] = [];
    if (shuffled.length > 0) {
      initialBlanks = getBlanksForWord(shuffled[0].word, blanksPerWord);
      if (level > 2) {
        const required = initialBlanks.map(idx => shuffled[0].word[idx].toLowerCase());
        const alphabet = 'abcdefghijklmnopqrstuvwxyz';
        initialOptions = [...required];
        while (initialOptions.length < 8) {
          const randomLetter = alphabet[Math.floor(Math.random() * 26)];
          initialOptions.push(randomLetter);
        }
        initialOptions.sort(() => Math.random() - 0.5);
      } else {
        const correctLetter = shuffled[0].word[initialBlanks[0]];
        initialOptions = getOptionsForBlank(correctLetter, optionsCount);
      }
    }
    return { valid, shuffled, initialBlanks, initialOptions };
  }, [reviews, blanksPerWord, level, optionsCount]);

  const initial = useMemo(() => buildInitial(), [buildInitial]);

  const [shuffledReviews] = useState<VocabReview[]>(
    () => initial.shuffled
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(totalTimeLimit);
  const [gameOver, setGameOver] = useState<{ won: boolean } | null>(null);
  const [activeBlankIdx, setActiveBlankIdx] = useState(0); // Index into currentBlanks
  const [currentBlanks, setCurrentBlanks] = useState<number[]>(() => initial.initialBlanks);
  const [currentOptions, setCurrentOptions] = useState<string[]>(() => initial.initialOptions);
  const [filledLetters, setFilledLetters] = useState<Record<number, string>>({});
  const [usedOptionIndices, setUsedOptionIndices] = useState<number[]>([]);
  const [wrongOption, setWrongOption] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentReview = shuffledReviews[currentIndex];

  const initWord = useCallback((review: VocabReview) => {
    if (!review) return;
    const blanks = getBlanksForWord(review.word, blanksPerWord);
    setCurrentBlanks(blanks);
    setActiveBlankIdx(0);
    setFilledLetters({});
    setUsedOptionIndices([]);
    setWrongOption(null);

    let newOptions: string[] = [];
    if (level > 2) {
      const required = blanks.map(idx => review.word[idx].toLowerCase());
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      newOptions = [...required];
      while (newOptions.length < 8) {
        const randomLetter = alphabet[Math.floor(Math.random() * 26)];
        newOptions.push(randomLetter);
      }
      newOptions.sort(() => Math.random() - 0.5);
    } else {
      const correctLetter = review.word[blanks[0]];
      newOptions = getOptionsForBlank(correctLetter, optionsCount);
    }
    setCurrentOptions(newOptions);
    
    speakWord(review.word, review.word_id, review.audio_url, () => setIsPlaying(true), () => setIsPlaying(false));
  }, [blanksPerWord, level, optionsCount]);

  // Handle first word sound if needed
  const firstWordSoundPlayed = useRef(false);
  useEffect(() => {
    if (shuffledReviews.length > 0 && !firstWordSoundPlayed.current) {
      firstWordSoundPlayed.current = true;
      speakWord(shuffledReviews[0].word, shuffledReviews[0].word_id, shuffledReviews[0].audio_url, () => setIsPlaying(true), () => setIsPlaying(false));
    }
  }, [shuffledReviews]);

  useEffect(() => {
    if (gameOver) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setGameOver({ won: false });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [gameOver]);

  const handleOptionClick = (letter: string, optionIndex?: number) => {
    if (gameOver || !currentReview) return;
    if (level > 2 && optionIndex !== undefined && usedOptionIndices.includes(optionIndex)) return;
    
    const correctLetter = currentReview.word[currentBlanks[activeBlankIdx]].toLowerCase();
    
    if (letter === correctLetter) {
      playFeedback('correct');
      setFilledLetters(prev => ({ ...prev, [currentBlanks[activeBlankIdx]]: letter }));
      if (level > 2 && optionIndex !== undefined) {
        setUsedOptionIndices(prev => [...prev, optionIndex]);
      }
      setWrongOption(null);
      
      if (activeBlankIdx + 1 < currentBlanks.length) {
        const nextBlankIdx = activeBlankIdx + 1;
        setActiveBlankIdx(nextBlankIdx);
        if (level <= 2) {
          const nextCorrectLetter = currentReview.word[currentBlanks[nextBlankIdx]];
          setCurrentOptions(getOptionsForBlank(nextCorrectLetter, optionsCount));
        }
      } else {
        // Word completed
        const nextScore = score + 1;
        setScore(nextScore);
        scoreRef.current = nextScore;
        streakRef.current += 1;
        if (streakRef.current > bestStreakRef.current) {
          bestStreakRef.current = streakRef.current;
        }

        if (nextScore >= matchTarget) {
          const stats: LevelStats = {
            bestStreak: bestStreakRef.current,
            avgSecondsPerMatch: (totalTimeLimit - timeLeft) / nextScore,
            totalMatches: nextScore,
            timeUsed: totalTimeLimit - timeLeft,
            timeLeft: timeLeft,
          };
          onLevelComplete?.(level, nextScore, stats);
          return;
        }

        // Move to next word after a short delay
        setTimeout(() => {
          const nextIndex = (currentIndex + 1) % shuffledReviews.length;
          setCurrentIndex(nextIndex);
          initWord(shuffledReviews[nextIndex]);
        }, 600);
      }
    } else {
      playFeedback('wrong');
      setWrongOption(letter);
      streakRef.current = 0;
      setTimeout(() => setWrongOption(null), 400);
    }
  };

  if (!currentReview) return null;

  const progress = (score / matchTarget) * 100;

  if (gameOver && !gameOver.won) {
    return (
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-orange-200 rounded-full blur-3xl opacity-40 animate-levitate pointer-events-none" />
        <div className="relative flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            className="w-32 h-32 rounded-[40px] flex items-center justify-center text-white shadow-2xl bg-gradient-to-br from-orange-400 to-red-500"
          >
            <Trophy className="w-16 h-16" />
          </motion.div>
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-black text-slate-800">Time Up!</h2>
            <p className="text-xl font-bold text-slate-500">
              Score: {cumulativeScore + score}
            </p>
          </div>
          <div className="flex flex-col gap-3 w-96">
            <button
              onClick={onRestart}
              className="w-full py-4 rounded-2xl font-bold text-lg bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105 active:scale-95 transition-all group flex items-center justify-center gap-2"
            >
              <Gamepad2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
              <span>Restart Game</span>
            </button>
            <button 
              onClick={onBack} 
              className="w-full py-4 rounded-2xl font-bold text-lg bg-slate-500 text-white shadow-lg shadow-slate-200 hover:shadow-xl hover:shadow-slate-300 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 group"
            >
              <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span>Quit Game</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center min-h-[80vh] p-4 max-w-2xl mx-auto w-full pt-8 overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-20 -left-20 w-72 h-72 bg-green-200 rounded-full blur-3xl opacity-40 animate-levitate pointer-events-none" />
      <div className="absolute top-40 -right-16 w-60 h-60 bg-blue-200 rounded-full blur-3xl opacity-40 animate-levitate delay-200 pointer-events-none" />

      {/* HUD */}
      <div className="relative w-full mb-12">
        <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-lg p-4">
          <div className="flex justify-between items-center mb-3 px-2">
            <button 
              onClick={onBack} 
              className="px-4 py-1.5 rounded-xl font-bold text-xs bg-slate-100 text-slate-500 flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shadow-sm shadow-slate-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Quit</span>
            </button>
            <div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              Level {level}
            </div>
            <div className="flex items-center gap-2 text-slate-600 font-bold">
              <Timer className={cn("w-5 h-5", timeLeft < 10 && "text-red-500 animate-pulse")} />
              <span className={cn("tabular-nums", timeLeft < 10 && "text-red-500")}>
                {timeLeft}s
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 font-bold">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span className="tabular-nums">{cumulativeScore + score}</span>
            </div>
          </div>
          <div className="h-3 bg-white/50 rounded-full overflow-hidden border border-white/70">
            <motion.div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* Game Content */}
      <div className="flex-1 w-full flex flex-col items-center justify-center gap-12">
        {/* Prompt */}
        <div className="text-center space-y-4">
          {isSoundMode ? (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => speakWord(currentReview.word, currentReview.word_id, currentReview.audio_url, () => setIsPlaying(true), () => setIsPlaying(false))}
              className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-200"
            >
              <Volume2 className={cn("w-10 h-10", isPlaying && "animate-pulse")} />
            </motion.button>
          ) : (
            <h2 className="text-3xl font-black text-slate-800 font-baloo px-4">
              {getMeaningBeforeDefinition(currentReview.meaning || '')}
            </h2>
          )}
        </div>

        {/* Word Display */}
        <div className="flex flex-wrap justify-center gap-2">
          {currentReview.word.split('').map((char, idx) => {
            const isBlank = currentBlanks.includes(idx);
            const isActive = isBlank && currentBlanks[activeBlankIdx] === idx;
            const isFilled = isBlank && filledLetters[idx] !== undefined;
            
            return (
              <motion.div
                key={`${currentIndex}-${idx}`}
                layoutId={`${currentIndex}-${idx}`}
                className={cn(
                  "w-12 h-16 md:w-14 md:h-20 rounded-2xl flex items-center justify-center text-3xl md:text-4xl font-black transition-all",
                  isBlank 
                    ? (isFilled 
                        ? "bg-emerald-100 text-emerald-600 border-2 border-emerald-300 shadow-sm"
                        : isActive 
                          ? "bg-white border-2 border-indigo-500 text-indigo-500 shadow-indigo-100 animate-pulse scale-105"
                          : "bg-slate-100 border-2 border-dashed border-slate-300 text-transparent")
                    : "bg-white/40 text-slate-400 border border-white/80"
                )}
              >
                {isBlank ? (isFilled ? filledLetters[idx].toUpperCase() : '_') : char.toUpperCase()}
              </motion.div>
            );
          })}
        </div>

        {/* Options */}
        <div className="w-full max-w-2xl px-4">
          <AnimatePresence mode="wait">
            <motion.div 
              key={level > 2 ? `options-${currentIndex}` : `options-${currentIndex}-${activeBlankIdx}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={cn(
                "flex flex-wrap justify-center gap-2 md:gap-3",
                level > 2 ? "" : "gap-4"
              )}
            >
              {currentOptions.map((letter, idx) => {
                const isUsed = level > 2 && usedOptionIndices.includes(idx);
                return (
                  <motion.button
                    key={`${currentIndex}-${idx}`}
                    whileHover={isUsed ? {} : { scale: 1.05 }}
                    whileTap={isUsed ? {} : { scale: 0.95 }}
                    onClick={() => handleOptionClick(letter, idx)}
                    animate={wrongOption === letter ? { x: [-5, 5, -5, 5, 0], backgroundColor: '#fecaca' } : {}}
                    disabled={isUsed}
                    className={cn(
                      level > 2 ? "w-14 h-14 md:w-16 md:h-16 text-2xl" : "w-16 h-16 md:w-20 md:h-20 text-3xl",
                      "rounded-xl md:rounded-2xl flex items-center justify-center font-black shadow-lg border-2 transition-all",
                      isUsed 
                        ? "opacity-0 pointer-events-none" 
                        : (wrongOption === letter 
                            ? "bg-red-100 border-red-400 text-red-600" 
                            : "bg-white border-white text-slate-700 hover:border-indigo-200")
                    )}
                  >
                    {letter.toUpperCase()}
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
