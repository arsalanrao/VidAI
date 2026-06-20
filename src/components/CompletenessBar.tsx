import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/colors';
import type { CompletenessStep } from '../utils/projectCompleteness';

type Props = {
  percent: number;
  steps: CompletenessStep[];
};

export function CompletenessBar({ percent, steps }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>Completeness</Text>
        <Text style={styles.percent}>{percent}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <View style={styles.steps}>
        {steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Text style={[styles.dot, step.done ? styles.dotDone : styles.dotPending]}>
              {step.done ? '✓' : '○'}
            </Text>
            <Text style={[styles.stepLabel, step.done && styles.stepDone]}>
              {step.label}
              {step.detail ? ` (${step.detail})` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  percent: {
    color: colors.accentSoft,
    fontSize: 18,
    fontWeight: '700',
  },
  track: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  steps: {
    gap: 6,
    marginTop: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 18,
    fontSize: 12,
    textAlign: 'center',
  },
  dotDone: {
    color: colors.success,
  },
  dotPending: {
    color: colors.textMuted,
  },
  stepLabel: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  stepDone: {
    color: colors.text,
  },
});
