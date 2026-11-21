/**
 * Role-based authorization middleware.
 * Verifies that the authenticated user's role matches one of the allowed roles.
 *
 * @param {...string|string[]} roles - One or more allowed user roles.
 * @returns {Function} Express middleware handler.
 */
export const authorizeRoles = (...roles) => {
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required before checking role authorization.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user.role}' is not authorized to access this resource.`,
      });
    }

    next();
  };
};

export const authorize = authorizeRoles;
export default authorizeRoles;
