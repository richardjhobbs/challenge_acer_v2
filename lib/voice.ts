export interface SpeechStatus {
  available: boolean;
  hasVoices: boolean;
}

const femaleHints = ['female', 'woman', 'zira', 'susan', 'kate', 'hazel', 'serena', 'amy', 'emma', 'olivia', 'sophie', 'victoria'];

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const score = (voice: SpeechSynthesisVoice) => {
    const name = (voice.name || '').toLowerCase();
    let s = 0;
    if ((voice.lang || '').toLowerCase().startsWith('en-gb')) s += 50;
    if (femaleHints.some((hint) => name.includes(hint))) s += 25;
    if (voice.default) s += 5;
    return s;
  };
  const enGb = voices.filter((voice) => (voice.lang || '').toLowerCase().startsWith('en-gb'));
  const pool = enGb.length ? enGb : voices.filter((voice) => (voice.lang || '').toLowerCase().startsWith('en'));
  if (!pool.length) return null;
  return pool.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function speakText(
  text: string,
  voice: SpeechSynthesisVoice | null,
  options: { interrupt?: boolean } = {}
) {
  if (!isSpeechSupported()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'en-GB';
  }
  utterance.rate = 1.02;
  utterance.pitch = 1.05;
  if (options.interrupt) {
    window.speechSynthesis.cancel();
  }
  window.speechSynthesis.speak(utterance);
}

export function getSpeechStatus(): SpeechStatus {
  if (!isSpeechSupported()) return { available: false, hasVoices: false };
  const voices = window.speechSynthesis.getVoices();
  return { available: true, hasVoices: voices.length > 0 };
}
