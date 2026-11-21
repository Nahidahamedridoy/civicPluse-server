
import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initializeSocket } from "./services/socketService.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  // Create HTTP server wrapping the Express app
  const server = createServer(app);

  // Initialize Socket.IO on the HTTP server
  initializeSocket(server);

  server.listen(PORT, () => {
    console.log("----------------------------");
    console.log("       CIVICPULSE SERVER");
    console.log("--------------------------------");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Real-time: Socket.IO enabled`);
    console.log("--------------------------------");
  });
};

startServer();
