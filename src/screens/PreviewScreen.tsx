import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video from 'react-native-video';
import { getProjectResult } from '../api/client';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import type { RootStackParamList } from '../navigation/types';
import type { ProjectResult } from '../types/project';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Preview'>;

export function PreviewScreen({ navigation, route }: Props) {
  const { projectId } = route.params;
  const [project, setProject] = useState<ProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getProjectResult(projectId);
      setProject(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentSoft} />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !project) {
    return (
      <ScreenContainer>
        <Text style={styles.error}>{error ?? 'Project not found'}</Text>
        <PrimaryButton label="Retry" onPress={load} />
      </ScreenContainer>
    );
  }

  const stillRendering = project.status !== 'done';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{project.title ?? 'Your new Short'}</Text>
        <Text style={styles.status}>
          {stillRendering ? 'Rendering… check back in a few minutes' : 'Ready to watch'}
        </Text>

        {project.thumbnail ? (
          <Image resizeMode="cover" source={{ uri: project.thumbnail }} style={styles.thumb} />
        ) : null}

        {project.videoUrl && !stillRendering ? (
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
        ) : (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>
              {stillRendering
                ? 'Video will appear here when cloud FFmpeg render finishes.'
                : 'No video URL yet.'}
            </Text>
          </View>
        )}

        {project.videoUrl ? (
          <PrimaryButton
            label="Open in browser"
            variant="secondary"
            onPress={() => Linking.openURL(project.videoUrl!)}
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Continue to upload"
          disabled={stillRendering || !project.videoUrl}
          onPress={() =>
            navigation.navigate('Upload', {
              projectId,
              videoUrl: project.videoUrl,
              title: project.title,
            })
          }
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  thumb: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 220,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  videoWrap: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 420,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  pendingBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
  footer: {
    paddingBottom: spacing.lg,
  },
});
