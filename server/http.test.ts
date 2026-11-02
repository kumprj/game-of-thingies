import {describe, expect, it, vi} from 'vitest';
import {asyncHandler, errorHandler} from './http';

const fakeRes = (headersSent = false) => {
  const res: any = {code: 0, body: undefined, headersSent};
  res.status = (c: number) => { res.code = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
};
const req: any = {method: 'GET', originalUrl: '/api/games/ABCD'};

describe('asyncHandler', () => {
  it('passes a rejected promise to next', async () => {
    const boom = new Error('dynamo down');
    const next = vi.fn();
    asyncHandler(async () => { throw boom; })(req, fakeRes(), next);
    await new Promise(r => setImmediate(r));
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('does not call next when the handler succeeds', async () => {
    const next = vi.fn();
    asyncHandler(async () => undefined)(req, fakeRes(), next);
    await new Promise(r => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('errorHandler', () => {
  it('answers 400 JSON for malformed JSON', () => {
    const res = fakeRes();
    errorHandler({type: 'entity.parse.failed', status: 400}, req, res, vi.fn());
    expect(res.code).toBe(400);
    expect(res.body).toEqual({error: 'Request body must be valid JSON'});
  });

  it('answers 413 JSON for an oversize body', () => {
    const res = fakeRes();
    errorHandler({type: 'entity.too.large', status: 413}, req, res, vi.fn());
    expect(res.code).toBe(413);
    expect(res.body).toEqual({error: 'Request body is too large'});
  });

  it('keeps other 4xx statuses from the parser', () => {
    const res = fakeRes();
    errorHandler({status: 415}, req, res, vi.fn());
    expect(res.code).toBe(415);
    expect(res.body).toEqual({error: 'Invalid request'});
  });

  it('logs and answers 500 JSON for anything else', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fakeRes();
    errorHandler(new Error('dynamo down'), req, res, vi.fn());
    expect(res.code).toBe(500);
    expect(res.body).toEqual({error: 'Something went wrong'});
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('delegates when the response has already started', () => {
    const next = vi.fn();
    const err = new Error('late');
    errorHandler(err, req, fakeRes(true), next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
