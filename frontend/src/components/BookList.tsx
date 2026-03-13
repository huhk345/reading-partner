'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Book as BookIcon, Plus } from 'lucide-react';
import { Book } from '../types';
import { 
  Dialog, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from './Dialog';

interface BookListProps {
  onSelectBook: (bookId: number) => void;
}

export default function BookList({ onSelectBook }: BookListProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
  });

  const fetchBooks = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/books');
      setBooks(response.data);
    } catch (error) {
      console.error('Error fetching books:', error);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://localhost:8000/api/upload', formData);
      fetchBooks();
    } catch (error) {
      console.error('Error uploading file:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Upload Failed ❌',
        description: 'Please check if the backend is running and supports the file type.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8 p-4">
      {books.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
          {/* Magic Upload Card */}
          <label className="magic-card border-2 border-dashed border-indigo-200/60 bg-indigo-50/20 flex flex-col items-center justify-center p-6 cursor-pointer group hover:bg-indigo-50/40 transition-all h-[340px] hover:scale-[1.02] active:scale-95">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-indigo-500 mb-4 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-xl shadow-indigo-100 ring-4 ring-indigo-50 group-hover:ring-indigo-200">
              {uploading ? (
                <div className="w-6 h-6 border-4 border-indigo-200 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus className="w-8 h-8" />
              )}
            </div>
            <span className="font-bold text-slate-600 text-lg group-hover:text-indigo-600 transition-colors">
              {uploading ? 'Summoning...' : 'Add New Book'}
            </span>
            <span className="text-xs text-slate-400 mt-2 font-medium bg-white/50 px-3 py-1 rounded-full">
              PDF or EPUB
            </span>
            <input type="file" className="hidden" accept=".pdf,.epub" onChange={handleFileUpload} disabled={uploading} />
          </label>

          {books.map((book, index) => (
            <div
              key={book.id}
              onClick={() => onSelectBook(book.id)}
              className="magic-card group h-[340px] cursor-pointer p-6 flex flex-col items-center justify-between relative animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Background Ambient Glow */}
              <div 
                className="absolute inset-0 z-0 opacity-0 group-hover:opacity-20 transition-opacity duration-700"
                style={{
                  background: book.cover_image 
                    ? `url(http://localhost:8000/uploads/${encodeURIComponent(book.cover_image)}) center/cover`
                    : 'linear-gradient(to bottom right, #4f46e5, #0ea5e9)',
                  filter: 'blur(20px)',
                }}
              />

              {/* 3D Book Container with Levitation */}
              <div 
                className="animate-levitate z-10 mt-2"
                style={{ animationDelay: `${index * 300}ms` }}
              >
                <div className="book-wrapper w-36 h-52 group-hover:scale-105 transition-transform duration-500">
                  <div 
                    className="book-cover-3d flex items-center justify-center overflow-hidden"
                    style={{
                      backgroundImage: book.cover_image ? `url(http://localhost:8000/uploads/${encodeURIComponent(book.cover_image)})` : undefined,
                    }}
                  >
                    {!book.cover_image && (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 p-4 flex flex-col items-center justify-center text-center">
                        <BookIcon className="w-8 h-8 text-white/50 mb-2" />
                        <span className="text-white font-bold text-sm line-clamp-3 leading-tight">
                          {book.title}
                        </span>
                      </div>
                    )}
                    {/* Sheen effect */}
                    <div className="book-sheen" />
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <div className="relative z-20 w-full text-center mt-4 space-y-2">
                <h3 className="font-black text-slate-700 text-lg leading-tight line-clamp-1 group-hover:text-indigo-600 transition-colors" title={book.title}>
                  {book.title}
                </h3>
                
                <div className="flex items-center justify-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                  <span className="magic-tag text-[10px] tracking-wider">
                    {book.type}
                  </span>
                </div>
              </div>

              {/* Hover Indicator */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                 <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur text-indigo-600 flex items-center justify-center shadow-sm">
                   <BookIcon className="w-4 h-4" />
                 </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Large Empty State */
        <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in-95 duration-500">
          <label className="magic-card border-2 border-dashed border-indigo-200 bg-white/60 p-16 text-center cursor-pointer group hover:bg-white/80 transition-all max-w-xl w-full hover:scale-[1.01]">
            <div className="text-7xl mb-6 group-hover:scale-110 transition-transform inline-block drop-shadow-md">
              {uploading ? '✨' : '📚'}
            </div>
            <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">
              {uploading ? 'Summoning your story...' : 'Your library awaits'}
            </h3>
            <p className="text-slate-500 text-lg font-medium mb-8 max-w-md mx-auto leading-relaxed">
              Upload a PDF or EPUB to begin your magical reading journey.
            </p>
            
            <div className="clay-button clay-primary py-4 px-10 text-xl inline-flex items-center gap-3 shadow-xl shadow-indigo-200/50 hover:shadow-indigo-300/50">
              {uploading ? (
                <>
                  <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6" />
                  Add First Book
                </>
              )}
            </div>
            <input type="file" className="hidden" accept=".pdf,.epub" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      )}

      <Dialog 
        isOpen={dialogConfig.isOpen} 
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      >
        <DialogHeader>
          <DialogTitle>{dialogConfig.title}</DialogTitle>
          <DialogDescription>{dialogConfig.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
            className="clay-button clay-primary px-6 py-2"
          >
            OK
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
