import serverless from "serverless-http";
import {createServer} from "./app";

// API Gateway invokes the Express app on demand. The HTTP server is still built for local and
// integration-test Socket.IO compatibility, but Lambda only needs the Express request handler.
const {app} = createServer();

export const handler = serverless(app);
