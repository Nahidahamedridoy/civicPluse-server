
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

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

export default app;
