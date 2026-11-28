import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { restoreProgressBackupIfNeeded } from "./game/updater";

async function boot() {
  await Promise.race([
    restoreProgressBackupIfNeeded(),
    new Promise<void>((resolve) => setTimeout(resolve, 400)),
  ]);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void boot();
