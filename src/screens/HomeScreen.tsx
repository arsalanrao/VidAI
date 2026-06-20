import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { checkApiHealth } from '../api/client';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { API_BASE_URL } from '../config/api';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    checkApiHealth().then(setApiOnline);
  }, []);

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.badge}>VidAiPro</Text>
        <Text style={styles.title}>Turn any YouTube Short into a new viral Short</Text>
        <Text style={styles.subtitle}>
          Paste a link, we rewrite the script, generate scenes, narrate, and render on your PC.
        </Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>API</Text>
        {apiOnline === null ? (
          <ActivityIndicator color={colors.accentSoft} />
        ) : (
          <Text style={[styles.statusValue, apiOnline ? styles.online : styles.offline]}>
            {apiOnline ? 'Connected' : 'Offline'} · {API_BASE_URL.replace('https://', '')}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label="Create new Short"
          onPress={() => navigation.navigate('CreateProject')}
          disabled={apiOnline === false}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  badge: {
    color: colors.accentSoft,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  online: {
    color: colors.success,
  },
  offline: {
    color: colors.error,
  },
  actions: {
    paddingBottom: spacing.lg,
  },
});
