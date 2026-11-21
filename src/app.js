
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import issueRoutes from "./routes/issueRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import activityLogRoutes from "./routes/activityLogRoutes.js";

const app = express();

// Security Headers
app.use(helmet());

// CORS Configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Request Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logger
app.use(morgan("dev"));

// Root Route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to CivicPulse API",
  });
});

// Health Check Route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CivicPulse Server is running!",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api", commentRoutes);
app.use("/api", activityLogRoutes);

export default app;
