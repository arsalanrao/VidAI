import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateProjectScreen } from '../screens/CreateProjectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PreviewScreen } from '../screens/PreviewScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ThumbnailScreen } from '../screens/ThumbnailScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export function AppNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen
          component={HomeScreen}
          name="Home"
          options={{ headerShown: false }}
        />
        <Stack.Screen component={SettingsScreen} name="Settings" options={{ title: 'Settings' }} />
        <Stack.Screen
          component={CreateProjectScreen}
          name="CreateProject"
          options={{ title: 'New Short' }}
        />
        <Stack.Screen
          component={ProgressScreen}
          name="Progress"
          options={{ title: 'Progress', headerBackVisible: false }}
        />
        <Stack.Screen
          component={ProjectDetailScreen}
          name="ProjectDetail"
          options={{ title: 'Project' }}
        />
        <Stack.Screen
          component={ThumbnailScreen}
          name="Thumbnail"
          options={{ title: 'Thumbnail' }}
        />
        <Stack.Screen
          component={PreviewScreen}
          name="Preview"
          options={{ title: 'Preview' }}
        />
        <Stack.Screen
          component={UploadScreen}
          name="Upload"
          options={{ title: 'Upload' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
