import "./polyfills.js";
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { PreferencesProvider } from "./components/preferences.js";
import { WorkspaceProvider, useWorkspace } from "./workspace/context.js";

function WorkspaceRouter() {
  const { client } = useWorkspace();
  const [router] = useState(() =>
    createRouter({
      routeTree,
      context: { queryClient: client },
      basepath: import.meta.env.BASE_URL,
      defaultPreload: "intent",
    }),
  );
  return <RouterProvider router={router} />;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter<typeof routeTree>>;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <WorkspaceProvider>
        <WorkspaceRouter />
      </WorkspaceProvider>
    </PreferencesProvider>
  </React.StrictMode>,
);
