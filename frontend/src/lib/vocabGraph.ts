import { api } from './api';
import { VocabGraphResponse } from '../types';

let cachedPromise: Promise<VocabGraphResponse> | null = null;

export async function getVocabGraph(): Promise<VocabGraphResponse> {
  if (cachedPromise) {
    return cachedPromise;
  }
  
  cachedPromise = api.get<VocabGraphResponse>('/api/vocab/graph')
    .then(res => res.data)
    .catch(err => {
      cachedPromise = null;
      throw err;
    });
    
  return cachedPromise;
}

export function clearVocabGraphCache(): void {
  cachedPromise = null;
}
