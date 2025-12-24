import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Music, FileText, X, Check } from 'lucide-react';
import type { UploadState } from '@/types/veosync';

interface UploadScreenProps {
  uploads: UploadState;
  onUpdateUploads: (updates: Partial<UploadState>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function UploadScreen({ uploads, onUpdateUploads, onContinue, onBack }: UploadScreenProps) {
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [showLyrics, setShowLyrics] = useState(false);

  const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const preview = URL.createObjectURL(file);
      onUpdateUploads({ selfie: file, selfiePreview: preview });
    }
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpdateUploads({ audio: file, audioName: file.name });
    }
  };

  const canContinue = uploads.selfie && uploads.audio;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg animate-fade-in">
        <button
          onClick={onBack}
          className="mb-6 font-body text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>

        <h1 className="mb-2 text-center font-display text-4xl tracking-wider text-foreground md:text-5xl">
          YOUR INGREDIENTS
        </h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">
          Upload only media you own or have permission to use.
        </p>

        <div className="mb-8 space-y-4">
          {/* Selfie Upload Card */}
          <div
            onClick={() => selfieInputRef.current?.click()}
            className={`gradient-border relative cursor-pointer overflow-hidden rounded-2xl bg-muted/30 p-6 transition-all hover:bg-muted/50 ${
              uploads.selfie ? 'border-2 border-primary' : ''
            }`}
          >
            <input
              ref={selfieInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleSelfieChange}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              {uploads.selfiePreview ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                  <img
                    src={uploads.selfiePreview}
                    alt="Selfie preview"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/80">
                    <Check className="h-6 w-6 text-primary-foreground" />
                  </div>
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                  <Camera className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <h3 className="font-display text-xl tracking-wider">SELFIE</h3>
                <p className="text-sm text-muted-foreground">
                  {uploads.selfie ? 'Tap to change' : 'Image or 3-5s video'}
                </p>
              </div>
            </div>
          </div>

          {/* Audio Upload Card */}
          <div
            onClick={() => audioInputRef.current?.click()}
            className={`gradient-border relative cursor-pointer overflow-hidden rounded-2xl bg-muted/30 p-6 transition-all hover:bg-muted/50 ${
              uploads.audio ? 'border-2 border-primary' : ''
            }`}
          >
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              onChange={handleAudioChange}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              <div className={`flex h-16 w-16 items-center justify-center rounded-xl ${
                uploads.audio ? 'bg-primary' : 'bg-muted'
              }`}>
                {uploads.audio ? (
                  <Check className="h-8 w-8 text-primary-foreground" />
                ) : (
                  <Music className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <h3 className="font-display text-xl tracking-wider">AUDIO</h3>
                <p className="text-sm text-muted-foreground">
                  {uploads.audioName || 'MP3, WAV, or M4A'}
                </p>
              </div>
            </div>
          </div>

          {/* Lyrics Card */}
          <div
            onClick={() => !showLyrics && setShowLyrics(true)}
            className={`gradient-border relative overflow-hidden rounded-2xl bg-muted/30 p-6 transition-all ${
              !showLyrics ? 'cursor-pointer hover:bg-muted/50' : ''
            }`}
          >
            {showLyrics ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-xl tracking-wider">LYRICS</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLyrics(false);
                      onUpdateUploads({ lyrics: '' });
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <Textarea
                  value={uploads.lyrics}
                  onChange={(e) => onUpdateUploads({ lyrics: e.target.value })}
                  placeholder="Paste your lyrics here..."
                  className="min-h-[120px] resize-none border-none bg-muted/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-display text-xl tracking-wider">LYRICS</h3>
                  <p className="text-sm text-muted-foreground">Optional — add for lip sync</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <Button
          variant="hero"
          className="w-full"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
