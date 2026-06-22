import type { Tool } from "@modelcontextprotocol/sdk/types";
import { createContext, useContext, useEffect, useRef, type PropsWithChildren } from "react";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { appToolName } from "@cmdforge/tip";

export type ManagerDaemonInfo = {
  pid: number;
  url: string;
};

type AppState = {
  daemonInfo: ManagerDaemonInfo | null;
  serverUrl: string;
  tools: Tool[];
  selectedToolName: string | null;
  selectedTab: "ui" | "form";
  isConnecting: boolean;
  connectionError: string | null;
  infoModalTitle: string | null;
  infoModalValue: unknown | null;
  // UI navigation/view state
  currentView: "explore" | "manage" | "quick-connect" | "session";
  selectedSessionId: string | null;
  // currently active/open session in the main area
  currentSessionId: string | null;
};

type AppActions = {
  setDaemonInfo(daemonInfo: ManagerDaemonInfo | null): void;
  setServerUrl(serverUrl: string): void;
  startConnecting(): void;
  connectionSucceeded(tools: Tool[]): void;
  connectionFailed(message: string): void;
  setSelectedToolName(toolName: string | null): void;
  setSelectedTab(tab: "ui" | "form"): void;
  syncSelectedTool(tool: Tool | null): void;
  openInfoModal(title: string, value: unknown): void;
  closeInfoModal(): void;
  // navigation actions
  setCurrentView(view: AppState["currentView"]): void;
  setSelectedSessionId(id: string | null): void;
  setCurrentSessionId(id: string | null): void;
};

export type AppStoreState = AppState & {
  actions: AppActions;
};

type AppStore = ReturnType<typeof createAppStore>;

function getDefaultSelectedToolName(tools: Tool[]) {
  const preferredTool = tools.find((tool) => tool.name === appToolName);
  return preferredTool?.name ?? tools[0]?.name ?? null;
}

function hasUiResource(tool: Tool | null) {
  if (!tool) {
    return false;
  }

  const ui = tool._meta?.ui;

  if (!ui || typeof ui !== "object") {
    return false;
  }

  return typeof (ui as { resourceUri?: unknown }).resourceUri === "string";
}

export function createAppStore(initialState?: Partial<AppState>) {
  return createWithEqualityFn<AppStoreState>()(
    (set) => {
      const actions: AppActions = {
        setDaemonInfo(daemonInfo) {
          set({ daemonInfo });
        },
        setServerUrl(serverUrl) {
          set({ serverUrl });
        },
        startConnecting() {
          set({
            isConnecting: true,
            connectionError: null,
            tools: [],
            selectedToolName: null,
            selectedTab: "form",
          });
        },
        connectionSucceeded(tools) {
          const selectedToolName = getDefaultSelectedToolName(tools);
          const selectedTool =
            tools.find((tool) => tool.name === selectedToolName) ?? null;

          set({
            isConnecting: false,
            connectionError: null,
            tools,
            selectedToolName,
            selectedTab: hasUiResource(selectedTool) ? "ui" : "form",
          });
        },
        connectionFailed(message) {
          set({
            isConnecting: false,
            connectionError: message,
            tools: [],
            selectedToolName: null,
            selectedTab: "form",
          });
        },
        setSelectedToolName(toolName) {
          set({ selectedToolName: toolName });
        },
        setSelectedTab(tab) {
          set({ selectedTab: tab });
        },
        syncSelectedTool(tool) {
          set((state) => ({
            selectedTab:
              state.selectedTab === "ui" && !hasUiResource(tool)
                ? "form"
                : state.selectedTab,
          }));
        },
        openInfoModal(title, value) {
          set({
            infoModalTitle: title,
            infoModalValue: value,
          });
        },
        closeInfoModal() {
          set({
            infoModalTitle: null,
            infoModalValue: null,
          });
        },
        setCurrentView(view) {
          set({ currentView: view });
        },
        setSelectedSessionId(id) {
          set({ selectedSessionId: id });
        },
        setCurrentSessionId(id) {
          set({ currentSessionId: id });
        },
      };

      return {
        daemonInfo: initialState?.daemonInfo ?? null,
        serverUrl: initialState?.serverUrl ?? "",
        tools: initialState?.tools ?? [],
        selectedToolName: initialState?.selectedToolName ?? null,
        selectedTab: initialState?.selectedTab ?? "form",
        isConnecting: initialState?.isConnecting ?? false,
        connectionError: initialState?.connectionError ?? null,
        infoModalTitle: initialState?.infoModalTitle ?? null,
        infoModalValue: initialState?.infoModalValue ?? null,
        currentView: initialState?.currentView ?? "explore",
        selectedSessionId: initialState?.selectedSessionId ?? null,
        currentSessionId: initialState?.currentSessionId ?? null,
        actions,
      };
    },
    shallow,
  );
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({
  children,
  initialServerUrl,
  initialDaemonInfo,
}: PropsWithChildren<{ initialServerUrl: string; initialDaemonInfo: ManagerDaemonInfo | null }>) {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createAppStore({
      daemonInfo: initialDaemonInfo,
      serverUrl: initialServerUrl,
    });
  }

  useEffect(() => {
    const actions = storeRef.current?.getState().actions;
    actions?.setServerUrl(initialServerUrl);
    actions?.setDaemonInfo(initialDaemonInfo);
  }, [initialDaemonInfo, initialServerUrl]);

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore<T>(selector: (state: AppStoreState) => T) {
  const store = useContext(AppStoreContext);

  if (!store) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }

  return store(selector);
}
