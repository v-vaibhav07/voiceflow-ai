// /**
//  * useAudio hook
//  *
//  * Owns a single AudioPlaybackManager instance for the component
//  * lifecycle, and exposes ergonomic play/stop actions plus state.
//  */

// import { useEffect, useRef, useState, useCallback } from 'react';
// import { AudioPlaybackManager, FallbackTTS } from '../utils/audio';
// import { ENABLE_FALLBACK_TTS } from '../utils/constants';

// export function useAudio() {
//   const managerRef = useRef(null);
//   const fallbackRef = useRef(null);
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [currentGeneration, setCurrentGeneration] = useState(null);

//   if (!managerRef.current) managerRef.current = new AudioPlaybackManager();
//   if (!fallbackRef.current && ENABLE_FALLBACK_TTS) fallbackRef.current = new FallbackTTS();

//   useEffect(() => {
//     const manager = managerRef.current;
//     const unsub = manager.subscribe((event) => {
//       if (event.type === 'play') {
//         setIsPlaying(true);
//         setCurrentGeneration(event.generation);
//       } else if (event.type === 'ended' || event.type === 'stopped' || event.type === 'error' || event.type === 'pause') {
//         setIsPlaying(false);
//         setCurrentGeneration(null);
//       }
//     });

//     return () => {
//       unsub();
//       manager.destroy();
//       managerRef.current = null;
//     };
//   }, []);

//   const play = useCallback(async ({ base64, mimeType, generation, messageId, isStale }) => {
//     const manager = managerRef.current;
//     if (!manager) return null;
//     return manager.play({ base64, mimeType, generation, messageId, isStale });
//   }, []);

//   const stop = useCallback(() => {
//     const manager = managerRef.current;
//     if (!manager) return 0;
//     return manager.stop();
//   }, []);

//   const speakFallback = useCallback(async (text) => {
//     const fallback = fallbackRef.current;
//     if (!fallback) throw new Error('Fallback TTS disabled');
//     return fallback.speak(text);
//   }, []);

//   const stopFallback = useCallback(() => {
//     const fallback = fallbackRef.current;
//     if (fallback) fallback.stop();
//   }, []);

//   const subscribe = useCallback((fn) => {
//     const manager = managerRef.current;
//     if (!manager) return () => {};
//     return manager.subscribe(fn);
//   }, []);

//   return {
//     play,
//     stop,
//     speakFallback,
//     stopFallback,
//     subscribe,
//     isPlaying,
//     currentGeneration,
//     fallbackAvailable: !!fallbackRef.current?.isAvailable(),
//   };
// }











// /**
//  * useAudio hook
//  *
//  * Owns a single AudioPlaybackManager instance for the component
//  * lifecycle, and exposes ergonomic play/stop actions plus state.
//  */

// import { useEffect, useRef, useState, useCallback } from 'react';
// import { AudioPlaybackManager, FallbackTTS } from '../utils/audio';
// import { ENABLE_FALLBACK_TTS } from '../utils/constants';

// export function useAudio() {
//   const managerRef = useRef(null);
//   const fallbackRef = useRef(null);

//   const [isPlaying, setIsPlaying] = useState(false);
//   const [currentGeneration, setCurrentGeneration] = useState(null);

//   /*
//    * Create the managers once.
//    *
//    * Keeping this outside the effect ensures the instance is available
//    * before any effect/subscriber tries to use it.
//    */
//   if (!managerRef.current) {
//     managerRef.current = new AudioPlaybackManager();
//   }

//   if (!fallbackRef.current && ENABLE_FALLBACK_TTS) {
//     fallbackRef.current = new FallbackTTS();
//   }

//   useEffect(() => {
//     const manager = managerRef.current;

//     // Safety guard: never call subscribe on a missing manager.
//     if (!manager) {
//       console.warn('[useAudio] AudioPlaybackManager is unavailable');
//       return undefined;
//     }

//     const unsub = manager.subscribe((event) => {
//       if (event.type === 'play') {
//         setIsPlaying(true);
//         setCurrentGeneration(event.generation);
//       } else if (
//         event.type === 'ended' ||
//         event.type === 'stopped' ||
//         event.type === 'error' ||
//         event.type === 'pause'
//       ) {
//         setIsPlaying(false);
//         setCurrentGeneration(null);
//       }
//     });

//     return () => {
//       /*
//        * IMPORTANT:
//        * Do NOT set managerRef.current = null here.
//        *
//        * React StrictMode may execute effect cleanup and setup again
//        * during development. Clearing the ref here can leave the next
//        * effect with a null manager.
//        */
//       if (typeof unsub === 'function') {
//         unsub();
//       }
//     };
//   }, []);

