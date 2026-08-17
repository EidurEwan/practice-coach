import { authError } from '../authError';

describe('authError', () => {
  it('turns a broken mail server into something the person can act on', () => {
    // Exactly what the hosted project returns today.
    const raw = { code: 500, error_code: 'unexpected_failure', msg: 'Error sending confirmation email', message: 'Error sending confirmation email' };
    const out = authError(raw);

    expect(out.serverSide).toBe(true);
    expect(out.message).toMatch(/nothing you did/i);
    expect(out.message).toMatch(/without an account/i);
    // The raw string named a server and offered no way forward.
    expect(out.message).not.toMatch(/^Error sending confirmation email$/);
  });

  it('separates what the person can fix from what they cannot', () => {
    expect(authError({ message: 'User already registered' }).serverSide).toBe(false);
    expect(authError({ message: 'Invalid login credentials' }).serverSide).toBe(false);
    expect(authError({ message: 'Token has expired or is invalid' }).serverSide).toBe(false);

    expect(authError({ error_code: 'over_email_send_rate_limit', message: 'rate limit exceeded' }).serverSide).toBe(true);
    expect(authError({ message: 'Network request failed' }).serverSide).toBe(true);
  });

  it('points an existing address at sign-in rather than repeating the form', () => {
    expect(authError({ message: 'User already registered' }).message).toMatch(/sign in/i);
  });

  it('tells someone with a stale code to ask for another', () => {
    expect(authError({ message: 'Token has expired or is invalid' }).message).toMatch(/new one/i);
  });

  it('keeps an unmapped message rather than inventing one', () => {
    expect(authError({ message: 'Some future failure' }).message).toBe('Some future failure');
  });

  it('survives the shapes Supabase actually throws', () => {
    expect(authError(new Error('Invalid login credentials')).message).toMatch(/do not match/i);
    expect(authError(null).message).toBeTruthy();
    expect(authError(undefined).message).toBeTruthy();
  });
});
