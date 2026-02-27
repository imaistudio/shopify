import { useEffect, useRef, useCallback } from "react";

interface JobResult {
  versionId?: string;
  urls: string[];
  assetIds: string[];
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

      if (attemptsRef.current > 150) {
        clearPoller();
        onError("Generation timed out. Check your Library in a few minutes.");
        return;
      }

      try {
        const resp = await fetch(`/api/imai/status?jobId=${jobId}`);
        const data = await resp.json();

        if (data.status === "completed") {
          clearPoller();
          onComplete(data.result);
        } else if (data.status === "failed") {
          clearPoller();
          onError(data.error || "Generation failed.");
        }
        // status === "queued" or "running": keep polling
      } catch {
        // Network blip — keep trying
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    intervalRef.current = setInterval(poll, 2000);

    return clearPoller;
  }, [jobId, onComplete, onError, clearPoller]);

  return { clearPoller };
}
