import { ElectronAPI } from "@electron-toolkit/preload";
import type { SyncAgentApi } from "./index";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: SyncAgentApi;
  }
}
