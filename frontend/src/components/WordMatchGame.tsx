'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VocabReview } from '../types';
import { cn, extractShortMeaning } from '../lib/utils';
import { Timer, Trophy, X, Gamepad2 } from 'lucide-react';

type SlotData = {
  id: string;
  vocabId: number;
  text: string;
  lang: 'en' | 'zh';
  state: 'idle' | 'selected' | 'correct' | 'wrong';
  audio_url?: string;
};

interface WordMatchGameProps {
  reviews: VocabReview[];
  onBack: () => void;
}

const MAX_SCORE = 45;
const TIME_LIMIT = 120;
const SLOTS_COUNT = 5;

function fallbackSpeak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

function speakWord(word: string, audio_url?: string) {
  if (audio_url) {
    const audio = new Audio(audio_url);
    audio.play().catch(() => fallbackSpeak(word));
  } else {
    fallbackSpeak(word);
  }
}

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
      audio_url: r.audio_url,
    }))
    .sort(() => Math.random() - 0.5);

  const right = initialPairs
    .map((r) => ({
      id: `right-${r.vocab_id}-0`,
      vocabId: r.vocab_id,
      text: extractShortMeaning(r.meaning || ''),
      lang: 'zh' as const,
      state: 'idle' as const,
    }))
    .sort(() => Math.random() - 0.5);

  return { left, right, queue: initialQueue };
}

const slotBase =
  'absolute inset-0 w-full h-full rounded-2xl flex items-center justify-center text-lg font-bold transition-all active:scale-95 select-none backdrop-blur-md border shadow-lg';

function slotClass(
  state: SlotData['state'],
  isSelected: boolean,
  lang: 'en' | 'zh'
) {
  if (state === 'correct') {
    return cn(
      slotBase,
      'bg-emerald-400/70 border-emerald-300/80 text-white shadow-emerald-500/20 z-10'
    );
  }
  if (state === 'wrong') {
    return cn(
      slotBase,
      'bg-red-400/70 border-red-300/80 text-white shadow-red-500/20 z-10'
    );
  }
  if (isSelected) {
    return cn(
      slotBase,
      lang === 'en'
        ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-700 shadow-emerald-500/10 ring-2 ring-emerald-400/40'
        : 'bg-sky-500/25 border-sky-400/50 text-sky-700 shadow-sky-500/10 ring-2 ring-sky-400/40'
    );
  }
  return cn(
    slotBase,
    'bg-white/60 border-white/80 text-slate-700 hover:bg-white/80 hover:border-white/90'
  );
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
        // Play word sound when clicking English word
        const slot = leftSlots[index];
        if (slot && slot.lang === 'en') {
          speakWord(slot.text, slot.audio_url);
        }
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
                  audio_url: nextReview.audio_url,
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
                  text: extractShortMeaning(nextReview.meaning || ''),
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
      <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-green-200 rounded-full blur-3xl opacity-40 animate-levitate pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-blue-200 rounded-full blur-3xl opacity-40 animate-levitate delay-200 pointer-events-none" />

        <div className="relative flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
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
          <div className="flex flex-col gap-3 w-96">
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
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 hover:scale-105 active:scale-95 transition-all group flex items-center justify-center gap-2"
            >
              <Gamepad2 className="w-6 h-6 group-hover:rotate-12 group-hover:scale-110 transition-transform" />
              <span>Play Match Game</span>
            </button>
            <button
              onClick={onBack}
              className="w-full py-4 rounded-2xl font-bold text-lg border-2 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center gap-2 group"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
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
      <div className="absolute bottom-20 left-1/3 w-48 h-48 bg-purple-200 rounded-full blur-3xl opacity-30 animate-levitate delay-500 pointer-events-none" />

      {/* HUD */}
      <div className="relative w-full mb-8">
        <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-white/80 shadow-lg p-4">
          <div className="flex justify-between items-center mb-3 px-2">
            <button
              onClick={onBack}
              className="px-4 py-1.5 rounded-xl font-bold transition-all text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 hover:scale-105 active:scale-95 flex items-center gap-1.5 group"
            >
              <X className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              <span>Quit Game</span>
            </button>
            <div className="flex items-center gap-2 text-slate-600 font-bold text-xl">
              <Timer
                className={cn(
                  'w-6 h-6',
                  timeLeft < 15 && 'text-red-500 animate-pulse'
                )}
              />
              <span
                className={cn(
                  'tabular-nums',
                  timeLeft < 15 && 'text-red-500'
                )}
              >
                {Math.floor(timeLeft / 60)}:
                {(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 font-bold text-xl">
              <Trophy className="w-6 h-6 text-amber-500" />
              <span className="tabular-nums">
                {score} / {MAX_SCORE}
              </span>
            </div>
          </div>
          <div className="h-4 bg-white/50 backdrop-blur-sm rounded-full overflow-hidden border border-white/70 shadow-inner">
            <motion.div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full shadow-sm"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="relative flex justify-center gap-4 w-full">
        {/* Left Column */}
        <div className="flex flex-col gap-3 flex-1">
          <div className="text-center mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              English
            </span>
          </div>
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
                    slotClass(
                      slot.state,
                      selectedLeft === index,
                      'en'
                    )
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
          <div className="text-center mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              中文
            </span>
          </div>
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
                    slotClass(
                      slot.state,
                      selectedRight === index,
                      'zh'
                    )
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
