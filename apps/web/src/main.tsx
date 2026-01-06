import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Removed StrictMode to avoid double-connect issues with LiveKit
// In development, React.StrictMode causes effects to run twice,
// which can cause immediate disconnects in WebSocket/WebRTC connections
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
