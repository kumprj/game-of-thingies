import {UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {getApnsSender} from './apns';
import type {ApnsMessage, ApnsSender} from './apns';
import {ddb, tables} from './db';
import type {ApnsToken, GameItem} from './models';
import {activityUpdate, newRoundAlert, turnAlert} from './pushPayloads';

type TokenMap = 'pushTokens' | 'activityTokens';

/** Drops a token Apple said is dead, unless the device has registered a fresh one since. */
async function forget(gameId: string, map: TokenMap, name: string, dead: ApnsToken) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: tables.games,
      Key: {gameId},
      UpdateExpression: `REMOVE ${map}.#p`,
      ConditionExpression: `${map}.#p.#t = :dead`,
      ExpressionAttributeNames: {'#p': name, '#t': 'token'},
      ExpressionAttributeValues: {':dead': dead.token},
    }));
  } catch (err) {
    if ((err as {name?: string})?.name !== 'ConditionalCheckFailedException') {
      console.error('Failed to drop a dead push token:', err);
    }
  }
}

/** Sends one message per registered token (`only` limits it to one player). Never throws. */
async function deliver(
  send: ApnsSender, game: GameItem, map: TokenMap, build: (token: ApnsToken) => ApnsMessage, only?: string
) {
  const tokens = Object.entries(game[map] ?? {}).filter(([name]) => !only || name === only.toLowerCase());
  await Promise.all(tokens.map(async ([name, token]) => {
    try {
      if (await send(build(token)) === 'unregistered') await forget(game.gameId, map, name, token);
    } catch (err) {
      console.error('Push failed:', err);
    }
  }));
}

/**
 * The turn passed to turnOrder[0]: notify that player, and move every Live Activity along. Runs in
 * the background and does nothing when push isn't configured, so a game never waits on Apple.
 * Skipped for the alert when the same player is still up (e.g. the host skipped the last player).
 */
export function notifyTurn(game: GameItem, nextOrder: string[]) {
  const send = getApnsSender();
  if (!send) return;
  const next = nextOrder[0];
  if (next && next !== game.turnOrder?.[0]) {
    void deliver(send, game, 'pushTokens', t => ({
      token: t.token, sandbox: t.sandbox, pushType: 'alert', payload: turnAlert(game.gameId), collapseId: game.gameId,
    }), next);
  }
  void deliver(send, game, 'activityTokens', t => ({
    token: t.token, sandbox: t.sandbox, pushType: 'liveactivity', payload: activityUpdate(nextOrder),
  }));
}

/** The host started a new round: tell every registered player, and end last round's Live Activities. */
export function notifyNewRound(game: GameItem) {
  const send = getApnsSender();
  if (!send) return;
  void deliver(send, game, 'pushTokens', t => ({
    token: t.token, sandbox: t.sandbox, pushType: 'alert', payload: newRoundAlert(game.gameId), collapseId: game.gameId,
  }));
  void deliver(send, game, 'activityTokens', t => ({
    token: t.token, sandbox: t.sandbox, pushType: 'liveactivity', payload: activityUpdate([]),
  }));
}
