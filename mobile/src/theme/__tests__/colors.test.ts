import { bandFor, BandTone } from '../../engine/bands';
import { bandColors } from '../colors';
import { DARK, LIGHT } from '../tokens';

const TONES: (BandTone | 'fnt')[] = ['red', 'amb', 'acc', 'grn', 'fnt'];

describe('bandColors', () => {
  // The bug this guards: a caller mapped only `grn` and `fnt` and defaulted
  // everything else to the accent, so Fragile and Learning both came out blue
  // and the band table's four steps collapsed into two.
  for (const palette of [
    { name: 'light', c: LIGHT },
    { name: 'dark', c: DARK },
  ]) {
    it(`gives every tone its own pair in ${palette.name}`, () => {
      const seen = TONES.map((tone) => bandColors(tone, palette.c));

      for (const pair of seen) {
        expect(pair.fg).toBeTruthy();
        expect(pair.bg).toBeTruthy();
      }

      const foregrounds = new Set(seen.map((p) => p.fg));
      expect(foregrounds.size).toBe(TONES.length);
    });
  }

  it('gives Fragile red and Learning amber, not the accent', () => {
    const fragile = bandFor(1);
    const learning = bandFor(5);

    expect(fragile.label).toBe('Fragile');
    expect(learning.label).toBe('Learning');

    expect(bandColors(fragile.tone, DARK).fg).toBe(DARK.red);
    expect(bandColors(learning.tone, DARK).fg).toBe(DARK.amb);
    expect(bandColors(learning.tone, DARK).fg).not.toBe(DARK.acc);
  });

  it('keeps Familiar on the accent and Strong on green', () => {
    expect(bandColors(bandFor(20).tone, LIGHT).fg).toBe(LIGHT.acc);
    expect(bandColors(bandFor(60).tone, LIGHT).fg).toBe(LIGHT.grn);
  });
});
