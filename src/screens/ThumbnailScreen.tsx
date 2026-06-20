import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { getProjectStatus } from '../api/client';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { POLL_INTERVAL_MS } from '../config/api';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Thumbnail'>;

export function ThumbnailScreen({ navigation, route }: Props) {
  const { projectId, thumbnailUrl, title } = route.params;
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const status = await getProjectStatus(projectId);

        if (cancelled) {
          return;
        }

        if (status.status === 'done') {
          navigation.replace('Preview', { projectId });
          return;
        }

        setRendering(status.status !== 'failed');

        if (status.status !== 'done' && status.status !== 'failed') {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
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
  }, [navigation, projectId]);

  return (
    <ScreenContainer>
      <Text style={styles.title}>Thumbnail preview</Text>
      <Text style={styles.subtitle}>
        {title ?? 'Your Short'} — we generate one thumbnail for now. Step 17 adds YouTube upload.
      </Text>

      <View style={styles.imageWrap}>
        {thumbnailUrl ? (
          <Image resizeMode="cover" source={{ uri: thumbnailUrl }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No thumbnail yet</Text>
          </View>
        )}
      </View>

      {rendering ? (
        <View style={styles.renderingRow}>
          <ActivityIndicator color={colors.accentSoft} />
          <Text style={styles.renderingText}>Still rendering video on your PC…</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <PrimaryButton
          label="Skip to preview when ready"
          variant="secondary"
          onPress={() => navigation.navigate('Preview', { projectId })}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  imageWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.textMuted,
  },
  renderingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  renderingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
});
