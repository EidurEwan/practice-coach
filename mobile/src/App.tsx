import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { backIn } from './engine/dates';
import { NavProvider, Route, showsTabs, useNav } from './nav/router';
import { AccountScreen } from './screens/Account';
import { LogScreen } from './screens/Log';
import { OnboardingScreen } from './screens/Onboarding';
import { SettingsScreen } from './screens/Settings';
import { SkillsScreen } from './screens/Skills';
import { TodayScreen } from './screens/Today';
import { UpcomingScreen } from './screens/Upcoming';
import { StoreProvider, useStore } from './store/store';
import { AuthProvider } from './sync/auth';
import { RATING_LABEL } from './theme/colors';
import { ThemeProvider, useTheme } from './theme/theme';
import { Txt } from './ui/primitives';
import { Header, TabBar, UndoToast, Wash } from './ui/shell';

/**
 * The splash stays up until the fonts and the stored schedule are both in
 * hand, so the app opens once rather than flashing an empty background and
 * then animating everything in from nothing.
 */
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 220 });

export default function App() {
  const [fontsLoaded] = useFonts({ 'Unbounded-Bold': require('../assets/fonts/Unbounded-Bold.ttf') });

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Themed ready={fontsLoaded} />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

/** Theme choice is a stored setting, so it has to hang below the store. */
function Themed({ ready }: { ready: boolean }) {
  const store = useStore();
  return (
    <ThemeProvider choice={store.doc.settings.theme} onChoice={(theme) => store.updateSettings({ theme })}>
      <AuthProvider>
        <Shell ready={ready && store.ready} />
      </AuthProvider>
    </ThemeProvider>
  );
}

function Shell({ ready }: { ready: boolean }) {
  const t = useTheme();
  const store = useStore();

  // Hand over on the frame the first screen is ready to paint, so the splash
  // cross-fades straight into content.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) {
    // Painted in the resolved theme so a chosen theme never flashes.
    return <View style={{ flex: 1, backgroundColor: t.c.bg }} />;
  }

  const initial: Route = store.doc.settings.onboarded ? { name: 'today' } : { name: 'onboarding', step: 1 };

  return (
    <NavProvider initial={initial}>
      <Routes />
    </NavProvider>
  );
}

function Routes() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { route } = nav;
  const chrome = route.name !== 'onboarding' && route.name !== 'account';

  // The undo bar is an offer, not a modal: it steps aside on its own.
  useEffect(() => {
    if (!store.undoable) return;
    const id = setTimeout(store.dismissUndo, 8000);
    return () => clearTimeout(id);
  }, [store.dismissUndo, store.undoable]);

  useEffect(() => {
    store.dismissUndo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.key]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Wash />

      {chrome ? <Header onSettings={() => nav.go({ name: 'settings' })} /> : null}

      {/* Losing the schedule is the one failure worth interrupting for. */}
      {store.loadError ? (
        <View style={{ marginHorizontal: 20, marginBottom: 8, padding: 13, borderRadius: 12, backgroundColor: t.c.redT }}>
          <Txt v="secondary" c={t.c.red} style={{ lineHeight: 19 }}>
            Could not read what is stored on this phone, so Interval has started empty. Nothing has been overwritten —
            sign in to restore from a backup, or reinstall to start again.
          </Txt>
        </View>
      ) : null}

      <View style={{ flex: 1 }} key={nav.key}>
        {route.name === 'today' ? <TodayScreen /> : null}
        {route.name === 'upcoming' ? <UpcomingScreen /> : null}
        {route.name === 'skills' ? <SkillsScreen /> : null}
        {route.name === 'log' ? <LogScreen /> : null}
        {route.name === 'settings' ? <SettingsScreen /> : null}
        {route.name === 'onboarding' ? <OnboardingScreen step={route.step} /> : null}
        {route.name === 'account' ? (
          <AccountScreen step={route.step} from={route.from} email={route.email} />
        ) : null}
      </View>

      {store.undoable ? (
        <UndoToast
          text={`${store.undoable.title} — ${RATING_LABEL[store.undoable.rating].toLowerCase()}, ${backIn(store.undoable.nextInterval)}`}
          onUndo={store.undo}
        />
      ) : null}

      {showsTabs(route) ? <TabBar dueCount={store.plan.focus.length} /> : null}
    </View>
  );
}
