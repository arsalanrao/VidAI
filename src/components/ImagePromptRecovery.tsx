import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { colors, spacing } from '../theme/colors';

type Props = {
  blockedPrompt?: string | null;
  suggestedPrompt?: string | null;
  alternatives?: string[];
  loading: boolean;
  generating: boolean;
  onGenerateSafer: () => Promise<void>;
  onRetry: (prompt: string) => Promise<void>;
};

export function ImagePromptRecovery({
  blockedPrompt,
  suggestedPrompt,
  alternatives = [],
  loading,
  generating,
  onGenerateSafer,
  onRetry,
}: Props) {
  const initial = suggestedPrompt ?? alternatives[0] ?? blockedPrompt ?? '';
  const [prompt, setPrompt] = useState(initial);

  useEffect(() => {
    setPrompt(suggestedPrompt ?? alternatives[0] ?? blockedPrompt ?? '');
  }, [blockedPrompt, suggestedPrompt, alternatives]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Safety filter blocked this image</Text>
      <Text style={styles.hint}>
        Use the softer prompt below (auto-generated) or tap Generate softer prompt for an AI rewrite.
      </Text>

      {blockedPrompt ? (
        <View style={styles.blockedBox}>
          <Text style={styles.label}>Blocked prompt</Text>
          <Text style={styles.blockedText}>{blockedPrompt}</Text>
        </View>
      ) : null}

      {alternatives.length > 0 ? (
        <View style={styles.altRow}>
          {alternatives.map((alt) => (
            <Pressable
              key={alt.slice(0, 40)}
              style={[styles.altChip, prompt === alt && styles.altChipActive]}
              onPress={() => setPrompt(alt)}>
              <Text style={[styles.altChipText, prompt === alt && styles.altChipTextActive]}>
                Use softer #{alternatives.indexOf(alt) + 1}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Prompt to retry</Text>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Family-friendly vertical 9:16 scene, no text…"
        placeholderTextColor={colors.textMuted}
        multiline
        style={styles.input}
        editable={!loading && !generating}
      />

      <PrimaryButton
        label={generating ? 'Generating softer prompt…' : 'Generate softer prompt (AI)'}
        variant="secondary"
        loading={generating}
        disabled={loading}
        onPress={onGenerateSafer}
      />

      <PrimaryButton
        label="Retry images with this prompt"
        loading={loading}
        disabled={generating || !prompt.trim()}
        onPress={() => onRetry(prompt.trim())}
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
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  blockedBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  altRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  altChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  altChipActive: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.accent,
  },
  altChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  altChipTextActive: {
    color: '#fff',
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
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
