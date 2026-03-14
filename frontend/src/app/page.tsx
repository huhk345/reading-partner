'use client';

import { useState } from 'react';
import BookList from '@/components/BookList';
import dynamic from 'next/dynamic';
const Reader = dynamic(() => import('@/components/Reader'), { ssr: false });
import Review from '@/components/Review';
import { ArrowLeft, GraduationCap, Sparkles, BookOpen, Settings } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/Dialog';

export default function Home() {
  const [view, setView] = useState<'library' | 'reader' | 'review'>('library');
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSelectBook = (id: number) => {
    setSelectedBookId(id);
    setView('reader');
  };

  return (
    <main className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Playful Header */}
      <header className="bg-white border-b border-slate-100 z-50 sticky top-0 shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setView('library')}
            >
              <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white shadow-lg rotate-[-5deg] group-hover:rotate-0 transition-transform">
                <BookOpen className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent hidden sm:block">
                Reading Partner
              </h1>
            </div>

            {view === 'reader' && (
              <div className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-300">
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <button 
                  onClick={() => setView('library')}
                  className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center transition-all text-slate-600 active:scale-90"
                  title="Go Back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          
          <nav className="flex items-center gap-2">
            <button 
              onClick={() => setIsDialogOpen(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setView('library')}
              className={`px-4 py-2 rounded-xl font-bold transition-colors text-sm ${view === 'library' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Library
            </button>
            <button 
              onClick={() => setView('review')}
              className={`px-4 py-2 rounded-xl font-bold transition-colors text-sm ${view === 'review' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Review
            </button>
          </nav>
        </div>
      </header>

      <div className={`flex-1 overflow-hidden ${view === 'reader' ? '' : 'max-w-6xl mx-auto p-6 w-full'}`}>
        {view === 'library' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl flex items-center gap-2">
                  <Sparkles className="text-yellow-500" />
                  My Magic Library
                </h2>
                <p className="text-slate-500 text-lg">Pick a book and start your adventure!</p>
              </div>
            </div>
            
            <BookList onSelectBook={handleSelectBook} />
            
            <div className="fixed bottom-8 right-8 flex flex-col gap-4">
              <button
                onClick={() => setView('review')}
                className="clay-button clay-accent py-4 px-8 text-xl group shadow-2xl"
              >
                <GraduationCap className="w-7 h-7 mr-2 group-hover:scale-125 transition-transform" />
                Start Reviewing!
              </button>
            </div>
          </div>
        )}

        {view === 'reader' && selectedBookId && (
          <div className="animate-in zoom-in-95 duration-300 h-full">
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
      </div>

      <Dialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <DialogHeader>
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm border-2 border-indigo-200">
            <Settings className="w-6 h-6" />
          </div>
          <DialogTitle>Magic Settings</DialogTitle>
          <DialogDescription>
            Customize your reading adventure.
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="clay-card p-4 bg-slate-50 border-2 border-slate-100">
            <h4 className="font-bold text-slate-700 mb-2">Display Mode</h4>
            <div className="flex gap-2">
              <button className="flex-1 py-2 px-3 bg-white border-2 border-indigo-500 text-indigo-700 rounded-xl font-bold shadow-sm">
                Default
              </button>
              <button className="flex-1 py-2 px-3 bg-white border-2 border-slate-200 text-slate-500 rounded-xl font-bold hover:border-slate-300 transition-colors">
                Cozy
              </button>
            </div>
          </div>
          <p className="text-slate-400 text-sm text-center font-medium italic">
            "Every great story starts with a single click."
          </p>
        </DialogContent>
        <DialogFooter>
          <button 
            onClick={() => setIsDialogOpen(false)}
            className="clay-button clay-primary w-full sm:w-auto"
          >
            Got it!
          </button>
        </DialogFooter>
      </Dialog>
    </main>
  );
}
