import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import router from './routes'; // Import your endpoints

// Create an instance of the Express application
const app = express();

// Create an HTTP server using the Express application
const httpServer = http.createServer(app);

// Initialize a Socket.IO server with CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins (adjust for production)
    methods: ["GET", "POST"] // Allow only GET and POST methods
  }
});

// Middleware to enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Middleware to parse incoming JSON requests
app.use(express.json());

// Middleware to attach the Socket.IO instance to the request object
app.use((req, res, next) => {
  (req as any).io = io; // Attach 'io' to the request object
  next(); // Proceed to the next middleware or route handler
});

// Mount the API routes under the '/api' path
app.use('/api', router);

// Define a warmup route to check server health
app.get("/warmup", (req, res) => res.send("OK"));

// Handle WebSocket connections
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id); // Log the connected client ID

  // Handle the 'joinGame' event to join a specific game room
  socket.on("joinGame", (gameId) => {
    socket.join(gameId); // Add the client to the specified game room
  });
});

// Define the port for the server to listen on
const PORT = process.env.PORT || 3001;

// Start the HTTP server and log the running port
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});