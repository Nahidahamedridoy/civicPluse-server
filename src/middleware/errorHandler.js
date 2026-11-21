import multer from "multer";

/**
 * 404 Not Found middleware for unknown API routes.
 */
export const notFoundHandler = (req, res, next) => {
  return res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Global Error Handler middleware.
 * Handles Mongoose validation, duplicate keys, CastErrors, JWT, and Multer errors.
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  if (res.statusCode && res.statusCode !== 200 && statusCode === 500) {
    statusCode = res.statusCode;
  }

  let message = err.message || "An unexpected server error occurred.";
  let errors = undefined;

  // Log detailed error during development
  if (process.env.NODE_ENV !== "production") {
    console.error(`[Global Error Handler] [${req.method} ${req.url}]:`, err);
  }

  // 1. Mongoose Validation Error
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation Error";
    errors = Object.values(err.errors || {}).map((item) => item.message);
  }

  // 2. Mongoose Duplicate Key Error (code 11000)
  else if (err.code === 11000) {
    statusCode = 409;
    const duplicateFields = Object.keys(err.keyValue || {});
    message = `Duplicate entry for field(s): ${duplicateFields.join(", ")}.`;
    errors = err.keyValue;
  }

  // 3. Mongoose Cast Error (Invalid ObjectId)
  else if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ID format for path '${err.path}': ${err.value}`;
  }

  // 4. JWT Errors
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Authorization failed.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired. Please authenticate again.";
  }

  // 5. Multer Upload Errors
  else if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "File too large. Maximum allowed size is 5 MB.";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files uploaded. Maximum 5 images allowed.";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = `Unexpected upload field '${err.field}'. Expected 'images' or 'image'.`;
    } else {
      message = `Upload error: ${err.message}`;
    }
  }

  // 6. Custom File Type Error
  else if (err.code === "INVALID_FILE_TYPE") {
    statusCode = 400;
    message = err.message;
  }

  const responseBody = {
    success: false,
    message,
    ...(errors !== undefined ? { errors } : {}),
    ...(process.env.NODE_ENV === "development" && err.stack
      ? { stack: err.stack }
      : {}),
  };

  return res.status(statusCode).json(responseBody);
};

export default errorHandler;
