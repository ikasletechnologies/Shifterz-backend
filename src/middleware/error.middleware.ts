import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../shared/errors/ApiError.js';
import { logger } from '../shared/logger/logger.js';
import { ZodError } from 'zod';

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: (err as any).errors
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
    return;
  }

  if (err?.code === 'P2025') {
    res.status(404).json({
      success: false,
      error: err.meta?.cause || 'Requested record was not found'
    });
    return;
  }

  logger.error(err);

  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
};
