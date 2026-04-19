import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Suppress Zoom SDK internal errors from React's dev overlay.
// The SDK throws non-Error plain objects that are not actionable.
const originalOnError = window.onerror;
window.onerror = (msg, src, _line, _col, err) => {
  if (!err || !(err instanceof Error)) return true; // plain-object throws
  if (typeof src === "string" && src.includes("zoom")) return true;
  if (typeof msg === "string" && msg.toLowerCase().includes("zoom")) return true;
  if (originalOnError) return originalOnError(msg, src, _line, _col, err);
  return false;
};
window.addEventListener("unhandledrejection", (e) => {
  const reason = e?.reason;
  if (reason && typeof reason === "object" && !(reason instanceof Error)) {
    e.preventDefault();
  }
});
window.addEventListener("error", (e) => {
  if (e.error && !(e.error instanceof Error)) e.stopImmediatePropagation();
}, true);

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
