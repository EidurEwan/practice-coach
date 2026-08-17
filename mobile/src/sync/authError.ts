/**
 * Supabase's auth errors are written for whoever configured the project, not
 * for the person holding the phone. "Error sending confirmation email" is a
 * true statement about a server and a dead end for a student — it names
 * nothing they did and nothing they can do.
 *
 * Each case here answers two questions the raw string does not: is this my
 * fault, and what do I do now. The fallback keeps the original text rather
 * than inventing one, so an unmapped failure is still diagnosable.
 */

export type AuthFailure = {
  message: string;
  /** True when the account is unreachable for reasons on the server's side. */
  serverSide: boolean;
};

type Raw = { message?: string; code?: string; error_code?: string; status?: number };

export function authError(cause: unknown): AuthFailure {
  const o = (cause ?? {}) as Raw;
  const text = (o.message || (cause instanceof Error ? cause.message : String(cause)) || '').trim();
  const code = o.error_code || o.code || '';
  const hay = `${code} ${text}`.toLowerCase();

  // The project cannot send mail at all — bad SMTP, or none configured. No
  // amount of retrying or trying another address gets past this.
  if (hay.includes('error sending') || hay.includes('unexpected_failure')) {
    return {
      serverSide: true,
      message:
        'The confirmation code could not be sent — email is not working on the server yet, which is nothing you did. You can keep using Interval without an account; everything is kept on this device.',
    };
  }

  if (hay.includes('rate limit') || hay.includes('over_email_send')) {
    return {
      serverSide: true,
      message: 'Too many codes have been sent in a short time. Wait a few minutes and ask for another.',
    };
  }

  if (hay.includes('already registered') || hay.includes('user_already_exists')) {
    return { serverSide: false, message: 'That address already has an account — sign in instead.' };
  }

  if (hay.includes('invalid login') || hay.includes('invalid_credentials')) {
    return { serverSide: false, message: 'That email and password do not match an account.' };
  }

  if (hay.includes('expired') || hay.includes('otp_expired') || hay.includes('invalid token')) {
    return { serverSide: false, message: 'That code has expired or is not right. Ask for a new one.' };
  }

  if (hay.includes('email not confirmed') || hay.includes('email_not_confirmed')) {
    return { serverSide: false, message: 'This account still needs confirming. Check your inbox for the six-digit code.' };
  }

  if (hay.includes('network') || hay.includes('fetch')) {
    return {
      serverSide: true,
      message: 'Could not reach the server. Interval carries on offline — this will sort itself out when you are back online.',
    };
  }

  return { serverSide: false, message: text || 'Something went wrong. Try again.' };
}
