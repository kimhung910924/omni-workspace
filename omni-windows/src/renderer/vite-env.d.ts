/// <reference types="vite/client" />

interface Window {
  omni?: {
    claudePartition: string;
    chatgptPartition: string;
    geminiPartition: string;
    grokPartition: string;
    perplexityPartition: string;
    getWebviewCapturePreloadUrl: () => Promise<string>;
  };
}
