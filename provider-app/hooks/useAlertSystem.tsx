import { useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { Audio } from 'expo-av';

// Standard high-priority alert pattern
const VIBRATION_PATTERN = [0, 500, 500, 500];

export function useAlertSystem() {
  const soundRef = useRef<Audio.Sound | null>(null);

  const startAlert = async () => {
    try {
      // 1. Continuous Vibration
      Vibration.vibrate(VIBRATION_PATTERN, true);

      // 2. Looping Alert Sound
      // Using a standard high-quality alert URL as a robust default
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
      await sound.playAsync();
    } catch (error) {
      console.error('[AlertSystem] Failed to start alert:', error);
    }
  };

  const stopAlert = async () => {
    try {
      // 1. Stop Vibration
      Vibration.cancel();

      // 2. Stop Sound
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (error) {
      console.error('[AlertSystem] Failed to stop alert:', error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Vibration.cancel();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  return { startAlert, stopAlert };
}
