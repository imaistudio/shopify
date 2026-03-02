import { useEffect, useRef, useCallback } from "react";

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

export function useJobPoller(
  jobs: JobItem[]
) {
  const attemptsRef = useRef<Record<string, number>>({});
  const intervalRef = useRef<Record<string, NodeJS.Timeout | null>>({});

  const clearPoller = useCallback((jobId: string) => {
    if (intervalRef.current[jobId]) {
      clearInterval(intervalRef.current[jobId]!);
      intervalRef.current[jobId] = null;
    }
  }, []);

  const clearAllPollers = useCallback(() => {
    Object.keys(intervalRef.current).forEach(jobId => clearPoller(jobId));
  }, [clearPoller]);

  useEffect(() => {
    // Clear pollers for jobs that are no longer in the list
    const currentJobIds = jobs.map(job => job.jobId);
    Object.keys(intervalRef.current).forEach(jobId => {
      if (!currentJobIds.includes(jobId)) {
        clearPoller(jobId);
        delete attemptsRef.current[jobId];
        delete intervalRef.current[jobId];
      }
    });

    jobs.forEach(({ jobId, onComplete, onError }) => {
      if (!jobId) return;

      if (!attemptsRef.current[jobId]) {
        attemptsRef.current[jobId] = 0;
      }

      if (intervalRef.current[jobId]) return; // Already polling

      const poll = async () => {
        attemptsRef.current[jobId]++;

        // Max 7 minutes of polling (14 attempts * 30 seconds)
        if (attemptsRef.current[jobId] > 14) {
          clearPoller(jobId);
          onError("Generation timed out. Check your Library in a few minutes.");
          return;
        }

        try {
          const resp = await fetch(`/api/imai/status?jobId=${jobId}`);
          
          if (!resp.ok) {
            throw new Error(`Status check failed: ${resp.status}`);
          }
          
          const data = await resp.json();

          // Handle different response formats
          if (data.success === false || data.error) {
            clearPoller(jobId);
            onError(data.error || data.message || "Generation failed.");
            return;
          }

          if (data.status === "completed" || (data.success && !data.accepted)) {
            clearPoller(jobId);
            // Handle both direct result format and nested result format
            const result = data.result || data;
            
            // Check if there are any pending IDs that need to be resolved
            if (result.pendingIds && result.pendingIds.length > 0) {
              // Some assets are still processing, but show results now
              console.log("Job completed with pending IDs:", result.pendingIds, "showing results");
            }
            
            console.log("Job completed, calling onComplete with result");
            onComplete(result);
          } else if (data.status === "failed") {
            clearPoller(jobId);
            onError(data.error || data.message || "Generation failed.");
          } else if (data.status === "running" || data.status === "queued") {
            // Check if we have pendingIds in the response
            const result = data.result || data;
            if (result.pendingIds && result.pendingIds.length === 0) {
              // All pending IDs resolved but job still running, keep polling
              console.log("All pending IDs resolved, job still running");
            }
          }
          // status === "queued" or "running": keep polling
        } catch (error) {
          console.error("Polling error:", error);
          // Network blip — keep trying, but log it
          if (attemptsRef.current[jobId] > 10) {
            // After many failed attempts, show an error
            clearPoller(jobId);
            onError("Connection lost. Please check your internet and try again.");
          }
        }
      };

      // Poll immediately, then every 30 seconds
      poll();
      intervalRef.current[jobId] = setInterval(poll, 30000);
    });

    return clearAllPollers;
  }, [jobs, clearPoller, clearAllPollers]);

  return { clearAllPollers };
}
