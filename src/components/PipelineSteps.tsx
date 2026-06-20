import { StyleSheet, Text, View } from 'react-native';
import {
  DETAILED_PIPELINE_STEPS,
  type PipelineFailedStage,
  type StepVisualState,
} from '../utils/pipeline';
import { colors, spacing } from '../theme/colors';

type Props = {
  stepStates: StepVisualState[];
  failedStage?: PipelineFailedStage | null;
};

export function PipelineSteps({ stepStates, failedStage }: Props) {
  return (
    <View style={styles.wrap}>
      {DETAILED_PIPELINE_STEPS.map((step, index) => {
        const state = stepStates[index] ?? 'pending';
        const isFailed = state === 'failed' || failedStage === step.id;

        return (
          <View key={step.id} style={styles.row}>
            <View
              style={[
                styles.dot,
                state === 'done' && styles.dotDone,
                state === 'active' && styles.dotActive,
                isFailed && styles.dotFailed,
                state === 'pending' && styles.dotUpcoming,
              ]}
            />
            <Text
              style={[
                styles.label,
                state === 'done' && styles.labelDone,
                state === 'active' && styles.labelActive,
                isFailed && styles.labelFailed,
                state === 'pending' && styles.labelUpcoming,
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
  labelFailed: {
    color: colors.error,
    fontWeight: '600',
  },
  labelUpcoming: {
    color: colors.textMuted,
  },
});
