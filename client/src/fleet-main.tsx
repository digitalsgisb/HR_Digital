import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FleetAccess } from "./FleetAccess";
import "./styles.css";
import "./design-system.css";

// Public company-car page served at /fleet/ (no HR sign-in). It bundles only the car flow.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FleetAccess />
  </StrictMode>
);
