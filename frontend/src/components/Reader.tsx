'use client';

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ArrowLeft, Volume2, Plus, History, X, BookOpen, FileText, RefreshCw } from 'lucide-react';
import { Book, WordDefinition, PageData, Sentence } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { 
  Dialog, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogContent, 
  DialogFooter 
} from './Dialog';

// Set up worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface WordOverlayProps {
  pageData?: PageData;
  renderedWidth: number;
  renderedHeight: number;
  onWordClick: (word: string) => void;
  onSentencePlay: (sentenceText: string) => void;
  pageIndex: number;
  sentences?: Sentence[];
  findSentenceForWord: (word: string) => Sentence | null;
}

function WordOverlay({ pageData, renderedWidth, renderedHeight, onWordClick, onSentencePlay, pageIndex, findSentenceForWord }: WordOverlayProps) {
  if (!pageData || !pageData.words || !pageData.width || renderedWidth <= 0) {
    return null;
  }

  const pointToPixel = renderedWidth / pageData.width;

  const isFirstWordOfSentence = (wordText: string, idx: number): boolean => {
    if (idx === 0) return true;
    const prevWord = pageData.words[idx - 1];
    if (!prevWord) return true;
    const prevEndsWithPunctuation = /[.!?]$/.test(prevWord.text.replace(/\s+$/, ''));
    return prevEndsWithPunctuation;
  };

  return (
    <div 
      className="absolute top-0 left-0 z-[60] pointer-events-none overflow-hidden"
      style={{ 
        width: renderedWidth, 
        height: renderedHeight 
      }}
    >
      {pageData.words.map((word, idx) => {
        const [x0, y0, x1, y1] = word.bbox;
        
        const sentence = findSentenceForWord(word.text);
        const showPlayButton = sentence && isFirstWordOfSentence(word.text, idx);
        
        return (
          <div
            key={`${word.text}-${idx}`}
            className="absolute cursor-pointer pointer-events-auto bg-transparent hover:bg-indigo-500/20 hover:ring-1 hover:ring-indigo-500/30 rounded-sm transition-all duration-75 group"
            style={{
              left: `${x0 * pointToPixel}px`,
              top: `${y0 * pointToPixel}px`,
              width: `${(x1 - x0) * pointToPixel}px`,
              height: `${(y1 - y0) * pointToPixel}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(word.text);
            }}
          >
            {showPlayButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (sentence) onSentencePlay(sentence.text);
                }}
                className="opacity-0 group-hover:opacity-100 absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600 transition-all z-[80] cursor-pointer"
                title="Play sentence"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
            <div className="opacity-0 group-hover:opacity-100 absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap z-[70] pointer-events-none">
                {word.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ReaderProps {
  bookId: number;
  onBack: () => void;
}

export default function Reader({ bookId, onBack }: ReaderProps) {
  const [book, setBook] = useState<Book | null>(null);
  const [selectedWord, setSelectedWord] = useState<WordDefinition | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingWord, setIsLoadingWord] = useState(false);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<Record<number, { width: number, height: number }>>({});
  const [reparsing, setReparsing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hoveredWordPos, setHoveredWordPos] = useState<{x: number, y: number, sentenceId?: number, sentenceText?: string} | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm?: () => void;
    confirmText?: string;
    isAlert?: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchBook = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/books/${bookId}`);
      setBook(response.data);
    } catch (error) {
      console.error('Error fetching book:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBook();
  }, [bookId]);

  const handleReparse = async () => {
    setDialogConfig({
      isOpen: true,
      title: "Re-parse Book?",
      description: "Are you sure you want to re-parse this book? This will reset your sentences and word occurrences for this book.",
      confirmText: "Yes, Re-parse",
      onConfirm: async () => {
        setReparsing(true);
        try {
          await axios.post(`http://localhost:8000/api/books/${bookId}/reparse`);
          await fetchBook();
          setDialogConfig({
            isOpen: true,
            title: "Success! 🚀",
            description: "Book re-parsed successfully!",
            isAlert: true
          });
        } catch (error) {
          console.error('Error reparsing book:', error);
          setDialogConfig({
            isOpen: true,
            title: "Error",
            description: "Failed to re-parse book.",
            isAlert: true
          });
        } finally {
          setReparsing(false);
        }
      }
    });
  };

  // Handle auto-scaling and container width
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const updateWidth = () => {
      if (scrollContainerRef.current) {
        // Full width since we removed padding (px-0) and the sidebar
        const width = scrollContainerRef.current.clientWidth - 16; // Small buffer for scrollbar
        setContainerWidth(width);
        
        if (scale === 1.0) {
            setScale(1.0);
        }
      }
    };

    const observer = new ResizeObserver(updateWidth);
    observer.observe(scrollContainerRef.current);
    updateWidth();

    return () => observer.disconnect();
  }, [scrollContainerRef, scale]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    console.log("Document loaded with", numPages, "pages. pages_data length:", book?.pages_data?.length);
  };

  // Update current page on scroll
  useEffect(() => {
    if (book?.type !== 'pdf' || !scrollContainerRef.current) return;

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        
        const container = scrollContainerRef.current;
        const pageElements = container.querySelectorAll('.pdf-page-wrapper');
        
        let currentIdx = 1;
        let minDiff = Infinity;
        
        pageElements.forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const diff = Math.abs(rect.top - containerRect.top);
            
            if (diff < minDiff) {
                minDiff = diff;
                currentIdx = idx + 1;
            }
        });
        
        if (currentIdx !== currentPage) {
            setCurrentPage(currentIdx);
        }
    };

    const container = scrollContainerRef.current;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [book?.type, currentPage]);

  const scrollToPage = (pageNum: number) => {
    if (!scrollContainerRef.current) return;
    const pageEl = scrollContainerRef.current.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleWordClick = async (word: string, sentenceId?: number) => {
    // Clean word: remove punctuation and whitespace, keep only letters and apostrophes
    const cleanWord = word.replace(/[^\w\s']|_/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleanWord) return;

    // Open dialog immediately with loading state (REQ-001)
    setIsDialogOpen(true);
    setIsLoadingWord(true);
    setSelectedWord({ id: 0, word: cleanWord, phonetic: '', meaning: '' });

    try {
      const response = await axios.get(`http://localhost:8000/api/dict`, {
        params: { 
          word: cleanWord,
          book_id: bookId,
          sentence_id: sentenceId
        }
      });
      setSelectedWord(response.data);
    } catch (error) {
      console.error('Error fetching word:', error);
      setSelectedWord({ id: 0, word: cleanWord, phonetic: '', meaning: 'Failed to load definition' });
    } finally {
      setIsLoadingWord(false);
    }
  };

  const handlePdfClick = (e: React.MouseEvent) => {
    // Standardize getting the range from point
    let range: Range | null = null;
    if (typeof document.caretRangeFromPoint === 'function') {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }

    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer;
      const text = textNode.textContent || '';
      const offset = range.startOffset;

      // Expand to find the word boundaries
      // Match alphanumeric characters and apostrophes
      let start = offset;
      while (start > 0 && /[\w']/.test(text[start - 1])) {
        start--;
      }
      let end = offset;
      while (end < text.length && /[\w']/.test(text[end])) {
        end++;
      }

      const clickedWord = text.slice(start, end).trim();
      if (clickedWord) {
        handleWordClick(clickedWord);
      }
    }
  };

  const speak = async (text: string, audioUrl?: string) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(e => {
        console.error("Error playing audio file, falling back to synthesis", e);
        fallbackSpeak(text);
      });
      return;
    }
    try {
      const response = await axios.post('http://localhost:8000/api/tts', null, {
        params: { text }
      });
      if (response.data.audio_url) {
        const audio = new Audio(response.data.audio_url);
        audio.play().catch(e => {
          console.error("Error playing TTS audio, falling back to synthesis", e);
          fallbackSpeak(text);
        });
        return;
      }
    } catch (error) {
      console.error("Error fetching TTS audio, falling back to synthesis", error);
    }
    fallbackSpeak(text);
  };

  const findSentenceContainingWord = (word: string): Sentence | null => {
    if (!book?.sentences) return null;
    const cleanWord = word.replace(/[^\w']/g, '').toLowerCase();
    for (const sentence of book.sentences) {
      const cleanSentence = sentence.text.replace(/[^\w']/g, '').toLowerCase();
      if (cleanSentence.includes(cleanWord)) {
        return sentence;
      }
    }
    return null;
  };

  const handleSentencePlay = async (sentenceText: string) => {
    setIsSpeaking(true);
    await speak(sentenceText);
    setIsSpeaking(false);
  };

  const fallbackSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const addToVocab = async () => {
    if (!selectedWord || !selectedWord.id) return;
    try {
      await axios.post('http://localhost:8000/api/vocab', null, {
        params: { word_id: selectedWord.id }
      });
      // Close the word dialog (REQ-002: no confirmation dialog)
      setIsDialogOpen(false);
      setSelectedWord(null);
    } catch (error) {
      console.error('Error adding to vocab:', error);
    }
  };

  // Auto-play audio when word is loaded with audio_url (REQ-004)
  useEffect(() => {
    if (selectedWord && selectedWord.audio_url && !isLoadingWord) {
      speak(selectedWord.word, selectedWord.audio_url);
    }
  }, [selectedWord, isLoadingWord]);

  if (loading || !book) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Preparing your book...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden h-full">
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Interactive PDF (only for PDF books) */}
        {book.type === 'pdf' ? (
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-100 flex flex-col items-center gap-8 py-8 px-4"
          >
            <Document
                file={book.pdf_url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => console.error("Error loading PDF:", error)}
                loading={
                  <div className="h-full flex items-center justify-center py-48">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                        <p className="text-slate-500 font-bold text-xl animate-pulse uppercase tracking-widest">Opening Document...</p>
                    </div>
                  </div>
                }
                error={
                    <div className="p-24 text-center text-red-500">
                        <p className="text-2xl font-bold mb-4">Oops! Document failed to load.</p>
                        <p className="text-slate-500">Please check if the file is still available.</p>
                    </div>
                }
              >
                {Array.from(new Array(numPages), (el, index) => (
                  <div 
                    key={`page_${index + 1}`} 
                    data-page-number={index + 1}
                    className="pdf-page-wrapper relative shadow-[0_20px_50px_rgba(0,0,0,0.1)] bg-white rounded-sm transform transition-transform duration-500" 
                  >
                    <Page 
                      pageNumber={index + 1} 
                      scale={scale} 
                      width={containerWidth ? (containerWidth - 32) : undefined}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                      onRenderSuccess={(page) => {
                        // Capture the exact rendered dimensions
                        setRenderedPages(prev => ({
                          ...prev,
                          [index]: { 
                            width: page.width, 
                            height: page.height 
                          }
                        }));
                      }}
                      loading={
                        <div 
                            className="bg-white flex items-center justify-center animate-pulse" 
                            style={{ 
                                width: containerWidth ? (containerWidth - 32) : 800, 
                                height: containerWidth ? (containerWidth - 32) * 1.41 : 1100 
                            }}
                        >
                            <div className="text-slate-200 font-bold text-6xl italic">PAGE {index + 1}</div>
                        </div>
                      }
                    />
                    
                    {/* Word-level Interactive Overlay */}
                    {renderedPages[index] && (
                        <WordOverlay 
                            pageData={book.pages_data?.[index]}
                            renderedWidth={renderedPages[index].width}
                            renderedHeight={renderedPages[index].height}
                            onWordClick={handleWordClick}
                            onSentencePlay={handleSentencePlay}
                            pageIndex={index}
                            sentences={book.sentences}
                            findSentenceForWord={findSentenceContainingWord}
                        />
                    )}

                  </div>
                ))}
              </Document>
          </div>
        ) : (
          /* Clean Text View (Full width if EPUB or in text mode) */
          <div className="flex-1 overflow-y-auto p-12 bg-white flex justify-center custom-scrollbar">
            <div className="max-w-3xl w-full leading-loose text-xl text-slate-700">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between mb-8">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-2xl">
                  <FileText className="w-7 h-7 text-indigo-500" />
                  {book.type === 'epub' ? 'EPUB Reader' : 'Clean Text View'}
                </h3>
                <button
                  onClick={handleReparse}
                  disabled={reparsing}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-all font-bold text-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${reparsing ? 'animate-spin' : ''}`} />
                  {reparsing ? 'Reparsing...' : 'Reparse Book'}
                </button>
              </div>
              {book.sentences?.length ? book.sentences.map((sentence) => (
                <span key={sentence.id} className="group/sentence hover:bg-slate-50 rounded px-2 py-1 -mx-2 transition-colors relative">
                  {sentence.text.split(/\s+/).map((word, wIdx) => (
                    <span
                      key={wIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWordClick(word, sentence.id);
                      }}
                      className="cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 px-0.5 rounded transition-all inline-block"
                    >
                      {word}{' '}
                    </span>
                  ))}
                  <button 
                    onClick={() => speak(sentence.text)}
                    className="opacity-0 group-hover/sentence:opacity-100 absolute -right-12 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-indigo-500 transition-all"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </span>
              )) : (
                <p className="text-slate-400 italic">No text extracted yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pagination & Zoom Controls (only for PDF) */}
      {book.type === 'pdf' && (
        <div className="h-16 bg-white border-t border-slate-200 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setScale(prev => Math.max(prev - 0.1, 0.5))}
              className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-slate-600 font-bold"
              title="Zoom out"
            >
              -
            </button>
            <div className="px-2 text-sm font-bold text-slate-500 w-16 text-center">
              {Math.round(scale * 100)}%
            </div>
            <button
              onClick={() => setScale(prev => Math.min(prev + 0.1, 3))}
              className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-slate-600 font-bold"
              title="Zoom in"
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              disabled={currentPage <= 1}
              onClick={() => scrollToPage(currentPage - 1)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-50 hover:bg-slate-200 transition-colors font-medium flex items-center gap-2"
            >
              Previous
            </button>
            <span className="font-bold text-slate-600 min-w-[100px] text-center">
              {currentPage} / {numPages}
            </span>
            <button 
              disabled={currentPage >= numPages}
              onClick={() => scrollToPage(currentPage + 1)}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-50 hover:bg-slate-200 transition-colors font-medium flex items-center gap-2"
            >
              Next
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={handleReparse}
              disabled={reparsing}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all text-xs font-bold uppercase disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reparsing ? 'animate-spin' : ''}`} />
              {reparsing ? 'Reparsing...' : 'Reparse Book'}
            </button>
            </div>
            </div>
            )}
      {/* Word Definition Modal (Same as before but integrated) */}
      <AnimatePresence>
        {isDialogOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDialogOpen(false)}
              className="fixed inset-0 bg-indigo-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="fixed inset-x-4 bottom-8 z-[101] clay-card bg-white p-8 max-w-2xl mx-auto shadow-2xl border-t-8 border-indigo-500"
            >
              <button
                onClick={() => setIsDialogOpen(false)}
                className="absolute top-4 right-4 w-10 h-10 clay-card flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {isLoadingWord ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500 font-medium">Looking up "{selectedWord?.word}"...</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-4xl font-bold text-indigo-600 mb-1">{selectedWord?.word}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-blue-500 font-bold text-lg">{selectedWord?.phonetic}</span>
                        <button
                          onClick={() => speak(selectedWord?.word || '', selectedWord?.audio_url)}
                          className="w-10 h-10 clay-card bg-blue-50 text-blue-600 flex items-center justify-center hover:scale-110 transition-transform"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-indigo-400 rounded-full" />
                      What it means
                    </h4>
                    <p className="text-slate-700 text-xl leading-relaxed font-medium whitespace-pre-line">
                      {selectedWord?.meaning}
                    </p>
                  </div>

                  {selectedWord?.occurrences && selectedWord.occurrences.length > 0 && (
                    <div className="mb-8">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Seen before
                      </h4>
                      <div className="max-h-32 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {selectedWord.occurrences.map((occ, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 rounded-2xl text-slate-600 italic border-l-4 border-slate-200">
                            &quot;{occ.sentence}&quot;
                            <span className="block text-xs text-slate-400 mt-2 not-italic font-bold uppercase tracking-wider">
                              From: {occ.book}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={addToVocab}
                    disabled={!selectedWord?.id}
                    className="clay-button clay-primary w-full py-4 text-xl flex items-center justify-center gap-3 shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-6 h-6" />
                    Add to My Word Bank
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Dialog 
        isOpen={dialogConfig.isOpen} 
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
      >
        <DialogHeader>
          <DialogTitle>{dialogConfig.title}</DialogTitle>
          <DialogDescription>{dialogConfig.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {!dialogConfig.isAlert && (
            <button
              onClick={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))}
              className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              if (dialogConfig.onConfirm) {
                dialogConfig.onConfirm();
              }
              setDialogConfig(prev => ({ ...prev, isOpen: false }));
            }}
            className="clay-button clay-primary px-6 py-2"
          >
            {dialogConfig.confirmText || "OK"}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
