'use client';

import { useState } from 'react';
import BookList from '@/components/BookList';
import Title from '@/components/Title';
import dynamic from 'next/dynamic';
const Reader = dynamic(() => import('@/components/Reader'), { ssr: false });
import Review from '@/components/Review';
import Calendar from '@/components/Calendar';
import { ArrowLeft, GraduationCap, BookOpen, Trophy } from 'lucide-react';

export default function Home() {
  const [view, setView] = useState<'library' | 'reader' | 'review' | 'calendar'>('library');
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [bookCount, setBookCount] = useState(0);

  const handleSelectBook = (id: number) => {
    setSelectedBookId(id);
    setView('reader');
  };

  return (
    <main className={`min-h-screen flex flex-col bg-gradient-to-b from-green-50 to-blue-50 ${view === 'reader' ? 'h-screen overflow-hidden' : ''}`}>
      {/* Decorative floating elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-20 left-10 w-20 h-20 bg-green-200 rounded-full opacity-30 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-16 h-16 bg-yellow-200 rounded-full opacity-30 animate-bounce" style={{ animationDuration: '3s' }}></div>
        <div className="absolute bottom-40 left-1/4 w-12 h-12 bg-blue-200 rounded-full opacity-30 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute top-1/3 right-1/3 w-8 h-8 bg-purple-200 rounded-full opacity-40 animate-bounce" style={{ animationDelay: '1s', animationDuration: '4s' }}></div>
      </div>

      {/* Playful Header */}
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20 z-50 sticky top-0 shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setView('library')}
            >
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg rotate-[-5deg] group-hover:rotate-0 group-hover:scale-110 transition-all duration-300">
                <BookOpen className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent hidden sm:block">
                Reading Partner
              </h1>
            </div>

            {view === 'reader' && (
              <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-300">
                <div className="w-px h-8 bg-green-200 mx-1" />
                <button 
                  onClick={() => setView('library')}
                  className="w-10 h-10 bg-green-100 hover:bg-green-200 rounded-xl flex items-center justify-center transition-all text-green-700 active:scale-90"
                  title="Go Back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          
          <nav className="flex items-center gap-2">
            <button 
              onClick={() => setView('library')}
              className={`px-5 py-2.5 rounded-2xl font-bold transition-all text-sm ${view === 'library' ? 'bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105' : 'text-green-700 hover:bg-green-100'}`}
            >
              Library
            </button>
            <button 
              onClick={() => setView('review')}
              className={`px-5 py-2.5 rounded-2xl font-bold transition-all text-sm ${view === 'review' ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-200 hover:shadow-xl hover:shadow-yellow-300 hover:scale-105' : 'text-green-700 hover:bg-green-100'}`}
            >
              Word Wall
            </button>
            <button 
              onClick={() => setView('calendar')}
              className={`px-5 py-2.5 rounded-2xl font-bold transition-all text-sm ${view === 'calendar' ? 'bg-blue-500 text-white shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 hover:scale-105' : 'text-green-700 hover:bg-green-100'}`}
            >
              Calendar
            </button>
          </nav>
        </div>
      </header>

      <div className={`flex-1 ${view === 'reader' ? 'overflow-hidden' : 'max-w-6xl mx-auto p-6 w-full'} relative z-10`}>
        {view === 'library' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Title 
              title="My Magic Library" 
              subtitle="Pick a book and start your adventure!"
              badge={{ icon: <Trophy className="w-5 h-5 text-white" />, text: `${bookCount} book${bookCount !== 1 ? 's' : ''} in library` }}
            />
            
            <BookList onSelectBook={handleSelectBook} onBooksLoaded={setBookCount} />
            
            <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-20">
              <button
                onClick={() => setView('review')}
                className="px-5 py-2.5 rounded-2xl font-bold transition-all text-base bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105 group"
              >
                <div className="flex items-center">
                  <GraduationCap className="w-7 h-7 mr-2 group-hover:rotate-12 group-hover:scale-125 transition-transform" />
                  <span>Visit Word Wall</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {view === 'reader' && selectedBookId && (
          <div className="animate-in zoom-in-95 duration-300 flex-1 h-full flex flex-col">
            <Reader 
              bookId={selectedBookId} 
              onBack={() => setView('library')}
            />
          </div>
        )}

        {view === 'review' && (
          <div className="animate-in zoom-in-95 duration-300">
            <Review onBack={() => setView('library')} />
          </div>
        )}

        {view === 'calendar' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Calendar />
          </div>
        )}
      </div>
    </main>
  );
}
