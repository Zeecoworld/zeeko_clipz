const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

const SESSION_HOURS = 12;
const REMEMBER_DAYS = 14;

const sign = (value) =>
  crypto.createHmac('sha256', process.env.APP_PASSWORD || '').update(value).digest('hex');

const sameText = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

const passwordMatches = (given) => {
  const expected = process.env.APP_PASSWORD;
  return Boolean(expected) && sameText(String(given || ''), expected);
};

const makeSession = (remember) => {
  const expiresAt = Date.now() + (remember ? REMEMBER_DAYS * 86400000 : SESSION_HOURS * 3600000);
  return { token: `${expiresAt}.${sign(`session.${expiresAt}`)}`, expiresAt };
};

const validSession = (token) => {
  const [expires, signature] = String(token || '').split('.');
  if (!expires || !signature || !process.env.APP_PASSWORD) return false;
  const expected = sign(`session.${expires}`);
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  return Number(expires) > Date.now();
};

const authorized = (event) => {
  const headers = event.headers || {};
  const bearer = String(headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && validSession(bearer)) return true;
  const given = headers['x-app-key'];
  return Boolean(given) && passwordMatches(given);
};

const supabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const tiktokMode = () => (process.env.TIKTOK_POST_MODE === 'direct' ? 'direct' : 'draft');

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|\d{1,3}(\.\d{1,3}){3}|\[.*\])$/i;

const publicUrlProblem = (link) => {
  let url;
  try {
    url = new URL(link);
  } catch (err) {
    return 'not a valid link';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'the link must start with http:// or https://';
  if (BLOCKED_HOST.test(url.hostname)) return 'the link must point to a public host';
  return null;
};

const siteUrl = () => (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');

const makeState = (platform) => {
  const base = `${platform}.${Date.now() + 10 * 60 * 1000}`;
  return `${base}.${sign(base)}`;
};

const readState = (state) => {
  const [platform, expires, signature] = String(state || '').split('.');
  if (!platform || !expires || !signature) return null;
  const expected = sign(`${platform}.${expires}`);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(expires) < Date.now()) return null;
  return platform;
};

module.exports = {
  json,
  authorized,
  passwordMatches,
  makeSession,
  supabase,
  siteUrl,
  tiktokMode,
  publicUrlProblem,
  makeState,
  readState
};
