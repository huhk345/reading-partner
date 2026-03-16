'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Check, Volume2, Sparkles, History, RotateCw } from 'lucide-react';
import { VocabReview } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import Title from './Title';

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

  const getMeaningHeight = (meaning: string) => {
    const baseHeight = 60;
    const extraHeight = Math.max(0, (meaning.length - 80) / 2);
    return baseHeight + Math.min(extraHeight, 80);
  };

  return (
    <motion.div 
      className="relative perspective-1000 cursor-pointer group"
      onClick={() => setIsFlipped(!isFlipped)}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      animate={{ height: isFlipped ? 280 + getMeaningHeight(review.meaning) : 200 }}
      transition={{ 
        type: "spring", 
        stiffness: 150, 
        damping: 20,
        mass: 0.8
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
          className="absolute inset-0 backface-hidden rounded-[32px] bg-white p-4 flex flex-col rotate-y-180 border-2 border-slate-100 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,1)]"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <div className="flex-1 space-y-2">
            <div className="text-center pt-1">
              <h4 className="text-lg font-black text-slate-800 leading-tight font-baloo">{review.word}</h4>
              <p className="text-indigo-400 font-bold text-[10px] uppercase tracking-widest">{review.phonetic}</p>
            </div>
            
            <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-100 to-transparent w-full" />
            
            <div className="space-y-1">
              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest px-2 py-0.5 bg-indigo-50 rounded-full">Meaning</span>
              <p className="text-slate-700 font-semibold text-sm leading-relaxed italic px-1">
                {review.meaning}
              </p>
            </div>

            {review.occurrences && review.occurrences.length > 0 && (
              <div className="pt-1">
                <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <History className="w-2.5 h-2.5 text-indigo-300" />
                  Context
                </h5>
                <div className="p-2 rounded-xl bg-slate-50/50 border border-slate-100 italic text-[10px] text-slate-500 leading-tight relative">
                  &quot;{review.occurrences[0].sentence}&quot;
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

  const fetchReviews = async () => {
    setLoading(true);
    try {
      // Changed to the new /all endpoint to see everything
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

  return (
    <div className="max-w-6xl mx-auto flex flex-col min-h-screen px-6">
      <div className="space-y-8">
        {/* Dynamic Header */}
        <Title 
          title="Word Wall" 
          subtitle="Your magical word collection!"
          badge={{ icon: <Sparkles className="w-5 h-5 text-yellow-500" />, text: `${reviews.length} words collected!` }}
        />

        {/* Grid Wall with Staggered Entrance */}
        <motion.div 
          layout
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8 pb-20 align-start"
        >
          <AnimatePresence>
            {reviews.map((review, idx) => (
              <motion.div
                key={review.vocab_id}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 100, 
                  damping: 20,
                  delay: idx * 0.05 
                }}
              >
                <ClayWordCard 
                  review={review} 
                  index={idx}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
