// config/axios.js
import axios from 'axios';

// Base URL dari .env
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  timeout: 10000, // optional: timeout 10 detik
  headers: {
    'Content-Type': 'application/json',
  },
});


console.log("process.env.REACT_APP_API_BASE_URL",process.env.REACT_APP_API_BASE_URL);

// Interceptor request (optional, misal untuk token)
api.interceptors.request.use(
  (config) => {
    // Misal pakai token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor response (optional, handle error global)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Axios Error:', error);
    return Promise.reject(error);
  }
);

export default api;
