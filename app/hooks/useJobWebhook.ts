import { useEffect, useRef, useCallback, useState } from "react";

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

export function useJobWebhook(
  jobs: JobItem[],
  shop: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});
  const completedJobs = useRef<Set<string>>(new Set());

  const clearJobTimeout = useCallback((jobId: string) => {
    if (timeoutRefs.current[jobId]) {
      clearTimeout(timeoutRefs.current[jobId]);
      delete timeoutRefs.current[jobId];
    }
  }, []);

  const clearAllTimeouts = useCallback(() => {
    Object.keys(timeoutRefs.current).forEach(jobId => {
      clearJobTimeout(jobId);
    });
  }, [clearJobTimeout]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current || !shop) return;

    try {
      const eventSource = new EventSource(`/api/imai/events?shop=${shop}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("SSE connection opened");
        setIsConnected(true);
        setConnectionError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'job_update') {
            const { jobId, status, result, error } = data;
            
            // Find the job in our list
            const job = jobs.find(j => j.jobId === jobId);
            if (!job) return;

            // Skip if already processed
            if (completedJobs.current.has(jobId)) return;

            if (status === 'completed' && result) {
              completedJobs.current.add(jobId);
              clearJobTimeout(jobId);
              job.onComplete(result);
            } else if (status === 'failed' && error) {
              completedJobs.current.add(jobId);
              clearJobTimeout(jobId);
              job.onError(error);
            }
          }
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        setIsConnected(false);
        setConnectionError("Connection lost. Switching to polling mode.");
        
        // Don't immediately reconnect - let the fallback polling handle it
        disconnect();
      };

    } catch (error) {
      console.error("Failed to create SSE connection:", error);
      setConnectionError("Failed to establish real-time connection.");
    }
  }, [jobs, shop, disconnect, clearJobTimeout]);

  useEffect(() => {
    // Set up 7-minute timeout for each job
    jobs.forEach(({ jobId, onError }) => {
      if (!jobId || completedJobs.current.has(jobId)) return;

      // Clear existing timeout
      clearJobTimeout(jobId);

      // Set new timeout for 7 minutes
      timeoutRefs.current[jobId] = setTimeout(() => {
        if (!completedJobs.current.has(jobId)) {
          completedJobs.current.add(jobId);
          onError("Generation timed out after 7 minutes. Check your Library in a few minutes.");
        }
      }, 7 * 60 * 1000); // 7 minutes
    });

    return clearAllTimeouts;
  }, [jobs, clearJobTimeout, clearAllTimeouts]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
      clearAllTimeouts();
    };
  }, [connect, disconnect, clearAllTimeouts]);

  // Clean up completed jobs when jobs array changes
  useEffect(() => {
    const currentJobIds = new Set(jobs.map(j => j.jobId));
    
    // Remove completed jobs that are no longer in the active list
    completedJobs.current.forEach(jobId => {
      if (!currentJobIds.has(jobId)) {
        completedJobs.current.delete(jobId);
        clearJobTimeout(jobId);
      }
    });
  }, [jobs, clearJobTimeout]);

  return {
    isConnected,
    connectionError,
    disconnect,
    connect,
    clearAllTimeouts
  };
}
