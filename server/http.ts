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

/**
 * Error middleware: always answers with JSON. Body-parser failures keep their own 4xx status
 * (malformed JSON is 400, an oversize body is 413); anything else is logged and becomes a 500.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
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
