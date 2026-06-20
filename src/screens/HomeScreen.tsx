import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { checkApiHealth, deleteProject, listProjects } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  function confirmDeleteProject(item: ProjectListItem) {
    setDeleteError(null);
    setDeleteTarget(item);
  }

  function closeDeleteDialog() {
    if (deletingId) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function handleDeleteProject() {
    if (!deleteTarget) {
      return;
    }

    const projectId = deleteTarget.id;
    setDeletingId(projectId);
    setDeleteError(null);

    try {
      await deleteProject(projectId);
      setProjects((current) => current.filter((item) => item.id !== projectId));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this project');
    } finally {
      setDeletingId(null);
    }
  }

  function renderProject({ item }: { item: ProjectListItem }) {
    const incomplete = isProjectIncomplete(item.status);
    const hasError = Boolean(item.errorMessage);
    const canWatch = item.status === 'done' && Boolean(item.videoUrl);
    const completeness = item.completeness ?? { percent: 0, scenesDone: 0, scenesTotal: 0 };
    const isDeleting = deletingId === item.id;

    return (
      <Pressable
        style={[styles.projectCard, hasError && styles.projectCardError]}
        onPress={() => openProject(item)}
        disabled={isDeleting}>
        <View style={styles.cardRow}>
          {item.thumbnail ? (
            <Image resizeMode="cover" source={{ uri: item.thumbnail }} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbPlaceholderText}>No thumb</Text>
            </View>
          )}

          <View style={styles.cardBody}>
            <View style={styles.projectHeader}>
              <Text style={styles.projectTitle} numberOfLines={2}>
                {item.title ?? 'Untitled Short'}
              </Text>
              <View style={styles.headerActions}>
                <Text style={styles.projectPercent}>{completeness.percent}%</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => confirmDeleteProject(item)}
                  disabled={isDeleting}
                  style={styles.deleteBtn}>
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <Text style={styles.deleteText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            </View>
            <Text style={styles.projectStatus}>{statusLabel(item.status)}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${completeness.percent}%` }]} />
            </View>
            <Text style={styles.projectMeta}>
              {completeness.scenesDone}/{completeness.scenesTotal} scenes
              {canWatch ? ' · Tap to watch' : incomplete ? ' · Tap to continue' : ' · Complete'}
            </Text>
            {hasError ? (
              <Text style={styles.projectError} numberOfLines={2}>
                {item.errorMessage}
              </Text>
            ) : null}
          </View>
        </View>
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

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this project?"
        projectTitle={deleteTarget?.title ?? 'Untitled Short'}
        message="This permanently removes the project from your account, clears queued jobs in Upstash, and deletes all images, audio, and video from Cloudflare R2 storage."
        error={deleteError}
        confirmLabel="Delete permanently"
        loading={deletingId !== null}
        onCancel={closeDeleteDialog}
        onConfirm={handleDeleteProject}
      />
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
  },
  projectCardError: {
    borderColor: colors.error,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: 72,
    height: 96,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
  thumbPlaceholder: {
    width: 72,
    height: 96,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbPlaceholderText: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  deleteBtn: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  deleteText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '700',
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
