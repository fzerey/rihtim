import { contextBridge, ipcRenderer } from "electron";

// Minimal, safe bridge. The UI talks to the API via same-origin HTTP/WS
// (proxied by the Next.js server), so no privileged APIs are exposed here.
contextBridge.exposeInMainWorld("rihtim", {
  isDesktop: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  selectComposeFile: async (): Promise<string | null> =>
    ipcRenderer.invoke("rihtim:select-compose-file"),
});
