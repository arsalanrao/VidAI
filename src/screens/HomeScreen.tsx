import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { checkApiHealth, listProjects } from '../api/client';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { API_BASE_URL } from '../config/api';
import type { RootStackParamList } from '../navigation/types';
import type { ProjectListItem } from '../types/project';
import { isProjectIncomplete, statusLabel } from '../utils/pipeline';
import { colors, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const items = await listProjects();
      setProjects(items);
    } catch {
      setProjects([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const online = await checkApiHealth();
    setApiOnline(online);
    if (online) {
      await loadProjects();
    }
    setRefreshing(false);
    setLoading(false);
  }, [loadProjects]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openProject(item: ProjectListItem) {
    if (isProjectIncomplete(item.status) && ['queued', 'processing'].includes(item.status)) {
      navigation.navigate('Progress', { projectId: item.id });
      return;
    }

    navigation.navigate('ProjectDetail', { projectId: item.id });
  }

  function renderProject({ item }: { item: ProjectListItem }) {
    const incomplete = isProjectIncomplete(item.status);
    const hasError = Boolean(item.errorMessage);

    return (
      <Pressable
        style={[styles.projectCard, hasError && styles.projectCardError]}
        onPress={() => openProject(item)}>
        <View style={styles.projectHeader}>
          <Text style={styles.projectTitle} numberOfLines={2}>
            {item.title ?? 'Untitled Short'}
          </Text>
          <Text style={styles.projectPercent}>{item.completeness.percent}%</Text>
        </View>
        <Text style={styles.projectStatus}>{statusLabel(item.status)}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${item.completeness.percent}%` }]} />
        </View>
        <Text style={styles.projectMeta}>
          {item.completeness.scenesDone}/{item.completeness.scenesTotal} scenes
          {incomplete ? ' · Tap to continue' : ' · Complete'}
        </Text>
        {hasError ? (
          <Text style={styles.projectError} numberOfLines={2}>
            {item.errorMessage}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.topRow}>
        <View style={styles.heroCompact}>
          <Text style={styles.badge}>VidAiPro</Text>
          <Text style={styles.title}>Your Shorts</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
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

      {loading ? (
        <ActivityIndicator color={colors.accentSoft} style={styles.loader} />
      ) : (
        <FlatList
          style={styles.listFlex}
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={renderProject}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentSoft} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No projects yet. Create your first Short below.</Text>
          }
          contentContainerStyle={styles.list}
        />
      )}

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
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  heroCompact: {
    flex: 1,
    gap: spacing.xs,
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
    fontWeight: '800',
  },
  settingsBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  settingsText: {
    color: colors.accentSoft,
    fontSize: 15,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
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
  loader: {
    marginTop: spacing.lg,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  projectCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  projectCardError: {
    borderColor: colors.error,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  projectTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  projectPercent: {
    color: colors.accentSoft,
    fontWeight: '700',
    fontSize: 16,
  },
  projectStatus: {
    color: colors.textMuted,
    fontSize: 13,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  projectMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  projectError: {
    color: colors.error,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  actions: {
    paddingVertical: spacing.md,
  },
});
