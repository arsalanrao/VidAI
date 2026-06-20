import { Image, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import { PrimaryButton } from './PrimaryButton';
import { CompletenessBar } from './CompletenessBar';
import type { ProjectCompleteness } from '../types/project';
import type { ProjectResult, SceneResult } from '../types/project';
import type { CompletenessStep } from '../utils/projectCompleteness';
import { colors, spacing } from '../theme/colors';

type Props = {
  project: ProjectResult;
  completeness: ProjectCompleteness;
  steps: CompletenessStep[];
  actionLoading: string | null;
  retryMessage: string | null;
  formattedError: string | null;
  statusText: string;
  showPcRetry: boolean;
  showPipelineRetry: boolean;
  onRegenerateThumbnail: () => void;
  onRegenerateScene: (sceneId: string) => void;
  onSelectScene: (scene: SceneResult) => void;
  onRetryPcRender: () => void;
  onRetryPipeline: () => void;
  onUpload: () => void;
};

export function SceneImage({ uri, large }: { uri: string; large?: boolean }) {
  return (
    <Image
      resizeMode="cover"
      source={{ uri }}
      style={[styles.sceneImage, large && styles.sceneImageLarge]}
    />
  );
}

export function ProjectDetailContent({
  project,
  completeness,
  steps,
  actionLoading,
  retryMessage,
  formattedError,
  statusText,
  showPcRetry,
  showPipelineRetry,
  onRegenerateThumbnail,
  onRegenerateScene,
  onSelectScene,
  onRetryPcRender,
  onRetryPipeline,
  onUpload,
}: Props) {
  const canRegenAssets = Boolean(project.title);

  return (
    <View style={styles.scroll}>
      <Text style={styles.title}>{project.title ?? 'Untitled Short'}</Text>
      <Text style={styles.status}>{statusText}</Text>

      <CompletenessBar percent={completeness.percent} steps={steps} />

      {formattedError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{formattedError}</Text>
          {showPcRetry ? (
            <PrimaryButton
              label="Retry video render"
              loading={actionLoading === 'pc-render' || actionLoading === 'auto-retry'}
              onPress={onRetryPcRender}
            />
          ) : null}
          {showPipelineRetry ? (
            <View style={styles.btnGap}>
              <PrimaryButton
                label="Retry cloud pipeline"
                loading={actionLoading === 'pipeline'}
                variant="secondary"
                onPress={onRetryPipeline}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {retryMessage ? (
        <Text
          style={[
            styles.retryMsg,
            retryMessage.toLowerCase().includes('fail') || retryMessage.includes('502')
              ? styles.retryErr
              : styles.retryOk,
          ]}>
          {retryMessage}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Thumbnail</Text>
        {project.thumbnail ? (
          <Image resizeMode="cover" source={{ uri: project.thumbnail }} style={styles.thumbnail} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Not generated yet</Text>
          </View>
        )}
        <PrimaryButton
          label="Regenerate thumbnail"
          variant="secondary"
          disabled={!canRegenAssets}
          loading={actionLoading === 'thumbnail'}
          onPress={onRegenerateThumbnail}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Title & description</Text>
        <Text style={styles.metaTitle}>{project.title ?? '—'}</Text>
        {project.hook ? <Text style={styles.hook}>{project.hook}</Text> : null}
        <Text style={styles.description}>
          {project.description?.trim() || 'Description will appear after script generation.'}
        </Text>
        {project.tags && project.tags.length > 0 ? (
          <Text style={styles.tags}>{project.tags.map((t) => `#${t}`).join(' ')}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Scenes ({completeness.scenesDone}/{completeness.scenesTotal})
        </Text>
        {(project.scenes ?? []).map((scene) => {
          const complete = scene.complete ?? Boolean(scene.imageUrl);

          return (
            <View key={scene.id} style={styles.sceneCard}>
              <Text style={styles.sceneLabel}>Scene {scene.order + 1}</Text>
              {scene.imageUrl ? (
                <SceneImage uri={scene.imageUrl} />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>Missing image</Text>
                </View>
              )}
              <Text style={styles.scenePrompt} numberOfLines={2}>
                {scene.prompt}
              </Text>
              <View style={styles.sceneActions}>
                {scene.imageUrl ? (
                  <PrimaryButton
                    label="View full"
                    variant="secondary"
                    onPress={() => onSelectScene(scene)}
                  />
                ) : null}
                {!complete ? (
                  <PrimaryButton
                    label="Generate scene"
                    loading={actionLoading === `scene-${scene.id}`}
                    onPress={() => onRegenerateScene(scene.id)}
                  />
                ) : (
                  <PrimaryButton
                    label="Regenerate"
                    variant="secondary"
                    loading={actionLoading === `scene-${scene.id}`}
                    onPress={() => onRegenerateScene(scene.id)}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Voice narration</Text>
        {project.narrationUrl ? (
          <View style={styles.audioWrap}>
            <Video
              controls
              paused
              repeat={false}
              source={{ uri: project.narrationUrl }}
              style={styles.audioPlayer}
            />
          </View>
        ) : (
          <Text style={styles.placeholderText}>Narration not ready yet</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Final video</Text>
        {project.videoUrl && project.status === 'done' ? (
          <>
            <View style={styles.videoWrap}>
              <Video
                controls
                paused={false}
                repeat
                resizeMode="contain"
                source={{ uri: project.videoUrl }}
                style={styles.video}
              />
            </View>
            <PrimaryButton label="Upload to YouTube" onPress={onUpload} />
          </>
        ) : (
          <>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {showPcRetry
                  ? 'Cloud render failed. Use Retry video render above.'
                  : 'Video appears here when cloud FFmpeg render completes.'}
              </Text>
            </View>
            {showPcRetry ? (
              <PrimaryButton
                label="Retry video render"
                loading={actionLoading === 'pc-render'}
                onPress={onRetryPcRender}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  status: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.error,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorTitle: {
    color: colors.error,
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  btnGap: {
    marginTop: spacing.xs,
  },
  retryMsg: {
    fontSize: 14,
    lineHeight: 20,
  },
  retryOk: {
    color: colors.success,
  },
  retryErr: {
    color: colors.warning,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 280,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  placeholder: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  metaTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  hook: {
    color: colors.accentSoft,
    fontSize: 15,
    fontStyle: 'italic',
  },
  description: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  tags: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sceneCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sceneLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  sceneImage: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 200,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  sceneImageLarge: {
    maxHeight: 420,
  },
  scenePrompt: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sceneActions: {
    gap: spacing.sm,
  },
  audioWrap: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    minHeight: 64,
  },
  audioPlayer: {
    width: '100%',
    height: 64,
  },
  videoWrap: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 400,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
