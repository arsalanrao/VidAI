import { useEffect, useRef } from 'react';
import {
  resumeProjectRender,
  retryPipeline,
} from '../api/client';
import { useSettings } from '../context/SettingsContext';
import type { ProjectStatus } from '../types/project';
import { canRetryPcRender, canRetryPipeline, isPcRenderError } from '../utils/pipeline';

type AutoRetryInput = {
  projectId: string;
  status: ProjectStatus;
  errorMessage: string | null | undefined;
  onRetryStart?: () => void;
  onRetryMessage?: (message: string) => void;
  onReload?: () => void;
};

export function useAutoRetryOnError({
  projectId,
  status,
  errorMessage,
  onRetryStart,
  onRetryMessage,
  onReload,
}: AutoRetryInput): void {
  const { autoRetryEnabled, autoRetryDelayMs } = useSettings();
  const lastAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoRetryEnabled) {
      return;
    }

    const hasError = Boolean(errorMessage) || status === 'failed' || canRetryPcRender(status);
    if (!hasError) {
      lastAttemptRef.current = null;
      return;
    }

    const attemptKey = `${projectId}:${status}:${errorMessage ?? ''}`;
    if (lastAttemptRef.current === attemptKey) {
      return;
    }

    const timer = setTimeout(async () => {
      lastAttemptRef.current = attemptKey;
      onRetryStart?.();

      try {
        if (canRetryPcRender(status) || isPcRenderError(errorMessage)) {
          const result = await resumeProjectRender(projectId);
          onRetryMessage?.(result.message);
          if (result.ok) {
            onReload?.();
          } else {
            lastAttemptRef.current = null;
          }
          return;
        }

        if (canRetryPipeline(status)) {
          const result = await retryPipeline(projectId);
          onRetryMessage?.(result.message);
          if (result.ok) {
            onReload?.();
          } else {
            lastAttemptRef.current = null;
          }
        }
      } catch (err) {
        onRetryMessage?.(err instanceof Error ? err.message : 'Auto-retry failed');
        lastAttemptRef.current = null;
      }
    }, autoRetryDelayMs);

    return () => clearTimeout(timer);
  }, [
    autoRetryEnabled,
    autoRetryDelayMs,
    projectId,
    status,
    errorMessage,
    onRetryStart,
    onRetryMessage,
    onReload,
  ]);
}
