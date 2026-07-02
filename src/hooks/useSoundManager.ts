'use client';
import { useRef, useCallback, useEffect } from 'react';

let _preloaded: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!_preloaded) {
    _preloaded = new Audio('/ding.mp3');
    _preloaded.preload = 'auto';
  }
  return _preloaded;
}

export function useSoundManager() {
  const playingRef = useRef(false);

  useEffect(() => {
    getAudio();
  }, []);

  const playDing = useCallback((): Promise<void> => {
    const audio = getAudio();
    audio.currentTime = 0;
    return audio.play().then(() => {}).catch(() => {});
  }, []);

  const playDingAndWait = useCallback((delayMs = 800): Promise<void> => {
    const audio = getAudio();
    audio.currentTime = 0;
    return audio.play().then(() => new Promise<void>(r => setTimeout(r, delayMs))).catch(() => Promise.resolve());
  }, []);

  return { playDing, playDingAndWait };
}
