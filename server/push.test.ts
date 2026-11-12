import {generateKeyPairSync, verify} from 'crypto';
import {describe, expect, it} from 'vitest';
import {loadApnsConfig, providerToken, requestHeaders} from './apns';
import {activityUpdate, newRoundAlert, turnAlert} from './pushPayloads';

const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve: 'P-256'});
const pem = privateKey.export({type: 'pkcs8', format: 'pem'}).toString();
const config = {key: pem, keyId: 'KEY1234567', teamId: 'TEAM123456', topic: 'com.example.App'};

describe('loadApnsConfig', () => {
  const env = {APNS_KEY: pem, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_TOPIC: 'com.example.App'};

  it('reads the credentials from the environment', () => {
    expect(loadApnsConfig(env)).toEqual({key: pem.trim(), keyId: 'K', teamId: 'T', topic: 'com.example.App'});
  });

  it('restores newlines in a key stored on one line', () => {
    expect(loadApnsConfig({...env, APNS_KEY: pem.trim().replace(/\n/g, '\\n')})?.key).toBe(pem.trim());
  });

  it.each(['APNS_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_TOPIC'])('is off without %s', name => {
    expect(loadApnsConfig({...env, [name]: undefined})).toBeNull();
  });

  it('is off when the key is a placeholder rather than a PEM', () => {
    expect(loadApnsConfig({...env, APNS_KEY: 'unset'})).toBeNull();
  });
});

describe('providerToken', () => {
  it('is an ES256 JWT with the key id and team, signed by the key', () => {
    const [header, claims, signature] = providerToken(config, 1_700_000_000).split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({alg: 'ES256', kid: 'KEY1234567'});
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({iss: 'TEAM123456', iat: 1_700_000_000});
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), {key: publicKey, dsaEncoding: 'ieee-p1363'},
        Buffer.from(signature, 'base64url'))).toBe(true);
  });
});

describe('requestHeaders', () => {
  it('sends an alert to the app topic, collapsing by game', () => {
    expect(requestHeaders(config, {token: 'abc', sandbox: false, pushType: 'alert', payload: {}, collapseId: 'ABCD'}, 'jwt'))
        .toMatchObject({
          ':path': '/3/device/abc', authorization: 'bearer jwt', 'apns-push-type': 'alert',
          'apns-topic': 'com.example.App', 'apns-collapse-id': 'ABCD',
        });
  });

  it('sends a Live Activity update to the activity topic', () => {
    const headers = requestHeaders(config, {token: 'abc', sandbox: true, pushType: 'liveactivity', payload: {}}, 'jwt');
    expect(headers['apns-push-type']).toBe('liveactivity');
    expect(headers['apns-topic']).toBe('com.example.App.push-type.liveactivity');
    expect(headers).not.toHaveProperty('apns-collapse-id');
  });
});

describe('payloads', () => {
  it('only name the game: no answers in a notification (#71)', () => {
    for (const payload of [turnAlert('ABCD'), newRoundAlert('ABCD')]) {
      const text = JSON.stringify(payload);
      expect(text).toContain('ABCD');
      expect(Object.keys(payload).sort()).toEqual(['aps', 'gameId']);
    }
  });

  it('updates a Live Activity with who is up and who is left', () => {
    expect(activityUpdate(['Ann', 'Ben'], 5_000)).toEqual({
      aps: {timestamp: 5, event: 'update', 'content-state': {currentPlayer: 'Ann', remaining: ['Ann', 'Ben']}},
    });
  });

  it('ends the Live Activity when nobody is left', () => {
    expect(activityUpdate([], 5_000).aps).toMatchObject({event: 'end', 'content-state': {currentPlayer: null, remaining: []}});
  });
});
