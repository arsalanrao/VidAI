import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, createProject } from '../api/client';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateProject'>;

export function CreateProjectScreen({ navigation }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const trimmed = url.trim();

    if (!trimmed) {
      setError('Paste a YouTube Short URL');
      return;
    }

    if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      setError('URL must be a YouTube link');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await createProject(trimmed);
      navigation.replace('Progress', { projectId: result.projectId });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not start project';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View style={styles.content}>
          <Text style={styles.title}>Paste YouTube URL</Text>
          <Text style={styles.subtitle}>
            Use a Shorts link. We will analyze it and build a new version.
          </Text>

          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://youtube.com/shorts/..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={url}
            onChangeText={setUrl}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <PrimaryButton label="Start pipeline" loading={loading} onPress={handleSubmit} />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingTop: spacing.xl,
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
  input: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  error: {
    color: colors.error,
    fontSize: 14,
  },
});