//   /*
//    * Destroy the manager only when the component is actually unmounted.
//    *
//    * This separate effect avoids destroying the manager during the
//    * StrictMode effect cycle.
//    */
//   useEffect(() => {
//     return () => {
//       const manager = managerRef.current;

//       if (manager) {
//         try {
//           manager.destroy();
//         } catch (error) {
//           console.error('[useAudio] Failed to destroy audio manager:', error);
//         }
//       }

//       managerRef.current = null;

//       const fallback = fallbackRef.current;

//       if (fallback) {
//         try {
//           fallback.stop();
//         } catch (error) {
//           console.error('[useAudio] Failed to stop fallback TTS:', error);
//         }
//       }

//       fallbackRef.current = null;
//     };
//   }, []);

//   const play = useCallback(
//     async ({ base64, mimeType, generation, messageId, isStale }) => {
//       const manager = managerRef.current;

//       if (!manager) {
//         console.warn('[useAudio] play() called without audio manager');
//         return null;
//       }

//       return manager.play({
//         base64,
//         mimeType,
//         generation,
//         messageId,
//         isStale,
//       });
//     },
//     []
//   );

//   const stop = useCallback(() => {
//     const manager = managerRef.current;

//     if (!manager) {
//       return 0;
//     }

//     return manager.stop();
//   }, []);

//   const speakFallback = useCallback(async (text) => {
//     const fallback = fallbackRef.current;

//     if (!fallback) {
//       throw new Error('Fallback TTS disabled');
//     }

//     return fallback.speak(text);
//   }, []);

//   const stopFallback = useCallback(() => {
//     const fallback = fallbackRef.current;

//     if (fallback) {
//       fallback.stop();
//     }
//   }, []);

//   const subscribe = useCallback((fn) => {
//     const manager = managerRef.current;

//     if (!manager) {
//       return () => {};
//     }

//     return manager.subscribe(fn);
//   }, []);

//   return {
//     play,
//     stop,
//     speakFallback,
//     stopFallback,
//     subscribe,
//     isPlaying,
//     currentGeneration,
//     fallbackAvailable:
//       !!fallbackRef.current?.isAvailable(),
//   };
// }

























