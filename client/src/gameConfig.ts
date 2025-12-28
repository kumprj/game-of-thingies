// src/gameConfig.ts
import axios from "axios";
import { io } from 'socket.io-client';



const API_URL = process.env.NODE_ENV === 'production'
    ? 'https://game-of-thingies.onrender.com'
    : 'http://localhost:3001';

console.log("🚀 Current API URL:", API_URL); // <--- Add this!

axios.defaults.baseURL = API_URL;


// Configure Axios
axios.defaults.baseURL = API_URL;

// Configure Socket - singleton instance
export const socket = io(API_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export default axios;
