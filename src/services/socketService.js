import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import User from "../models/User.js";

/** @type {Server|null} */
let io = null;

/**
 * Initializes Socket.IO on the given HTTP server.
 * Authenticates socket connections using JWT from handshake auth or query.
 * Joins each authenticated user to a user-specific room: `user:<userId>`.
 *
 * @param {import("http").Server} httpServer - Node HTTP server instance.
 * @returns {Server} The initialized Socket.IO server.
 */
export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // --- JWT Authentication Middleware ---
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Authentication error: Token is required."));
      }

      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (err) {
        return next(
          new Error(
            err.name === "TokenExpiredError"
              ? "Authentication error: Token has expired."
              : "Authentication error: Invalid token."
          )
        );
      }

      const userId = decoded.id || decoded._id || decoded.userId;
      if (!userId) {
        return next(new Error("Authentication error: Invalid token payload."));
      }

      const user = await User.findById(userId).select("_id name role department isActive");
      if (!user) {
        return next(new Error("Authentication error: User not found."));
      }

      if (!user.isActive) {
        return next(new Error("Authentication error: Account is deactivated."));
      }

      // Attach user to socket for downstream handlers
      socket.user = user;
      next();
    } catch (error) {
      return next(new Error("Authentication error: " + error.message));
    }
  });

  // --- Connection Handler ---
  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();

    // Join user-specific room
    socket.join(`user:${userId}`);
    console.log(
      `[Socket.IO] User connected: ${socket.user.name} (${userId}) — socket ${socket.id}`
    );

    socket.on("disconnect", (reason) => {
      console.log(
        `[Socket.IO] User disconnected: ${socket.user.name} (${userId}) — ${reason}`
      );
    });
  });

  console.log("[Socket.IO] Real-time notification system initialized.");
  return io;
};

/**
 * Returns the initialized Socket.IO Server instance.
 * Throws if called before initializeSocket().
 *
 * @returns {Server}
 */
export const getIO = () => {
  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized. Call initializeSocket(httpServer) first."
    );
  }
  return io;
};

/**
 * Emit an event to a specific user by their MongoDB user ID.
 *
 * @param {string} userId - Target user's MongoDB ObjectId (as string).
 * @param {string} event  - Event name (e.g. "notification:new").
 * @param {*} data        - Payload to send.
 */
export const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId.toString()}`).emit(event, data);
};

export default {
  initializeSocket,
  getIO,
  emitToUser,
};