/**
 * useAudio hook (v2)
 *
 * Now supports both:
 *   1. Single-shot audio playback (original behavior)
 *   2. Chunked sentence-level streaming (new)
 *
 * The chunked player is used when the backend sends TTS_AUDIO_CHUNK
 * messages. The single-shot player is the fallback for TTS_AUDIO.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AudioPlaybackManager, FallbackTTS } from '../utils/audio';
import { ChunkedAudioPlayer } from '../utils/audioStream';
import { ENABLE_FALLBACK_TTS } from '../utils/constants';

export function useAudio() {
  const managerRef = useRef(null);
  const chunkedRef = useRef(null);
  const fallbackRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentGeneration, setCurrentGeneration] = useState(null);
  const [streamingMode, setStreamingMode] = useState(false);

  /*
   * Create the managers once.
   *
   * Keeping these outside the effect ensures the instances are
   * available before any effect/subscriber tries to use them.
   */
  if (!managerRef.current) {
    managerRef.current = new AudioPlaybackManager();
  }

  if (!chunkedRef.current) {
    chunkedRef.current = new ChunkedAudioPlayer();
  }

  if (!fallbackRef.current && ENABLE_FALLBACK_TTS) {
    fallbackRef.current = new FallbackTTS();
  }

  /*
   * Subscribe to audio manager events.
   */
  useEffect(() => {
    const manager = managerRef.current;
    const chunked = chunkedRef.current;

    if (!manager || !chunked) {
      console.warn('[useAudio] Audio manager is unavailable');
      return undefined;
    }

    const unsubManager = manager.subscribe((event) => {
      if (event.type === 'play') {
        setIsPlaying(true);
        setCurrentGeneration(event.generation);
      } else if (
        event.type === 'ended' ||
        event.type === 'stopped' ||
        event.type === 'error' ||
        event.type === 'pause'
      ) {
        setIsPlaying(false);
        setCurrentGeneration(null);
      }
    });

    /*
     * Subscribe to chunked audio events.
     */
    const unsubChunked = chunked.subscribe((event) => {
      if (event.type === 'chunk_start') {
        setIsPlaying(true);
        setCurrentGeneration(event.generation);
        setStreamingMode(true);
      } else if (
        event.type === 'all_complete' ||
        event.type === 'stopped'
      ) {
        setIsPlaying(false);
        setCurrentGeneration(null);
        setStreamingMode(false);
      }
    });

    /*
     * IMPORTANT:
     * Do not destroy managers here.
     *
     * React StrictMode may execute effect cleanup/setup again
     * during development.
     */
    return () => {
      if (typeof unsubManager === 'function') {
        unsubManager();
      }

      if (typeof unsubChunked === 'function') {
        unsubChunked();
      }
    };
  }, []);

  /*
   * Destroy audio managers only when the component is actually
   * unmounted.
   */
  useEffect(() => {
    return () => {
      const manager = managerRef.current;

      if (manager) {
        try {
          manager.destroy();
        } catch (error) {
          console.error(
            '[useAudio] Failed to destroy audio manager:',
            error
          );
        }
      }

      managerRef.current = null;

      const chunked = chunkedRef.current;

      if (chunked) {
        try {
          chunked.destroy();
        } catch (error) {
          console.error(
            '[useAudio] Failed to destroy chunked audio player:',
            error
          );
        }
      }

      chunkedRef.current = null;

      const fallback = fallbackRef.current;

      if (fallback) {
        try {
          fallback.stop();
        } catch (error) {
          console.error(
            '[useAudio] Failed to stop fallback TTS:',
            error
          );
        }
      }

      fallbackRef.current = null;
    };
  }, []);

  /**
   * Play a single complete audio blob.
   *
   * This is the original playback behavior and is used for
   * normal TTS_AUDIO messages.
   */
  const play = useCallback(
    async ({
      base64,
      mimeType,
      generation,
      messageId,
      isStale,
    }) => {
      /*
       * Stop any active chunked playback first.
       */
      chunkedRef.current?.stop();
      setStreamingMode(false);

      const manager = managerRef.current;

      if (!manager) {
        console.warn(
          '[useAudio] play() called without audio manager'
        );
        return null;
      }

      return manager.play({
        base64,
        mimeType,
        generation,
        messageId,
        isStale,
      });
    },
    []
  );

  /**
   * Enqueue a TTS audio chunk for sentence-level streaming.
   */
  const enqueueChunk = useCallback(
    ({
      base64,
      mimeType,
      seq,
      generation,
      messageId,
      isLast,
    }) => {
      /*
       * Stop single-shot playback if active.
       */
      managerRef.current?.stop();

      const chunked = chunkedRef.current;

      if (!chunked) {
        console.warn(
          '[useAudio] enqueueChunk() called without chunked audio player'
        );
        return;
      }

      chunked.enqueue({
        base64,
        mimeType,
        seq,
        generation,
        messageId,
        isLast,
      });
    },
    []
  );

  /**
   * Reset chunked audio playback for a new generation.
   *
   * Used when an interruption occurs and the current audio
   * generation becomes stale.
   */
  const resetChunkedForGeneration = useCallback(
    (generation) => {
      chunkedRef.current?.resetForGeneration(generation);
      setStreamingMode(false);
    },
    []
  );

  /**
   * Stop ALL audio.
   *
   * Stops:
   *   - Single-shot audio
   *   - Chunked streaming audio
   */
  const stop = useCallback(() => {
    const managerLatency =
      managerRef.current?.stop() || 0;

    const chunkedLatency =
      chunkedRef.current?.stop() || 0;

    setStreamingMode(false);

    return Math.max(
      managerLatency,
      chunkedLatency
    );
  }, []);

  /**
   * Speak using fallback browser TTS.
   */
  const speakFallback = useCallback(async (text) => {
    const fallback = fallbackRef.current;

    if (!fallback) {
      throw new Error('Fallback TTS disabled');
    }

    return fallback.speak(text);
  }, []);

  /**
   * Stop fallback browser TTS.
   */
  const stopFallback = useCallback(() => {
    fallbackRef.current?.stop();
  }, []);

  /**
   * Subscribe to events from both:
   *   - AudioPlaybackManager
   *   - ChunkedAudioPlayer
   */
  const subscribe = useCallback((fn) => {
    const unsub1 =
      managerRef.current?.subscribe(fn) ||
      (() => {});

    const unsub2 =
      chunkedRef.current?.subscribe(fn) ||
      (() => {});

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  return {
    play,
    enqueueChunk,
    resetChunkedForGeneration,
    stop,
    speakFallback,
    stopFallback,
    subscribe,

    isPlaying,
    currentGeneration,
    streamingMode,

    fallbackAvailable:
      !!fallbackRef.current?.isAvailable(),
  };
}