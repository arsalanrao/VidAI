import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fixRender,
  getProjectStatus,
  retryAudio,
  retryImages,
  retryScript,
  retryStart,
} from '../api/client';
import { PipelineSteps } from '../components/PipelineSteps';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { StepRecoveryPanel } from '../components/StepRecoveryPanel';
import { pollIntervalForStatus } from '../config/api';
import { VOICE_PRESETS } from '../constants/creativeOptions';
import type { RootStackParamList } from '../navigation/types';
import type {
  PipelineFailedStage,
  ProjectStatus,
  ProjectStatusResponse,
} from '../types/project';
import {
  formatProjectError,
  isTerminalStatus,
  resolveStepStates,
  statusLabel,
} from '../utils/pipeline';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Progress'>;

const EMPTY_COMPLETENESS = {
  script: false,
  thumbnail: false,
  scenesDone: 0,
  scenesTotal: 0,
  narration: false,
  video: false,
  percent: 0,
  uploadReady: false,
};

export function ProgressScreen({ navigation, route }: Props) {
  const { projectId } = route.params;
  const [status, setStatus] = useState<ProjectStatusResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [recoveringStep, setRecoveringStep] = useState<PipelineFailedStage | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('narrator');
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [pollEpoch, setPollEpoch] = useState(0);

  const handleDone = useCallback(async () => {
    navigation.replace('ProjectDetail', { projectId });
  }, [navigation, projectId]);

  const pollOnce = useCallback(async () => {
    const next = await getProjectStatus(projectId);
    setStatus(next);
    setPollError(null);

    if (!selectedSceneId && next.scenes?.length) {
      const blocked = next.scenes.find((scene) => !scene.hasImage) ?? next.scenes[0];
      setSelectedSceneId(blocked?.id ?? null);
    }

    if (next.status === 'done') {
      await handleDone();
      return false;
    }

    if (next.status === 'failed' || next.status === 'waiting_for_renderer') {
      return false;
    }

    return true;
  }, [projectId, handleDone, selectedSceneId]);

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
  }, [pollOnce, status?.status, pollEpoch]);

  const currentStatus = status?.status ?? 'queued';
  const completeness = status?.completeness ?? EMPTY_COMPLETENESS;
  const failedStage =
    status?.failedStage ??
    (currentStatus === 'waiting_for_renderer' ? ('render' as PipelineFailedStage) : null);

  const stepStates = useMemo(
    () =>
      resolveStepStates({
        status: currentStatus,
        failedStage,
        completeness,
      }),
    [currentStatus, failedStage, completeness],
  );

  const selectedScene = status?.scenes?.find((scene) => scene.id === selectedSceneId);

  const runRecovery = async (
    step: PipelineFailedStage,
    action: () => Promise<{ ok: boolean; message: string; status?: string }>,
  ) => {
    setRecoveringStep(step);
    setRetryMessage(null);

    try {
      const result = await action();

      if (!result.ok) {
        setRetryMessage(result.message);
        return;
      }

      setRetryMessage(result.message);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              status: (result.status ?? 'processing') as ProjectStatus,
              errorMessage: null,
              failedStage: null,
            }
          : prev,
      );
      setPollEpoch((value) => value + 1);
      await pollOnce();
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setRecoveringStep(null);
    }
  };

  const isRecovering = recoveringStep !== null;
  const showRecovery = Boolean(failedStage) && !isRecovering;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{status?.title ?? 'Creating your Short'}</Text>
          <Text style={styles.subtitle}>Project {projectId.slice(0, 8)}…</Text>
        </View>

        <View style={styles.spinnerWrap}>
          {!isTerminalStatus(currentStatus) || isRecovering ? (
            <ActivityIndicator size="large" color={colors.accentSoft} />
          ) : null}
        </View>

        <PipelineSteps stepStates={stepStates} failedStage={failedStage} />

        <Text style={styles.statusText}>{statusLabel(currentStatus)}</Text>

        {status?.errorMessage ? (
          <Text style={styles.error}>
            {formatProjectError(status.errorMessage, failedStage)}
          </Text>
        ) : null}

        {pollError ? <Text style={styles.warn}>Connection issue: {pollError}</Text> : null}

        {retryMessage ? (
          <Text
            style={[
              styles.retryMsg,
              retryMessage.toLowerCase().includes('fail') ? styles.error : styles.okMsg,
            ]}>
            {retryMessage}
          </Text>
        ) : null}

        <StepRecoveryPanel
          stepId="start"
          visible={showRecovery && failedStage === 'start'}
          loading={recoveringStep === 'start'}
          defaultValue={status?.youtubeUrl ?? ''}
          placeholder="YouTube URL (optional — change if needed)"
          onRecover={(input) =>
            runRecovery('start', () => retryStart(projectId, input || status?.youtubeUrl))
          }
        />

        <StepRecoveryPanel
          stepId="script"
          visible={showRecovery && failedStage === 'script'}
          loading={recoveringStep === 'script'}
          placeholder="How should the script change? e.g. family-friendly, focus on history, stronger hook…"
          onRecover={(input) =>
            runRecovery('script', () => retryScript(projectId, input || undefined))
          }
        />

        {showRecovery && failedStage === 'images' ? (
          <View style={styles.wrap}>
            <Text style={styles.hint}>
              Safer prompts avoid brands, violence, and weapons. Edit the scene description below.
            </Text>

            {status?.scenes && status.scenes.length > 1 ? (
              <View style={styles.scenePickRow}>
                {status.scenes.map((scene) => (
                  <PrimaryButton
                    key={scene.id}
                    label={`Scene ${scene.order + 1}${scene.hasImage ? ' ✓' : ''}`}
                    variant={selectedSceneId === scene.id ? 'primary' : 'secondary'}
                    onPress={() => setSelectedSceneId(scene.id)}
                    style={styles.scenePickBtn}
                  />
                ))}
              </View>
            ) : null}

            <StepRecoveryPanel
              stepId="images"
              visible
              loading={recoveringStep === 'images'}
              defaultValue={selectedScene?.prompt ?? ''}
              placeholder="Scene image prompt — neutral, family-friendly, vertical 9:16…"
              onRecover={(input) =>
                runRecovery('images', () =>
                  retryImages(projectId, {
                    sceneId: selectedSceneId ?? undefined,
                    promptOverride: input || undefined,
                  }),
                )
              }
            />
          </View>
        ) : null}

        {showRecovery && failedStage === 'audio' ? (
          <View style={styles.wrap}>
            <Text style={styles.hint}>Choose a different voice and retry narration.</Text>
            <View style={styles.scenePickRow}>
              {VOICE_PRESETS.map((voice) => (
                <PrimaryButton
                  key={voice.id}
                  label={voice.label}
                  variant={selectedVoice === voice.id ? 'primary' : 'secondary'}
                  onPress={() => setSelectedVoice(voice.id)}
                  style={styles.scenePickBtn}
                />
              ))}
            </View>
            <StepRecoveryPanel
              stepId="audio"
              visible
              loading={recoveringStep === 'audio'}
              showInput={false}
              placeholder=""
              onRecover={() => runRecovery('audio', () => retryAudio(projectId, selectedVoice))}
            />
          </View>
        ) : null}

        <StepRecoveryPanel
          stepId="render"
          visible={showRecovery && failedStage === 'render'}
          loading={recoveringStep === 'render'}
          showInput={false}
          placeholder=""
          onRecover={() => runRecovery('render', () => fixRender(projectId))}
        />

        <View style={styles.footer}>
          {currentStatus === 'failed' || currentStatus === 'waiting_for_renderer' ? (
            <>
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
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
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
    lineHeight: 20,
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
  wrap: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  scenePickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  scenePickBtn: {
    flexGrow: 1,
    minWidth: '30%',
  },
  footer: {
    marginTop: spacing.lg,
  },
  footerGap: {
    height: spacing.sm,
  },
});
