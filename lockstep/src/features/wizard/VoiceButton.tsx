/** Voice input via the Web Speech API. Hidden entirely where the browser doesn't support it. */
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const Ctor = getCtor();
  useEffect(() => () => recRef.current?.stop(), []);
  if (!Ctor) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <IconButton
      label={listening ? 'Stop dictation' : 'Dictate your goal'}
      onClick={toggle}
      className={cn(listening && 'text-danger')}
      aria-pressed={listening}
    >
      {listening ? (
        <MicOff className="size-5" strokeWidth={1.5} />
      ) : (
        <Mic className="size-5" strokeWidth={1.5} />
      )}
    </IconButton>
  );
}
