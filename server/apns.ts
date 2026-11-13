import {sign} from 'crypto';
import http2 from 'http2';

/** One push for one device. `sandbox` picks Apple's development gateway (builds run from Xcode). */
export interface ApnsMessage {
  token: string;
  sandbox: boolean;
  /** `alert` is a normal notification; `liveactivity` updates or ends a Live Activity. */
  pushType: 'alert' | 'liveactivity';
  payload: object;
  /** A newer push with the same id replaces an undelivered older one. */
  collapseId?: string;
}

/** `unregistered`: Apple says the token is dead (app deleted, notifications revoked), so drop it. */
export type ApnsResult = 'sent' | 'unregistered' | 'failed';
export type ApnsSender = (message: ApnsMessage) => Promise<ApnsResult>;

export interface ApnsConfig {
  /** The .p8 key's PEM text. */
  key: string;
  keyId: string;
  teamId: string;
  /** The app's bundle id. */
  topic: string;
}

/**
 * Reads the APNs credentials from the environment (SST secrets in production). Returns null when
 * any is missing or the key isn't a PEM, which leaves push off: games work the same without it.
 */
export function loadApnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  // Secrets stored on one line carry their newlines as the two characters \n
  const key = env.APNS_KEY?.replace(/\\n/g, '\n').trim();
  const {APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_TOPIC: topic} = env;
  if (!key?.startsWith('-----BEGIN') || !keyId || !teamId || !topic) return null;
  return {key, keyId, teamId, topic};
}

const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/** The ES256 provider token APNs wants with every request (valid for an hour; reuse it for 50 minutes). */
export function providerToken(config: ApnsConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({alg: 'ES256', kid: config.keyId}));
  const claims = base64url(JSON.stringify({iss: config.teamId, iat: nowSeconds}));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {key: config.key, dsaEncoding: 'ieee-p1363'});
  return `${header}.${claims}.${base64url(signature)}`;
}

/** The request headers for a message: which app, what kind of push, and how Apple should treat it. */
export function requestHeaders(config: ApnsConfig, message: ApnsMessage, jwt: string) {
  return {
    ':method': 'POST',
    ':path': `/3/device/${message.token}`,
    authorization: `bearer ${jwt}`,
    'apns-push-type': message.pushType,
    'apns-topic': message.pushType === 'liveactivity' ? `${config.topic}.push-type.liveactivity` : config.topic,
    'apns-priority': '10',
    ...(message.collapseId ? {'apns-collapse-id': message.collapseId} : {}),
  };
}

const gateway = (sandbox: boolean) =>
  sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

/** A sender that talks HTTP/2 to Apple, keeping one connection per gateway open. */
export function createApnsSender(config: ApnsConfig): ApnsSender {
  const sessions = new Map<string, http2.ClientHttp2Session>();
  let cached: {jwt: string; at: number} | null = null;

  const sessionFor = (url: string) => {
    let session = sessions.get(url);
    if (!session || session.closed || session.destroyed) {
      session = http2.connect(url);
      // A dropped connection is replaced on the next push; never crash the server over it
      session.on('error', () => sessions.delete(url));
      session.on('close', () => sessions.delete(url));
      session.unref();
      sessions.set(url, session);
    }
    return session;
  };

  return message => new Promise<ApnsResult>(resolve => {
    const now = Math.floor(Date.now() / 1000);
    if (!cached || now - cached.at > 50 * 60) cached = {jwt: providerToken(config, now), at: now};
    try {
      const request = sessionFor(gateway(message.sandbox)).request(requestHeaders(config, message, cached.jwt));
      let status = 0;
      request.on('response', headers => { status = Number(headers[':status']); });
      request.on('error', () => resolve('failed'));
      request.on('close', () => resolve(status === 200 ? 'sent' : status === 410 ? 'unregistered' : 'failed'));
      request.setTimeout(10_000, () => request.close());
      request.resume();
      request.end(JSON.stringify(message.payload));
    } catch {
      resolve('failed');
    }
  });
}

let sender: ApnsSender | null = null;
let senderLoaded = false;

/** The sender for this server's credentials, or null when push isn't configured. */
export function getApnsSender(): ApnsSender | null {
  if (!senderLoaded) {
    const config = loadApnsConfig();
    sender = config ? createApnsSender(config) : null;
    senderLoaded = true;
  }
  return sender;
}

/** Lets tests capture pushes instead of calling Apple. */
export function setApnsSender(next: ApnsSender | null) {
  sender = next;
  senderLoaded = true;
}
