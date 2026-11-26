const logger = require('../config/logger');

class AppError extends Error {
  constructor(statusCode, message, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate record', code: 'DUPLICATE_RECORD' });
  }

  logger.error(
    {
      errName: err.name,
      errMessage: err.message,
      path: req.originalUrl,
      method: req.method,
    },
    'Unhandled request error'
  );

  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

module.exports = {
  AppError,
  errorHandler,
};
