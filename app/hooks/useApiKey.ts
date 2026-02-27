import { useState, useEffect, useCallback } from "react";
import type { FetcherWithComponents } from "react-router";

// App bridge instance type
interface AppBridgeInstance {
  toast: {
    show: (message: string) => void;
  };
}

interface ApiKeyState {
  isConnected: boolean;
  maskedKey: string | null;
  balance: number | null;
  isLoading: boolean;
  error: string | null;
}

export function useApiKey(
  fetcher: FetcherWithComponents<{
    success?: boolean;
    removed?: boolean;
    maskedKey?: string;
    balance?: number;
    error?: string;
  }>,
  shopify: AppBridgeInstance
) {
  const [state, setState] = useState<ApiKeyState>({
    isConnected: false,
    maskedKey: null,
    balance: null,
    isLoading: false,
    error: null,
  });

  // Handle fetcher data changes
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success) {
        if (fetcher.data.removed) {
          // Key was removed
          setState({
            isConnected: false,
            maskedKey: null,
            balance: null,
            isLoading: false,
            error: null,
          });
          shopify.toast.show("API key removed");
        } else {
          // Key was saved
          setState({
            isConnected: true,
            maskedKey: fetcher.data.maskedKey || null,
            balance: fetcher.data.balance || null,
            isLoading: false,
            error: null,
          });
          shopify.toast.show("✅ Connected to IMAI Studio");
        }
      } else if (fetcher.data.error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: fetcher.data!.error || null,
        }));
      }
    }
  }, [fetcher.data, shopify]);

  const saveKey = useCallback(
    (apiKey: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      const formData = new FormData();
      formData.append("intent", "saveKey");
      formData.append("apiKey", apiKey);
      
      fetcher.submit(formData, { method: "POST" });
    },
    [fetcher]
  );

  const removeKey = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    const formData = new FormData();
    formData.append("intent", "removeKey");
    
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher]);

  const refreshBalance = useCallback(async () => {
    // This would typically fetch from your backend which then calls IMAI API
    // For now, it's a placeholder
    console.log("Refreshing balance...");
  }, []);

  return {
    ...state,
    saveKey,
    removeKey,
    refreshBalance,
  };
}
