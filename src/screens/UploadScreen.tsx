import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

export function UploadScreen({ navigation, route }: Props) {
  const { title, videoUrl } = route.params;

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <Text style={styles.badge}>Step 17 next</Text>
        <Text style={styles.title}>Upload to YouTube</Text>
        <Text style={styles.subtitle}>
          {title ?? 'Your Short'} is ready. YouTube OAuth upload comes in the next step — videos
          will upload as Private first.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Video URL</Text>
          <Text selectable style={styles.cardValue}>
            {videoUrl ?? 'Not available yet'}
          </Text>
        </View>

        <Text style={styles.note}>
          Tell Cursor: “Do Step 17 — YouTube OAuth and upload” to wire Google sign-in here.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Create another Short" onPress={() => navigation.popToTop()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  badge: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  cardValue: {
    color: colors.text,
    fontSize: 13,
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  footer: {
    paddingBottom: spacing.lg,
  },
});
