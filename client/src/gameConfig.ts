// src/gameConfig.ts
import axios from "axios";
import { io } from 'socket.io-client';
import { API_URL } from './apiUrl';

// Configure Axios
axios.defaults.baseURL = API_URL;

// Automatically attach player token to all requests
axios.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('got_playerToken') : null;
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
