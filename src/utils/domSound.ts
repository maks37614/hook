// Web Audio API sound for price alerts.
import type { SiteNotificationSound } from './siteNotifications';
import { getCustomNotificationSound } from './customNotificationSound';

let activeUserSound: HTMLAudioElement | null = null;
let activeUserSoundUrl: string | null = null;

/** Stop an ongoing user melody immediately when notification consent is revoked. */
export function stopCustomNotificationSound(): void {
  if (activeUserSound) {
    activeUserSound.pause();
    activeUserSound.removeAttribute('src');
    activeUserSound = null;
  }
  if (activeUserSoundUrl) {
    URL.revokeObjectURL(activeUserSoundUrl);
    activeUserSoundUrl = null;
  }
}
async function playPersonalSound(uid: string, allowed?: () => boolean): Promise<void> {
  let startedAudio: HTMLAudioElement | null = null;
  try {
    const saved = await getCustomNotificationSound(uid);
    if (allowed && !allowed()) return;
    if (!saved) {
      // The selection can be synchronized with the profile, but files are
      // device-local. Use a quiet default instead of a broken player.
      playAlertChime();
      return;
    }
    stopCustomNotificationSound();
    const url = URL.createObjectURL(saved.blob);
    const audio = new Audio(url);
    startedAudio = audio;
    activeUserSound = audio;
    activeUserSoundUrl = url;
    audio.volume = 0.75;
    const cleanup = () => { if (activeUserSound === audio) stopCustomNotificationSound(); };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    await audio.play();
  } catch {
    // A superseded async preview must never stop a newer sound.
    if (startedAudio && activeUserSound === startedAudio) stopCustomNotificationSound();
  }
}

/** The bundled MP3 loads only when a permitted notification or preview plays. */
function playBundledAlert(allowed?: () => boolean): void {
  if (typeof Audio === 'undefined' || (allowed && !allowed())) return;
  stopCustomNotificationSound();
  try {
    const audio = new Audio('/sounds/alert_35.mp3');
    activeUserSound = audio;
    audio.volume = 0.75;
    const cleanup = () => {
      if (activeUserSound === audio) stopCustomNotificationSound();
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    void audio.play().catch(cleanup); // Autoplay may be blocked by the browser.
  } catch { /* Audio can be blocked by the browser. */ }
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (e) {
    console.warn('AudioContext not available:', e);
    return null;
  }
}


/**
 * Play a distinctive 3-tone notification chime when a price alert triggers
 */
export function playAlertChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;

    // Chord: G5 (784Hz) -> C6 (1046Hz) -> E6 (1318Hz)
    const tones = [
      { freq: 784, time: 0, dur: 0.15 },
      { freq: 1046, time: 0.08, dur: 0.18 },
      { freq: 1318, time: 0.16, dur: 0.35 },
    ];

    tones.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime + time);
      gain.gain.setValueAtTime(0.001, startTime + time);
      gain.gain.linearRampToValueAtTime(0.2, startTime + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + time + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime + time);
      osc.stop(startTime + time + dur + 0.01);
    });
  } catch (e) {
    console.warn('Failed to play alert chime:', e);
  }
}


/** Original, selectable sounds for on-site notifications. Call only after category and mute gates. */
export function playSiteNotificationSound(
  preset: SiteNotificationSound = 'chime',
  uid = '',
  allowed?: () => boolean,
): void {
  if (preset === 'custom') {
    void playPersonalSound(uid, allowed);
    return;
  }
  if (preset === 'alert35') {
    playBundledAlert(allowed);
    return;
  }
  stopCustomNotificationSound();
  if (preset === 'chime') {
    playAlertChime();
    return;
  }
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = preset === 'soft'
      ? [{ freq: 660, offset: 0, duration: 0.24, volume: 0.07 }]
      : [{ freq: 540, offset: 0, duration: 0.12, volume: 0.10 },
         { freq: 810, offset: 0.18, duration: 0.12, volume: 0.10 }];
    for (const note of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = preset === 'soft' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(note.freq, t + note.offset);
      gain.gain.setValueAtTime(0.0001, t + note.offset);
      gain.gain.linearRampToValueAtTime(note.volume, t + note.offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.offset + note.duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(t + note.offset);
      oscillator.stop(t + note.offset + note.duration + 0.01);
    }
  } catch { /* Browser or autoplay policy may prohibit sound. */ }
}
