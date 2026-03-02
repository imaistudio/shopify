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
  const timeoutRef = useRef<Record<string, NodeJS.Timeout | null>>({});
  const pollTimeoutRef = useRef<Record<string, NodeJS.Timeout | null>>({});
  const eventSourceRef = useRef<EventSource | null>(null);
  const jobsRef = useRef<JobItem[]>(jobs);

  const clearTimeoutForJob = useCallback((jobId: string) => {
    if (timeoutRef.current[jobId]) {
      clearTimeout(timeoutRef.current[jobId]!);
      timeoutRef.current[jobId] = null;
    }
  }, []);

  const clearPollTimeoutForJob = useCallback((jobId: string) => {
    if (pollTimeoutRef.current[jobId]) {
      clearTimeout(pollTimeoutRef.current[jobId]!);
      pollTimeoutRef.current[jobId] = null;
    }
  }, []);

  const clearAllTimeouts = useCallback(() => {
    Object.keys(timeoutRef.current).forEach(jobId => clearTimeoutForJob(jobId));
    Object.keys(pollTimeoutRef.current).forEach(jobId => clearPollTimeoutForJob(jobId));
  }, [clearTimeoutForJob, clearPollTimeoutForJob]);

  const startPolling = useCallback(async (jobId: string, onComplete: (result: any) => void, onError: (error: string) => void) => {
    const poll = async () => {
      try {
        const resp = await fetch(`/api/imai/status?jobId=${jobId}`);
        
        if (!resp.ok) {
          throw new Error(`Status check failed: ${resp.status}`);
        }
        
        const data = await resp.json();

        if (data.success === false || data.error) {
          clearPollTimeoutForJob(jobId);
          onError(data.error || data.message || "Generation failed.");
          return;
        }

        if (data.status === "completed" || (data.success && !data.accepted)) {
          clearPollTimeoutForJob(jobId);
          const result = data.result || data;
          onComplete(result);
          return;
        } else if (data.status === "failed") {
          clearPollTimeoutForJob(jobId);
          onError(data.error || data.message || "Generation failed.");
          return;
        }
        // Continue polling every 45 seconds
        pollTimeoutRef.current[jobId] = setTimeout(poll, 45000);
      } catch (error) {
        console.error("Polling error:", error);
        // Continue trying
        pollTimeoutRef.current[jobId] = setTimeout(poll, 45000);
      }
    };

    poll(); // Start polling immediately
  }, [clearPollTimeoutForJob]);

  useEffect(() => {
    jobsRef.current = jobs;

    // Clear timeouts for jobs that are no longer in the list
    const currentJobIds = jobs.map(job => job.jobId);
    Object.keys(timeoutRef.current).forEach(jobId => {
      if (!currentJobIds.includes(jobId)) {
        clearTimeoutForJob(jobId);
        delete timeoutRef.current[jobId];
      }
    });

    // Clear poll timeouts for jobs that are no longer in the list
    Object.keys(pollTimeoutRef.current).forEach(jobId => {
      if (!currentJobIds.includes(jobId)) {
        clearPollTimeoutForJob(jobId);
        delete pollTimeoutRef.current[jobId];
      }
    });

    // Set up EventSource if not already connected
    if (!eventSourceRef.current) {
      eventSourceRef.current = new EventSource('/api/imai/events');

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'job_update') {
            const { jobId, status, result, error } = data;

            // Find the job in current jobs
            const job = jobsRef.current.find(j => j.jobId === jobId);
            if (job) {
              // Clear both timeouts since we have an update
              clearTimeoutForJob(jobId);
              clearPollTimeoutForJob(jobId);

              if (status === 'completed') {
                // Handle both direct result format and nested result format
                const jobResult = result.result || result;

                // Check if there are any pending IDs that need to be resolved
                if (jobResult.pendingIds && jobResult.pendingIds.length > 0) {
                  // Some assets are still processing, but show results now
                  console.log("Job completed with pending IDs:", jobResult.pendingIds, "showing results");
                }

                console.log("Job completed, calling onComplete with result");
                job.onComplete(jobResult);
              } else if (status === 'failed') {
                job.onError(error || "Generation failed.");
              }
            }
          }
        } catch (err) {
          console.error("Error parsing SSE event:", err);
        }
      };

      eventSourceRef.current.onerror = (error) => {
        console.error("SSE connection error:", error);
      };
    }

    jobs.forEach(({ jobId, onComplete, onError }) => {
      if (!jobId) return;

      // Set 10-minute final timeout if not set
      if (!timeoutRef.current[jobId]) {
        timeoutRef.current[jobId] = setTimeout(() => {
          clearTimeoutForJob(jobId);
          clearPollTimeoutForJob(jobId);
          onError("Generation timed out. Check your Library in a few minutes.");
        }, 600000); // 10 minutes
      }

      // Set 7-minute timeout to start fallback polling
      if (!pollTimeoutRef.current[jobId]) {
        pollTimeoutRef.current[jobId] = setTimeout(() => {
          console.log(`Starting fallback polling for job ${jobId}`);
          startPolling(jobId, onComplete, onError);
        }, 420000); // 7 minutes
      }
    });

    return () => {
      clearAllTimeouts();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [jobs, clearTimeoutForJob, clearAllTimeouts]);

  return { clearAllTimeouts };
}
