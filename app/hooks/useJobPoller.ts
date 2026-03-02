import { useEffect, useRef, useCallback } from "react";

interface JobResult {
  versionId?: string;
  urls: string[];
  assetIds: string[];
  failedIds?: string[];
  pendingIds?: string[];
  linkIds?: string[];
}

export function useJobPoller(
  jobId: string | null,
  onComplete: (result: JobResult) => void,
  onError: (error: string) => void
) {
  const attemptsRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPoller = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      clearPoller();
      return;
    }

    attemptsRef.current = 0;

    const poll = async () => {
      attemptsRef.current++;

      // Max 5 minutes of polling (150 attempts * 2 seconds)
      if (attemptsRef.current > 150) {
        clearPoller();
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
          clearPoller();
          onError(data.error || data.message || "Generation failed.");
          return;
        }

        if (data.status === "completed" || (data.success && !data.accepted)) {
          clearPoller();
          // Handle both direct result format and nested result format
          const result = data.result || data;
          
          // Check if there are any pending IDs that need to be resolved
          if (result.pendingIds && result.pendingIds.length > 0) {
            // Some assets are still processing, keep polling
            console.log("Job completed but has pending IDs:", result.pendingIds);
            return;
          }
          
          onComplete(result);
        } else if (data.status === "failed") {
          clearPoller();
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
        if (attemptsRef.current > 10) {
          // After many failed attempts, show an error
          clearPoller();
          onError("Connection lost. Please check your internet and try again.");
        }
      }
    };

    // Poll immediately, then every 5 seconds
    poll();
    intervalRef.current = setInterval(poll, 5000);

    return clearPoller;
  }, [jobId, onComplete, onError, clearPoller]);

  return { clearPoller };
}
