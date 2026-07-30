"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const AppError_1 = require("../utils/AppError");
const zod_1 = require("zod");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    // Log error for debugging
    if (process.env.NODE_ENV !== 'test') {
        logger.error({ err, path: req.path, method: req.method });
    }
    // Zod Validation Error
    if (err instanceof zod_1.ZodError) {
        const errors = err.issues.map((e) => ({
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
        error = new AppError_1.AppError(`${field} already exists. Please use another value.`, 409);
    }
    // JWT Errors
    if (err.name === 'JsonWebTokenError') {
        error = new AppError_1.AppError('Invalid token. Please log in again.', 401);
    }
    if (err.name === 'TokenExpiredError') {
        error = new AppError_1.AppError('Your token has expired! Please log in again.', 401);
    }
    // Operational, trusted error: send message to client
    if (error instanceof AppError_1.AppError || err instanceof AppError_1.AppError) {
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
exports.errorHandler = errorHandler;
