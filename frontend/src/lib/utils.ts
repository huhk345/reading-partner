import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts 1 or 2 Chinese words from a complex dictionary meaning string.
 * It attempts to pick words from different parts of speech (POS) if available.
 */
export function extractShortMeaning(meaning: string): string {
  if (!meaning) return '';

  const posRegex = /\b(n|v|vt|vi|a|adj|adv|prep|conj|pron|interj|det|art|abbr|num|numeral|suff|pref)\./gi;
  
  // 1. Find all POS positions
  const matches = Array.from(meaning.matchAll(posRegex));
  
  if (matches.length === 0) {
    // Fallback if no POS tags found
    return fallbackExtract(meaning);
  }

  const results: string[] = [];
  const usedWords = new Set<string>();

  // 2. Try to extract the first Chinese word from each POS group
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index || 0) + matches[i][0].length;
    const end = matches[i + 1] ? matches[i + 1].index : meaning.length;
    const groupText = meaning.substring(start, end);
    
    const word = getFirstChineseWord(groupText);
    if (word && !usedWords.has(word)) {
      results.push(word);
      usedWords.add(word);
    }
    
    if (results.length >= 2) break;
  }

  // 3. Supplement if we have only 1 word and there are more meanings in the first group
  if (results.length < 2 && matches.length > 0) {
    const firstGroupEnd = matches[1] ? matches[1].index : meaning.length;
    const firstGroupText = meaning.substring((matches[0].index || 0) + matches[0][0].length, firstGroupEnd);
    const extraWords = getAllChineseWords(firstGroupText);
    
    for (const word of extraWords) {
      if (!usedWords.has(word)) {
        results.push(word);
        usedWords.add(word);
      }
      if (results.length >= 2) break;
    }
  }

  return results.slice(0, 2).join('，');
}

/** Helper to get all Chinese words from a text block after cleaning */
function getAllChineseWords(text: string): string[] {
  const cleaned = text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/【[^】]*】/g, '');
    
  return cleaned.split(/[,，\s\n\r]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && /[\u4e00-\u9fa5]/.test(s));
}

/** Helper to get just the first Chinese word from a text block */
function getFirstChineseWord(text: string): string | null {
  const words = getAllChineseWords(text);
  return words.length > 0 ? words[0] : null;
}

/** Fallback for when no POS tags are found */
function fallbackExtract(meaning: string): string {
  const words = getAllChineseWords(meaning);
  const unique = Array.from(new Set(words));
  return unique.slice(0, 2).join('，');
}
