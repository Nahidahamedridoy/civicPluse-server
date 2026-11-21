import jwt from "jsonwebtoken";

/**
 * Retrieves the JWT secret from environment variables.
 * Throws a descriptive error if JWT_SECRET is not configured.
 *
 * @returns {string} The JWT secret key.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not defined in environment variables. Please configure JWT_SECRET in your .env file."
    );
  }
  return secret;
};

/**
 * Generates a signed JWT token.
 *
 * @param {Object} payload - Data payload to encode within the token.
 * @param {Object} [options={}] - Additional jsonwebtoken sign options.
 * @returns {string} Signed JWT token string.
 */
export const generateToken = (payload, options = {}) => {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(payload, secret, {
    expiresIn,
    ...options,
  });
};

/**
 * Verifies a JWT token and returns the decoded payload.
 *
 * @param {string} token - The JWT token to verify.
 * @param {Object} [options={}] - Additional jsonwebtoken verify options.
 * @returns {Object|string} Decoded token payload.
 */
export const verifyToken = (token, options = {}) => {
  const secret = getJwtSecret();

  return jwt.verify(token, secret, options);
};

export default {
  generateToken,
  verifyToken,
};
