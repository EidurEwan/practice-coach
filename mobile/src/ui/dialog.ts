import { Alert, Platform } from 'react-native';

/**
 * Asking and telling, on every platform the app runs on.
 *
 * `react-native-web` ships `Alert` as `class Alert { static alert() {} }` — an
 * empty function. Nothing throws, nothing warns, and every confirmation built
 * on it silently does nothing: on the web build "Erase everything" was inert,
 * and so was the message explaining a bad import.
 *
 * The browser's own dialogs are plain, but they are the platform affordance,
 * they are accessible, and they are honest. A destructive action that does
 * nothing at all is the worse outcome by a distance.
 */

const isWeb = Platform.OS === 'web';

/** Returns whether the person confirmed. Destructive callers should await it. */
export function ask(title: string, body: string, confirmLabel: string): Promise<boolean> {
  if (isWeb) {
    const ok = typeof globalThis.confirm === 'function' ? globalThis.confirm(`${title}\n\n${body}`) : false;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Says something that needs no answer — an error, usually. */
export function tell(title: string, body: string): void {
  if (isWeb) {
    if (typeof globalThis.alert === 'function') globalThis.alert(`${title}\n\n${body}`);
    else console.warn(`${title}: ${body}`);
    return;
  }
  Alert.alert(title, body);
}
