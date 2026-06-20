import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import type { PipelineFailedStage } from '../utils/pipeline';
import { recoveryButtonLabel, recoveryHint } from '../utils/pipeline';
import { colors, spacing } from '../theme/colors';

type Props = {
  stepId: PipelineFailedStage;
  visible: boolean;
  loading: boolean;
  defaultValue?: string;
  placeholder: string;
  showInput?: boolean;
  multiline?: boolean;
  onRecover: (input: string) => Promise<void>;
};

export function StepRecoveryPanel({
  stepId,
  visible,
  loading,
  defaultValue = '',
  placeholder,
  showInput = true,
  multiline = true,
  onRecover,
}: Props) {
  const [value, setValue] = useState(defaultValue);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>{recoveryHint(stepId)}</Text>

      {showInput ? (
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline]}
          editable={!loading}
        />
      ) : null}

      <PrimaryButton
        label={recoveryButtonLabel(stepId)}
        loading={loading}
        onPress={() => onRecover(value.trim())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
