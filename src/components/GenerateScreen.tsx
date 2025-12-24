import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles } from 'lucide-react';
import type { JobStatus } from '@/types/veosync';

interface GenerateScreenProps {
  status: JobStatus;
  onGenerate: () => void;
  onBack: () => void;
  assemblyProgress?: number;
}

const STATUS_MESSAGES: Record<JobStatus, string> = {
  queued: 'Preparing your vision...',
  running: 'Creating your masterpiece...',
  ready_for_assembly: 'Assembling final video...',
  assembling: 'Putting it all together...',
  done: 'Your video is ready!',
  error: 'Something went wrong',
};

const STATUS_DETAILS: Record<JobStatus, string> = {
  queued: 'Setting up the creative pipeline',
  running: 'Generating visuals and syncing audio',
  ready_for_assembly: 'Combining all elements',
  assembling: 'Final rendering in progress',
  done: 'Time to watch your creation',
  error: 'Please try again',
};

export function GenerateScreen({ status, onGenerate, onBack, assemblyProgress }: GenerateScreenProps) {
  const [pulse, setPulse] = useState(0);
  const isProcessing = status !== 'queued' && status !== 'done' && status !== 'error';
  const isReady = status === 'done';

  useEffect(() => {
    if (!isProcessing) return;
    
    const interval = setInterval(() => {
      setPulse((p) => (p + 1) % 100);
    }, 50);
    
    return () => clearInterval(interval);
  }, [isProcessing]);

  const getProgress = () => {
    if (status === 'queued') return 0;
    if (status === 'running') return 30 + (pulse % 30);
    if (status === 'ready_for_assembly' || status === 'assembling') {
      return assemblyProgress ?? 60 + (pulse % 35);
    }
    if (status === 'done') return 100;
    return 0;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg animate-fade-in text-center">
        {status === 'queued' && !isProcessing && (
          <>
            <button
              onClick={onBack}
              className="mb-6 font-body text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>

            <div className="mb-8">
              <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full gradient-bg glow-primary">
                <Sparkles className="h-16 w-16 text-primary animate-pulse" />
              </div>
              <h1 className="mb-2 font-display text-5xl tracking-wider text-foreground md:text-6xl">
                READY?
              </h1>
              <p className="text-muted-foreground">
                Let's turn your vision into reality
              </p>
            </div>

            <Button
              variant="hero"
              className="w-full pulse-glow"
              onClick={onGenerate}
            >
              MAKE IT HIT
            </Button>
          </>
        )}

        {isProcessing && (
          <>
            <div className="mb-8">
              <div className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full gradient-bg">
                <Loader2 className="h-16 w-16 text-primary animate-spin" />
              </div>
              <h1 className="mb-2 font-display text-4xl tracking-wider text-foreground md:text-5xl">
                {STATUS_MESSAGES[status]}
              </h1>
              <p className="text-muted-foreground">
                {STATUS_DETAILS[status]}
              </p>
            </div>

            <div className="mb-4">
              <Progress value={getProgress()} className="h-2" />
            </div>
            <p className="text-sm text-muted-foreground">
              {Math.round(getProgress())}% complete
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-8">
              <h1 className="mb-2 font-display text-4xl tracking-wider text-destructive md:text-5xl">
                OOPS!
              </h1>
              <p className="text-muted-foreground">
                Something went wrong. Let's try again.
              </p>
            </div>

            <Button
              variant="hero"
              className="w-full"
              onClick={onGenerate}
            >
              TRY AGAIN
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
