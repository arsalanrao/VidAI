import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import { SettingsProvider } from './src/context/SettingsContext';
import { AppNavigator } from './src/navigation/AppNavigator';

enableScreens();

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppNavigator />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

export default App;
