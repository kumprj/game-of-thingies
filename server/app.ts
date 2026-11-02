import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import router from './routes'; // Import your endpoints
import {errorHandler} from './http';

/** Largest JSON body accepted (the biggest legitimate payload is a few hundred bytes). */
export const JSON_BODY_LIMIT = '10kb';

/**
 * Builds the Express app, HTTP server and Socket.IO server without listening, so index.ts can
 * start it on PORT and the integration tests on a random port.
 */
export function createServer() {
  // Create an instance of the Express application
  const app = express();

  // Create an HTTP server using the Express application
  const httpServer = http.createServer(app);

  // Initialize a Socket.IO server with CORS configuration
  const io = new Server(httpServer, {
    cors: {
      // "*" is intentional: the API is public and has no cookie or credential auth, and the web
      // and iOS clients connect from varying origins. The REST API (cors() below) is open the same way.
      origin: "*",
      methods: ["GET", "POST"] // Allow only GET and POST methods
    }
  });

  // Middleware to enable Cross-Origin Resource Sharing (CORS)
  app.use(cors());

  // Middleware to parse incoming JSON requests
  app.use(express.json({limit: JSON_BODY_LIMIT}));

  // Handlers reach the Socket.IO instance through getIo(req) in http.ts
  app.set('io', io);

  // Mount the API routes under the '/api' path
  app.use('/api', router);

  // Health check for the load balancer (sst.config.ts)
  app.get("/health", (req, res) => res.send("OK"));

  // Must come after the routes and body parser: turns their errors into JSON responses
  app.use(errorHandler);

  // Handle WebSocket connections
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id); // Log the connected client ID

    // Handle the 'joinGame' event to join a specific game room
    socket.on("joinGame", (gameId) => {
      socket.join(gameId); // Add the client to the specified game room
    });
  });

  return {app, httpServer, io};
}
