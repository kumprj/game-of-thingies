import type {Server} from 'socket.io';
import type {NextFunction, Request, RequestHandler, Response} from 'express';

/**
 * Wraps an async route handler so a rejection reaches the error middleware. Express 4 does not
 * catch rejected promises itself, so without this a failed DynamoDB call would hang the request.
 */
export function asyncHandler(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** The shape of errors this handler reads (body-parser and AWS SDK errors carry some of these). */
type HttpError = Partial<Error> & {status?: number; statusCode?: number; type?: string};

/** The Socket.IO server app.ts stored with `app.set('io', io)`. */
export function getIo(req: Request): Server {
  return req.app.get('io');
}

/**
 * Error middleware: always answers with JSON. Body-parser failures keep their own 4xx status
 * (malformed JSON is 400, an oversize body is 413); anything else is logged and becomes a 500.
 */
export function errorHandler(err: HttpError, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  const status = Number(err?.status ?? err?.statusCode);
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({error: 'Request body must be valid JSON'});
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({error: 'Request body is too large'});
  }
  if (status >= 400 && status < 500) {
    return res.status(status).json({error: 'Invalid request'});
  }
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({error: 'Something went wrong'});
}
