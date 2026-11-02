import type {NextFunction, Request, Response} from 'express';
import {MAX_QUESTION_LENGTH} from './gameSetup';

export const MAX_NAME_LENGTH = 30;
export const MAX_ANSWER_LENGTH = 200;
/** Generous cap for ids (game codes are 4 letters, entry ids are UUIDs) so junk can't reach the database. */
export const MAX_ID_LENGTH = 64;
/** Generous cap for player and host tokens (UUIDs are 36 characters). */
export const MAX_TOKEN_LENGTH = 128;
export const DEFAULT_QUESTION = 'What is your favorite thing?';

type Invalid = {ok: false; error: string};

const asRecord = (body: unknown) => (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

/** Reset's body: `question` is optional text (trimmed, within the limit); blank or missing falls back to the default. */
export function validateReset(body: unknown): {ok: true; question: string} | Invalid {
  const raw = asRecord(body).question;
  if (raw === undefined || raw === null) return {ok: true, question: DEFAULT_QUESTION};
  if (typeof raw !== 'string') return {ok: false, error: 'Question must be text'};
  const question = raw.trim();
  if (question.length > MAX_QUESTION_LENGTH) {
    return {ok: false, error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer`};
  }
  return {ok: true, question: question || DEFAULT_QUESTION};
}

/** Guess's body: both names must be text within the name limit. Values are not trimmed (they are matched exactly). */
export function validateGuess(body: unknown): {ok: true; guesserName: string; guess: string} | Invalid {
  const {guesserName, guess} = asRecord(body);
  if (typeof guesserName !== 'string' || typeof guess !== 'string') {
    return {ok: false, error: 'Guesser and guess must be text'};
  }
  if (guesserName.length > MAX_NAME_LENGTH || guess.length > MAX_NAME_LENGTH) {
    return {ok: false, error: `Names must be ${MAX_NAME_LENGTH} characters or fewer`};
  }
  return {ok: true, guesserName, guess};
}

/** Checks a trimmed player name against the name limit (used for host transfer targets). */
export function checkNameLength(name: string): string | null {
  return name.length > MAX_NAME_LENGTH ? `Name must be ${MAX_NAME_LENGTH} characters or fewer` : null;
}

/** Rejects an id or name URL param that is oversize. */
export function checkParam(name: string, value: unknown): string | null {
  const max = name === 'playerName' ? MAX_NAME_LENGTH : MAX_ID_LENGTH;
  if (typeof value !== 'string') return `Invalid ${name}`;
  if (value.length > max) return `${name} must be ${max} characters or fewer`;
  return null;
}

/** Router param handler: 400 for an oversize gameId, entryId or playerName. */
export function validateParam(_req: Request, res: Response, next: NextFunction, value: unknown, name: string) {
  const error = checkParam(name, value);
  if (error) return res.status(400).json({error});
  next();
}

/** Middleware: 400 when a token header is repeated or oversize. */
export function validateTokenHeaders(req: Request, res: Response, next: NextFunction) {
  for (const header of ['x-player-token', 'x-host-token']) {
    const value = req.headers[header];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > MAX_TOKEN_LENGTH) {
      return res.status(400).json({error: `Invalid ${header} header`});
    }
  }
  next();
}
