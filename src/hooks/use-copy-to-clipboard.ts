"use client";

import { useEffect, useRef, useState } from "react";

export type UseCopyToClipboardOptions = {
  copiedDuration?: number;
  onError?: (error: unknown) => void;
};

export const useCopyToClipboard = ({
  copiedDuration = 3000,
  onError,
}: UseCopyToClipboardOptions = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scopeGenerationRef = useRef(0);

  useEffect(
    () => () => {
      scopeGenerationRef.current += 1;
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = undefined;
      setIsCopied(false);
    },
    [],
  );

  const resetCopied = () => {
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = undefined;
    setIsCopied(false);
  };

  const copyToClipboard = async (value: string) => {
    resetCopied();
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      onError?.(
        new Error(
          value
            ? "Clipboard access is unavailable in this browser."
            : "There is no content to copy.",
        ),
      );
      return;
    }

    const scopeGeneration = scopeGenerationRef.current;
    await navigator.clipboard.writeText(value).then(
      () => {
        if (scopeGeneration !== scopeGenerationRef.current) return;

        clearTimeout(copiedTimerRef.current);
        setIsCopied(true);
        copiedTimerRef.current = setTimeout(() => {
          copiedTimerRef.current = undefined;
          setIsCopied(false);
        }, copiedDuration);
      },
      (error: unknown) => {
        onError?.(error);
      },
    );
  };

  return { isCopied, copyToClipboard, resetCopied };
};
