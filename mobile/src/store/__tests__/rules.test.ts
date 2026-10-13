import { skill } from '../../engine/__tests__/factory';
import { keptSubSkill, nextHue } from '../rules';

describe('a new skill colour', () => {
  test('follows the highest in use, so deleting one does not hand its colour on', () => {
    // Three skills were made (0, 1, 2) and the middle one deleted.
    expect(nextHue([skill({ hue_index: 0 }), skill({ hue_index: 2 })])).toBe(3);
  });

  test('counts archived skills too, since they keep their colour', () => {
    expect(nextHue([skill({ hue_index: 4, archived_at: '2026-10-01T00:00:00.000Z' })])).toBe(5);
  });

  test('starts at the first colour', () => {
    expect(nextHue([])).toBe(0);
  });
});

describe('re-logging a topic', () => {
  test('keeps its sub-skill when none is typed', () => {
    expect(keptSubSkill('', 'Choosing u and dv')).toBe('Choosing u and dv');
    expect(keptSubSkill('   ', 'Choosing u and dv')).toBe('Choosing u and dv');
    expect(keptSubSkill(undefined, 'Choosing u and dv')).toBe('Choosing u and dv');
  });

  test('takes a new one when one is typed', () => {
    expect(keptSubSkill(' Limits ', 'Choosing u and dv')).toBe('Limits');
  });
});
