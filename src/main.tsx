import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { SupabaseAuthProvider } from "./lib/auth";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SupabaseAuthProvider>
      <RouterProvider router={router} />
    </SupabaseAuthProvider>
  </React.StrictMode>,
);
