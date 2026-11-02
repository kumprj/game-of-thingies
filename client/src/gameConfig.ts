// src/gameConfig.ts
import axios from "axios";
import { io } from 'socket.io-client';
import { API_URL } from './apiUrl';
import { getPlayerToken } from './playerToken';

// Configure Axios
axios.defaults.baseURL = API_URL;

// Automatically attach player token to all requests
axios.interceptors.request.use((config) => {
  const token = getPlayerToken(); // created on first use
  if (token) {
    config.headers.set('x-player-token', token);
  }
  return config;
});

// Configure Socket - singleton instance
export const socket = io(API_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export default axios;
