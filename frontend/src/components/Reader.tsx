'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, Volume2, Plus, History, X, BookOpen, FileText, RefreshCw, Play, Pause } from 'lucide-react';
import { Book, WordDefinition, PageData, Sentence, WordData } from '../types';
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
  currentlyPlayingSentence: string | null;
}

function WordOverlay({ pageData, renderedWidth, renderedHeight, onWordClick, onSentencePlay, pageIndex, sentences, currentlyPlayingSentence }: WordOverlayProps) {
  const [hoveredSentence, setHoveredSentence] = useState<{
    text: string;
    backendSentenceText: string;
    bbox: { top: number; left: number; right: number; bottom: number };
  } | null>(null);

  if (!pageData || !pageData.words || !pageData.width || renderedWidth <= 0) {
    return null;
  }

  const pointToPixel = renderedWidth / pageData.width;

  // Group words into sentences on this page based on punctuation
  const sentenceGroups = useMemo(() => {
    const groups: { text: string; words: WordData[], isValid: boolean, backendSentenceText: string }[] = [];
    let currentWords: WordData[] = [];
    
    const normalizedSentences = (sentences || []).map((s: Sentence) => ({
      text: s.text,
      normalized: s.text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    }));
    
    const abbreviations = [
      'Mrs.', 'Mr.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.',
      'St.', 'Ave.', 'Blvd.', 'Rd.',
      'etc.', 'vs.', 'Inc.', 'Ltd.', 'Corp.',
      'vol.', 'ch.', 'fig.', 'approx.',
      'A.M.', 'P.M.', 'a.m.', 'p.m.',
      'U.S.', 'U.K.', 'E.U.',
    ];

    pageData.words.forEach((word, idx) => {
      currentWords.push(word);
      const trimmedText = word.text.replace(/\s+$/, '');
      const isAbbreviation = abbreviations.includes(trimmedText);
      const endsWithPunctuation = /[.!?…][”"']?$/.test(trimmedText) && !isAbbreviation;
      if (endsWithPunctuation || idx === pageData.words.length - 1) {
        let processing = true;
        while (processing && currentWords.length > 0) {
          const text = currentWords.map(w => w.text).join(' ');
          const normalizedText = text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          
          let matched = false;
          
          if (normalizedText.length > 0) {
              const match = normalizedSentences.find((s: { text: string; normalized: string }) => {
                  if (normalizedText.length <= 5) {
                      return s.normalized === normalizedText;
                  }
                  return s.normalized.includes(normalizedText) || normalizedText.includes(s.normalized);
              });

              if (match) {
                  // Check if we have a superset (we have more text than the match)
                  // AND the match is contained within our text.
                  // We also handle exact match here if we relax the length check, but strictly splitting is for superset.
                  if (normalizedText.includes(match.normalized) && normalizedText.length > match.normalized.length) {
                      const matchStart = normalizedText.indexOf(match.normalized);
                      const matchEnd = matchStart + match.normalized.length;
                      
                      let charCount = 0;
                      let startIndex = 0;
                      let endIndex = currentWords.length;
                      
                      // Identify word boundaries corresponding to the match
                      for(let i=0; i<currentWords.length; i++) {
                          const wLen = currentWords[i].text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().length;
                          const wStart = charCount;
                          const wEnd = charCount + wLen;
                          
                          if (wEnd <= matchStart) {
                              // Word is fully before match
                              startIndex = i + 1;
                          }
                          if (wStart < matchEnd) {
                              // Word overlaps with match (at least partially)
                              endIndex = i + 1;
                          }
                          charCount += wLen;
                      }
                      
                      // Split logic
                      const prefix = currentWords.slice(0, startIndex);
                      const target = currentWords.slice(startIndex, endIndex);
                      const suffix = currentWords.slice(endIndex);
                      
                      if (prefix.length > 0) {
                          groups.push({
                              text: prefix.map(w => w.text).join(' '),
                              words: prefix,
                              isValid: false,
                              backendSentenceText: prefix.map(w => w.text).join(' ')
                          });
                      }
                      
                      groups.push({
                          text: target.map(w => w.text).join(' '),
                          words: target,
                          isValid: true,
                          backendSentenceText: match.text
                      });
                      
                      currentWords = suffix;
                      matched = true;
                      // Continue loop to process suffix
                  } else {
                      // Exact match or subset match (we have partial sentence or exact sentence)
                      groups.push({
                          text,
                          words: [...currentWords],
                          isValid: true,
                          backendSentenceText: match.text
                      });
                      currentWords = [];
                      processing = false;
                      matched = true;
                  }
              }
          }

          if (!matched) {
              // No match found, group everything as one (invalid/unknown)
              groups.push({
                text,
                words: [...currentWords],
                isValid: false,
                backendSentenceText: text
              });
              currentWords = [];
              processing = false;
          }
        }
      }
    });
    return groups;
  }, [pageData.words, sentences]);

  const handleMouseEnter = (wordIdx: number) => {
    // Find which group this word belongs to
    let currentCount = 0;
    const group = sentenceGroups.find(g => {
      const start = currentCount;
      const end = currentCount + g.words.length;
      currentCount = end;
      return wordIdx >= start && wordIdx < end;
    });

    if (group && group.isValid) {
      console.log('[Hover] Backend sentence:', group.backendSentenceText);

      const top = Math.min(...group.words.map(w => w.bbox[1] * pointToPixel));
      const left = Math.min(...group.words.map(w => w.bbox[0] * pointToPixel));
      const right = Math.max(...group.words.map(w => w.bbox[2] * pointToPixel));
      const bottom = Math.max(...group.words.map(w => w.bbox[3] * pointToPixel));

      setHoveredSentence({
        text: group.text,
        backendSentenceText: group.backendSentenceText,
        bbox: { top, left, right, bottom }
      });
    } else {
      setHoveredSentence(null);
    }
  };

  const isPlaying = hoveredSentence && currentlyPlayingSentence === hoveredSentence.backendSentenceText;
  const activeSentenceWords = useMemo(() => {
    if (hoveredSentence) {
      return sentenceGroups.find(g => g.text === hoveredSentence.text)?.words || [];
    }
    if (currentlyPlayingSentence) {
      const playingGroups = sentenceGroups.filter(g => g.backendSentenceText === currentlyPlayingSentence);
      return playingGroups.flatMap(g => g.words);
    }
    return [];
  }, [hoveredSentence, currentlyPlayingSentence, sentenceGroups]);

  return (
    <div 
      className="absolute top-0 left-0 z-40 pointer-events-none overflow-hidden"
      style={{ 
        width: renderedWidth, 
        height: renderedHeight 
      }}
      onMouseLeave={() => setHoveredSentence(null)}
    >
      {/* Sentence Highlight */}
      <AnimatePresence>
        {(hoveredSentence || currentlyPlayingSentence) && activeSentenceWords.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute pointer-events-none"
          >
            {(() => {
              const lines = new Map<number, typeof activeSentenceWords>();
              activeSentenceWords.forEach(w => {
                const existing = lines.get(w.line) || [];
                existing.push(w);
                lines.set(w.line, existing);
              });
              return Array.from(lines.values()).map((lineWords, i) => {
                const left = Math.min(...lineWords.map(w => w.bbox[0] * pointToPixel)) - 4;
                const top = Math.min(...lineWords.map(w => w.bbox[1] * pointToPixel)) - 3;
                const right = Math.max(...lineWords.map(w => w.bbox[2] * pointToPixel)) + 4;
                const bottom = Math.max(...lineWords.map(w => w.bbox[3] * pointToPixel)) + 3;
                return (
                  <div
                    key={`line-${i}`}
                    className={`absolute rounded transition-colors duration-300 ${
                      currentlyPlayingSentence === (hoveredSentence?.backendSentenceText || currentlyPlayingSentence)
                        ? 'bg-green-500/20'
                        : 'bg-indigo-500/10'
                    }`}
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${right - left}px`,
                      height: `${bottom - top}px`,
                    }}
                  />
                );
              });
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sentences Hover Action Button */}
      <AnimatePresence>
        {(hoveredSentence || (currentlyPlayingSentence && sentenceGroups.some(g => g.backendSentenceText === currentlyPlayingSentence))) && (
          <motion.div
            initial={{ opacity: 0, y: 5, x: 0 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 5, x: 0 }}
            className="pointer-events-auto absolute z-[80] pt-6" // pt-6 creates a hover 'bridge'
            style={{
              top: `${(hoveredSentence?.bbox.top || Math.min(...(sentenceGroups.find(g => g.backendSentenceText === currentlyPlayingSentence)?.words.map(w => w.bbox[1] * pointToPixel) || [0]))) - 50}px`,
              left: `${hoveredSentence ? hoveredSentence.bbox.left : ((sentenceGroups.find(g => g.backendSentenceText === currentlyPlayingSentence)?.words[0]?.bbox[0] || 0) * pointToPixel)}px`,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hoveredSentence) onSentencePlay(hoveredSentence.backendSentenceText);
                else if (currentlyPlayingSentence) onSentencePlay(currentlyPlayingSentence);
              }}
              className={`p-2 rounded-xl shadow-xl transition-all flex items-center gap-2 px-4 group/btn border border-white/20 backdrop-blur-sm ${
                isPlaying ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isPlaying ? (
                <div className="flex items-center gap-0.5 h-3">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [3, 12, 3] }}
                      transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                      className="w-0.5 bg-white rounded-full"
                    />
                  ))}
                </div>
              ) : (
                <Play className="w-4 h-4 text-white fill-white group-hover/btn:scale-110 transition-transform" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                {isPlaying ? 'Reading...' : 'Read Sentence'}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {pageData.words.map((word, idx) => {
        // Only render words that contain at least one alphabet character
        if (!/[a-zA-Z]/.test(word.text)) {
          return null;
        }

        const [x0, y0, x1, y1] = word.bbox;
        const hoverText = word.text.replace(/[^\w\s'’\-]|_/g, "").trim();

        return (
          <div
            key={`${word.text}-${idx}`}
            className="absolute cursor-pointer pointer-events-auto bg-transparent hover:bg-indigo-500/10 rounded-sm transition-all duration-75 group"
            style={{
              left: `${x0 * pointToPixel}px`,
              top: `${y0 * pointToPixel}px`,
              width: `${(x1 - x0) * pointToPixel}px`,
              height: `${(y1 - y0) * pointToPixel}px`,
            }}
            onMouseEnter={() => handleMouseEnter(idx)}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(word.text);
            }}
          >
            <div className="opacity-0 group-hover:opacity-100 absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap z-[70] pointer-events-none">
                {hoverText}
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
  const [originalWord, setOriginalWord] = useState<string>('');
  const [lemma, setLemma] = useState<string | undefined>(undefined);
  const [activeWord, setActiveWord] = useState<string>('');
  const [inputWord, setInputWord] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingWord, setIsLoadingWord] = useState(false);
  const [hasPlayedLemma, setHasPlayedLemma] = useState(false);
  const hasAutoPlayedRef = useRef(false);
  const [lastSentenceId, setLastSentenceId] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<Record<number, { width: number, height: number }>>({});
  const [reparsing, setReparsing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReadingWord, setIsReadingWord] = useState(false);
  const [currentlyPlayingSentence, setCurrentlyPlayingSentence] = useState<string | null>(null);
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
  const inputRef = useRef<HTMLInputElement>(null);

  const lastFetchedBookId = useRef<number | null>(null);

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
    if (lastFetchedBookId.current === bookId) return;
    lastFetchedBookId.current = bookId;
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
          onBack();
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
      }
    };

    const observer = new ResizeObserver(updateWidth);
    observer.observe(scrollContainerRef.current);
    updateWidth();

    return () => observer.disconnect();
  }, [book, scale]);

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
  }, [book, currentPage]);

  const scrollToPage = (pageNum: number) => {
    if (!scrollContainerRef.current) return;
    const pageEl = scrollContainerRef.current.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const lookupWord = async (word: string, sentenceId?: number, skipLemma: boolean = false, forceRefresh: boolean = false) => {
    const cleanWord = word.replace(/[^\w\s'’]|_/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleanWord) return;

    setIsLoadingWord(true);
    try {
      const response = await axios.get(`http://localhost:8000/api/dict`, {
        params: { 
          word: cleanWord,
          book_id: bookId,
          sentence_id: sentenceId,
          skip_lemma: skipLemma,
          force_refresh: forceRefresh
        }
      });
      setSelectedWord(response.data);
      // Auto-play audio on first lookup or forced refresh
      if ((!skipLemma || forceRefresh) && response.data.audio_url) {
        hasAutoPlayedRef.current = true;
        speak(response.data.word, response.data.audio_url);
      }
    } catch (error) {
      console.error('Error fetching word:', error);
      setSelectedWord({ id: 0, word: cleanWord, phonetic: '', meaning: 'Failed to load definition' });
    } finally {
      setIsLoadingWord(false);
    }
  };

  // Debounced lookup when inputWord changes (only for manual typing, not for tag clicks)
  useEffect(() => {
    if (!isDialogOpen || !inputWord) return;
    
    // Skip if inputWord matches activeWord (tag click already triggered lookup)
    if (selectedWord && inputWord.toLowerCase() === activeWord.toLowerCase()) return;

    const delayDebounceFn = setTimeout(() => {
      lookupWord(inputWord, lastSentenceId, true);
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [inputWord, isDialogOpen, lastSentenceId, activeWord]);

  const handleWordClick = async (word: string, sentenceId?: number) => {
    // Clean word: remove punctuation and whitespace, keep only letters and apostrophes
    const cleanWord = word.replace(/[^\w\s'’]|_/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleanWord) return;

    // Open dialog immediately with loading state (REQ-001)
    setIsDialogOpen(true);
    setInputWord(cleanWord);
    setLastSentenceId(sentenceId);
    setOriginalWord(cleanWord);
    setActiveWord(cleanWord);
    setLemma(undefined);
    setHasPlayedLemma(false);
    hasAutoPlayedRef.current = false;
    console.log('handleWordClick:', cleanWord, sentenceId);
    setSelectedWord({ id: 0, word: cleanWord, phonetic: '', meaning: '' });
    
    await lookupWord(cleanWord, sentenceId, false);
  };

  const handleLemmaClick = async (lemmaWord: string) => {
    if (!hasPlayedLemma) {
      setHasPlayedLemma(true);
    }
    setActiveWord(lemmaWord);
    setInputWord(lemmaWord);
    await lookupWord(lemmaWord, lastSentenceId, true);
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

  const speak = async (text: string, audioUrl?: string, onComplete?: () => void) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(e => {
        console.error("Error playing audio file, falling back to synthesis", e);
        fallbackSpeak(text, onComplete);
      });
      audio.onended = () => onComplete?.();
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
          fallbackSpeak(text, onComplete);
        });
        audio.onended = () => onComplete?.();
        return;
      }
    } catch (error) {
      console.error("Error fetching TTS audio, falling back to synthesis", error);
    }
    fallbackSpeak(text, onComplete);
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
    setCurrentlyPlayingSentence(sentenceText);
    await speak(sentenceText, undefined, () => {
      setIsSpeaking(false);
      setCurrentlyPlayingSentence(null);
    });
  };

  const fallbackSpeak = (text: string, onComplete?: () => void) => {
    if (!window.speechSynthesis) {
      onComplete?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.8;
    utterance.onend = () => onComplete?.();
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

  // Update lemma when selectedWord changes (only for initial lookup, not for lemma clicks)
  useEffect(() => {
    if (selectedWord && selectedWord.lemma && !isLoadingWord && activeWord === originalWord) {
      setLemma(selectedWord.lemma);
    }
  }, [selectedWord, isLoadingWord, originalWord, activeWord]);

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
                            currentlyPlayingSentence={currentlyPlayingSentence}
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
              {book.sentences?.length ? book.sentences.map((sentence) => {
                const isPlaying = currentlyPlayingSentence === sentence.text;
                return (
                  <span key={sentence.id} className={`group/sentence rounded px-2 py-1 -mx-2 transition-colors relative inline-block ${
                    isPlaying ? 'bg-green-50' : 'hover:bg-indigo-50/50'
                  }`}>
                    {sentence.text.split(/\s+/).map((word, wIdx) => {
                      // Only show words that contain at least one alphabet character
                      if (!/[a-zA-Z]/.test(word)) return null;
                      
                      // Remove symbols for cleaner reading view
                      const cleanDisplayWord = word.replace(/[^\w\s'’]|_/g, "").trim();
                      if (!cleanDisplayWord) return null;

                      return (
                        <span
                          key={wIdx}
                          onMouseEnter={() => console.log('[Hover] Backend sentence:', sentence.text)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWordClick(word, sentence.id);
                          }}
                          className="cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 px-0.5 rounded transition-all inline-block"
                        >
                          {cleanDisplayWord}{' '}
                        </span>
                      );
                    })}
                    <div className={`absolute -top-12 left-0 pt-6 pointer-events-auto z-10 transition-all duration-300 ${
                      isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover/sentence:opacity-100 group-hover/sentence:translate-y-0'
                    }`}>
                      <button 
                        onClick={() => handleSentencePlay(sentence.text)}
                        className={`p-2 rounded-xl shadow-xl transition-all flex items-center gap-2 px-4 whitespace-nowrap border border-white/20 backdrop-blur-sm ${
                          isPlaying ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {isPlaying ? (
                          <div className="flex items-center gap-0.5 h-3">
                            {[1, 2, 3].map((i) => (
                              <motion.div
                                key={i}
                                animate={{ height: [3, 12, 3] }}
                                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                                className="w-0.5 bg-white rounded-full"
                              />
                            ))}
                          </div>
                        ) : (
                          <Play className="w-4 h-4 text-white fill-white group-hover:scale-110 transition-transform" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                          {isPlaying ? 'Reading...' : 'Read Sentence'}
                        </span>
                      </button>
                    </div>
                  </span>
                );
              }) : (
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
      {/* Word Definition Modal */}
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
              layout
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ 
                type: 'spring', 
                damping: 25, 
                stiffness: 300,
                layout: { duration: 0.3 }
              }}
              className="fixed inset-x-4 bottom-8 z-[101] clay-card bg-white p-8 max-w-2xl mx-auto shadow-2xl border-t-8 border-indigo-500 overflow-hidden"
              style={{ transition: 'none' }}
            >
              <div className="absolute top-4 right-4 flex gap-3">
                <button
                  onClick={() => lookupWord(inputWord, lastSentenceId, true, true)}
                  className="w-10 h-10 clay-card flex items-center justify-center text-slate-400 hover:text-indigo-500 transition-colors"
                  title="Refresh definition"
                  disabled={isLoadingWord}
                >
                  <RefreshCw className={`w-5 h-5 ${isLoadingWord ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="w-10 h-10 clay-card flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex justify-between items-start mb-6">
                <div className="w-full mr-8">
                  {/* Lemma Tags - Show when word !== lemma */}
                  {lemma && (
                    <div 
                      key={activeWord}
                      className="flex items-center gap-2 mb-3 overflow-hidden"
                    >
                      <button
                        onClick={async () => {
                          if (activeWord !== originalWord) {
                            setActiveWord(originalWord);
                            setInputWord(originalWord);
                            await lookupWord(originalWord, lastSentenceId, false);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                          activeWord === originalWord
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {originalWord}
                      </button>
                      <button
                        onClick={() => handleLemmaClick(lemma)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                          activeWord === lemma
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {lemma}
                      </button>
                    </div>
                  )}
                  <div className={`transition-all duration-300 ${(isLoadingWord && selectedWord?.meaning) ? 'blur-[4px] pointer-events-none' : ''}`}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputWord}
                      onChange={(e) => setInputWord(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && inputWord.trim()) {
                          lookupWord(inputWord.trim(), lastSentenceId, false);
                          inputRef.current?.blur();
                        }
                      }}
                      className="text-4xl font-bold text-indigo-600 mb-1 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg w-full transition-all"
                      placeholder="Type a word..."
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-blue-500 font-bold text-lg">{selectedWord?.phonetic}</span>
                      {selectedWord?.phonetic && (
                        <button
                          onClick={() => {
                            setIsReadingWord(true);
                            speak(selectedWord?.word || '', selectedWord?.audio_url, () => setIsReadingWord(false));
                          }}
                          disabled={isReadingWord}
                          className="w-10 h-10 clay-card bg-blue-50 text-blue-600 flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Listen"
                        >
                          {isReadingWord ? (
                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Volume2 className="w-5 h-5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative min-h-[200px]">
                <AnimatePresence mode="wait">
                  {isLoadingWord && !selectedWord?.meaning ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-col items-center justify-center py-12"
                    >
                      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-slate-500 font-medium">Looking up &quot;{inputWord}&quot;...</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={selectedWord?.word || 'content'}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className={`transition-all duration-300 ${(isLoadingWord && selectedWord?.meaning) ? 'pointer-events-none' : ''}`}
                      style={{
                        filter: (isLoadingWord && selectedWord?.meaning) ? 'blur(4px)' : 'blur(0px)'
                      }}
                    >
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
                        className="px-5 py-2.5 rounded-2xl font-bold transition-all text-sm bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105 w-full py-4 text-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-6 h-6" />
                        Add to My Word Bank
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
            className="px-5 py-2.5 rounded-2xl font-bold transition-all text-base bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105"
          >
            {dialogConfig.confirmText || "OK"}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
