/**
 * Supabase Auth 错误文案映射（各 app 传入 i18n labels）。
 *
 * @param {unknown} err
 * @param {{
 *   invalidCredentials: string;
 *   emailNotConfirmed: string;
 *   alreadyRegistered: string;
 *   passwordShort: string;
 *   invalidEmail: string;
 *   rateLimit: string;
 *   network: string;
 *   generic: string;
 * }} labels
 */
export function mapAuthErrorMessage(err, labels) {
  const msg = err?.message || '';
  if (/invalid login credentials/i.test(msg)) return labels.invalidCredentials;
  if (/email not confirmed/i.test(msg)) return labels.emailNotConfirmed;
  if (/user already registered/i.test(msg)) return labels.alreadyRegistered;
  if (/password should be at least/i.test(msg)) return labels.passwordShort;
  if (/unable to validate email|invalid email/i.test(msg)) return labels.invalidEmail;
  if (/rate limit|too many requests/i.test(msg)) return labels.rateLimit;
  if (/network|fetch/i.test(msg)) return labels.network;
  return msg || labels.generic;
}
