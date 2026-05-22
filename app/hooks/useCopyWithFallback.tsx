"use client";

import { useCallback, useState } from "react";
import { CopyFallbackModal } from "../components/CopyFallbackModal";
import type { AppLang } from "../lib/appLang";
import { copyToClipboard } from "../lib/copyToClipboard";
import { sharedUiCopy } from "../lib/uiI18n";

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

export function useCopyWithFallback(isMobile = false, lang: AppLang = "zh") {
  const [fallback, setFallback] = useState<FallbackState | null>(null);
  const shared = sharedUiCopy(lang);

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

      setFallback({
        text: value,
        options: {
          title: options?.title ?? shared.copyFallbackTitle,
          description: options?.description ?? shared.copyFallbackDesc,
          tapLabel: options?.tapLabel ?? shared.tapToCopy,
          closeLabel: options?.closeLabel ?? shared.close,
          copiedLabel: options?.copiedLabel ?? shared.copiedExclaim,
          onSuccess: options?.onSuccess,
        },
      });
      return false;
    },
    [shared.close, shared.copyFallbackDesc, shared.copyFallbackTitle, shared.copiedExclaim, shared.tapToCopy],
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
