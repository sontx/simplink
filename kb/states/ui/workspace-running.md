---
type: state
title: The selected KB is open in the local UI
summary: The browser has loaded the selected KB folder and shows its graph, lint counts, and folder name.
check: "Confirm the header shows the intended folder name, the expected node count appears, and the graph loads. Memory mode shows the download banner."
satisfied_by:
  - procedure.ui.launch-workspace
---

Opening a different folder creates a fresh workspace and clears the previous query cache.
