import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Job, JobStatus, AssemblyManifest } from '@/types/veosync';

interface DbJob {
  id: string;
  user_id: string;
  status: string;
  emotion: string;
  lyrics: string | null;
  song_url: string | null;
  selfie_url: string | null;
  result_url: string | null;
  provider_refs: Record<string, unknown>;
  error: string | null;
  assembly_manifest: unknown;
  created_at: string;
  updated_at: string;
}

function parseJob(data: DbJob): Job {
  return {
    id: data.id,
    user_id: data.user_id,
    status: data.status as JobStatus,
    emotion: data.emotion as Job['emotion'],
    lyrics: data.lyrics ?? undefined,
    song_url: data.song_url ?? '',
    selfie_url: data.selfie_url ?? '',
    result_url: data.result_url ?? undefined,
    provider_refs: data.provider_refs ?? {},
    error: data.error ?? undefined,
    assembly_manifest: data.assembly_manifest as AssemblyManifest | undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError) {
      setError(fetchError.message);
    } else if (data) {
      setJob(parseJob(data as DbJob));
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    // Fetch job immediately
    const doFetch = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (fetchError) {
        setError(fetchError.message);
      } else if (data) {
        setJob(parseJob(data as DbJob));
      }
      setLoading(false);
    };
    
    doFetch();

    // Subscribe to realtime changes
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          if (payload.new) {
            setJob(parseJob(payload.new as DbJob));
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [jobId]); // Only depend on jobId - removed fetchJob to prevent memory leak

  const updateStatus = async (status: JobStatus) => {
    if (!jobId) return;
    
    const { error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId);

    if (error) {
      setError(error.message);
    }
  };

  return { job, loading, error, fetchJob, updateStatus };
}
