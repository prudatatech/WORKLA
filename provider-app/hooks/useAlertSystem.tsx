import { useEffect, useRef, useCallback } from 'react';
import { Vibration, Platform } from 'react-native';
import { Audio } from 'expo-av';

// Repeat-safe vibration pattern: [wait, vibrate, pause, vibrate, ...]
const VIBRATION_PATTERN = [0, 700, 300, 700, 300, 700];

export function useAlertSystem() {
  const soundRef   = useRef<Audio.Sound | null>(null);
  const activeRef  = useRef(false);
  const vibTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAlert = useCallback(async () => {
    activeRef.current = false;

    // 1. Stop vibration
    Vibration.cancel();
    if (vibTimerRef.current) {
      clearInterval(vibTimerRef.current);
      vibTimerRef.current = null;
    }

    // 2. Stop and unload sound
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (error) {
      console.warn('[AlertSystem] Stop error (safe to ignore):', error);
    }
  }, []);

  const startAlert = useCallback(async () => {
    // Prevent double-start
    if (activeRef.current) return;
    activeRef.current = true;

    console.log('[AlertSystem] 🔔 Starting alert (vibration + sound)');

    // ── 1. Vibration ──────────────────────────────────────────────
    // Android: repeat=true loops the pattern indefinitely
    // iOS: does NOT support repeat, so we manually re-trigger via setInterval
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate(VIBRATION_PATTERN, true /* repeat */);
      } else {
        // iOS: fire once immediately, then repeat every ~3 seconds
        Vibration.vibrate(VIBRATION_PATTERN);
        vibTimerRef.current = setInterval(() => {
          if (!activeRef.current) {
            clearInterval(vibTimerRef.current!);
            return;
          }
          Vibration.vibrate(VIBRATION_PATTERN);
        }, 3000);
      }
    } catch (vibError) {
      console.warn('[AlertSystem] Vibration error:', vibError);
    }

    // ── 2. Alert Sound ────────────────────────────────────────────
    try {
      // Set audio mode to play through speaker even when silent mode is on
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,   // CRITICAL: plays sound even on iOS silent mode
        staysActiveInBackground: true, // CRITICAL: allows sound if app is backgrounded
        shouldDuckAndroid: false,
      });

      // Unload any leftover sound first
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
      console.log('[AlertSystem] 🔊 Alert sound playing');
    } catch (audioError) {
      // Audio failure is non-fatal — vibration still works
      console.warn('[AlertSystem] Audio error (vibration still active):', audioError);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      Vibration.cancel();
      if (vibTimerRef.current) clearInterval(vibTimerRef.current);
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  return { startAlert, stopAlert };
}
