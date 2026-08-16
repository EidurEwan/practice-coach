import { Platform } from 'react-native';

/**
 * What to call the thing the schedule is stored on.
 *
 * The handoff writes "this phone" throughout, and on iOS and Android that is
 * both accurate and warmer than "device". The same build also runs in a
 * browser, where it is simply wrong — so the word bends and the sentences
 * around it do not.
 */
export const DEVICE = Platform.OS === 'web' ? 'device' : 'phone';

/** "on this phone" / "on this device". */
export const ON_DEVICE = `on this ${DEVICE}`;
