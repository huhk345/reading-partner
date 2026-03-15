'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Check, Volume2, Sparkles, History, RotateCw } from 'lucide-react';
import { VocabReview } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

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

  return (
    <motion.div 
      layout
      className="break-inside-avoid mb-6 perspective-1000 cursor-pointer group"
      onClick={() => setIsFlipped(!isFlipped)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.div
        layout
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 150, 
          damping: 20,
          mass: 0.8,
          layout: { duration: 0.4, type: "spring", stiffness: 200, damping: 25 }
        }}
        className="w-full relative preserve-3d"
      >
        {/* 
          Front Side: Fixed height for uniformity 
          Back Side: Auto height based on content
          The container will animate height changes due to the layout prop.
        */}
        
        {/* Front of Card - Uniform height (e.g., 180px) */}
        <div 
          className={`
            backface-hidden rounded-[32px] p-6 flex flex-col items-center justify-center text-center border-2 
            bg-gradient-to-br backdrop-blur-md 
            shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,0.7),inset_0_-4px_8px_rgba(0,0,0,0.05)] 
            ${cardStyle}
            ${isFlipped ? 'invisible h-0' : 'h-[180px] w-full'}
          `}
        >
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

        {/* Back of Card - Auto height, absolute positioned but occupying space when flipped */}
        <div 
          className={`
            backface-hidden rounded-[32px] bg-white p-6 flex flex-col border-2 border-slate-100 
            shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,1)]
            ${!isFlipped ? 'invisible absolute inset-0 rotate-y-180' : 'relative rotate-y-180 h-auto min-h-[180px] w-full'}
          `}
          style={{ transform: 'rotateY(180deg)' }}
        >
          <div className="flex-1 space-y-4">
            <div className="text-center">
              <h4 className="text-xl font-black text-slate-800 leading-tight font-baloo">{review.word}</h4>
              <p className="text-indigo-400 font-bold text-[10px] uppercase tracking-widest">{review.phonetic}</p>
            </div>
            
            <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-100 to-transparent w-full" />
            
            <div className="space-y-1.5">
              <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest px-2.5 py-0.5 bg-indigo-50 rounded-full">Meaning</span>
              <p className="text-slate-600 font-medium text-[13px] leading-relaxed italic px-1">
                {review.meaning}
              </p>
            </div>

            {review.occurrences && review.occurrences.length > 0 && (
              <div className="pt-1">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <History className="w-3 h-3 text-indigo-300" />
                  Context
                </h5>
                <div className="p-3 rounded-2xl bg-slate-50/50 border border-slate-100 italic text-[11px] text-slate-500 leading-normal relative">
                  &quot;{review.occurrences[0].sentence}&quot;
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-50 flex flex-col items-center">
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

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:8000/api/vocab/all');
      setReviews(response.data);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 gap-6">
      <div className="relative">
        <div className="w-20 h-20 border-8 border-indigo-100 border-t-indigo-500 rounded-full animate-spin shadow-inner" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
        </div>
      </div>
      <p className="text-xl font-black text-indigo-600 font-baloo tracking-tight">Summoning your Word Wall...</p>
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
          <h2 className="text-4xl font-black text-slate-800 mb-4 font-baloo">Pure Magic! ✨</h2>
          <p className="text-slate-500 text-xl font-medium px-8">Your Word Wall is waiting for its first collection. Start reading to find magical words!</p>
        </div>
        <button onClick={onBack} className="clay-button clay-primary w-full py-5 text-xl shadow-xl">
          Start Reading Adventure
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col min-h-screen py-10 px-6">
      {/* Dynamic Header */}
      <div className="flex items-center justify-between mb-12 sticky top-4 z-20 bg-white/70 backdrop-blur-xl py-5 rounded-[32px] px-8 border border-white shadow-[0_8px_32px_rgba(0,0,0,0.05)]">
        <button 
          onClick={onBack} 
          className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all text-slate-600"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-3xl font-black text-slate-800 font-baloo tracking-tight leading-none">Word Wall</h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] opacity-70">{reviews.length} Magical Items</p>
          </div>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-inner">
          <Sparkles className="w-6 h-6" />
        </div>
      </div>

      {/* Grid Wall with Masonry Layout */}
      <div className="columns-2 md:columns-3 lg:columns-4 gap-6 md:gap-8 pb-20">
        <AnimatePresence>
          {reviews.map((review, idx) => (
            <motion.div
              layout
              key={review.vocab_id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.4,
                delay: idx * 0.03,
                layout: { duration: 0.4, type: "spring", stiffness: 200, damping: 25 }
              }}
            >
              <ClayWordCard 
                review={review} 
                index={idx}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
