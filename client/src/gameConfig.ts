// src/gameConfig.ts
import axios from "axios";
import { io } from 'socket.io-client';
import { API_URL } from './apiUrl';

// Configure Axios
axios.defaults.baseURL = API_URL;

// Configure Socket - singleton instance
export const socket = io(API_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export default axios;
