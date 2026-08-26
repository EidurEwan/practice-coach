import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LIGHT } from '../theme/tokens';

type Props = {
  children: React.ReactNode;
  /** The stored document, as JSON, so a crash is still recoverable. */
  snapshot?: () => string;
};

type State = { error: Error | null };

/**
 * The last thing between a render error and a white screen.
 *
 * Everything a student has logged lives on their device, and until they have
 * an account this app is the only copy. A component throwing must not take
 * the route to Export with it — so the fallback carries the document itself,
 * selectable, rather than only an apology.
 *
 * It uses nothing from the app: no theme, no store, no shared primitives. A
 * crash inside the theme provider is exactly the case this exists for, and a
 * fallback that reads context would throw while trying to explain the throw.
 * Hence raw `Text`, and a palette inlined light-only.
 */
export class Boundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Interval crashed while rendering', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    let snapshot = '';
    try {
      snapshot = this.props.snapshot?.() ?? '';
    } catch {
      snapshot = '';
    }

    return (
      <View style={{ flex: 1, backgroundColor: LIGHT.bg, padding: 24, paddingTop: 72 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: LIGHT.tx, letterSpacing: -0.5 }}>
          Interval stopped
        </Text>
        <Text style={{ marginTop: 10, lineHeight: 22, color: LIGHT.mut }}>
          Something broke while drawing the screen. Nothing has been deleted — everything you have logged is still on
          this device. Reopening the app usually clears it.
        </Text>

        <View
          style={{
            marginTop: 18,
            padding: 13,
            borderRadius: 12,
            backgroundColor: LIGHT.redT,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 19, color: LIGHT.red }}>{error.message || String(error)}</Text>
        </View>

        {snapshot ? (
          <>
            <Text style={{ marginTop: 22, fontSize: 12, fontWeight: '600', letterSpacing: 0.24, color: LIGHT.fnt }}>
              YOUR WORK, IF YOU WANT A COPY
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: LIGHT.mut }}>
              Select and copy this. Settings → Import takes it back.
            </Text>
            <ScrollView
              style={{
                flex: 1,
                marginTop: 10,
                marginBottom: 24,
                padding: 12,
                borderRadius: 12,
                backgroundColor: LIGHT.surf,
              }}
            >
              <Text selectable style={{ fontSize: 11, lineHeight: 16, color: LIGHT.mut }}>
                {snapshot}
              </Text>
            </ScrollView>
          </>
        ) : null}
      </View>
    );
  }
}
