import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { Boundary } from '../Boundary';

function Explodes(): React.ReactElement {
  throw new Error('render blew up');
}

/**
 * React 19's test renderer only commits inside `act`, and `toJSON()` is null
 * until it has. Everything rendered, as one searchable string.
 */
function render(node: React.ReactElement): string {
  let tree: renderer.ReactTestRenderer | undefined;
  act(() => {
    tree = renderer.create(node);
  });
  return JSON.stringify(tree!.toJSON() ?? '');
}

describe('Boundary', () => {
  let quiet: jest.SpyInstance;
  beforeEach(() => {
    // The boundary logs the crash on purpose; keep the test output readable.
    quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => quiet.mockRestore());

  it('renders its children when nothing is wrong', () => {
    const out = render(
      <Boundary>
        <Text>All fine</Text>
      </Boundary>,
    );
    expect(out).toContain('All fine');
    expect(out).not.toContain('Interval stopped');
  });

  it('catches a render error instead of leaving a blank screen', () => {
    const out = render(
      <Boundary>
        <Explodes />
      </Boundary>,
    );
    expect(out).toContain('Interval stopped');
    expect(out).toContain('render blew up');
  });

  it('says nothing has been deleted, because nothing has', () => {
    const out = render(
      <Boundary>
        <Explodes />
      </Boundary>,
    );
    expect(out).toMatch(/still on\nthis device|still on this device/);
  });

  it('hands back the stored work, because this may be the only copy', () => {
    const doc = JSON.stringify({ topics: [{ title: 'Integration by parts' }] });
    const out = render(
      <Boundary snapshot={() => doc}>
        <Explodes />
      </Boundary>,
    );
    expect(out).toContain('Integration by parts');
  });

  it('still renders if taking the snapshot itself throws', () => {
    const out = render(
      <Boundary
        snapshot={() => {
          throw new Error('store is gone too');
        }}
      >
        <Explodes />
      </Boundary>,
    );
    expect(out).toContain('Interval stopped');
    expect(out).not.toContain('store is gone too');
  });
});
