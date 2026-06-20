import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors, spacing } from '../theme/colors';

export function SettingsScreen() {
  const { autoRetryEnabled, setAutoRetryEnabled, loading } = useSettings();

  return (
    <ScreenContainer>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>
        Control how VidAiPro handles errors while you are on a project screen.
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Auto-retry on error</Text>
            <Text style={styles.hint}>
              When enabled, the app waits 1 second after an error then automatically retries cloud
              video render or the full pipeline.
            </Text>
          </View>
          <Switch
            disabled={loading}
            value={autoRetryEnabled}
            onValueChange={setAutoRetryEnabled}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteTitle}>Cloud render errors</Text>
        <Text style={styles.noteText}>
          Videos render on Render using FFmpeg motion (zoom, pan, captions). If render fails, tap
          Retry video render on the project screen or enable auto-retry here.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  noteBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  noteTitle: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '700',
  },
  noteText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
