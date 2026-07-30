import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';
import pino from 'pino';

const logger = pino();

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  if (process.env.NODE_ENV !== 'test') {
    logger.error({ err, path: req.path, method: req.method });
  }

  // Zod Validation Error
  if (err instanceof ZodError) {
    const errors = err.issues.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({
      status: 'fail',
      message: 'Validation Error',
      errors,
    });
  }

  // Prisma Unique Constraint Violation
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'Field';
    error = new AppError(`${field} already exists. Please use another value.`, 409);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Your token has expired! Please log in again.', 401);
  }

  // Operational, trusted error: send message to client
  if (error instanceof AppError || err instanceof AppError) {
    const statusCode = error.statusCode || err.statusCode || 500;
    const status = error.status || err.status || 'error';
    return res.status(statusCode).json({
      status,
      message: error.message || err.message,
    });
  }

  // Programming or other unknown error: don't leak error details
  res.status(500).json({
    status: 'error',
    message: err.message || 'Something went very wrong!',
    stack: err.stack,
  });
};
