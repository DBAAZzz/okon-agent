import * as React from "react";

export function useCopyToClipboard(resetDelay = 1500) {
  const [copiedText, setCopiedText] = React.useState<string | null>(null);

  const copy = React.useCallback(async (text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      return true;
    } catch {
      return false;
    }
  }, []);

  React.useEffect(() => {
    if (!copiedText) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopiedText(null);
    }, resetDelay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copiedText, resetDelay]);

  return {
    copiedText,
    copy,
  };
}
