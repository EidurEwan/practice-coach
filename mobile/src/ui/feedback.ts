import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The taps you feel rather than see.
 *
 * `expo-haptics` was already a dependency and was never once called. Rating
 * something is the action this app is built around, and it happens with a
 * thumb on a screen — a short confirmation in the hand is the cheapest way to
 * make it feel answered, and it works when you are not looking directly at the
 * phone.
 *
 * There is no haptic engine on the web and none in a simulator, so every call
 * is guarded and every failure is swallowed: feedback that throws is worse
 * than feedback that is absent.
 */
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

const fire = (run: () => Promise<void>) => {
  if (!supported) return;
  run().catch(() => undefined);
};

/** A rating landed, and the schedule moved. */
export const tapped = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Something committed that would take work to undo — a log, a new skill. */
export const committed = () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** The last thing due is done. The one moment in the day worth marking. */
export const finished = () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Taken back. Deliberately unlike `tapped`, so undo does not feel like a rating. */
export const reverted = () => fire(() => Haptics.selectionAsync());

/** It did not work, and the screen is about to say so. */
export const failed = () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
