import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import router from './routes'; // Import your endpoints

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust for prod
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Pass 'io' to all routes via the request object
app.use((req, res, next) => {
  (req as any).io = io;
  next();
});

// Mount the routes
app.use('/api', router);

// Warmup route (outside /api if you prefer)
app.get("/warmup", (req, res) => res.send("OK"));

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("joinGame", (gameId) => {
    socket.join(gameId);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
