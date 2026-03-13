'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, Check, X, Info, Volume2, Sparkles, Trophy, History } from 'lucide-react';
import { VocabReview } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dialog, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from './Dialog';

interface ReviewProps {
  onBack: () => void;
}

export default function Review({ onBack }: ReviewProps) {
  const [reviews, setReviews] = useState<VocabReview[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://localhost:8000/api/vocab/review');
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

  const handleReview = async (quality: number) => {
    const current = reviews[currentIndex];
    try {
      await axios.post('http://localhost:8000/api/vocab/review', null, {
        params: { vocab_id: current.vocab_id, quality }
      });
      setShowAnswer(false);
      if (currentIndex < reviews.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setIsFinished(true);
      }
    } catch (error) {
      console.error('Error submitting review:', error);
    }
  };

  const speak = (text: string, audioUrl?: string) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(e => {
        console.error("Error playing audio file, falling back to synthesis", e);
        fallbackSpeak(text);
      });
      return;
    }
    fallbackSpeak(text);
  };

  const fallbackSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 gap-4">
      <div className="w-16 h-16 border-8 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      <p className="text-xl font-bold text-orange-600">Gathering your magic words...</p>
    </div>
  );

  if (reviews.length === 0) {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-8 animate-in zoom-in-95 duration-500">
        <div className="relative inline-block">
          <div className="w-24 h-24 clay-card bg-green-100 flex items-center justify-center text-green-600">
            <Check className="w-12 h-12" />
          </div>
          <Sparkles className="absolute -top-2 -right-2 text-yellow-500 animate-pulse" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">You're a Star! 🌟</h2>
        <p className="text-slate-500 text-xl font-medium">No words left to review today. You've mastered them all!</p>
        <button onClick={onBack} className="clay-button clay-primary w-full py-4 text-xl">
          Back to Library
        </button>
      </div>
    );
  }

  const current = reviews[currentIndex];
  const progress = ((currentIndex + 1) / reviews.length) * 100;

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-[600px] py-6">
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack} 
          className="w-12 h-12 clay-card flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-slate-600" />
        </button>
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Progress</div>
          <div className="text-xl font-bold text-indigo-600">
            {currentIndex + 1} <span className="text-slate-300 mx-1">/</span> {reviews.length}
          </div>
        </div>
        <div className="w-12" />
      </div>

      <div className="w-full h-4 bg-slate-200 rounded-full mb-12 overflow-hidden shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-gradient-to-r from-indigo-500 to-blue-400 rounded-full shadow-lg"
        />
      </div>

      <div className="flex-1 flex flex-col items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.vocab_id + (showAnswer ? '-ans' : '-q')}
            initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            exit={{ opacity: 0, scale: 0.8, rotateY: -90 }}
            transition={{ type: "spring", damping: 15 }}
            className="w-full aspect-[4/3] clay-card bg-white p-12 flex flex-col items-center justify-center text-center relative group"
          >
            <h3 className="text-5xl font-black text-slate-800 mb-4 tracking-tight drop-shadow-sm">
              {current.word}
            </h3>
            
            {showAnswer && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="text-2xl font-bold text-indigo-500 flex items-center justify-center gap-2">
                  {current.phonetic}
                  <button
                    onClick={() => speak(current.word, current.audio_url)}
                    className="w-10 h-10 clay-card bg-indigo-50 text-indigo-600 flex items-center justify-center hover:scale-110 transition-transform"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                <div className="w-24 h-2 bg-slate-100 mx-auto rounded-full" />
                <p className="text-2xl text-slate-600 leading-relaxed max-w-md font-medium">
                  {current.meaning}
                </p>
                
                {current.occurrences && current.occurrences.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-100 w-full max-w-md text-left">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <History className="w-3 h-3" />
                      Context
                    </h4>
                    <div className="space-y-3">
                      {current.occurrences.map((occ, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl text-slate-500 italic text-sm">
                          "{occ.sentence}"
                          <span className="block text-[10px] text-slate-300 mt-1 not-italic font-bold uppercase tracking-wider">
                            {occ.book}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {!showAnswer && (
              <button
                onClick={() => setShowAnswer(true)}
                className="clay-button clay-accent mt-12 py-4 px-12 text-2xl"
              >
                Flip Card!
              </button>
            )}
            
            {!showAnswer && (
              <button
                onClick={() => speak(current.word, current.audio_url)}
                className="absolute top-6 right-6 w-12 h-12 clay-card bg-slate-50 text-slate-400 hover:text-indigo-500 transition-colors flex items-center justify-center"
              >
                <Volume2 className="w-6 h-6" />
              </button>
            )}
          </motion.div>
        </AnimatePresence>

        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full mt-12"
          >
            <button 
              onClick={() => handleReview(0)} 
              className="clay-card p-4 bg-red-50 hover:bg-red-100 text-red-600 border-red-200 transition-colors flex flex-col items-center gap-1 shadow-red-100"
            >
              <span className="font-black text-xl">Oops!</span>
              <span className="text-xs font-bold uppercase opacity-60">Try Again</span>
            </button>
            <button 
              onClick={() => handleReview(3)} 
              className="clay-card p-4 bg-orange-50 hover:bg-orange-100 text-orange-600 border-orange-200 transition-colors flex flex-col items-center gap-1 shadow-orange-100"
            >
              <span className="font-black text-xl">Hard</span>
              <span className="text-xs font-bold uppercase opacity-60">Need help</span>
            </button>
            <button 
              onClick={() => handleReview(4)} 
              className="clay-card p-4 bg-green-50 hover:bg-green-100 text-green-600 border-green-200 transition-colors flex flex-col items-center gap-1 shadow-green-100"
            >
              <span className="font-black text-xl">Good</span>
              <span className="text-xs font-bold uppercase opacity-60">I Got It!</span>
            </button>
            <button 
              onClick={() => handleReview(5)} 
              className="clay-card p-4 bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200 transition-colors flex flex-col items-center gap-1 shadow-blue-100"
            >
              <span className="font-black text-xl">Easy</span>
              <span className="text-xs font-bold uppercase opacity-60">Mastered!</span>
            </button>
          </motion.div>
        )}
      </div>

      <Dialog 
        isOpen={isFinished} 
        onClose={onBack}
      >
        <DialogHeader>
          <DialogTitle>Amazing! You finished all your reviews! 🏆</DialogTitle>
          <DialogDescription>
            You've mastered all your words for today. Keep it up!
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={onBack}
            className="clay-button clay-primary px-6 py-2"
          >
            OK
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
