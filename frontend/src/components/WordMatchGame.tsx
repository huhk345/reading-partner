'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VocabReview } from '../types';
import { cn } from '../lib/utils';
import { Timer, Trophy, X } from 'lucide-react';

type SlotData = {
  id: string;
  vocabId: number;
  text: string;
  lang: 'en' | 'zh';
  state: 'idle' | 'selected' | 'correct' | 'wrong';
};

interface WordMatchGameProps {
  reviews: VocabReview[];
  onBack: () => void;
}

const MAX_SCORE = 20;
const TIME_LIMIT = 120;
const SLOTS_COUNT = 5;

function buildSlots(reviews: VocabReview[]) {
  const shuffled = [...reviews].sort(() => Math.random() - 0.5);
  const initialPairs = shuffled.slice(0, SLOTS_COUNT);
  const initialQueue = shuffled.slice(SLOTS_COUNT);

  const left = initialPairs
    .map((r) => ({
      id: `left-${r.vocab_id}-0`,
      vocabId: r.vocab_id,
      text: r.word,
      lang: 'en' as const,
      state: 'idle' as const,
    }))
    .sort(() => Math.random() - 0.5);

  const right = initialPairs
    .map((r) => ({
      id: `right-${r.vocab_id}-0`,
      vocabId: r.vocab_id,
      text: r.meaning || '',
      lang: 'zh' as const,
      state: 'idle' as const,
    }))
    .sort(() => Math.random() - 0.5);

  return { left, right, queue: initialQueue };
}

