"use client";

import { useCallback, useState } from "react";
import { CopyFallbackModal } from "../components/CopyFallbackModal";
import { copyToClipboard } from "../lib/copyToClipboard";

export type CopyWithFallbackOptions = {
  title?: string;
  description?: string;
  tapLabel?: string;
  closeLabel?: string;
  copiedLabel?: string;
  onSuccess?: () => void | Promise<void>;
};

type FallbackState = {
  text: string;
  options: CopyWithFallbackOptions;
};

export function useCopyWithFallback(isMobile = false) {
  const [fallback, setFallback] = useState<FallbackState | null>(null);

  const closeFallback = useCallback(() => setFallback(null), []);

  const copyWithFallback = useCallback(
    async (text: string, options?: CopyWithFallbackOptions): Promise<boolean> => {
      const value = text.trim();
      if (!value) return false;

      const ok = await copyToClipboard(value);
      if (ok) {
        await options?.onSuccess?.();
        return true;
      }

      setFallback({ text: value, options: options ?? {} });
      return false;
    },
    [],
  );

  const fallbackModal = fallback ? (
    <CopyFallbackModal
      open
      text={fallback.text}
      isMobile={isMobile}
      title={fallback.options.title}
      description={fallback.options.description}
      tapLabel={fallback.options.tapLabel}
      closeLabel={fallback.options.closeLabel}
      copiedLabel={fallback.options.copiedLabel}
      onClose={closeFallback}
      onCopied={async () => {
        await fallback.options.onSuccess?.();
        closeFallback();
      }}
    />
  ) : null;

  return { copyWithFallback, fallbackModal, closeFallback };
}
