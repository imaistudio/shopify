import { useEffect, useRef, useCallback } from "react";
import { authenticatedAppFetch } from "../lib/authenticated-app-fetch";

interface JobResult {
  versionId?: string;
  urls: string[];
  assetIds: string[];
  failedIds?: string[];
  pendingIds?: string[];
  linkIds?: string[];
}

interface JobItem {
  jobId: string;
  onComplete: (result: JobResult) => void;
  onError: (error: string) => void;
}

type PollStatusResponse = {
  success?: boolean;
  accepted?: boolean;
  status?: "queued" | "running" | "processing" | "completed" | "failed" | "cancelled";
  error?: string;
  message?: string;
  result?: JobResult;
};

export function useJobPoller(
  jobs: JobItem[]
) {
  const pollTimeoutRef = useRef<Record<string, NodeJS.Timeout | null>>({});
  const completedJobsRef = useRef<Set<string>>(new Set());
  const pollAttemptsRef = useRef<Record<string, number>>({});

  const clearPollTimeoutForJob = useCallback((jobId: string) => {
    if (pollTimeoutRef.current[jobId]) {
      clearTimeout(pollTimeoutRef.current[jobId]!);
      pollTimeoutRef.current[jobId] = null;
    }
  }, []);

  const clearAllTimeouts = useCallback(() => {
    Object.keys(pollTimeoutRef.current).forEach(jobId => clearPollTimeoutForJob(jobId));
  }, [clearPollTimeoutForJob]);

  // Exponential backoff: start at 3s, double each time, max 30s
  const getPollInterval = useCallback((attempts: number) => {
    return Math.min(3000 * Math.pow(2, attempts), 30000);
  }, []);

  const activePollersRef = useRef<Set<string>>(new Set());

  const pollJobStatus = useCallback(async (jobId: string, onComplete: (result: JobResult) => void, onError: (error: string) => void) => {
    // Skip if already completed or if polling is already active for this job
    if (completedJobsRef.current.has(jobId) || activePollersRef.current.has(jobId)) {
      return;
    }

    activePollersRef.current.add(jobId);

    const poll = async () => {
      // Double-check if completed before polling
      if (completedJobsRef.current.has(jobId)) {
        activePollersRef.current.delete(jobId);
        return;
      }

      try {
        console.log(`Polling status for job ${jobId}, attempt ${pollAttemptsRef.current[jobId] || 0}`);
        const resp = await authenticatedAppFetch(`/api/imai/status?jobId=${jobId}`);

        if (!resp.ok) {
          throw new Error(`Status check failed: ${resp.status}`);
        }

        const data = (await resp.json()) as PollStatusResponse;

        if (data.success === false || data.error) {
          console.log(`Job ${jobId} failed:`, data.error || data.message);
          completedJobsRef.current.add(jobId);
          activePollersRef.current.delete(jobId);
          onError(data.error || data.message || "Generation failed.");
          return;
        }

        if (data.status === "completed" || (data.success && !data.accepted)) {
          console.log(`Job ${jobId} completed`);
          completedJobsRef.current.add(jobId);
          activePollersRef.current.delete(jobId);
          const result = data.result || { urls: [], assetIds: [] };
          onComplete(result);
          return;
        } else if (data.status === "failed") {
          console.log(`Job ${jobId} failed with status`);
          completedJobsRef.current.add(jobId);
          activePollersRef.current.delete(jobId);
          onError(data.error || data.message || "Generation failed.");
          return;
        }

        // Continue polling with exponential backoff
        const attempts = pollAttemptsRef.current[jobId] || 0;
        pollAttemptsRef.current[jobId] = attempts + 1;
        const interval = getPollInterval(attempts);

        console.log(`Job ${jobId} still processing, next poll in ${interval}ms`);
        pollTimeoutRef.current[jobId] = setTimeout(poll, interval);

      } catch (error) {
        console.error(`Polling error for job ${jobId}:`, error);

        // On network errors, retry with backoff (but less aggressively)
        const attempts = pollAttemptsRef.current[jobId] || 0;
        pollAttemptsRef.current[jobId] = attempts + 1;
        const interval = getPollInterval(Math.min(attempts, 3)); // Cap at 4th attempt interval for errors

        pollTimeoutRef.current[jobId] = setTimeout(poll, interval);
      }
    };

    // Start polling immediately
    poll();
  }, [getPollInterval]);

  useEffect(() => {
    // Clear completed jobs for jobs that are no longer in the list
    const currentJobIds = jobs.map(job => job.jobId);
    completedJobsRef.current.forEach(jobId => {
      if (!currentJobIds.includes(jobId)) {
        completedJobsRef.current.delete(jobId);
        activePollersRef.current.delete(jobId);
        delete pollAttemptsRef.current[jobId];
      }
    });

    // Clear timeouts for jobs that are no longer in the list
    Object.keys(pollTimeoutRef.current).forEach(jobId => {
      if (!currentJobIds.includes(jobId)) {
        clearPollTimeoutForJob(jobId);
        activePollersRef.current.delete(jobId);
        delete pollTimeoutRef.current[jobId];
      }
    });

    // Start polling for new jobs
    jobs.forEach(({ jobId, onComplete, onError }) => {
      if (!jobId) return;

      // Skip if already polling or completed
      if (pollTimeoutRef.current[jobId] || completedJobsRef.current.has(jobId)) {
        return;
      }

      // Initialize attempts counter
      if (!pollAttemptsRef.current[jobId]) {
        pollAttemptsRef.current[jobId] = 0;
      }

      console.log(`Starting polling for job ${jobId}`);
      // Start polling immediately
      pollJobStatus(jobId, onComplete, onError);
    });

    return () => {
      clearAllTimeouts();
    };
  }, [jobs, pollJobStatus, clearPollTimeoutForJob, clearAllTimeouts]);

  return { clearAllTimeouts };
}
