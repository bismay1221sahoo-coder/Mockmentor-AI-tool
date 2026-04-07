const API_BASE = (process.env.REACT_APP_API_BASE || "http://localhost:8000").replace(/\/+$/, "");
const WS_BASE = (process.env.REACT_APP_WS_BASE || "ws://localhost:8000").replace(/\/+$/, "");

export { API_BASE, WS_BASE };
