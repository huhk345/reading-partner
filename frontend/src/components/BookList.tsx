'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Book as BookIcon, Upload, Plus } from 'lucide-react';
import { Book } from '../types';

interface BookListProps {
  onSelectBook: (bookId: number) => void;
}

export default function BookList({ onSelectBook }: BookListProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [uploading, setUploading] = useState(false);

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
      alert('Upload failed. Please check if the backend is running and supports the file type.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {books.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Compact Upload Card */}
          <label className="clay-card border-dashed border-indigo-200 bg-indigo-50/30 flex flex-col items-center justify-center p-8 cursor-pointer group hover:bg-indigo-50 transition-all h-[200px] hover:scale-[1.02] active:scale-95 shadow-sm">
            <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-indigo-100 shadow-lg">
              {uploading ? (
                <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent group-hover:border-white group-hover:border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-8 h-8" />
              )}
            </div>
            <span className="font-bold text-indigo-600 text-lg">
              {uploading ? 'Magic in progress...' : 'Add New Book'}
            </span>
            <input type="file" className="hidden" accept=".pdf,.epub" onChange={handleFileUpload} disabled={uploading} />
          </label>

          {books.map((book) => (
            <div
              key={book.id}
              onClick={() => onSelectBook(book.id)}
              className="relative clay-card group h-[200px] cursor-pointer hover:scale-[1.02] active:scale-95 transition-all shadow-sm hover:shadow-2xl bg-white overflow-hidden border-0"
            >
              {/* Cover Image Background with Blur */}
              {book.cover_image ? (
                <div 
                  className="absolute inset-0 z-0 transition-transform duration-700 group-hover:scale-110"
                  style={{
                    backgroundImage: `url(http://localhost:8000/uploads/${encodeURIComponent(book.cover_image)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(3px) brightness(0.9)',
                    transform: 'scale(1.5)'
                  }}
                />
              ) : (
                <div className="absolute inset-0 z-0 bg-gradient-to-br from-blue-50 to-indigo-100" />
              )}
              
              {/* Glass Overlay */}
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 group-hover:bg-white/40 transition-colors duration-500" />

              {/* Content */}
              <div className="relative z-20 p-6 h-full flex flex-col justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-blue-100 shadow-md">
                    <BookIcon className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-slate-800 text-lg line-clamp-2 leading-tight drop-shadow-sm group-hover:text-blue-900 transition-colors">
                      {book.title}
                    </h3>
                    <div className="flex gap-2 mt-2">
                      <span className="inline-block px-2 py-0.5 bg-white/70 backdrop-blur-sm text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white/50">
                        {book.type}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-end">
                  <div className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-lg shadow-blue-500/30 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    OPEN READER →
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Large Empty State Upload Button */
        <div className="flex flex-col items-center justify-center py-12 animate-in zoom-in-95 duration-500">
          <label className="clay-card border-dashed border-indigo-200 bg-white p-16 text-center cursor-pointer group hover:bg-indigo-50/50 transition-all max-w-xl w-full hover:scale-[1.01] shadow-xl border-4">
            <div className="text-7xl mb-6 group-hover:scale-110 transition-transform inline-block">
              {uploading ? '✨' : '📚'}
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">
              {uploading ? 'Brewing your story...' : 'Your library is waiting!'}
            </h3>
            <p className="text-slate-500 text-lg font-medium mb-8">
              Click anywhere here to add your first book (PDF or EPUB)
            </p>
            
            <div className="clay-button clay-primary py-4 px-10 text-xl inline-flex items-center gap-3 shadow-indigo-200">
              {uploading ? (
                <>
                  <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6" />
                  Add Your First Book
                </>
              )}
            </div>
            <input type="file" className="hidden" accept=".pdf,.epub" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      )}
    </div>
  );
}
