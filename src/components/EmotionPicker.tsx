import { Button } from '@/components/ui/button';
import { EMOTIONS } from '@/lib/emotions';
import type { Emotion } from '@/types/veosync';

interface EmotionPickerProps {
  selectedEmotion: Emotion | null;
  onSelect: (emotion: Emotion) => void;
  onContinue: () => void;
}

export function EmotionPicker({ selectedEmotion, onSelect, onContinue }: EmotionPickerProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg animate-fade-in">
        <h1 className="mb-2 text-center font-display text-5xl tracking-wider text-foreground md:text-6xl">
          HOW DO YOU FEEL?
        </h1>
        <p className="mb-10 text-center text-muted-foreground">
          Choose the vibe for your video
        </p>

        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {EMOTIONS.map((emotion, index) => (
            <Button
              key={emotion.id}
              variant="emotion"
              size="tile"
              onClick={() => onSelect(emotion.id)}
              className={`animate-slide-up ${
                selectedEmotion === emotion.id
                  ? 'border-primary glow-primary'
                  : ''
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <span className="text-3xl">{emotion.icon}</span>
              <span className="font-display text-xl tracking-wider">
                {emotion.label}
              </span>
              <span className="font-body text-xs text-muted-foreground">
                {emotion.description}
              </span>
            </Button>
          ))}
        </div>

        <Button
          variant="hero"
          className="w-full"
          disabled={!selectedEmotion}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
