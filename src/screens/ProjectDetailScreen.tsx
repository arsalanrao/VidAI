import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getProjectResult,
  regenerateScene,
  regenerateThumbnail,
  resumeProjectRender,
  retryAudio,
  retryPipeline,
} from '../api/client';
import { ProjectDetailContent, SceneImage } from '../components/ProjectDetailContent';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { pollIntervalForStatus } from '../config/api';
import { useAutoRetryOnError } from '../hooks/useAutoRetryOnError';
import type { RootStackParamList } from '../navigation/types';
import type { ProjectResult, SceneResult } from '../types/project';
import {
  canRetryPcRender,
  canRetryPipeline,
  formatProjectError,
  inferFailedStageFromMessage,
  isPcRenderError,
  statusLabel,
} from '../utils/pipeline';
import {
  completenessSteps,
  computeCompletenessFromResult,
} from '../utils/projectCompleteness';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>;

export function ProjectDetailScreen({ navigation, route }: Props) {
  const { projectId } = route.params;
  const [project, setProject] = useState<ProjectResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('narrator');
  const [selectedScene, setSelectedScene] = useState<SceneResult | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getProjectResult(projectId);
      setProject(result);
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : 'Could not load project');
    }
  }, [projectId]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!project || project.status === 'done' || project.status === 'failed') {
      return;
    }

    const timer = setInterval(load, pollIntervalForStatus(project.status));
    return () => clearInterval(timer);
  }, [project?.status, load]);

  useAutoRetryOnError({
    projectId,
    status: project?.status ?? 'queued',
    errorMessage: project?.errorMessage,
    onRetryStart: () => setActionLoading('auto-retry'),
    onRetryMessage: setRetryMessage,
    onReload: () => {
      setActionLoading(null);
      load();
    },
  });

  async function runAction(key: string, fn: () => Promise<{ message: string }>) {
    setActionLoading(key);
    setRetryMessage(null);

    try {
      const result = await fn();
      setRetryMessage(result.message);
      await load();
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetryPcRender() {
    setActionLoading('pc-render');
    setRetryMessage(null);

    try {
      const result = await resumeProjectRender(projectId);
      setRetryMessage(result.message);
      await load();
    } catch (err) {
      setRetryMessage(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading && !project) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentSoft} />
        </View>
      </ScreenContainer>
    );
  }

  if (!project) {
    return (
      <ScreenContainer>
        <Text style={styles.error}>{retryMessage ?? 'Project not found'}</Text>
        <PrimaryButton label="Retry load" onPress={reload} />
      </ScreenContainer>
    );
  }

  const completeness = computeCompletenessFromResult(project);
  const steps = completenessSteps(project);
  const showPcRetry =
    canRetryPcRender(project.status) || isPcRenderError(project.errorMessage);
  const showPipelineRetry = canRetryPipeline(project.status);
  const failedStage =
    project.failedStage ??
    (project.status === 'failed' || project.status === 'waiting_for_renderer'
      ? inferFailedStageFromMessage(project.errorMessage ?? '')
      : null);
  const showAudioRetry = failedStage === 'audio' && project.status === 'failed';

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.accentSoft} />
        }>
        <ProjectDetailContent
          project={project}
          completeness={completeness}
          steps={steps}
          actionLoading={actionLoading}
          retryMessage={retryMessage}
          formattedError={formatProjectError(project.errorMessage, failedStage)}
          statusText={statusLabel(project.status)}
          onRegenerateThumbnail={() =>
            runAction('thumbnail', () => regenerateThumbnail(projectId))
          }
          onRegenerateScene={(sceneId) =>
            runAction(`scene-${sceneId}`, () => regenerateScene(projectId, sceneId))
          }
          onSelectScene={setSelectedScene}
          onRetryPcRender={handleRetryPcRender}
          onRetryPipeline={() => runAction('pipeline', () => retryPipeline(projectId))}
          onRetryAudio={() =>
            runAction('audio', () => retryAudio(projectId, selectedVoice))
          }
          onUpload={() =>
            navigation.navigate('Upload', {
              projectId,
              videoUrl: project.videoUrl,
              title: project.title,
            })
          }
          showPcRetry={showPcRetry}
          showPipelineRetry={showPipelineRetry}
          showAudioRetry={showAudioRetry}
          selectedVoice={selectedVoice}
          onSelectVoice={setSelectedVoice}
        />
      </ScrollView>

      <Modal visible={selectedScene !== null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedScene(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Scene {(selectedScene?.order ?? 0) + 1}</Text>
            {selectedScene?.imageUrl ? (
              <SceneImage uri={selectedScene.imageUrl} large />
            ) : (
              <Text style={styles.modalEmpty}>No image yet</Text>
            )}
            <PrimaryButton label="Close" variant="secondary" onPress={() => setSelectedScene(null)} />
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalEmpty: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
