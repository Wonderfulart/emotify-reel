import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Share2, RefreshCw, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';

interface ResultScreenProps {
  videoUrl: string;
  onMakeAnother: () => void;
  onRegenerate: (style: string) => void;
}

const STYLE_CHIPS = [
  { id: 'raw', label: 'More raw' },
  { id: 'cinematic', label: 'More cinematic' },
  { id: 'intense', label: 'More intense' },
];

export function ResultScreen({ videoUrl, onMakeAnother, onRegenerate }: ResultScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  }, [videoUrl]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'veosync-video.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started!');
    } catch {
      toast.error('Failed to download video');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My VeoSync Video',
          text: 'Check out my music video!',
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg animate-fade-in">
        <h1 className="mb-6 text-center font-display text-4xl tracking-wider text-foreground md:text-5xl gradient-text">
          IT HITS.
        </h1>

        {/* Video Player */}
        <div className="relative mb-6 overflow-hidden rounded-2xl bg-muted aspect-[9/16]">
          <video
            ref={videoRef}
            src={videoUrl}
            className="h-full w-full object-cover"
            loop
            playsInline
            autoPlay
            muted={false}
          />
          <button
            onClick={togglePlay}
            className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-all hover:bg-background"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-foreground" />
            ) : (
              <Play className="h-6 w-6 text-foreground" />
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex gap-3">
          <Button
            variant="default"
            className="flex-1"
            onClick={handleDownload}
          >
            <Download className="h-5 w-5" />
            Download
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleShare}
          >
            <Share2 className="h-5 w-5" />
            Share
          </Button>
        </div>

        {/* Style Chips */}
        <div className="mb-6">
          <p className="mb-3 text-center text-sm text-muted-foreground">
            Want a different vibe?
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {STYLE_CHIPS.map((chip) => (
              <Button
                key={chip.id}
                variant="chip"
                size="sm"
                onClick={() => onRegenerate(chip.id)}
              >
                {chip.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Make Another */}
        <Button
          variant="ghost"
          className="w-full"
          onClick={onMakeAnother}
        >
          <RefreshCw className="h-5 w-5" />
          Make another version
        </Button>
      </div>
    </div>
  );
}
