import { useState, useCallback, forwardRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useJob } from '@/hooks/useJob';
import { supabase } from '@/integrations/supabase/client';
import { AuthScreen } from '@/components/AuthScreen';
import { PaywallScreen } from '@/components/PaywallScreen';
import { EmotionPicker } from '@/components/EmotionPicker';
import { UploadScreen } from '@/components/UploadScreen';
import { GenerateScreen } from '@/components/GenerateScreen';
import { ResultScreen } from '@/components/ResultScreen';
import { Header } from '@/components/Header';
import { assembleVideo } from '@/lib/ffmpeg';
import { toast } from 'sonner';
import { validateFile, sanitizeFilename, FileValidationError } from '@/lib/fileValidation';
import { logger } from '@/lib/logger';
import { StorageBuckets, URL_EXPIRY } from '@/lib/constants';
import type { Emotion, UploadState, JobStatus } from '@/types/veosync';

type Step = 'emotion' | 'upload' | 'generate' | 'result';

const Index = forwardRef<HTMLDivElement, object>(function Index(_, ref) {
  const { user, session, loading: authLoading } = useAuth();
  const { isActive, loading: subLoading } = useSubscription(user?.id);
  
  const [step, setStep] = useState<Step>('emotion');
  const [emotion, setEmotion] = useState<Emotion | null>(null);
  const [uploads, setUploads] = useState<UploadState>({
    selfie: null,
    selfiePreview: null,
    audio: null,
    audioName: null,
    lyrics: '',
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<JobStatus>('queued');
  const [assemblyProgress, setAssemblyProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const { job } = useJob(jobId);

  const handleUpdateUploads = useCallback((updates: Partial<UploadState>) => {
    setUploads((prev) => ({ ...prev, ...updates }));
  }, []);

  const uploadFile = async (file: File, folder: string, fileType: 'selfie' | 'audio'): Promise<string> => {
    // Validate file before upload
    try {
      validateFile(file, fileType);
    } catch (error) {
      if (error instanceof FileValidationError) {
        toast.error(error.message);
        throw error;
      }
      throw error;
    }
    
    // Sanitize filename
    const safeName = sanitizeFilename(file.name);
    const path = `${user!.id}/${folder}/${Date.now()}_${safeName}`;
    
    logger.info('Uploading file', { 
      userId: user!.id, 
      folder, 
      fileType, 
      originalName: file.name,
      sanitizedName: safeName,
      size: file.size 
    });
    
    const { error } = await supabase.storage
      .from(StorageBuckets.UPLOADS)
      .upload(path, file);
    
    if (error) {
      logger.error('File upload failed', { userId: user!.id, folder, error: error.message });
      throw error;
    }
    
    const { data: signedUrl } = await supabase.storage
      .from(StorageBuckets.UPLOADS)
      .createSignedUrl(path, URL_EXPIRY.UPLOAD);
    
    return signedUrl?.signedUrl || '';
  };

  const handleGenerate = async () => {
    if (!emotion || !uploads.selfie || !uploads.audio || !user) return;
    
    // Validate session before proceeding
    if (!session?.access_token) {
      logger.error('No active session', { userId: user.id });
      toast.error('Session expired. Please log in again.');
      return;
    }
    
    logger.info('Starting generation', { userId: user.id, emotion });
    setLocalStatus('running');
    setStep('generate');
    
    try {
      // Upload files
      toast.info('Uploading your files...');
      const [selfieUrl, audioUrl] = await Promise.all([
        uploadFile(uploads.selfie, 'selfies', 'selfie'),
        uploadFile(uploads.audio, 'audio', 'audio'),
      ]);

      logger.info('Files uploaded, creating job', { userId: user.id });
      
      // Create job
      const { data: createData, error: createError } = await supabase.functions.invoke('create-job', {
        body: {
          emotion,
          platform: '9:16',
          selfie_asset_url: selfieUrl,
          song_asset_url: audioUrl,
          lyrics: uploads.lyrics || undefined,
        },
      });

      if (createError) {
        logger.error('Create job failed', { userId: user.id, error: createError.message });
        throw createError;
      }
      
      const newJobId = createData.job_id;
      setJobId(newJobId);
      logger.info('Job created', { userId: user.id, jobId: newJobId });
      
      toast.info('Processing your video...');
      
      // Process job
      const { data: processData, error: processError } = await supabase.functions.invoke('process-job', {
        body: { job_id: newJobId },
      });

      if (processError) {
        logger.error('Process job failed', { userId: user.id, jobId: newJobId, error: processError.message });
        throw processError;
      }

      if (processData.status === 'ready_for_assembly' && processData.assembly) {
        setLocalStatus('assembling');
        toast.info('Assembling final video...');
        
        // Assemble video client-side
        const videoBlob = await assembleVideo(processData.assembly, setAssemblyProgress);
        
        // Upload final video
        const finalPath = `${user.id}/final/${newJobId}.mp4`;
        const { error: uploadError } = await supabase.storage
          .from('outputs')
          .upload(finalPath, videoBlob);

        if (uploadError) {
          logger.error('Final video upload failed', { userId: user.id, jobId: newJobId, error: uploadError.message });
          throw uploadError;
        }

        const { data: finalSignedUrl } = await supabase.storage
          .from('outputs')
          .createSignedUrl(finalPath, 3600 * 24); // 24 hours

        // Finalize job
        await supabase.functions.invoke('finalize-job', {
          body: { 
            job_id: newJobId, 
            final_video_url: finalSignedUrl?.signedUrl 
          },
        });

        setResultUrl(finalSignedUrl?.signedUrl || '');
        setLocalStatus('done');
        setStep('result');
        logger.info('Video generation complete', { userId: user.id, jobId: newJobId });
        toast.success('Your video is ready!');
      }
    } catch (error) {
      logger.error('Generation error', { userId: user.id, error: error instanceof Error ? error.message : 'Unknown' });
      setLocalStatus('error');
      toast.error(error instanceof FileValidationError ? error.message : 'Failed to generate video. Please try again.');
    }
  };

  const handleMakeAnother = () => {
    setStep('emotion');
    setEmotion(null);
    setUploads({
      selfie: null,
      selfiePreview: null,
      audio: null,
      audioName: null,
      lyrics: '',
    });
    setJobId(null);
    setLocalStatus('queued');
    setResultUrl(null);
    setAssemblyProgress(0);
  };

  const handleRegenerate = (style: string) => {
    logger.info('Regenerating with style', { style });
    toast.info(`Regenerating with "${style}" style...`);
    handleGenerate();
  };

  // Loading state
  if (authLoading || subLoading) {
    return (
      <div ref={ref} className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Auth required
  if (!user) {
    return <AuthScreen />;
  }

  // Subscription required (bypassed for testing)
  // if (!isActive) {
  //   return <PaywallScreen />;
  // }

  return (
    <div ref={ref} className="min-h-screen bg-background pt-16">
      <Header />
      
      {step === 'emotion' && (
        <EmotionPicker
          selectedEmotion={emotion}
          onSelect={setEmotion}
          onContinue={() => setStep('upload')}
        />
      )}

      {step === 'upload' && (
        <UploadScreen
          uploads={uploads}
          onUpdateUploads={handleUpdateUploads}
          onContinue={() => setStep('generate')}
          onBack={() => setStep('emotion')}
        />
      )}

      {step === 'generate' && (
        <GenerateScreen
          status={job?.status || localStatus}
          onGenerate={handleGenerate}
          onBack={() => setStep('upload')}
          assemblyProgress={assemblyProgress}
        />
      )}

      {step === 'result' && resultUrl && (
        <ResultScreen
          videoUrl={resultUrl}
          onMakeAnother={handleMakeAnother}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  );
});

Index.displayName = 'Index';

export default Index;
