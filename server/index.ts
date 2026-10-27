import { createServer } from './app';

const { httpServer } = createServer();

// Define the port for the server to listen on
const PORT = process.env.PORT || 3001;

// Start the HTTP server and log the running port
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
