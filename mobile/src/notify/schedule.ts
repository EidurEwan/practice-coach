import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Day } from '../engine/dates';
import { Doc } from '../engine/types';
import { DEFAULT_REMINDERS, plannedReminders, ReminderPrefs } from './reminders';

const KEY = 'interval:reminders';

/**
 * The side of reminders that touches the operating system.
 *
 * Everything worth reasoning about — whether to say anything, and what number
 * to say — lives in `reminders.ts` and is tested there. This part only asks
 * permission, wipes what was scheduled, and lays down the replacements.
 *
 * Rescheduling wholesale on every change is deliberate. A notification that
 * survives the schedule it described is worse than no notification: rate three
 * things and the buzz you get tomorrow morning should already know.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');

let mod: NotificationsModule | null = null;
let tried = false;

/**
 * Loaded on first use, never at import.
 *
 * This is a native module, so it is absent from any build made before it was
 * added — and a top-level import of something missing takes the whole app down
 * on launch. A reminder is not worth a white screen, so it is fetched lazily,
 * once, and everything here no-ops if it is not there.
 */
function notifications(): NotificationsModule | null {
  if (tried) return mod;
  tried = true;
  if (!supported) return null;
  try {
    mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('notifications are unavailable in this build', e);
    mod = null;
  }
  return mod;
}

export async function loadPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_REMINDERS, ...JSON.parse(raw) } : DEFAULT_REMINDERS;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export async function savePrefs(prefs: ReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // A reminder preference is not worth failing a screen over.
  }
}

/** Asks only when turning them on, so the prompt has a reason attached. */
export async function ensurePermission(): Promise<boolean> {
  const Notifications = notifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Replaces every scheduled reminder with what the schedule now says. */
export async function applyReminders(doc: Doc, prefs: ReminderPrefs, from: Day): Promise<number> {
  const Notifications = notifications();
  if (!Notifications) return 0;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!prefs.enabled) return 0;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Daily reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const planned = plannedReminders(doc, prefs, from);
    for (const p of planned) {
      await Notifications.scheduleNotificationAsync({
        content: { title: p.title, body: p.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at },
      });
    }
    return planned.length;
  } catch (e) {
    console.warn('could not schedule reminders', e);
    return 0;
  }
}
