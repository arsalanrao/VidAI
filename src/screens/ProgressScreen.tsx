import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  getProjectStatus,
  resumeProjectRender,
} from '../api/client';
import { PipelineSteps } from '../components/PipelineSteps';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { pollIntervalForStatus } from '../config/api';
import { useAutoRetryOnError } from '../hooks/useAutoRetryOnError';
import type { RootStackParamList } from '../navigation/types';
import type { ProjectStatus, ProjectStatusResponse } from '../types/project';
import {
  canRetryPcRender,
  formatProjectError,
  isTerminalStatus,
  statusLabel,
} from '../utils/pipeline';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Progress'>;

export function ProgressScreen({ navigation, route }: Props) {
  const { projectId } = route.params;
  const [status, setStatus] = useState<ProjectStatusResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const handleDone = useCallback(async () => {
    navigation.replace('ProjectDetail', { projectId });
  }, [navigation, projectId]);

  const pollOnce = useCallback(async () => {
    const next = await getProjectStatus(projectId);
    setStatus(next);
    setPollError(null);

    if (next.status === 'done') {
      await handleDone();
      return false;
    }

    if (next.status === 'failed') {
      return false;
    }

    return true;
  }, [projectId, handleDone]);

  useAutoRetryOnError({
    projectId,
    status: status?.status ?? 'queued',
    errorMessage: status?.errorMessage,
    onRetryMessage: setRetryMessage,
    onReload: pollOnce,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const shouldContinue = await pollOnce();
        if (cancelled || !shouldContinue) {
          return;
        }

        timer = setTimeout(poll, pollIntervalForStatus(status?.status));
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Could not reach API';
        setPollError(message);
        timer = setTimeout(poll, pollIntervalForStatus(status?.status));
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pollOnce, status?.status]);

  const handleRetryPcRender = async () => {
    setRetrying(true);
    setRetryMessage(null);

    try {
      const result = await resumeProjectRender(projectId);

      if (!result.ok) {
        setRetryMessage(result.message);
        return;
      }

      setRetryMessage(result.message);
      setStatus((prev) =>
        prev
          ? { ...prev, status: 'rendering' as ProjectStatus, errorMessage: null }
          : prev,
      );
      await pollOnce();
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const currentStatus = status?.status ?? 'queued';
  const showRetry = canRetryPcRender(currentStatus);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{status?.title ?? 'Creating your Short'}</Text>
        <Text style={styles.subtitle}>Project {projectId.slice(0, 8)}…</Text>
      </View>

      <View style={styles.spinnerWrap}>
        {!isTerminalStatus(currentStatus) || retrying ? (
          <ActivityIndicator size="large" color={colors.accentSoft} />
        ) : null}
      </View>

      <PipelineSteps status={currentStatus} />

      <Text style={styles.statusText}>{statusLabel(currentStatus)}</Text>

      {status?.errorMessage ? (
        <Text style={styles.error}>{formatProjectError(status.errorMessage)}</Text>
      ) : null}

      {pollError ? <Text style={styles.warn}>Connection issue: {pollError}</Text> : null}

      {retryMessage ? (
        <Text style={[styles.retryMsg, retryMessage.includes('offline') ? styles.error : styles.okMsg]}>
          {retryMessage}
        </Text>
      ) : null}

      {showRetry ? (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Script, images, and narration are already saved. Retry re-runs cloud FFmpeg motion render.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        {showRetry ? (
          <>
            <PrimaryButton
              label="Retry video render"
              loading={retrying}
              onPress={handleRetryPcRender}
            />
            <View style={styles.footerGap} />
            <PrimaryButton
              label="View project details"
              variant="secondary"
              onPress={() => navigation.navigate('ProjectDetail', { projectId })}
            />
            <View style={styles.footerGap} />
            <PrimaryButton
              label="Back to home"
              variant="secondary"
              onPress={() => navigation.popToTop()}
            />
          </>
        ) : null}

        {currentStatus === 'failed' ? (
          <>
            <PrimaryButton
              label="Try another URL"
              onPress={() => navigation.replace('CreateProject')}
            />
            <View style={styles.footerGap} />
            <PrimaryButton
              label="Back to home"
              variant="secondary"
              onPress={() => navigation.popToTop()}
            />
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  spinnerWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  statusText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    marginTop: spacing.md,
    fontSize: 14,
  },
  okMsg: {
    color: colors.success,
  },
  warn: {
    color: colors.warning,
    marginTop: spacing.sm,
    fontSize: 13,
  },
  retryMsg: {
    marginTop: spacing.md,
    fontSize: 14,
    lineHeight: 20,
  },
  hintBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: spacing.lg,
  },
  footerGap: {
    height: spacing.sm,
  },
});
