/**
 * Artificial Opposition (AO) - Mobile App
 * A sarcastic AI companion with text input & voice responses
 */

import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  Animated,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import * as Speech from 'expo-speech';
import AOLogo from './AOLogo';

// Web Speech Recognition types
let SpeechRecognition: any = null;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
}

// Witty responses for different types of questions
// Import responses from external file to keep App.tsx clean
import {wittyResponses} from './responses';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [submittedText, setSubmittedText] = useState('');
  const [response, setResponse] = useState('');
  const [buttonScale] = useState(new Animated.Value(1));
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  // Plasma animation values
  const plasmaRing1 = useRef(new Animated.Value(0)).current;
  const plasmaRing2 = useRef(new Animated.Value(0)).current;
  const plasmaRing3 = useRef(new Animated.Value(0)).current;
  const plasmaGlow = useRef(new Animated.Value(0)).current;
  const plasmaAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Blob morphing: animate each corner's border-radius independently
  const blobTL = useRef(new Animated.Value(90)).current;
  const blobTR = useRef(new Animated.Value(90)).current;
  const blobBL = useRef(new Animated.Value(90)).current;
  const blobBR = useRef(new Animated.Value(90)).current;
  const blobAnimRef = useRef<number | null>(null); // RAF id for blob animation
  // Animated entrance/exit for responding rings
  const ringEnter = useRef(new Animated.Value(0)).current; // 0=hidden, 1=fully visible
  const ringEnterAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const isListeningRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const recognitionRef = useRef<any>(null);
  const aoButtonRef = useRef<View>(null);
  const speechUnlockedRef = useRef(false);

  const lastTranscriptRef = useRef('');
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep handler refs up to date to avoid stale closures in DOM listeners
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => {});
  const pendingSubmitRef = useRef(false);
  const submitQuestionRef = useRef<(text: string) => void>(() => {});

  // Track used responses per category to avoid repeats
  const usedResponsesRef = useRef<Map<string, Set<number>>>(new Map());

  // Initialize speech recognition
  useEffect(() => {
    if (Platform.OS === 'web' && SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        const best = finalTranscript || interimTranscript;
        lastTranscriptRef.current = best;
      };

      recognition.onerror = (event: any) => {
        console.log('Speech recognition error:', event.error);
      };

      recognition.onend = () => {
        // Recognition stopped (either manually or auto-ended with continuous:false).
        // stopListening handles submission on button release.
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const unlockSpeech = useCallback(() => {
    if (Platform.OS === 'web' && !speechUnlockedRef.current) {
      // Speak empty utterance to unlock Safari's speech synthesis
      const empty = new SpeechSynthesisUtterance('');
      empty.volume = 0;
      window.speechSynthesis.speak(empty);
      speechUnlockedRef.current = true;
    }
  }, []);

  const speakResponse = useCallback((text: string) => {
    try {
      if (Platform.OS === 'web') {
        // Cancel any ongoing speech first
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        // Try to pick a natural-sounding voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Samantha') ||
              v.name.includes('Google') ||
              v.name.includes('Natural') ||
              v.name.includes('Enhanced') ||
              v.name.includes('Premium') ||
              v.name.includes('Daniel') ||
              v.name.includes('Karen') ||
              v.name.includes('Moira')),
        );
        if (preferred) {
          utterance.voice = preferred;
        }
        setIsResponding(true);
        utterance.onend = () => setIsResponding(false);
        utterance.onerror = () => setIsResponding(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsResponding(true);
        Speech.speak(text, {
          language: 'en-US',
          rate: 1.0,
          pitch: 1.0,
          onDone: () => setIsResponding(false),
          onError: () => setIsResponding(false),
        });
      }
    } catch (e) {
      console.log('TTS error:', e);
      setIsResponding(false);
    }
  }, []);

  const animateButton = useCallback(
    (toValue: number) => {
      Animated.spring(buttonScale, {
        toValue,
        tension: 100,
        friction: 8,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    },
    [buttonScale],
  );

  const generateWittyResponse = useCallback(
    (text: string) => {
      const lowerText = text.toLowerCase();
      let responseCategory = 'default';

      // Check if speech was unclear/empty
      if (lowerText === '__unclear__') {
        responseCategory = 'unclear';
      } else if (
        lowerText.includes('weather') ||
        lowerText.includes('temperature') ||
        lowerText.includes('rain') ||
        lowerText.includes('sunny') ||
        lowerText.includes('snow') ||
        lowerText.includes('wind') ||
        lowerText.includes('cloud') ||
        lowerText.includes('forecast') ||
        lowerText.includes('cold') ||
        lowerText.includes('hot outside')
      ) {
        responseCategory = 'weather';
      } else if (
        lowerText.includes('time') ||
        lowerText.includes('clock') ||
        lowerText.includes('hour') ||
        lowerText.includes('late') ||
        lowerText.includes('early') ||
        lowerText.includes('schedule')
      ) {
        responseCategory = 'time';
      } else if (
        lowerText.includes('hello') ||
        lowerText.includes('hi') ||
        lowerText.includes('hey') ||
        lowerText.includes('sup') ||
        lowerText.includes('good morning') ||
        lowerText.includes('good evening') ||
        lowerText.includes('good afternoon') ||
        lowerText.includes('howdy') ||
        lowerText.includes('what\'s up') ||
        lowerText.includes('yo')
      ) {
        responseCategory = 'greeting';
      } else if (
        lowerText.includes('eat') ||
        lowerText.includes('food') ||
        lowerText.includes('hungry') ||
        lowerText.includes('dinner') ||
        lowerText.includes('lunch') ||
        lowerText.includes('breakfast') ||
        lowerText.includes('cook') ||
        lowerText.includes('recipe') ||
        lowerText.includes('restaurant') ||
        lowerText.includes('pizza') ||
        lowerText.includes('snack')
      ) {
        responseCategory = 'food';
      } else if (
        lowerText.includes('meaning') ||
        lowerText.includes('life') ||
        lowerText.includes('purpose') ||
        lowerText.includes('exist') ||
        lowerText.includes('universe') ||
        lowerText.includes('philosophy') ||
        lowerText.includes('consciousness')
      ) {
        responseCategory = 'meaning';
      } else if (
        lowerText.includes('love') ||
        lowerText.includes('date') ||
        lowerText.includes('relationship') ||
        lowerText.includes('crush') ||
        lowerText.includes('boyfriend') ||
        lowerText.includes('girlfriend') ||
        lowerText.includes('marriage') ||
        lowerText.includes('romantic') ||
        lowerText.includes('valentine')
      ) {
        responseCategory = 'love';
      } else if (
        lowerText.includes('phone') ||
        lowerText.includes('computer') ||
        lowerText.includes('internet') ||
        lowerText.includes('app') ||
        lowerText.includes('wifi') ||
        lowerText.includes('tech') ||
        lowerText.includes('robot') ||
        lowerText.includes('ai') ||
        lowerText.includes('code') ||
        lowerText.includes('programming') ||
        lowerText.includes('software') ||
        lowerText.includes('hack')
      ) {
        responseCategory = 'technology';
      } else if (
        lowerText.includes('work') ||
        lowerText.includes('job') ||
        lowerText.includes('boss') ||
        lowerText.includes('office') ||
        lowerText.includes('meeting') ||
        lowerText.includes('career') ||
        lowerText.includes('coworker') ||
        lowerText.includes('fired') ||
        lowerText.includes('promotion') ||
        lowerText.includes('resume')
      ) {
        responseCategory = 'work';
      } else if (
        lowerText.includes('money') ||
        lowerText.includes('rich') ||
        lowerText.includes('broke') ||
        lowerText.includes('salary') ||
        lowerText.includes('invest') ||
        lowerText.includes('crypto') ||
        lowerText.includes('stock') ||
        lowerText.includes('bank') ||
        lowerText.includes('debt') ||
        lowerText.includes('budget') ||
        lowerText.includes('expensive')
      ) {
        responseCategory = 'money';
      } else if (
        lowerText.includes('sick') ||
        lowerText.includes('health') ||
        lowerText.includes('doctor') ||
        lowerText.includes('exercise') ||
        lowerText.includes('gym') ||
        lowerText.includes('diet') ||
        lowerText.includes('weight') ||
        lowerText.includes('headache') ||
        lowerText.includes('tired') ||
        lowerText.includes('fit')
      ) {
        responseCategory = 'health';
      } else if (
        lowerText.includes('sport') ||
        lowerText.includes('football') ||
        lowerText.includes('basketball') ||
        lowerText.includes('soccer') ||
        lowerText.includes('baseball') ||
        lowerText.includes('game') ||
        lowerText.includes('team') ||
        lowerText.includes('score') ||
        lowerText.includes('player') ||
        lowerText.includes('championship')
      ) {
        responseCategory = 'sports';
      } else if (
        lowerText.includes('music') ||
        lowerText.includes('song') ||
        lowerText.includes('sing') ||
        lowerText.includes('band') ||
        lowerText.includes('concert') ||
        lowerText.includes('playlist') ||
        lowerText.includes('album') ||
        lowerText.includes('rapper') ||
        lowerText.includes('genre')
      ) {
        responseCategory = 'music';
      } else if (
        lowerText.includes('movie') ||
        lowerText.includes('film') ||
        lowerText.includes('show') ||
        lowerText.includes('netflix') ||
        lowerText.includes('watch') ||
        lowerText.includes('actor') ||
        lowerText.includes('series') ||
        lowerText.includes('tv') ||
        lowerText.includes('cinema')
      ) {
        responseCategory = 'movies';
      } else if (
        lowerText.includes('school') ||
        lowerText.includes('homework') ||
        lowerText.includes('class') ||
        lowerText.includes('teacher') ||
        lowerText.includes('study') ||
        lowerText.includes('exam') ||
        lowerText.includes('college') ||
        lowerText.includes('university') ||
        lowerText.includes('math') ||
        lowerText.includes('grade')
      ) {
        responseCategory = 'school';
      } else if (
        lowerText.includes('sleep') ||
        lowerText.includes('nap') ||
        lowerText.includes('bed') ||
        lowerText.includes('dream') ||
        lowerText.includes('insomnia') ||
        lowerText.includes('awake') ||
        lowerText.includes('rest')
      ) {
        responseCategory = 'sleep';
      } else if (
        lowerText.includes('who are you') ||
        lowerText.includes('your name') ||
        lowerText.includes('what are you') ||
        lowerText.includes('about you') ||
        lowerText.includes('tell me about yourself')
      ) {
        responseCategory = 'identity';
      } else if (
        lowerText.includes('thank') ||
        lowerText.includes('appreciate') ||
        lowerText.includes('grateful') ||
        lowerText.includes('nice') ||
        lowerText.includes('awesome') ||
        lowerText.includes('great job') ||
        lowerText.includes('good job')
      ) {
        responseCategory = 'compliments';
      } else if (
        lowerText.includes('stupid') ||
        lowerText.includes('dumb') ||
        lowerText.includes('idiot') ||
        lowerText.includes('hate') ||
        lowerText.includes('suck') ||
        lowerText.includes('worst') ||
        lowerText.includes('useless') ||
        lowerText.includes('terrible')
      ) {
        responseCategory = 'insults';
      } else if (
        lowerText.includes('animal') ||
        lowerText.includes('dog') ||
        lowerText.includes('cat') ||
        lowerText.includes('pet') ||
        lowerText.includes('fish') ||
        lowerText.includes('bird') ||
        lowerText.includes('horse')
      ) {
        responseCategory = 'animals';
      } else if (
        lowerText.includes('travel') ||
        lowerText.includes('vacation') ||
        lowerText.includes('trip') ||
        lowerText.includes('flight') ||
        lowerText.includes('country') ||
        lowerText.includes('beach') ||
        lowerText.includes('hotel')
      ) {
        responseCategory = 'travel';
      } else if (
        lowerText.includes('age') ||
        lowerText.includes('old') ||
        lowerText.includes('young') ||
        lowerText.includes('birthday') ||
        lowerText.includes('born')
      ) {
        responseCategory = 'age';
      } else if (
        lowerText.includes('advice') ||
        lowerText.includes('should i') ||
        lowerText.includes('what do i do') ||
        lowerText.includes('help me') ||
        lowerText.includes('suggest') ||
        lowerText.includes('recommend')
      ) {
        responseCategory = 'advice';
      } else if (
        lowerText.includes('bored') ||
        lowerText.includes('boring') ||
        lowerText.includes('nothing to do') ||
        lowerText.includes('entertain')
      ) {
        responseCategory = 'bored';
      } else if (
        lowerText.includes('wear') ||
        lowerText.includes('outfit') ||
        lowerText.includes('clothes') ||
        lowerText.includes('fashion') ||
        lowerText.includes('dress') ||
        lowerText.includes('style') ||
        lowerText.includes('shoes')
      ) {
        responseCategory = 'fashion';
      } else if (
        lowerText.includes('friend') ||
        lowerText.includes('social') ||
        lowerText.includes('party') ||
        lowerText.includes('instagram') ||
        lowerText.includes('tiktok') ||
        lowerText.includes('follower') ||
        lowerText.includes('viral') ||
        lowerText.includes('post')
      ) {
        responseCategory = 'social';
      } else if (
        lowerText.includes('why') &&
        responseCategory === 'default'
      ) {
        responseCategory = 'why';
      }

      // For default, also mix in the random category for more variety
      let pool = wittyResponses[responseCategory];
      if (responseCategory === 'default' && wittyResponses.random) {
        pool = [...pool, ...wittyResponses.random];
      }

      // Avoid repeating responses until all have been used
      const catKey = responseCategory;
      if (!usedResponsesRef.current.has(catKey)) {
        usedResponsesRef.current.set(catKey, new Set());
      }
      const usedSet = usedResponsesRef.current.get(catKey)!;
      // Reset if all responses have been used
      if (usedSet.size >= pool.length) {
        usedSet.clear();
      }
      // Pick a random unused response
      let idx: number;
      do {
        idx = Math.floor(Math.random() * pool.length);
      } while (usedSet.has(idx));
      usedSet.add(idx);
      const randomResponse = pool[idx];

      setResponse(randomResponse);
      speakResponse(randomResponse);
    },
    [speakResponse],
  );

  const submitQuestion = useCallback(
    (text: string) => {
      // If empty or very short (unclear speech), use the 'unclear' category
      if (!text || text.length < 2) {
        setSubmittedText('');
        setInputText('');
        setIsThinking(true);
        setResponse('');
        animateButton(0.9);
        setTimeout(() => {
          setIsThinking(false);
          animateButton(1);
          generateWittyResponse('__unclear__');
        }, 800);
        return;
      }
      setSubmittedText(text);
      setInputText('');
      setIsThinking(true);
      setResponse('');
      inputRef.current?.blur();

      animateButton(0.9);

      setTimeout(() => {
        setIsThinking(false);
        animateButton(1);
        generateWittyResponse(text);
      }, 800);
    },
    [animateButton, generateWittyResponse],
  );

  const handleSubmit = () => {
    submitQuestion(inputText.trim());
  };

  const startListening = () => {
    // Unlock speech on user gesture so TTS works later
    unlockSpeech();
    if (!recognitionRef.current) {
      inputRef.current?.focus();
      return;
    }
    setInputText('');
    setResponse('');
    lastTranscriptRef.current = '';
    setIsListening(true);
    isListeningRef.current = true;
    animateButton(0.9);
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.log('Recognition start error:', e);
      setIsListening(false);
      isListeningRef.current = false;
    }
    // Safety: auto-stop after 8 seconds if touchend was missed
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        stopListeningRef.current();
      }
    }, 8000);
  };

  const stopListening = () => {
    // Clear safety timer
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (!recognitionRef.current) {
      return;
    }
    // Only process if we were actually listening
    if (!isListeningRef.current) {
      return;
    }
    setIsListening(false);
    isListeningRef.current = false;
    animateButton(1);

    // Stop recognition (may already be stopped if continuous:false auto-ended)
    try {
      recognitionRef.current.stop();
    } catch (e) {
      // Already stopped, that's fine
    }

    // Submit whatever we captured, or empty for 'unclear' response
    const captured = lastTranscriptRef.current.trim();
    setTimeout(() => {
      submitQuestionRef.current(captured);
    }, 150);
  };

  // Keep refs current
  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;
  submitQuestionRef.current = submitQuestion;

  // Native button handlers (no voice recognition in Expo Go)
  const handleNativeButtonPress = useCallback(() => {
    // On native, tap = submit whatever is in the text input
    const text = inputText.trim();
    submitQuestion(text);
  }, [inputText, submitQuestion]);

  // Attach native DOM touch events for reliable hold-to-talk on mobile Safari
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = aoButtonRef.current as any;
    if (!el) return;

    const onTouchStart = (e: Event) => {
      e.preventDefault();
      startListeningRef.current();
    };
    const onTouchEnd = () => {
      stopListeningRef.current();
    };
    const onMouseDown = (e: Event) => {
      e.preventDefault();
      startListeningRef.current();
    };
    const onMouseUp = () => {
      stopListeningRef.current();
    };

    // Start on button only
    el.addEventListener('touchstart', onTouchStart, {passive: false});
    el.addEventListener('mousedown', onMouseDown);

    // End on document so release is always caught, even if finger drifts
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Start/stop plasma rings when listening
  useEffect(() => {
    if (isListening) {
      plasmaRing1.setValue(0);
      plasmaRing2.setValue(0);
      plasmaRing3.setValue(0);
      plasmaGlow.setValue(0);

      const plasmaLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(plasmaRing1, { toValue: 1, duration: 1200, useNativeDriver: false }),
            Animated.timing(plasmaRing1, { toValue: 0, duration: 1200, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(plasmaRing2, { toValue: 1, duration: 1400, useNativeDriver: false }),
            Animated.timing(plasmaRing2, { toValue: 0, duration: 1400, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.delay(800),
            Animated.timing(plasmaRing3, { toValue: 1, duration: 1600, useNativeDriver: false }),
            Animated.timing(plasmaRing3, { toValue: 0, duration: 1600, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(plasmaGlow, { toValue: 1, duration: 800, useNativeDriver: false }),
            Animated.timing(plasmaGlow, { toValue: 0.3, duration: 800, useNativeDriver: false }),
          ]),
        ]),
      );
      plasmaAnimRef.current = plasmaLoop;
      plasmaLoop.start();
    } else {
      if (plasmaAnimRef.current) {
        plasmaAnimRef.current.stop();
        plasmaAnimRef.current = null;
      }
      plasmaRing1.setValue(0);
      plasmaRing2.setValue(0);
      plasmaRing3.setValue(0);
      plasmaGlow.setValue(0);
    }
  }, [isListening]);

  // Start/stop blob morphing when responding (voice-wave correlated via sine waves)
  useEffect(() => {
    if (isResponding) {
      // Animate rings growing out from behind the button
      if (ringEnterAnimRef.current) ringEnterAnimRef.current.stop();
      const enterAnim = Animated.timing(ringEnter, {
        toValue: 1,
        duration: 500,
        useNativeDriver: false,
      });
      ringEnterAnimRef.current = enterAnim;
      enterAnim.start();

      const startTime = Date.now();
      const animate = () => {
        const t = (Date.now() - startTime) / 1000;
        const tl = 90 + 18 * Math.sin(t * 3.7) + 10 * Math.sin(t * 7.1) + 5 * Math.sin(t * 1.3);
        const tr = 90 + 15 * Math.sin(t * 4.3 + 1.2) + 12 * Math.sin(t * 6.5 + 0.8) + 6 * Math.sin(t * 1.7 + 2.0);
        const bl = 90 + 20 * Math.sin(t * 3.1 + 2.5) + 8 * Math.sin(t * 8.3 + 1.5) + 7 * Math.sin(t * 1.1 + 0.5);
        const br = 90 + 14 * Math.sin(t * 5.0 + 0.7) + 11 * Math.sin(t * 6.9 + 2.2) + 4 * Math.sin(t * 2.1 + 1.0);
        blobTL.setValue(Math.max(55, Math.min(110, tl)));
        blobTR.setValue(Math.max(55, Math.min(110, tr)));
        blobBL.setValue(Math.max(55, Math.min(110, bl)));
        blobBR.setValue(Math.max(55, Math.min(110, br)));
        blobAnimRef.current = requestAnimationFrame(animate);
      };
      blobAnimRef.current = requestAnimationFrame(animate);
    } else {
      // Stop blob RAF
      if (blobAnimRef.current) {
        cancelAnimationFrame(blobAnimRef.current);
        blobAnimRef.current = null;
      }
      // Animate rings shrinking back behind the button
      if (ringEnterAnimRef.current) ringEnterAnimRef.current.stop();
      const exitAnim = Animated.timing(ringEnter, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      });
      ringEnterAnimRef.current = exitAnim;
      exitAnim.start(() => {
        // Reset blob radii after rings have faded
        blobTL.setValue(90);
        blobTR.setValue(90);
        blobBL.setValue(90);
        blobBR.setValue(90);
      });
    }
    return () => {
      if (blobAnimRef.current) {
        cancelAnimationFrame(blobAnimRef.current);
      }
    };
  }, [isResponding]);

  // Interpolated plasma styles (listening only)
  const ring1Style = {
    transform: [{scale: plasmaRing1.interpolate({inputRange: [0, 1], outputRange: [1, 1.6]})}],
    opacity: plasmaRing1.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.6, 0.3, 0]}),
  };
  const ring2Style = {
    transform: [{scale: plasmaRing2.interpolate({inputRange: [0, 1], outputRange: [1, 1.9]})}],
    opacity: plasmaRing2.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.5, 0.25, 0]}),
  };
  const ring3Style = {
    transform: [{scale: plasmaRing3.interpolate({inputRange: [0, 1], outputRange: [1, 2.2]})}],
    opacity: plasmaRing3.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.4, 0.2, 0]}),
  };
  const glowStyle = {
    shadowOpacity: plasmaGlow.interpolate({inputRange: [0, 1], outputRange: [0.4, 1]}),
    shadowRadius: plasmaGlow.interpolate({inputRange: [0, 1], outputRange: [16, 40]}),
  };
  // Blob border-radius for the main button (responding only)
  const isAnimating = isListening || isResponding;
  const blobButtonStyle = isResponding ? {
    borderTopLeftRadius: blobTL,
    borderTopRightRadius: blobTR,
    borderBottomLeftRadius: blobBL,
    borderBottomRightRadius: blobBR,
  } : {};
  const blobOuterStyle = isResponding ? {
    borderTopLeftRadius: blobTL,
    borderTopRightRadius: blobTR,
    borderBottomLeftRadius: blobBL,
    borderBottomRightRadius: blobBR,
  } : {};
  // Blob ring styles — always rendered, animated via ringEnter (0→1)
  const blobRing1Style = {
    borderTopLeftRadius: blobTR,
    borderTopRightRadius: blobBL,
    borderBottomLeftRadius: blobBR,
    borderBottomRightRadius: blobTL,
    opacity: ringEnter.interpolate({inputRange: [0, 1], outputRange: [0, 0.35]}),
    transform: [{scale: ringEnter.interpolate({inputRange: [0, 1], outputRange: [1, 1.5]})}],
  };
  const blobRing2Style = {
    borderTopLeftRadius: blobBR,
    borderTopRightRadius: blobTL,
    borderBottomLeftRadius: blobTR,
    borderBottomRightRadius: blobBL,
    opacity: ringEnter.interpolate({inputRange: [0, 1], outputRange: [0, 0.2]}),
    transform: [{scale: ringEnter.interpolate({inputRange: [0, 1], outputRange: [1, 1.8]})}],
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.buttonArea}>
        {/* Response text display */}
        {(submittedText || response) ? (
          <View style={styles.responseArea}>
            {submittedText ? (
              <Text style={styles.questionText}>"{submittedText}"</Text>
            ) : null}
            {isThinking ? (
              <Text style={styles.thinkingText}>Thinking...</Text>
            ) : response ? (
              <ScrollView style={styles.responseScroll} contentContainerStyle={styles.responseScrollContent}>
                <Text style={styles.responseText}>{response}</Text>
              </ScrollView>
            ) : null}
          </View>
        ) : (
          <View style={styles.responseArea}>
            <Text style={styles.hintText}>
              {Platform.OS === 'web'
                ? 'Hold the button to ask, or type below'
                : 'Tap the button to ask, or type below'}
            </Text>
          </View>
        )}

        {Platform.OS === 'web' ? (
          /* Web: DOM touch events for hold-to-talk */
          <View ref={aoButtonRef} style={styles.buttonTouchArea}>
            <Animated.View
              style={[
                styles.buttonContainer,
                {transform: [{scale: buttonScale}]},
              ]}>
              {/* Plasma rings (listening) */}
              {isListening && (
                <>
                  <Animated.View style={[styles.plasmaRing, styles.plasmaRing1, ring1Style]} />
                  <Animated.View style={[styles.plasmaRing, styles.plasmaRing2, ring2Style]} />
                  <Animated.View style={[styles.plasmaRing, styles.plasmaRing3, ring3Style]} />
                </>
              )}
              {/* Blob rings (responding) — always rendered, animated in/out */}
              <Animated.View style={[styles.plasmaRing, styles.plasmaRing1, blobRing1Style]} />
              <Animated.View style={[styles.plasmaRing, styles.plasmaRing2, blobRing2Style]} />
              <Animated.View
                style={[
                  styles.aoButtonOuter,
                  isAnimating && glowStyle,
                  blobOuterStyle,
                ]}>
                <Animated.View
                  style={[
                    styles.aoButton,
                    isThinking && styles.aoButtonActive,
                    isListening && styles.aoButtonListening,
                    isResponding && styles.aoButtonResponding,
                    blobButtonStyle,
                  ]}>
                  <AOLogo size={110} />
                  <Text style={styles.buttonSubtext}>
                    {isThinking
                      ? 'Thinking...'
                      : isListening
                        ? 'Listening...'
                        : isResponding
                          ? 'Speaking...'
                          : 'Hold to Ask'}
                  </Text>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </View>
        ) : (
          /* Native: Pressable tap to submit */
          <Pressable
            onPress={handleNativeButtonPress}
            style={styles.buttonTouchArea}>
            <Animated.View
              style={[
                styles.buttonContainer,
                {transform: [{scale: buttonScale}]},
              ]}>
              {/* Blob rings (responding) — always rendered, animated in/out */}
              <Animated.View style={[styles.plasmaRing, styles.plasmaRing1, blobRing1Style]} />
              <Animated.View style={[styles.plasmaRing, styles.plasmaRing2, blobRing2Style]} />
              <Animated.View
                style={[
                  styles.aoButtonOuter,
                  isResponding && {
                    shadowOpacity: 0.8,
                    shadowRadius: 30,
                  },
                  blobOuterStyle,
                ]}>
                <Animated.View
                  style={[
                    styles.aoButton,
                    isThinking && styles.aoButtonActive,
                    isResponding && styles.aoButtonResponding,
                    blobButtonStyle,
                  ]}>
                  <AOLogo size={110} />
                  <Text style={styles.buttonSubtext}>
                    {isThinking
                      ? 'Thinking...'
                      : isResponding
                        ? 'Speaking...'
                        : 'Tap to Ask'}
                  </Text>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </Pressable>
        )}
      </View>

      <View style={styles.bottomInputContainer}>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          placeholder={isListening ? 'Listening...' : 'Type a question...'}
          placeholderTextColor="#666"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          autoCorrect={false}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  buttonArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  responseArea: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 20,
    marginBottom: 20,
    minHeight: 60,
    alignItems: 'center',
  },
  questionText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  thinkingText: {
    color: '#ff6600',
    fontSize: 16,
    textAlign: 'center',
  },
  responseScroll: {
    maxHeight: 120,
  },
  responseScrollContent: {
    alignItems: 'center',
  },
  responseText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  hintText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonTouchArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Plasma rings: absolute-positioned circles behind the button
  plasmaRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
  },
  plasmaRing1: {
    borderColor: '#ff4444',
  },
  plasmaRing2: {
    borderColor: '#ff6600',
  },
  plasmaRing3: {
    borderColor: '#ff2200',
  },
  aoButtonOuter: {
    shadowColor: '#ff4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    borderRadius: 90,
  },
  aoButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aoButtonActive: {
    backgroundColor: '#cc0000',
  },
  aoButtonListening: {
    backgroundColor: '#ff6600',
  },
  aoButtonResponding: {
    backgroundColor: '#ff4444',
  },
  aoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  buttonSubtext: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  bottomInputContainer: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    maxWidth: 400,
    alignSelf: 'center',
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
});
