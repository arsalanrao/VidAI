import { StyleSheet, Text, View } from 'react-native';
import { PIPELINE_STEPS, stepIndexForStatus } from '../utils/pipeline';
import type { ProjectStatus } from '../types/project';
import { colors, spacing } from '../theme/colors';

type Props = {
  status: ProjectStatus;
};

export function PipelineSteps({ status }: Props) {
  const activeIndex = stepIndexForStatus(status);
  const failed = status === 'failed';

  return (
    <View style={styles.wrap}>
      {PIPELINE_STEPS.map((step, index) => {
        const done = index < activeIndex || status === 'done';
        const active = index === activeIndex && !failed;
        const upcoming = index > activeIndex;

        return (
          <View key={step.id} style={styles.row}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
                failed && active && styles.dotFailed,
                upcoming && styles.dotUpcoming,
              ]}
            />
            <Text
              style={[
                styles.label,
                done && styles.labelDone,
                active && styles.labelActive,
                upcoming && styles.labelUpcoming,
              ]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  dotDone: {
    backgroundColor: colors.success,
  },
  dotActive: {
    backgroundColor: colors.accentSoft,
  },
  dotFailed: {
    backgroundColor: colors.error,
  },
  dotUpcoming: {
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    color: colors.textMuted,
    fontSize: 15,
    flex: 1,
  },
  labelDone: {
    color: colors.text,
  },
  labelActive: {
    color: colors.accentSoft,
    fontWeight: '600',
  },
  labelUpcoming: {
    color: colors.textMuted,
  },
});
