let audio: HTMLAudioElement | null = null;

export function playPasteChime() {
  if (typeof window === 'undefined') return;
  if (!audio) audio = new Audio('/sounds/paste-chime.wav');
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Browsers may block playback without a user gesture; ignore silently.
  });
}
