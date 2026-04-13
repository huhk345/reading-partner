'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { Volume2, Plus, History, X, FileText, RefreshCw, Play, Check } from 'lucide-react';
import { Book, WordDefinition, PageData, Sentence, WordData } from '../types';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { 
  Dialog, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from './Dialog';

function fallbackSpeak(text: string, onComplete?: () => void) {
  if (!window.speechSynthesis) {
    onComplete?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.8;
  utterance.onend = () => onComplete?.();
  window.speechSynthesis.speak(utterance);
}

function endsWithSentencePunctuation(text: string, abbreviations: string[]): boolean {
  if (!text) return false;

  // Protect periods inside known abbreviations so "Dr." doesn't end a sentence.
  const protectedText = abbreviations.length > 0
    ? (() => {
        const abbreviationPattern = abbreviations.map(a => `\\b${a.replace(/\./g, '\\.')}`).join('|');
        return text.replace(new RegExp(`(${abbreviationPattern})`, 'g'), m => m.replace(/\./g, '\x00'));
      })()
    : text;

  // Ignore trailing quote characters when looking for sentence-ending punctuation.
  // Examples that should count as sentence-ending: `Hello."`, `What?"`, `Wow!”`
  const trailingQuoteChars = new Set(['"', '“', '”', '\'', '’']);
  let i = protectedText.length - 1;
  while (i >= 0 && trailingQuoteChars.has(protectedText[i])) i--;

  if (i < 0) return false;

  const last = protectedText[i];
  return '.!?…'.includes(last);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function normalizeToken(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function fuzzyTokenEquals(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const maxLen = Math.max(a.length, b.length);
  // Be conservative for very short tokens.
  const maxDist = maxLen <= 4 ? 1 : maxLen <= 7 ? 1 : 2;
  return levenshteinDistance(a, b) <= maxDist;
}

type TokenSpan = { start: number; endExclusive: number; spanLen: number };

function findFuzzyTokenSpanMatch(
  wordTokens: string[],
  sentTokens: string[],
): TokenSpan | null {
  if (sentTokens.length === 0 || wordTokens.length === 0) return null;

  const matchIndices: number[] = [];
  let wIdx = 0;
  let sIdx = 0;

  while (wIdx < wordTokens.length && sIdx < sentTokens.length) {
    if (fuzzyTokenEquals(wordTokens[wIdx], sentTokens[sIdx])) {
      matchIndices.push(wIdx);
      sIdx++;
    }
    wIdx++;
  }

  if (sIdx !== sentTokens.length) return null;

  const start = matchIndices[0];
  const endExclusive = matchIndices[matchIndices.length - 1] + 1;
  const spanLen = endExclusive - start;

  // Prevent matching a sentence across a much larger region (often indicates we crossed sentence boundaries).
  if (spanLen > sentTokens.length + 3) return null;

  return { start, endExclusive, spanLen };
}

// Set up worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface WordOverlayProps {
  pageData?: PageData;
  pageNumber: number;
  renderedWidth: number;
  renderedHeight: number;
  onWordClick: (word: string, sentenceText?: string) => void;
  onSentencePlay: (sentenceText: string) => void;
  sentences?: Sentence[];
  currentlyPlayingSentence: string | null;
  onPageSentencesChange?: (pageNumber: number, sentenceTexts: string[]) => void;
  isReadingPage?: boolean;
}

function WordOverlay({ pageData, pageNumber, renderedWidth, renderedHeight, onWordClick, onSentencePlay, sentences, currentlyPlayingSentence, onPageSentencesChange, isReadingPage }: WordOverlayProps) {
  const [hoveredSentence, setHoveredSentence] = useState<{
    text: string;
    backendSentenceText: string;
    bbox: { top: number; left: number; right: number; bottom: number };
  } | null>(null);
  const [hoveredWordIdx, setHoveredWordIdx] = useState<number | null>(null);

  // Group words into sentences on this page based on punctuation
  const sentenceGroups = useMemo(() => {
    if (!pageData || !pageData.words) return [];

    const groups: { text: string; words: WordData[], isValid: boolean, backendSentenceText: string }[] = [];
    let currentWords: WordData[] = [];
    // Sentence grouping is word-based; we treat punctuation as sentence-ending even if it's followed
    // by closing quotes (e.g., `."`, `?”`). So we don't track quote state here.
    
    const normalizedSentences = (sentences || []).map((s: Sentence) => ({
      text: s.text,
      normalized: normalizeToken(s.text),
      // IMPORTANT: tokenization must match the OCR word normalization logic below.
      // We intentionally treat "robot's" as a single token "robots" (not ["robot","s"]).
      tokens: s.text.split(/\s+/).map(normalizeToken).filter(Boolean),
    }));
    
    const abbreviations = [
      'Mrs.', 'Mr.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.',
      'St.', 'Ave.', 'Blvd.', 'Rd.',
      'etc.', 'vs.', 'Inc.', 'Ltd.', 'Corp.',
      'vol.', 'ch.', 'fig.', 'approx.',
      'A.M.', 'P.M.', 'a.m.', 'p.m.',
      'U.S.', 'U.K.', 'E.U.',
    ];

    // As we successfully match OCR word groups to backend sentences, advance this pointer so that
    // matches prefer the next expected sentence (keeps matching stable and ordered).
    let nextSentenceIdx = 0;

    pageData.words.forEach((word, idx) => {
      currentWords.push(word);
      const trimmedText = word.text.replace(/\s+$/, '');
      const endsWithPunctuation = endsWithSentencePunctuation(trimmedText, abbreviations);

      if (endsWithPunctuation || idx === pageData.words.length - 1) {
        let processing = true;
        // If OCR missed punctuation, a single `currentWords` chunk can contain multiple sentences.
        // Once we match the first sentence inside this chunk, subsequent matches MUST be consecutive
        // in the backend `sentences` list (no skipping), otherwise we mark the remainder as unmatched.
        let expectedSentenceIdx: number | null = null;

        while (processing && currentWords.length > 0) {
          const text = currentWords.map(w => w.text).join(' ');
          const normalizedText = normalizeToken(text);
          const currentWordsTokens = currentWords.map(w => normalizeToken(w.text));
          
          let matched = false;
          
          if (normalizedText.length > 0) {
              let match = null;
              let matchIdx: number | null = null;
              let tokenSpan: TokenSpan | null = null;
              // When OCR misses sentence-ending punctuation, `currentWords` can contain multiple backend
              // sentences. In that case, prefer matches that occur earliest (ideally at the start) so we
              // can split off the first sentence deterministically.
              let bestPos = Infinity;
              let bestDiff = Infinity;

              const getCandidateAtIndex = (sIdx: number): { sIdx: number; pos: number; diff: number; span: TokenSpan | null } | null => {
                  const s = normalizedSentences[sIdx];
                  if (!s) return null;

                  let isMatch = false;
                  if (normalizedText.length <= 5) {
                      isMatch = s.normalized === normalizedText;
                  } else {
                      isMatch = s.normalized.includes(normalizedText) || normalizedText.includes(s.normalized);
                  }

                  if (isMatch) {
                      const diff = Math.abs(s.normalized.length - normalizedText.length);
                      const pos = normalizedText.includes(s.normalized)
                        ? normalizedText.indexOf(s.normalized)
                        : 0;
                      return { sIdx, pos, diff, span: null };
                  }

                  const span = findFuzzyTokenSpanMatch(currentWordsTokens, s.tokens);
                  if (span) {
                      // Token-span match handles OCR typos like "ang" vs "and" or "stree" vs "street".
                      const pos = span.start;
                      const diff = Math.abs(span.spanLen - s.tokens.length);
                      return { sIdx, pos, diff, span };
                  }

                  return null;
              };

              const considerCandidate = (cand: { sIdx: number; pos: number; diff: number; span: TokenSpan | null } | null) => {
                  if (!cand) return;
                  if (cand.pos < bestPos || (cand.pos === bestPos && cand.diff < bestDiff)) {
                      bestPos = cand.pos;
                      bestDiff = cand.diff;
                      match = normalizedSentences[cand.sIdx];
                      matchIdx = cand.sIdx;
                      tokenSpan = cand.span;
                  }
              };

              if (expectedSentenceIdx !== null) {
                  // Enforce strict consecutiveness while splitting a multi-sentence OCR chunk:
                  // only the *next* backend sentence is allowed to match.
                  considerCandidate(getCandidateAtIndex(expectedSentenceIdx));
              } else {
                  // Prefer matching at/after the next expected sentence index to keep ordering stable.
                  for (let sIdx = nextSentenceIdx; sIdx < normalizedSentences.length; sIdx++) {
                      considerCandidate(getCandidateAtIndex(sIdx));
                      if (bestPos === 0 && bestDiff === 0) break;
                  }
                  // If we still didn't find anything, allow a full scan as a resync mechanism.
                  if (!match && nextSentenceIdx > 0) {
                      for (let sIdx = 0; sIdx < nextSentenceIdx; sIdx++) {
                          considerCandidate(getCandidateAtIndex(sIdx));
                          if (bestPos === 0 && bestDiff === 0) break;
                      }
                  }
              }

              if (!match && normalizedText.length > 5) {
                  // Fuzzy match for sentences that are almost identical
                  let minDist = Infinity;
                  const startIdx: number = expectedSentenceIdx !== null ? expectedSentenceIdx : 0;
                  const endIdx: number = expectedSentenceIdx !== null ? expectedSentenceIdx + 1 : normalizedSentences.length;
                  for (let sIdx: number = startIdx; sIdx < endIdx; sIdx++) {
                      const s = normalizedSentences[sIdx];
                      if (Math.abs(s.normalized.length - normalizedText.length) > 2) continue;
                      const dist = levenshteinDistance(s.normalized, normalizedText);
                      const maxDist = normalizedText.length > 10 ? 2 : 1;
                      if (dist <= maxDist) {
                          if (dist < minDist) {
                              minDist = dist;
                              match = s;
                              matchIdx = sIdx;
                          }
                          if (minDist === 0) break;
                      }
                  }
              }

              if (match) {
                  // Check if we have a superset (we have more text than the match)
                  // AND the match is contained within our text.
                  // We also handle exact match here if we relax the length check, but strictly splitting is for superset.
                  const span = tokenSpan as unknown as TokenSpan | null;
                  if (span && currentWords.length > span.endExclusive) {
                      const startIndex = span.start;
                      const endIndex = span.endExclusive;
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

                      if (matchIdx !== null) {
                          expectedSentenceIdx = matchIdx + 1;
                          nextSentenceIdx = Math.max(nextSentenceIdx, matchIdx + 1);
                      }

                      currentWords = suffix;
                      matched = true;
                      // Continue loop to process suffix
                  } else if (normalizedText.includes(match.normalized) && normalizedText.length > match.normalized.length) {
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

                      if (matchIdx !== null) {
                          expectedSentenceIdx = matchIdx + 1;
                          nextSentenceIdx = Math.max(nextSentenceIdx, matchIdx + 1);
                      }
                      
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

                      if (matchIdx !== null) {
                          // For a single-sentence match, advance the global pointer.
                          nextSentenceIdx = Math.max(nextSentenceIdx, matchIdx + 1);
                      }

                      currentWords = [];
                      processing = false;
                      matched = true;
                  }
              }
          }

          if (!matched) {
             // If we are in the middle of splitting a multi-sentence OCR chunk, but the next expected
             // backend sentence doesn't match, do NOT try to match arbitrary other sentences.
             // Mark the remainder as unmatched to avoid non-consecutive sentence alignment.
             if (expectedSentenceIdx !== null) {
                groups.push({
                  text,
                  words: [...currentWords],
                  isValid: false,
                  backendSentenceText: text
                });
                currentWords = [];
                processing = false;
                continue;
             }

             // Try Sequence Match Logic
             let bestSentMatch = null;
             let maxTokens = -1;
             let bestMatchIndices: number[] = [];

             // Optimization: Scan sentences for sequence match
             for (const sent of normalizedSentences) {
                 if (sent.tokens.length === 0) continue;
                 
                 let wIdx = 0;
                 let sIdx = 0;
                 const matchIndices: number[] = [];
                 
                 while (wIdx < currentWordsTokens.length && sIdx < sent.tokens.length) {
                     if (fuzzyTokenEquals(currentWordsTokens[wIdx], sent.tokens[sIdx])) {
                         matchIndices.push(wIdx);
                         sIdx++;
                     }
                     wIdx++;
                 }
                 
                 if (sIdx === sent.tokens.length) {
                      // Found a sequence match!
                      // The more tokens matched, the better.
                      if (sent.tokens.length > maxTokens) {
                          maxTokens = sent.tokens.length;
                          bestSentMatch = sent;
                          bestMatchIndices = matchIndices;
                      }
                 }
             }

             if (bestSentMatch) {
                      const sent = bestSentMatch;
                      const matchIndices = bestMatchIndices;
                      // Found a sequence match!
                      // Partition currentWords into Valid/Invalid blocks
                      let currentBlock: WordData[] = [];
                      let isBlockValid = matchIndices.includes(0); // Start state
                      
                      for (let i = 0; i < currentWords.length; i++) {
                          const isMatch = matchIndices.includes(i);
                          
                          if (isMatch !== isBlockValid) {
                              // Push old block
                              if (currentBlock.length > 0) {
                                  groups.push({
                                      text: currentBlock.map(w => w.text).join(' '),
                                      words: currentBlock,
                                      isValid: isBlockValid,
                                      backendSentenceText: isBlockValid ? sent.text : currentBlock.map(w => w.text).join(' ')
                                  });
                              }
                              // Start new block
                              currentBlock = [currentWords[i]];
                              isBlockValid = isMatch;
                          } else {
                              currentBlock.push(currentWords[i]);
                          }
                      }
                      // Push last block
                      if (currentBlock.length > 0) {
                          groups.push({
                              text: currentBlock.map(w => w.text).join(' '),
                              words: currentBlock,
                              isValid: isBlockValid,
                              backendSentenceText: isBlockValid ? sent.text : currentBlock.map(w => w.text).join(' ')
                          });
                      }
                      
                      matched = true;
                      currentWords = []; // Consumed all
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
  }, [pageData, sentences]);

  // Expose the ordered list of backend sentence texts for this page to the parent.
  useEffect(() => {
    if (!onPageSentencesChange) return;
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const g of sentenceGroups) {
      if (!g.isValid) continue;
      const t = g.backendSentenceText;
      if (!t || seen.has(t)) continue;
      seen.add(t);
      ordered.push(t);
    }
    onPageSentencesChange(pageNumber, ordered);
  }, [sentenceGroups, onPageSentencesChange, pageNumber]);

  const activeSentenceWords = useMemo(() => {
    if (hoveredSentence) {
      return sentenceGroups.filter(g => g.backendSentenceText === hoveredSentence.backendSentenceText && g.isValid).flatMap(g => g.words);
    }
    if (currentlyPlayingSentence) {
      const playingGroups = sentenceGroups.filter(g => g.backendSentenceText === currentlyPlayingSentence);
      return playingGroups.flatMap(g => g.words);
    }
    return [];
  }, [hoveredSentence, currentlyPlayingSentence, sentenceGroups]);

  const activeSentenceVisualLines = useMemo(() => {
    if (activeSentenceWords.length === 0) return [];

    // Use projection profile to group words into lines visually
    // 1. Find unique Y coordinates
    const uniqueYs = Array.from(new Set(activeSentenceWords.flatMap(w => [w.bbox[1], w.bbox[3]])))
      .sort((a, b) => a - b);
    
    const lineRegions: { top: number; bottom: number }[] = [];
    let currentRegion: { top: number; bottom: number } | null = null;

    // 2. Identify vertical regions that have text (intervals)
    for (let i = 0; i < uniqueYs.length - 1; i++) {
      const y1 = uniqueYs[i];
      const y2 = uniqueYs[i + 1];
      const mid = (y1 + y2) / 2;
      
      // Check if any word vertically overlaps this slice
      const hasWord = activeSentenceWords.some(w => w.bbox[1] <= mid && w.bbox[3] >= mid);

      if (hasWord) {
        if (!currentRegion) {
          currentRegion = { top: y1, bottom: y2 };
        } else {
          // Extend current region
          currentRegion.bottom = y2;
        }
      } else {
        // Gap found
        if (currentRegion) {
          lineRegions.push(currentRegion);
          currentRegion = null;
        }
      }
    }
    if (currentRegion) {
      lineRegions.push(currentRegion);
    }

    // 3. Map words to regions
    return lineRegions.map(region => 
      activeSentenceWords.filter(w => 
        // A word belongs to a region if it overlaps with it
        Math.max(w.bbox[1], region.top) < Math.min(w.bbox[3], region.bottom)
      )
    ).filter(words => words.length > 0);
  }, [activeSentenceWords]);

  const pointToPixel = (pageData && pageData.width) ? renderedWidth / pageData.width : 0;

  const handleMouseEnter = (wordIdx: number) => {
    // Suppress hover if a sentence is currently playing
    if (currentlyPlayingSentence) return;

    setHoveredWordIdx(wordIdx);
    // Find which group this word belongs to
    let currentCount = 0;
    const group = sentenceGroups.find(g => {
      const start = currentCount;
      const end = currentCount + g.words.length;
      currentCount = end;
      return wordIdx >= start && wordIdx < end;
    });

    if (group && group.isValid && pageData) {
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

  const buttonPosition = useMemo(() => {
    const gap = -60;
    let top = 0;
    let left = 0;

    if (hoveredWordIdx !== null && pageData?.words?.[hoveredWordIdx]) {
      const word = pageData.words[hoveredWordIdx];
      const line = activeSentenceVisualLines.find(l => l.includes(word));
      if (line && line.length > 0) {
        top = Math.min(...line.map(w => w.bbox[1] * pointToPixel)) + gap;
      } else {
        top = word.bbox[1] * pointToPixel + gap;
      }
      left = (word.bbox[0] + word.bbox[2]) / 2 * pointToPixel;
    } else if (hoveredSentence) {
      top = hoveredSentence.bbox.top + gap;
      left = (hoveredSentence.bbox.left + hoveredSentence.bbox.right) / 2;
    } else if (currentlyPlayingSentence) {
      const playingGroup = sentenceGroups.find(g => g.backendSentenceText === currentlyPlayingSentence);
      if (playingGroup && playingGroup.words.length > 0) {
        top = Math.min(...playingGroup.words.map(w => w.bbox[1] * pointToPixel)) + gap;
        const minLeft = Math.min(...playingGroup.words.map(w => w.bbox[0] * pointToPixel));
        const maxRight = Math.max(...playingGroup.words.map(w => w.bbox[2] * pointToPixel));
        left = (minLeft + maxRight) / 2;
      }
    }

    return { top: `${top}px`, left: `${left}px` };
  }, [hoveredWordIdx, pageData?.words, activeSentenceVisualLines, pointToPixel, hoveredSentence, currentlyPlayingSentence, sentenceGroups]);

  if (!pageData || !pageData.words || !pageData.width || renderedWidth <= 0) {
    return null;
  }

  return (
    <div 
      className="absolute top-0 left-0 z-40 pointer-events-none overflow-hidden"
      style={{ 
        width: renderedWidth, 
        height: renderedHeight 
      }}
      onMouseLeave={() => {
        // Don't clear hover state if a sentence is currently playing
        if (!currentlyPlayingSentence) {
          setHoveredSentence(null);
          setHoveredWordIdx(null);
        }
      }}
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
            {activeSentenceVisualLines.map((lineWords, i) => {
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
                        : 'bg-green-500/10'
                    }`}
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${right - left}px`,
                      height: `${bottom - top}px`,
                    }}
                  />
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sentences Hover Action Button */}
      <AnimatePresence>
        {!isReadingPage && (hoveredSentence || (currentlyPlayingSentence && sentenceGroups.some(g => g.backendSentenceText === currentlyPlayingSentence))) && (
          <motion.div
            initial={{ 
              opacity: 0, 
              y: 5, 
              x: '-50%',
              ...buttonPosition
            }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              x: '-50%',
              ...buttonPosition
            }}
            exit={{ opacity: 0, y: 5, x: '-50%' }}
            className="pointer-events-auto absolute z-[80] pt-6" // pt-6 creates a hover 'bridge'
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isPlaying) return; // Prevent multiple calls while playing
                if (hoveredSentence) onSentencePlay(hoveredSentence.backendSentenceText);
                else if (currentlyPlayingSentence) onSentencePlay(currentlyPlayingSentence);
              }}
              className={`p-2 rounded-xl shadow-xl transition-all flex items-center gap-2 px-4 group/btn border border-white/20 backdrop-blur-sm ${
                isPlaying ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600 hover:bg-green-700'
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

        let styleTop = y0 * pointToPixel;
        let styleHeight = (y1 - y0) * pointToPixel;

        // If this word is hovered AND belongs to the active sentence
        if (hoveredSentence && idx === hoveredWordIdx && activeSentenceWords.some(w => w === word)) {
          const lineWords = activeSentenceVisualLines.find(line => line.includes(word));
          if (lineWords && lineWords.length > 0) {
            const minTop = Math.min(...lineWords.map(w => w.bbox[1] * pointToPixel)) - 3;
            const maxBottom = Math.max(...lineWords.map(w => w.bbox[3] * pointToPixel)) + 3;
            styleTop = minTop;
            styleHeight = maxBottom - minTop;
          }
        }

        return (
          <div
            key={`${word.text}-${idx}`}
            className={`absolute cursor-pointer pointer-events-auto bg-transparent rounded-sm transition-all duration-75 group ${
              !currentlyPlayingSentence ? 'hover:bg-green-500/20' : ''
            }`}
            style={{
              left: `${x0 * pointToPixel}px`,
              top: `${styleTop}px`,
              width: `${(x1 - x0) * pointToPixel}px`,
              height: `${styleHeight}px`,
            }}
            onMouseEnter={() => handleMouseEnter(idx)}
            onClick={(e) => {
              e.stopPropagation();
              // Find group for this word
              let currentCount = 0;
              const group = sentenceGroups.find(g => {
                  const start = currentCount;
                  const end = currentCount + g.words.length;
                  const match = idx >= start && idx < end;
                  currentCount = end;
                  return match;
              });
              const sentenceText = (group && group.isValid) ? group.backendSentenceText : undefined;
              onWordClick(word.text, sentenceText);
            }}
          >
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
  const [lastSentenceText, setLastSentenceText] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [renderedPages, setRenderedPages] = useState<Record<number, { width: number, height: number }>>({});
  const [reparsing, setReparsing] = useState(false);
  const [isReadingWord, setIsReadingWord] = useState(false);
  const [isAddingToVocab, setIsAddingToVocab] = useState(false);
  const [currentlyPlayingSentence, setCurrentlyPlayingSentence] = useState<string | null>(null);
  const [pageSentences, setPageSentences] = useState<Record<number, string[]>>({});
  const [pageSentenceAudioUrls, setPageSentenceAudioUrls] = useState<Record<string, string>>({});
  const [isCheckingPageTts, setIsCheckingPageTts] = useState(false);
  const [isPageTtsReady, setIsPageTtsReady] = useState(false);
  const [isReadingPage, setIsReadingPage] = useState(false);
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
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelReadPageRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlaybackResolveRef = useRef<(() => void) | null>(null);
  const currentPageRef = useRef<number>(1);

  const lastFetchedBookId = useRef<number | null>(null);

  const fetchBook = useCallback(async () => {
    try {
      const response = await api.get(`/api/books/${bookId}`);
      setBook(response.data);
    } catch (error) {
      console.error('Error fetching book:', error);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    if (lastFetchedBookId.current === bookId) return;
    lastFetchedBookId.current = bookId;
    fetchBook();
  }, [bookId, fetchBook]);

  const handleReparse = async () => {
    setDialogConfig({
      isOpen: true,
      title: "Re-parse Book?",
      description: "Are you sure you want to re-parse this book? This will reset your sentences and word occurrences for this book.",
      confirmText: "Yes, Re-parse",
      onConfirm: async () => {
        setReparsing(true);
        try {
          await api.post(`/api/books/${bookId}/reparse`);
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

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const getVisiblePdfPageNumber = useCallback((): number => {
    const container = scrollContainerRef.current;
    if (!container) return currentPageRef.current;

    const pageElements = Array.from(
      container.querySelectorAll<HTMLElement>('.pdf-page-wrapper'),
    );
    if (pageElements.length === 0) return currentPageRef.current;

    const containerRect = container.getBoundingClientRect();
    const visibleTop = containerRect.top;
    let visibleBottom = containerRect.bottom;

    // If the bottom bar overlaps the scroll container (mobile/small height layouts),
    // treat the area behind the bar as NOT visible.
    const barRect = bottomBarRef.current?.getBoundingClientRect();
    if (barRect) {
      visibleBottom = Math.min(visibleBottom, barRect.top);
    }

    if (visibleBottom <= visibleTop) return currentPageRef.current;

    let bestPage = currentPageRef.current;
    let bestIntersection = -1;
    let bestIdx = Infinity;

    for (let idx = 0; idx < pageElements.length; idx++) {
      const rect = pageElements[idx].getBoundingClientRect();
      const intersection = Math.max(
        0,
        Math.min(rect.bottom, visibleBottom) - Math.max(rect.top, visibleTop),
      );

      // Prefer the page with the largest visible area. If tied, prefer the earlier page.
      if (
        intersection > bestIntersection + 0.5 ||
        (Math.abs(intersection - bestIntersection) <= 0.5 && idx < bestIdx)
      ) {
        bestIntersection = intersection;
        bestIdx = idx;
        bestPage = idx + 1;
      }
    }

    // If no page is visibly intersecting (rare, but can happen during fast rerenders),
    // keep the current page number stable rather than jumping.
    if (bestIntersection <= 0) return currentPageRef.current;

    return bestPage;
  }, []);

  // Update current page on scroll (PDF only)
  useEffect(() => {
    if (book?.type !== 'pdf' || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const nextPage = getVisiblePdfPageNumber();
        if (nextPage !== currentPageRef.current) {
          currentPageRef.current = nextPage;
          setCurrentPage(nextPage);
        }
      });
    };

    container.addEventListener('scroll', handleScroll);
    // Initialize once the pages are rendered.
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [book?.type, getVisiblePdfPageNumber]);

  const scrollToPage = (pageNum: number) => {
    if (!scrollContainerRef.current) return;
    const pageEl = scrollContainerRef.current.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handlePageSentencesChange = useCallback((pageNumber: number, sentenceTexts: string[]) => {
    setPageSentences(prev => {
      const existing = prev[pageNumber];
      if (
        existing &&
        existing.length === sentenceTexts.length &&
        existing.every((t, i) => t === sentenceTexts[i])
      ) {
        return prev;
      }
      return { ...prev, [pageNumber]: sentenceTexts };
    });
  }, []);

  const stopPlayback = useCallback(() => {
    cancelReadPageRef.current = true;
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentPlaybackResolveRef.current) {
      currentPlaybackResolveRef.current();
      currentPlaybackResolveRef.current = null;
    }
    setIsReadingPage(false);
    setCurrentlyPlayingSentence(null);
  }, []);

  // If the user navigates back to the library (Reader unmounts), stop any audio immediately.
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Check whether all sentences on the current page already have cached TTS audio.
  useEffect(() => {
    if (book?.type !== 'pdf') return;

    const texts = pageSentences[currentPage] || [];
    if (texts.length === 0) {
      setIsPageTtsReady(false);
      setPageSentenceAudioUrls({});
      return;
    }

    let cancelled = false;
    setIsCheckingPageTts(true);

    api.post('/api/tts/status', { texts })
      .then((res) => {
        if (cancelled) return;
        const results: Array<{ text: string; ready: boolean; audio_url?: string | null }> = res.data?.results || [];

        const urlMap: Record<string, string> = {};
        let allReady = results.length === texts.length;
        for (const r of results) {
          if (!r?.ready) allReady = false;
          if (r?.ready && r.audio_url) {
            urlMap[r.text] = r.audio_url;
          }
        }

        setPageSentenceAudioUrls(urlMap);
        setIsPageTtsReady(allReady);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error checking page TTS status:', err);
        setIsPageTtsReady(false);
        setPageSentenceAudioUrls({});
      })
      .finally(() => {
        if (cancelled) return;
        setIsCheckingPageTts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [book?.type, currentPage, pageSentences]);

  const speak = useCallback(async (text: string, wordId?: number, audioUrl?: string, onComplete?: () => void) => {
    if (wordId) {
      const audio = new Audio(`${api.defaults.baseURL}/api/audio/${wordId}`);
      audio.play().catch(e => {
        console.error("Error playing word audio API, falling back to synthesis", e);
        fallbackSpeak(text, onComplete);
      });
      audio.onended = () => onComplete?.();
      return;
    }
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(e => {
        console.error("Error playing audio file, falling back to synthesis", e);
        fallbackSpeak(text, onComplete);
      });
      audio.onended = () => onComplete?.();
      return;
    }
    if (!text.includes(' ')) {
      fallbackSpeak(text, onComplete);
      return;
    }
    try {
      const response = await api.post('/api/tts', null, {
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
  }, []);

  const lookupWord = useCallback(async (word: string, sentenceId?: number, skipLemma: boolean = false, forceRefresh: boolean = false) => {
    const cleanWord = word.replace(/[^\w\s'’]|_/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleanWord) return;

    setIsLoadingWord(true);
    try {
      const response = await api.get('/api/dict', {
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
        speak(response.data.word, response.data.id, response.data.audio_url);
      }
    } catch (error) {
      console.error('Error fetching word:', error);
      setSelectedWord({ id: 0, word: cleanWord, phonetic: '', meaning: 'Failed to load definition' });
    } finally {
      setIsLoadingWord(false);
    }
  }, [bookId, speak]);

  // Debounced lookup when inputWord changes (only for manual typing, not for tag clicks)
  useEffect(() => {
    if (!isDialogOpen || !inputWord) return;
    
    // Skip if inputWord matches activeWord (tag click already triggered lookup)
    if (selectedWord && inputWord.toLowerCase() === activeWord.toLowerCase()) return;

    const delayDebounceFn = setTimeout(() => {
      lookupWord(inputWord, lastSentenceId, true);
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [inputWord, isDialogOpen, lastSentenceId, activeWord, selectedWord, lookupWord]);

  const handleWordClick = async (word: string, sentenceId?: number, sentenceText?: string) => {
    // Clean word: remove punctuation and whitespace, keep only letters and apostrophes
    const cleanWord = word.replace(/[^\w\s'’]|_/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleanWord) return;

    // Open dialog immediately with loading state (REQ-001)
    setIsDialogOpen(true);
    setInputWord(cleanWord);
    setLastSentenceId(sentenceId);
    setLastSentenceText(sentenceText);
    setOriginalWord(cleanWord);
    setActiveWord(cleanWord);
    setLemma(undefined);
    setHasPlayedLemma(false);
    hasAutoPlayedRef.current = false;
    console.log('handleWordClick:', cleanWord, sentenceId, sentenceText);
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

  const playCachedSentenceAudio = useCallback((sentenceText: string, audioUrl: string) => {
    return new Promise<void>((resolve) => {
      // Allow stopPlayback() to interrupt the current wait.
      currentPlaybackResolveRef.current = resolve;

      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      const cleanup = () => {
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        if (currentPlaybackResolveRef.current === resolve) currentPlaybackResolveRef.current = null;
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        // Audio element is no longer usable, but keep the resolve ref so stopPlayback can interrupt.
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        // Fallback to browser speech synthesis if the file fails to play.
        fallbackSpeak(sentenceText, () => {
          cleanup();
          resolve();
        });
      };

      audio.play().catch(() => {
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        fallbackSpeak(sentenceText, () => {
          cleanup();
          resolve();
        });
      });
    });
  }, []);

  const handleReadCurrentPage = useCallback(async () => {
    if (book?.type !== 'pdf') return;
    if (!isPageTtsReady) return;

    // Read the page that is actually visible (not just what state thinks),
    // so the button never jumps ahead when the next page isn't on screen yet.
    const visiblePage = getVisiblePdfPageNumber();
    if (visiblePage !== currentPageRef.current) {
      currentPageRef.current = visiblePage;
      setCurrentPage(visiblePage);
    }

    const texts = pageSentences[visiblePage] || [];
    if (texts.length === 0) return;

    stopPlayback();
    cancelReadPageRef.current = false;
    setIsReadingPage(true);

    try {
      for (const sentenceText of texts) {
        if (cancelReadPageRef.current) break;
        const url = pageSentenceAudioUrls[sentenceText];
        if (!url) break;
        setCurrentlyPlayingSentence(sentenceText);
        await playCachedSentenceAudio(sentenceText, url);
        setCurrentlyPlayingSentence(null);
      }
    } finally {
      setIsReadingPage(false);
      setCurrentlyPlayingSentence(null);
    }
  }, [
    book?.type,
    isPageTtsReady,
    pageSentences,
    pageSentenceAudioUrls,
    getVisiblePdfPageNumber,
    playCachedSentenceAudio,
    stopPlayback,
  ]);

  const handleSentencePlay = async (sentenceText: string) => {
    // If the sentence belongs to the current page and we already have cached audio,
    // prefer playing that file (no backend generation).
    const cachedUrl = pageSentenceAudioUrls[sentenceText];
    if (cachedUrl) {
      stopPlayback();
      cancelReadPageRef.current = false;
      setCurrentlyPlayingSentence(sentenceText);
      try {
        await playCachedSentenceAudio(sentenceText, cachedUrl);
      } finally {
        setCurrentlyPlayingSentence(null);
      }
      return;
    }

    setCurrentlyPlayingSentence(sentenceText);
    try {
      // NOTE: speak() returns after starting playback; state is cleared via onComplete.
      await speak(sentenceText, undefined, undefined, () => {
        setCurrentlyPlayingSentence(null);
      });
    } catch (error) {
      console.error("Error playing sentence:", error);
      setCurrentlyPlayingSentence(null);
    }
  };

  const addToVocab = async () => {
    if (!selectedWord || !selectedWord.id || isAddingToVocab) return;
    setIsAddingToVocab(true);
    try {
      const params: Record<string, string | number> = { word_id: selectedWord.id };
      if (lastSentenceId) params.sentence_id = lastSentenceId;
      if (lastSentenceText) params.sentence_text = lastSentenceText;
      if (bookId) params.book_id = bookId;
      await api.post('/api/vocab', null, { params });
      // Close the word dialog (REQ-002: no confirmation dialog)
      setIsDialogOpen(false);
      setSelectedWord(null);
    } catch (error) {
      console.error('Error adding to vocab:', error);
    } finally {
      setIsAddingToVocab(false);
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
            className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-100 flex flex-col items-center gap-8 py-8 pb-24 px-4"
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
                            pageNumber={index + 1}
                            renderedWidth={renderedPages[index].width}
                            renderedHeight={renderedPages[index].height}
                            onWordClick={(word, text) => handleWordClick(word, undefined, text)}
                            onSentencePlay={handleSentencePlay}
                            sentences={book.sentences}
                            currentlyPlayingSentence={currentlyPlayingSentence}
                            onPageSentencesChange={handlePageSentencesChange}
                            isReadingPage={isReadingPage}
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
                    isPlaying ? 'bg-green-50' : currentlyPlayingSentence ? '' : 'hover:bg-indigo-50/50'
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
                    {!isReadingPage && (
                      <div className={`absolute -top-12 left-0 pt-6 pointer-events-auto z-10 transition-all duration-300 ${
                        isPlaying
                          ? 'opacity-100 translate-y-0'
                          : currentlyPlayingSentence
                            ? 'opacity-0 pointer-events-none'
                            : 'opacity-0 translate-y-2 group-hover/sentence:opacity-100 group-hover/sentence:translate-y-0'
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
                    )}
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
        <div
          ref={bottomBarRef}
          className="h-16 bg-white border-t border-slate-200 flex items-center justify-between px-6 z-10 flex-shrink-0"
        >
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
            {isReadingPage && (
              <button
                onClick={stopPlayback}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all text-xs font-bold uppercase"
                title="Stop reading this page"
              >
                <div className="w-3.5 h-3.5 bg-white rounded-sm" />
                Stop
              </button>
            )}

            {isPageTtsReady && !isReadingPage && (
              <button
                onClick={handleReadCurrentPage}
                disabled={isCheckingPageTts}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all text-xs font-bold uppercase disabled:opacity-50"
                title="Read all sentences on this page"
              >
                <Play className="w-3.5 h-3.5 text-white fill-white" />
                Read This Page
              </button>
            )}
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
                            speak(selectedWord?.word || '', selectedWord?.id, selectedWord?.audio_url, () => setIsReadingWord(false));
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

                      {selectedWord?.vocab_sentence && (
                        <div className="mb-8">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Context
                          </h4>
                          <div className="p-4 bg-white/40 backdrop-blur-md rounded-2xl text-slate-600 italic border-l-4 border-indigo-300 border border-white/50 shadow-sm text-sm">
                            &quot;{selectedWord.vocab_sentence}&quot;
                          </div>
                        </div>
                      )}

                      {selectedWord?.in_vocab ? (
                        <div className="px-5 py-4 rounded-2xl font-bold text-lg bg-amber-50 text-amber-600 border-2 border-amber-200 w-full flex items-center justify-center gap-3">
                          <Check className="w-6 h-6" />
                          Already in Word Wall
                        </div>
                      ) : (
                        <button
                          onClick={addToVocab}
                          disabled={!selectedWord?.id || isAddingToVocab}
                          className="px-5 py-2.5 rounded-2xl font-bold transition-all text-sm bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105 w-full py-4 text-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAddingToVocab ? (
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Plus className="w-6 h-6" />
                          )}
                          {isAddingToVocab ? 'Adding...' : 'Add to My Word Bank'}
                        </button>
                      )}
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
