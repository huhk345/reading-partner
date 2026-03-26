'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Check, Volume2, Sparkles, Target, History, RotateCw, BookOpen, Gamepad2 } from 'lucide-react';
import { VocabReview } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import Title from './Title';
import WordMatchGame from './WordMatchGame';

interface ReviewProps {
  onBack: () => void;
}

const ClayWordCard = ({ 
  review,
  index
}: { 
  review: VocabReview; 
  index: number;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAutoFlipped, setIsAutoFlipped] = useState(false);
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

  const speak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (review.audio_url) {
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
          <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            <div className="text-center pt-1">
              <h4 className="text-lg font-black text-slate-800 leading-tight font-baloo">{review.word}</h4>
              <p className="text-indigo-400 font-bold text-[10px] uppercase tracking-widest">{review.phonetic}</p>
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
    return <WordMatchGame reviews={reviews} onBack={() => setMode('wall')} />;
  }

  return (
    <div className="max-w-6xl mx-auto w-full">
      {reviews.length >= 5 && (
        <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-20">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setMode('game')}
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
                  <ClayWordCard review={review} index={idx} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