export default function WordMatchGame({ reviews, onBack }: WordMatchGameProps) {
  const [leftSlots, setLeftSlots] = useState<SlotData[]>([]);
  const [rightSlots, setRightSlots] = useState<SlotData[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gameOver, setGameOver] = useState<{ won: boolean } | null>(null);
  const initedRef = useRef(false);
  const scoreRef = useRef(0);
  const queueRef = useRef<VocabReview[]>([]);
  const reviewsRef = useRef(reviews);

  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    if (reviews.length < SLOTS_COUNT) {
      onBack();
      return;
    }

    const { left, right, queue } = buildSlots(reviews);
    setLeftSlots(left);
    setRightSlots(right);
    queueRef.current = queue;
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(TIME_LIMIT);
  });

  // Timer with integrated game-over detection
  useEffect(() => {
    if (gameOver) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timer);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameOver]);

  // Detect time up in a separate effect that only triggers the game-over state
  useEffect(() => {
    if (timeLeft === 0 && !gameOver) {
      setGameOver({ won: false });
    }
  }, [timeLeft, gameOver]);

  const handleSelect = useCallback(
    (side: 'left' | 'right', index: number) => {
      if (isAnimating || gameOver) return;

      let newLeft = selectedLeft;
      let newRight = selectedRight;

      if (side === 'left') {
        newLeft = selectedLeft === index ? null : index;
        setSelectedLeft(newLeft);
      } else {
        newRight = selectedRight === index ? null : index;
        setSelectedRight(newRight);
      }

      if (newLeft !== null && newRight !== null) {
        setIsAnimating(true);
        const leftSlot = leftSlots[newLeft];
        const rightSlot = rightSlots[newRight];

        if (leftSlot.vocabId === rightSlot.vocabId) {
          setLeftSlots((prev) =>
            prev.map((s, i) =>
              i === newLeft ? { ...s, state: 'correct' } : s
            )
          );
          setRightSlots((prev) =>
            prev.map((s, i) =>
              i === newRight ? { ...s, state: 'correct' } : s
            )
          );

          setTimeout(() => {
            const newScore = scoreRef.current + 1;
            setScore(newScore);
            scoreRef.current = newScore;

            if (newScore >= MAX_SCORE) {
              setGameOver({ won: true });
              setSelectedLeft(null);
              setSelectedRight(null);
              setIsAnimating(false);
              return;
            }

            let nextReview = queueRef.current[0];
            const restQueue = queueRef.current.slice(1);

            if (!nextReview) {
              nextReview =
                reviewsRef.current[
                  Math.floor(Math.random() * reviewsRef.current.length)
                ];
            } else {
              queueRef.current = restQueue;
            }

            setLeftSlots((prev) => {
              const newSlots = [...prev];
              if (newLeft !== null) {
                newSlots[newLeft] = {
                  id: `left-${nextReview.vocab_id}-${newScore}`,
                  vocabId: nextReview.vocab_id,
                  text: nextReview.word,
                  lang: 'en',
                  state: 'idle',
                };
              }
              return newSlots;
            });

            setRightSlots((prev) => {
              const newSlots = [...prev];
              if (newRight !== null) {
                newSlots[newRight] = {
                  id: `right-${nextReview.vocab_id}-${newScore}`,
                  vocabId: nextReview.vocab_id,
                  text: nextReview.meaning || '',
                  lang: 'zh',
                  state: 'idle',
                };
              }
              return newSlots;
            });

            setSelectedLeft(null);
            setSelectedRight(null);
            setIsAnimating(false);
          }, 250);
        } else {
          setLeftSlots((prev) =>
            prev.map((s, i) =>
              i === newLeft ? { ...s, state: 'wrong' } : s
            )
          );
          setRightSlots((prev) =>
            prev.map((s, i) =>
              i === newRight ? { ...s, state: 'wrong' } : s
            )
          );

          setTimeout(() => {
            setLeftSlots((prev) =>
              prev.map((s, i) =>
                i === newLeft ? { ...s, state: 'idle' } : s
              )
            );
            setRightSlots((prev) =>
              prev.map((s, i) =>
                i === newRight ? { ...s, state: 'idle' } : s
              )
            );
            setSelectedLeft(null);
            setSelectedRight(null);
            setIsAnimating(false);
          }, 400);
        }
      }
    },
    [isAnimating, gameOver, selectedLeft, selectedRight, leftSlots, rightSlots]
  );

  const progress = Math.min((score / MAX_SCORE) * 100, 100);

  if (gameOver) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in zoom-in-95 duration-500">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className={cn(
            'w-32 h-32 rounded-[40px] flex items-center justify-center text-white shadow-2xl',
            gameOver.won
              ? 'bg-gradient-to-br from-green-400 to-emerald-500'
              : 'bg-gradient-to-br from-orange-400 to-red-500'
          )}
        >
          <Trophy className="w-16 h-16" />
        </motion.div>
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-black text-slate-800">
            {gameOver.won ? 'You Win!' : 'Time Up!'}
          </h2>
          <p className="text-xl font-bold text-slate-500">
            Score: {score} / {MAX_SCORE}
          </p>
        </div>
        <div className="flex gap-4 w-full max-w-xs">
          <button
            onClick={() => {
              const { left, right, queue } = buildSlots(reviews);
              setLeftSlots(left);
              setRightSlots(right);
              queueRef.current = queue;
              setScore(0);
              scoreRef.current = 0;
              setTimeLeft(TIME_LIMIT);
              setSelectedLeft(null);
              setSelectedRight(null);
              setIsAnimating(false);
              setGameOver(null);
            }}
            className="flex-1 py-4 rounded-2xl font-bold text-lg bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            Play Again
          </button>
          <button
            onClick={onBack}
            className="flex-1 py-4 rounded-2xl font-bold text-lg bg-slate-200 text-slate-700 hover:bg-slate-300 active:scale-95 transition-all"
          >
            Word Wall
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-[80vh] p-4 max-w-2xl mx-auto w-full pt-8">
      {/* HUD */}
      <div className="w-full mb-8">
        <div className="flex justify-between items-center mb-3 px-2">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold transition-colors"
          >
            <X className="w-5 h-5" />
            <span className="text-sm">Quit</span>
          </button>
          <div className="flex items-center gap-2 text-slate-300 font-bold text-xl">
            <Timer
              className={cn(
                'w-6 h-6',
                timeLeft < 15 && 'text-red-500 animate-pulse'
              )}
            />
            <span className={cn(timeLeft < 15 && 'text-red-500')}>
              {Math.floor(timeLeft / 60)}:
              {(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 font-bold text-xl">
            <Trophy className="w-6 h-6 text-amber-400" />
            <span>
              {score} / {MAX_SCORE}
            </span>
          </div>
        </div>
        <div className="h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-400"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex justify-center gap-4 w-full">
        {/* Left Column */}
        <div className="flex flex-col gap-3 flex-1">
          {leftSlots.map((slot, index) => (
            <div
              key={`left-slot-${index}`}
              className="relative h-20 w-full"
            >
              <AnimatePresence mode="popLayout">
                <motion.button
                  key={slot.id}
                  initial={{ y: 20, opacity: 0, scale: 0.9 }}
                  animate={{
                    y: 0,
                    opacity: 1,
                    scale: slot.state === 'correct' ? 1.05 : 1,
                    x: slot.state === 'wrong' ? [0, -8, 8, -8, 8, 0] : 0,
                  }}
                  exit={{
                    scale: 0.8,
                    opacity: 0,
                    transition: { duration: 0.15 },
                  }}
                  transition={{ duration: 0.2 }}
                  onClick={() => handleSelect('left', index)}
                  className={cn(
                    'absolute inset-0 w-full h-full rounded-2xl border-b-4 flex items-center justify-center text-lg font-bold transition-all active:border-b-0 active:translate-y-1 select-none',
                    slot.state === 'idle' &&
                      selectedLeft !== index &&
                      'bg-slate-800 border-slate-900 text-slate-200 hover:bg-slate-700',
                    selectedLeft === index &&
                      slot.state === 'idle' &&
                      'bg-indigo-500/20 border-indigo-600 text-indigo-300 ring-2 ring-indigo-500',
                    slot.state === 'correct' &&
                      'bg-green-500 border-green-700 text-white z-10',
                    slot.state === 'wrong' &&
                      'bg-red-500 border-red-700 text-white z-10'
                  )}
                >
                  {slot.text}
                </motion.button>
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-3 flex-1">
          {rightSlots.map((slot, index) => (
            <div
              key={`right-slot-${index}`}
              className="relative h-20 w-full"
            >
              <AnimatePresence mode="popLayout">
                <motion.button
                  key={slot.id}
                  initial={{ y: 20, opacity: 0, scale: 0.9 }}
                  animate={{
                    y: 0,
                    opacity: 1,
                    scale: slot.state === 'correct' ? 1.05 : 1,
                    x: slot.state === 'wrong' ? [0, -8, 8, -8, 8, 0] : 0,
                  }}
                  exit={{
                    scale: 0.8,
                    opacity: 0,
                    transition: { duration: 0.15 },
                  }}
                  transition={{ duration: 0.2 }}
                  onClick={() => handleSelect('right', index)}
                  className={cn(
                    'absolute inset-0 w-full h-full rounded-2xl border-b-4 flex items-center justify-center text-lg font-bold transition-all active:border-b-0 active:translate-y-1 select-none',
                    slot.state === 'idle' &&
                      selectedRight !== index &&
                      'bg-slate-800 border-slate-900 text-slate-200 hover:bg-slate-700',
                    selectedRight === index &&
                      slot.state === 'idle' &&
                      'bg-indigo-500/20 border-indigo-600 text-indigo-300 ring-2 ring-indigo-500',
                    slot.state === 'correct' &&
                      'bg-green-500 border-green-700 text-white z-10',
                    slot.state === 'wrong' &&
                      'bg-red-500 border-red-700 text-white z-10'
                  )}
                >
                  {slot.text}
                </motion.button>
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
