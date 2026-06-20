import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getProjectResult, getProjectStatus } from '../api/client';
import { PipelineSteps } from '../components/PipelineSteps';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { POLL_INTERVAL_MS } from '../config/api';
import type { RootStackParamList } from '../navigation/types';
import type { ProjectStatusResponse } from '../types/project';
import {
  formatProjectError,
  isTerminalStatus,
  isThumbnailReady,
  statusLabel,
} from '../utils/pipeline';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Progress'>;

export function ProgressScreen({ navigation, route }: Props) {
  const { projectId } = route.params;
  const [status, setStatus] = useState<ProjectStatusResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const handleDone = useCallback(async () => {
    const result = await getProjectResult(projectId);

    if (result.thumbnail) {
      navigation.replace('Thumbnail', {
        projectId,
        thumbnailUrl: result.thumbnail,
        title: result.title,
      });
      return;
    }

    navigation.replace('Preview', { projectId });
  }, [navigation, projectId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await getProjectStatus(projectId);

        if (cancelled) {
          return;
        }

        setStatus(next);
        setPollError(null);

        if (next.status === 'done') {
          await handleDone();
          return;
        }

        if (next.status === 'failed') {
          return;
        }

        if (isThumbnailReady(next.status) && next.status === 'narration_ready') {
          const result = await getProjectResult(projectId);
          if (!cancelled && result.thumbnail) {
            navigation.replace('Thumbnail', {
              projectId,
              thumbnailUrl: result.thumbnail,
              title: result.title,
            });
            return;
          }
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Could not reach API';
        setPollError(message);
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [projectId, handleDone, navigation]);

  const currentStatus = status?.status ?? 'queued';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{status?.title ?? 'Creating your Short'}</Text>
        <Text style={styles.subtitle}>Project {projectId.slice(0, 8)}…</Text>
      </View>

      <View style={styles.spinnerWrap}>
        {!isTerminalStatus(currentStatus) ? (
          <ActivityIndicator size="large" color={colors.accentSoft} />
        ) : null}
      </View>

      <PipelineSteps status={currentStatus} />

      <Text style={styles.statusText}>{statusLabel(currentStatus)}</Text>

      {status?.errorMessage ? (
        <Text style={styles.error}>{formatProjectError(status.errorMessage)}</Text>
      ) : null}

      {pollError ? <Text style={styles.warn}>Connection issue: {pollError}</Text> : null}

      {currentStatus === 'waiting_for_renderer' ? (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Turn on your PC, start ai-server + Cloudflare tunnel, then wait or tap retry.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
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
        {currentStatus === 'waiting_for_renderer' ? (
          <PrimaryButton
            label="Back to home"
            variant="secondary"
            onPress={() => navigation.popToTop()}
          />
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
  warn: {
    color: colors.warning,
    marginTop: spacing.sm,
    fontSize: 13,
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
