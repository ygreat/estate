// Modified by ygreat for Estate, 2026. Originally part of Terax.
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { consumeLaunchFiles, getLaunchDir } from "@/lib/launchDir";
import { IS_MAC } from "@/lib/platform";
import { quoteShellArg } from "@/lib/shellQuote";
import { usePresence } from "@/lib/usePresence";
import { useZoom } from "@/lib/useZoom";
import { isMarkdownPath } from "@/lib/utils";
import {
  type AgentLaunchRequest,
  AgentNotificationsBridge,
  findAgentLauncher,
  nextAttentionTarget,
  validateAgentLaunchCommand,
} from "@/modules/agents";
import {
  AgentRunBridge,
  AiMiniWindow,
  LocalAgentNotificationsBridge,
  SelectionAskAi,
  useAiBootstrap,
  useAiLiveBridge,
  useChatStore,
  useSelectionAskAi,
} from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { native } from "@/modules/ai/lib/native";
import { isChatCapable } from "@/modules/agents/lib/launcher";
import {
  CommandPalette,
  createCommandItems,
  type OpenFileTarget,
  type PaletteInitialMode,
} from "@/modules/command-palette";
import { useControlBridge } from "@/modules/control";
import {
  type EditorPaneHandle,
  NewEditorDialog,
  useApplyEditorFontSize,
  useEditorFileSync,
} from "@/modules/editor";
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { useWorkspaceLayout } from "@/modules/layout/useWorkspaceLayout";
import { AgentsPanel } from "@/modules/agents/components/AgentsPanelLazy";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { newChatId } from "@/modules/agent-chat/ids";
import {
  folderName,
  markOpened,
  projectForFolder,
  readOpenedAt,
  recentProjects,
  readRecentClearedAt,
  clearRecent,
} from "@/modules/spaces/lib/projects";
import { ProjectButton } from "@/modules/statusbar/ProjectButton";
import { WelcomeScreen } from "@/modules/welcome/WelcomeScreen";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { setShowWelcome } from "@/modules/settings/store";
import { resolvePlanner } from "@/modules/orchestrator/planner";
import {
  ORCHESTRATE_EVENT,
  type OrchestrateDetail,
} from "@/modules/orchestrator/events";
import {
  chatTabDefaultTitle,
  CHAT_AGENTS,
  type ChatAgentId,
} from "@/modules/agent-chat/model";
import { resolveInstructions } from "@/modules/orchestrator/instructions";
import { orchestratorPrompt } from "@/modules/orchestrator/plan";
import { setOrchestratorHost } from "@/modules/orchestrator/runs";
import type { FolderAction } from "@/modules/statusbar/CwdBreadcrumb";
import {
  checkAgentAuth,
  LOGIN_COMMANDS,
  RUN_IN_TERMINAL_EVENT,
  type RunInTerminalDetail,
} from "@/modules/agent-chat/auth";
import { setLspNavigator } from "@/modules/lsp";
import type { PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setShowHidden } from "@/modules/settings/store";
import {
  type ShortcutHandlers,
  type ShortcutId,
  shouldDisableAskSelection,
  shouldDisablePaneSwapShortcut,
  tabDigit,
  useGlobalShortcuts,
} from "@/modules/shortcuts";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SidebarRail,
  useSidebarPanel,
} from "@/modules/sidebar";
import {
  SourceControlPanel,
  useRepositoryTargeting,
  useSourceControlContext,
} from "@/modules/source-control";
import {
  SpaceSwitcher,
  useSpacePersistence,
  useSpaces,
  useSpacesBoot,
} from "@/modules/spaces";
import { StatusBar } from "@/modules/statusbar";
import {
  type CloseTabsPlan,
  TabSwitcherHud,
  useTabSwitcher,
  useTabs,
  useWindowTitle,
  useWorkspaceCwd,
} from "@/modules/tabs";
import { DEFAULT_SPACE_ID } from "@/modules/tabs/lib/useTabs";
import {
  clearFocusedTerminal,
  disposeSession,
  findLeafCwd,
  hasLeaf,
  isTerminalSurfaceTarget,
  leafIds,
  navigateFocusedBlocks,
  type PaneBounds,
  ptyIdForLeaf,
  type TerminalPaneHandle,
  useAgentActivityStore,
  useTerminalFileDrop,
  whenSessionReady,
  writeToSession,
} from "@/modules/terminal";
import { bindTerminalWindowFocus } from "@/modules/terminal/ghostty/renderScheduling";
import { subscribeWindowPresentation } from "@/modules/terminal/ghostty/windowPresentation";
import type { TerminalSearchController } from "@/modules/terminal/search/TerminalSearchController";
import {
  LivePageResizeBridge,
  ThemeProvider,
  useThemeFileEditing,
  WindowActivityBridge,
  WindowVibrancyBridge,
} from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import {
  anyAgentHasSession,
  projectHasSession,
  workTabCount,
} from "@/modules/welcome/projectSession";
import {
  chatPathDropTarget,
  firstPathDropTarget,
} from "@/modules/explorer/lib/chatPathDrop";
import {
  currentWorkspaceEnv,
  useWorkspaceEnvStore,
  type WorkspaceEnv,
  workspaceScopeKey,
} from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CloseDialogs } from "./components/CloseDialogs";
import {
  TOGGLE_BLOCK_INPUT_EVENT,
  WorkspaceInputBar,
} from "./components/WorkspaceInputBar";
import { WorkspaceSurface } from "./components/WorkspaceSurface";
import {
  hasOpenPathTab,
  renamedPath,
  spacesEmptiedByTabs,
} from "./hooks/tabCloseGuards";
import { useAppCloseGuard } from "./hooks/useAppCloseGuard";
import { useTabCloseGuards } from "./hooks/useTabCloseGuards";
import { useWorkspaceSwitcher } from "./hooks/useWorkspaceSwitcher";

// Real-application benchmark driver (scripts/app-lab). `__ESTATE_BENCH__` is the literal `false`
// in a normal build, so this is `null` and neither the import nor its chunk is emitted.
const BenchBridge = __ESTATE_BENCH__
  ? lazy(() => import("@/bench/BenchBridge"))
  : null;

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    allocId,
    booted,
    replaceTabs,
    moveTabToSpace,
    reorderTab,
    reorderTabByGap,
    gatherTabs,
    newTabInSpace,
    removeTabsForSpace,
    markBooted,
    setActiveSpaceForNewTabs,
    newTab,
    newBlockTab,
    newAgentTab,
    newAgentGroupTab,
    newAgentChatTab,
    newPrivateTab,
    openFileTab,
    pinTab,
    newPreviewTab,
    newMarkdownTab,
    setMarkdownView,
    setOverrideLanguage,
    openAiDiffTab,
    closeAiDiffTab,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    closeTab,
    closeTabs,
    updateTab,
    selectByIndex,
    setLeafCwd,
    focusPane,
    focusNextPaneInTab,
    swapActivePaneInDirection,
    splitActivePane,
    closeActivePane,
    closePaneByLeaf,
    resetWorkspace,
    warmTab,
    peekTab,
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  // Mirror `tabs` into a ref so callbacks scheduled with `setTimeout`
  // (e.g. cdInNewTab) read the latest pane state instead of a stale closure.
  const tabsRef = useRef(tabs);
  const activeIdRef = useRef(activeId);

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "terminal" ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;

  const searchAddons = useRef<Map<number, TerminalSearchController>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<TerminalSearchController | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useApplyEditorFontSize();
  const terminalPathDropTarget = useTerminalFileDrop();
  // Estate: files dragged from the sidebar land in a chat box first, else the
  // terminal under the pointer.
  const explorerPathDropTarget = useMemo(
    () => firstPathDropTarget(chatPathDropTarget, terminalPathDropTarget),
    [terminalPathDropTarget],
  );
  const explorerRef = useRef<FileExplorerHandle>(null);

  // Drives session disposal off the pane tree, not React lifecycles —
  // split/unsplit re-mount components but the leaf is still live.
  const liveLeavesRef = useRef<Set<number>>(new Set());

  const clearWorkspaceState = useCallback(() => {
    for (const id of liveLeavesRef.current) disposeSession(id);
    searchAddons.current.clear();
    terminalRefs.current.clear();
    editorRefs.current.clear();
    previewRefs.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const {
    home,
    launchCwd,
    launchCwdResolved,
    switchWorkspace,
    adoptWorkspaceEnv,
  } = useWorkspaceSwitcher({
    tabsRef,
    workspaceEnv,
    setWorkspaceEnv,
    resetWorkspace,
    clearWorkspaceState,
  });

  const activeSpaceId = useSpaces((s) => s.activeId);
  const spacesHydrated = useSpaces((s) => s.hydrated);
  const activeSpaceIdRef = useRef(activeSpaceId);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
    activeIdRef.current = activeId;
    activeSpaceIdRef.current = activeSpaceId;
  }, [tabs, activeId, activeSpaceId]);
  const sourceControlSpaceId = activeSpaceId ?? DEFAULT_SPACE_ID;

  const handleWorkspaceChange = useCallback(
    async (env: WorkspaceEnv) => {
      const switched = await switchWorkspace(env);
      if (switched && activeSpaceId) {
        useSpaces.getState().setEnv(activeSpaceId, env);
      }
    },
    [switchWorkspace, activeSpaceId],
  );

  useSpacesBoot({
    ready: launchCwdResolved,
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  });

  useSpacePersistence({
    tabs,
    activeId,
    activeSpaceId: activeSpaceId ?? DEFAULT_SPACE_ID,
    enabled: spacesHydrated,
  });

  const prevSpaceRef = useRef(activeSpaceId);
  useEffect(() => {
    if (!spacesHydrated || !activeSpaceId) return;
    setActiveSpaceForNewTabs(activeSpaceId);
    const prev = prevSpaceRef.current;
    prevSpaceRef.current = activeSpaceId;
    if (prev === null || prev === activeSpaceId) return;
    const meta = useSpaces
      .getState()
      .spaces.find((s) => s.id === activeSpaceId);
    if (meta) void adoptWorkspaceEnv(meta.env);
    const inSpace = tabsRef.current.filter((t) => t.spaceId === activeSpaceId);
    if (inSpace.length === 0) return;
    // Keep the active tab if it already belongs to the newly active space (a
    // cross-space jump set it explicitly); else fall to the space's last tab.
    if (inSpace.some((t) => t.id === activeId)) return;
    setActiveId(inSpace[inSpace.length - 1].id);
  }, [
    activeSpaceId,
    activeId,
    spacesHydrated,
    setActiveSpaceForNewTabs,
    setActiveId,
    adoptWorkspaceEnv,
  ]);

  const [switcherOpen, setSwitcherOpen] = useState(false);

  const spaceTabs = useMemo(
    () => tabs.filter((t) => t.spaceId === (activeSpaceId ?? DEFAULT_SPACE_ID)),
    [tabs, activeSpaceId],
  );

  // Estate: a chat tab that closed stops its agent and forgets its transcript.
  // The chat store loads on demand, so it stays out of the startup bundle.
  const chatIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set<string>();
    for (const t of tabs) if (t.kind === "agent-chat") now.add(t.chatId);
    const gone = [...chatIdsRef.current].filter((id) => !now.has(id));
    chatIdsRef.current = now;
    if (gone.length === 0 || !booted) return;
    void import("@/modules/agent-chat/store").then((m) => {
      for (const id of gone) m.deleteSavedChat(id);
    });
  }, [tabs, booted]);

  const workspaceLayout = useWorkspaceLayout({
    spaceId: activeSpaceId ?? DEFAULT_SPACE_ID,
    spaceTabs,
    activeId,
    setActiveId,
    warmTab,
    gatherTabs,
  });

  const {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    sidebarCollapsed,
    initialSidebarCollapsed,
    persistSidebarView,
    persistSidebarCollapsed,
    toggleSidebar,
    cycleSidebarView,
    openSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  } = useSidebarPanel(explorerRef);

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialMode, setPaletteInitialMode] =
    useState<PaletteInitialMode>("commands");
  const openCommandPalette = useCallback(
    (mode: PaletteInitialMode = "commands") => {
      setPaletteInitialMode(mode);
      setCommandPaletteOpen(true);
    },
    [],
  );
  const miniOpen = useChatStore((s) => s.mini.open);
  const miniPresence = usePresence(miniOpen, 200);
  const openMini = useChatStore((s) => s.openMini);
  const toggleMini = useChatStore((s) => s.toggleMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const openPanel = useChatStore((s) => s.openPanel);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const setLive = useChatStore((s) => s.setLive);
  const respondToApproval = useChatStore((s) => s.respondToApproval);

  const { hasComposer, keysLoaded } = useAiBootstrap();

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isBlockTab = activeTerminalTab?.blocks === true;
  const isEditorTab = activeTab?.kind === "editor";
  const isGitHistoryTab = activeTab?.kind === "git-history";

  useEditorFileSync({ tabs, tabsRef, editorRefs });
  useThemeFileEditing({ tabsRef, openFileTab });

  const projectRoot = useSpaces(
    (s) => s.spaces.find((sp) => sp.id === s.activeId)?.root ?? null,
  );
  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    launchCwd ?? home,
    projectRoot,
  );

  useWindowTitle(activeTab, explorerRoot);

  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null
        ? (searchAddons.current.get(activeLeafId) ?? null)
        : null,
    );
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId, activeLeafId]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: TerminalSearchController) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Terminal-leaf-keyed maps (terminalRefs/searchAddons) are pruned by
      // the effect below as the pane tree changes; only the tab-id-keyed
      // handles need explicit cleanup here.
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  const disposeTabs = useCallback(
    (anchorId: number, plan: CloseTabsPlan) => {
      const closedIds = closeTabs(anchorId, plan);
      for (const id of closedIds) {
        editorRefs.current.delete(id);
        previewRefs.current.delete(id);
      }
    },
    [closeTabs],
  );

  const disposeDeletedTabs = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      for (const spaceId of spacesEmptiedByTabs(tabsRef.current, ids)) {
        const root = useSpaces
          .getState()
          .spaces.find((s) => s.id === spaceId)?.root;
        newTabInSpace(spaceId, root ?? undefined);
      }
      for (const id of ids) disposeTab(id);
    },
    [disposeTab, newTabInSpace],
  );

  const {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    pendingCloseMany,
    closeManyConfirming,
    handleClose,
    handleCloseTabsToRight,
    handleCloseOtherTabs,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    confirmCloseMany,
    cancelCloseMany,
    handlePathsDeleted,
  } = useTabCloseGuards({
    tabs,
    activeId,
    disposeTab,
    disposeDeletedTabs,
    disposeTabs,
  });

  const { pendingAppClose, confirmAppClose, cancelAppClose } =
    useAppCloseGuard(tabsRef);

  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === "terminal") {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const id of liveLeavesRef.current) {
      if (!live.has(id)) disposeSession(id);
    }
    liveLeavesRef.current = live;
    for (const k of [...terminalRefs.current.keys()])
      if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()])
      if (!live.has(k)) searchAddons.current.delete(k);
  }, [tabs]);

  useEffect(() => {
    const tab = tabsRef.current.find((t) => t.id === activeId);
    if (tab?.kind !== "terminal") return;
    const ptyIds = leafIds(tab.paneTree).flatMap((leafId) => {
      const ptyId = ptyIdForLeaf(leafId);
      return ptyId === null ? [] : [ptyId];
    });
    useAgentActivityStore.getState().acknowledgeAttention(ptyIds);
  }, [activeId]);

  // Most-recently-used tab ids, most recent first, pruned to live tabs. Drives
  // the Ctrl+Tab quick switcher so it cycles by recency, not strip order.
  const mruRef = useRef<number[]>([activeId]);
  useEffect(() => {
    mruRef.current = [
      activeId,
      ...mruRef.current.filter((id) => id !== activeId),
    ];
  }, [activeId]);
  useEffect(() => {
    const live = new Set(tabs.map((t) => t.id));
    mruRef.current = mruRef.current.filter((id) => live.has(id));
  }, [tabs]);

  const getSwitcherOrder = useCallback(() => {
    const space = activeSpaceId ?? DEFAULT_SPACE_ID;
    const inSpace = tabsRef.current
      .filter((t) => t.spaceId === space)
      .map((t) => t.id);
    const present = new Set(inSpace);
    const ordered = mruRef.current.filter((id) => present.has(id));
    for (const id of inSpace) if (!ordered.includes(id)) ordered.push(id);
    return [activeId, ...ordered.filter((id) => id !== activeId)];
  }, [activeId, activeSpaceId]);

  const { state: switcherState, step: stepSwitcher } = useTabSwitcher({
    getOrder: getSwitcherOrder,
    onCommit: (id) => {
      if (tabsRef.current.some((t) => t.id === id)) setActiveId(id);
    },
  });

  const cycleSpace = useCallback((delta: 1 | -1) => {
    const { spaces, activeId: sid, setActive } = useSpaces.getState();
    if (spaces.length < 2) return;
    const idx = spaces.findIndex((s) => s.id === sid);
    const next = (idx + delta + spaces.length) % spaces.length;
    setActive(spaces[next].id);
  }, []);

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "terminal") {
      const lid = t.activeLeafId;
      return terminalRefs.current.get(lid)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  const togglePanelAndFocus = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    if (panelOpen) {
      useChatStore.getState().closePanel();
    } else {
      openPanel();
      focusInput(null);
    }
  }, [hasComposer, panelOpen, openPanel, focusInput]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const handleAttachFileToAgent = useCallback(
    (path: string) => {
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      // Dispatch a window event the composer listens for. Same pattern as
      // selections — keeps file-explorer decoupled from the AI module.
      window.dispatchEvent(
        new CustomEvent<string>("estate:ai-attach-file", { detail: path }),
      );
      openPanel();
      focusInput(null);
    },
    [hasComposer, openPanel, focusInput],
  );

  const askFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [
    hasComposer,
    captureActiveSelection,
    focusInput,
    attachSelection,
    activeTab,
  ]);

  const { askPopup, setAskPopup, onAskFromSelection } = useSelectionAskAi({
    captureActiveSelection,
    askFromSelection,
  });
  const askPresence = usePresence(Boolean(askPopup), 120);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const openNewPrivateTab = useCallback(() => {
    newPrivateTab(inheritedCwdForNewTab());
  }, [newPrivateTab, inheritedCwdForNewTab]);

  const openNewBlockTab = useCallback(() => {
    newBlockTab(inheritedCwdForNewTab());
  }, [newBlockTab, inheritedCwdForNewTab]);

  const launchAgentGroup = useCallback(
    (request: AgentLaunchRequest) => {
      // Estate: chat mode runs the agent headless in a chat tab.
      if (request.view === "chat") {
        if (!isChatCapable(request.agent)) return;
        // The project the user is in: the active terminal's (or chat's)
        // folder, else the space's root, else the last terminal or home.
        const current =
          activeTab?.kind === "terminal" || activeTab?.kind === "agent-chat"
            ? inheritedCwdForNewTab()
            : undefined;
        const spaceRoot = useSpaces
          .getState()
          .spaces.find((sp) => sp.id === useSpaces.getState().activeId)?.root;
        const cwd = current ?? spaceRoot ?? inheritedCwdForNewTab() ?? home;
        if (!cwd) {
          toast.error("Open a folder before starting a chat");
          return;
        }
        const agent = request.agent;
        void native
          .workspaceAuthorize(cwd)
          .then(() => newAgentChatTab(agent, cwd))
          .catch((error) =>
            toast.error("Could not open this folder for the agent", {
              description: String(error),
            }),
          );
        return;
      }
      const command = validateAgentLaunchCommand(request.command);
      if (!command.ok) return;
      const launcher = findAgentLauncher(request.agent);
      const title =
        request.instances === 1
          ? launcher.label
          : `${launcher.label} × ${request.instances}`;
      const { leafIds: agentLeafIds } = newAgentGroupTab(
        inheritedCwdForNewTab(),
        title,
        request.instances,
      );
      const hooksReady = launcher.supportsHooks
        ? invoke("agent_enable_hooks", {
            agent: request.agent,
          }).catch((error) => {
            console.warn(
              `[estate] could not enable ${request.agent} notifications:`,
              error,
            );
          })
        : Promise.resolve();

      for (const leafId of agentLeafIds) {
        void (async () => {
          await Promise.all([whenSessionReady(leafId), hooksReady]);
          if (!writeToSession(leafId, `${command.command}\r`)) {
            console.error(
              `[estate] agent terminal ${leafId} closed before launch`,
            );
          }
        })();
      }
    },
    [inheritedCwdForNewTab, newAgentGroupTab, newAgentChatTab, home, activeTab],
  );

  // Estate: the busy toast offers the new-tab route, defined further down.
  const cdInNewTabRef = useRef<(path: string) => void>(() => {});
  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      void term.writeAtPrompt(`cd ${quoteShellArg(path)}\r`).then((typed) => {
        if (typed) {
          term.focus();
          return;
        }
        // Estate: say what is in the way, not just "busy".
        void term.busyReason().then((reason) => {
          const why: Record<string, [string, string]> = {
            agent: [
              "A coding agent is running in this terminal",
              "Exit the agent, or open a new tab to go there.",
            ],
            fullscreen: [
              "A full-screen program is open in this terminal",
              "Quit it, or open a new tab to go there.",
            ],
            running: [
              "A command is still running in this terminal",
              "Wait for it to finish, or open a new tab to go there.",
            ],
            "not-integrated": [
              "This terminal isn't at a prompt Estate can type into",
              "Press Enter once at the prompt, or open a new tab to go there.",
            ],
            closed: ["This terminal has closed", "Open a new tab to go there."],
          };
          const [title, description] = why[reason ?? "running"] ?? why.running;
          toast(title, {
            description,
            action: {
              label: "Open in new tab",
              onClick: () => cdInNewTabRef.current(path),
            },
          });
        });
      });
    },
    [activeLeafId],
  );

  // Estate: an agent chat's sign-in screen asks for a terminal running the
  // agent's login. Only the fixed login commands are accepted.
  // Settings asks over a Tauri event, so the terminal opens here.
  useEffect(() => {
    const run = (detail: RunInTerminalDetail | null | undefined) => {
      if (!detail || !LOGIN_COMMANDS.includes(detail.command)) return;
      const tabId = newTab(detail.cwd || undefined);
      const tab = peekTab(tabId);
      const leafId = tab?.kind === "terminal" ? tab.activeLeafId : null;
      if (leafId === null) return;
      void whenSessionReady(leafId).then(() => {
        writeToSession(leafId, `${detail.command}\r`);
      });
    };
    const onRun = (event: Event) =>
      run((event as CustomEvent<RunInTerminalDetail>).detail);
    window.addEventListener(RUN_IN_TERMINAL_EVENT, onRun);
    const win = getCurrentWebviewWindow();
    const unlisten = win.listen<RunInTerminalDetail>(
      RUN_IN_TERMINAL_EVENT,
      (event) => {
        void win.setFocus();
        run(event.payload);
      },
    );
    return () => {
      window.removeEventListener(RUN_IN_TERMINAL_EVENT, onRun);
      void unlisten.then((off) => off());
    };
  }, [newTab, peekTab]);

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        t.write(`cd ${quoteShellArg(path)}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );
  cdInNewTabRef.current = cdInNewTab;

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean) => {
      // Markdown opens in its rendered view by default; a per-tab toggle flips
      // it to the raw editor. Other files default to preview (pin=false);
      // explicit actions like context-menu "Open" pass pin=true to persist.
      if (isMarkdownPath(path)) newMarkdownTab(path);
      else openFileTab(path, pin ?? false);
    },
    [openFileTab, newMarkdownTab],
  );

  const openLaunchFiles = useCallback(
    (paths: string[]) => {
      for (const path of paths) handleOpenFile(path, true);
    },
    [handleOpenFile],
  );

  // Warm start: the backend emits once the window already exists. Attach on
  // mount so an "Open With" that lands mid-restore isn't dropped — the backend
  // also seeds the drain-once state, so the boot drain below is the safety net.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const off = await listen<string[]>("estate:open-file", (e) => {
        openLaunchFiles(e.payload);
      });
      if (disposed) off();
      else unlisten = off;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openLaunchFiles]);

  // Cold start: files arrive as CLI args (Linux/Windows) or the macOS open-files
  // event, and get_launch_files drains them once. Wait for `booted` — the spaces
  // restore ends in replaceTabs(), which overwrites the whole tab list and would
  // discard a launch tab opened before it, making the file flash open and vanish.
  // Booting first also lands the tab in the restored active space, and lets
  // openFileTab dedupe against a session that already had the file open.
  useEffect(() => {
    if (!booted) return;
    void (async () => {
      openLaunchFiles(await consumeLaunchFiles());
    })();
  }, [booted, openLaunchFiles]);

  const handleExplorerPathRenamed = useCallback(
    (from: string, to: string) => {
      for (const tab of tabsRef.current) {
        if (tab.kind !== "editor" && tab.kind !== "markdown") continue;
        const path = renamedPath(tab.path, from, to);
        if (path === null) continue;
        const i = path.lastIndexOf("/");
        updateTab(tab.id, {
          path,
          title: i === -1 ? path : path.slice(i + 1),
        });
      }
    },
    [updateTab],
  );

  const canReplaceExplorerPath = useCallback(
    (path: string) => !hasOpenPathTab(tabsRef.current, path),
    [],
  );

  const activeTerminalLeafCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        null)
      : null;

  const activeFilePath = (() => {
    if (activeTab?.kind === "editor") return activeTab.path;
    // Estate: a markdown preview shows its file too.
    if (activeTab?.kind === "markdown") return activeTab.path;
    if (activeTab?.kind === "git-diff") {
      if (/^([A-Za-z]:|\/|\\)/.test(activeTab.path)) return activeTab.path;
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    if (activeTab?.kind === "git-commit-file") {
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    return null;
  })();
  const explorerActiveFilePath =
    activeTab?.kind === "editor" || activeTab?.kind === "markdown"
      ? activeTab.path
      : null;
  const isRepositoryContextCurrent = useCallback(
    (spaceId: string, workspaceKey: string) => {
      const currentSpaceId = useSpaces.getState().activeId ?? DEFAULT_SPACE_ID;
      const currentWorkspaceKey = workspaceScopeKey(
        useWorkspaceEnvStore.getState().env,
      );
      return spaceId === currentSpaceId && workspaceKey === currentWorkspaceKey;
    },
    [],
  );
  const openSourceControl = useCallback(() => {
    openSidebarView("source-control");
  }, [openSidebarView]);
  const toggleHiddenFiles = useCallback(() => {
    openSidebarView("explorer");
    void setShowHidden(!usePreferencesStore.getState().showHidden);
  }, [openSidebarView]);
  const {
    repositoryTarget: sourceControlRepositoryTarget,
    openInSourceControl: handleOpenRepositoryInSourceControl,
    openGitHistory: handleOpenGitHistoryForPath,
    followActiveContext: handleFollowRepositoryContext,
  } = useRepositoryTargeting({
    spaceId: sourceControlSpaceId,
    workspaceKey: workspaceScopeKey(workspaceEnv),
    isContextCurrent: isRepositoryContextCurrent,
    openSourceControl,
    openCommitHistoryTab,
  });
  const explorerGitDecorations = usePreferencesStore(
    (s) => s.explorerGitDecorations,
  );
  const sidebarSide = usePreferencesStore((s) => s.sidebarSide);
  const { sourceControl, toggleSourceControl, openGitGraphFromContext } =
    useSourceControlContext({
      activeTab,
      tabs,
      activeTerminalLeafCwd,
      explorerRoot,
      launchCwd,
      launchCwdResolved,
      home,
      sidebarView,
      sidebarCollapsed,
      explorerGitDecorations,
      repositoryTarget: sourceControlRepositoryTarget,
      cycleSidebarView,
      openCommitHistoryTab,
    });

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type.
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const splitActivePaneInActiveTab = useCallback(
    (dir: "row" | "col") => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (!t || t.kind !== "terminal") return;
      splitActivePane(activeId, dir);
    },
    [activeId, splitActivePane],
  );

  const livePaneBounds = useCallback((tabId: number): PaneBounds[] => {
    const tab = document.querySelector<HTMLElement>(
      `[data-terminal-tab="${tabId}"]`,
    );
    if (!tab) return [];
    return [...tab.querySelectorAll<HTMLElement>("[data-pane-leaf]")].flatMap(
      (element) => {
        const id = Number(element.dataset.paneLeaf);
        if (!Number.isFinite(id)) return [];
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return [{ id, left, right, top, bottom }];
      },
    );
  }, []);

  const swapActivePane = useCallback(
    (direction: "left" | "right" | "up" | "down") => {
      swapActivePaneInDirection(activeId, direction, livePaneBounds(activeId));
    },
    [activeId, livePaneBounds, swapActivePaneInDirection],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeId);
    if (t?.kind === "terminal" && leafIds(t.paneTree).length > 1) {
      closeActivePane(activeId);
      return;
    }
    void handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  const [zenMode, setZenMode] = useState(false);

  // Focus an agent's tab, switching to its space first so the header and tab
  // strip don't end up showing a different space than the focused pane.
  const activateAgentTarget = useCallback(
    (tabId: number, leafId: number) => {
      const space = tabsRef.current.find((t) => t.id === tabId)?.spaceId;
      if (space && space !== useSpaces.getState().activeId) {
        useSpaces.getState().setActive(space);
      }
      setActiveId(tabId);
      focusPane(tabId, leafId);
    },
    [setActiveId, focusPane],
  );

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.files": () => openCommandPalette("files"),
      "commandPalette.content": () => openCommandPalette("content"),
      "tab.new": openNewTab,
      "tab.newBlock": openNewBlockTab,
      "tab.newPrivate": openNewPrivateTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseTabOrPane,
      "tab.next": () => stepSwitcher(1),
      "tab.prev": () => stepSwitcher(-1),
      "tab.selectByIndex": (e) =>
        selectByIndex(
          (tabDigit(e, e.shiftKey) ?? 1) - 1,
          activeSpaceId ?? DEFAULT_SPACE_ID,
        ),
      "space.next": () => cycleSpace(1),
      "space.prev": () => cycleSpace(-1),
      "space.overview": () => setSwitcherOpen(true),
      "pane.splitRight": () => splitActivePaneInActiveTab("row"),
      "pane.splitDown": () => splitActivePaneInActiveTab("col"),
      "pane.focusNext": () => focusNextPaneInTab(activeId, 1),
      "pane.focusPrev": () => focusNextPaneInTab(activeId, -1),
      "pane.swapLeft": () => swapActivePane("left"),
      "pane.swapRight": () => swapActivePane("right"),
      "pane.swapUp": () => swapActivePane("up"),
      "pane.swapDown": () => swapActivePane("down"),
      "pane.source": toggleSourceControl,
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "terminal.toggleInput": () =>
        window.dispatchEvent(new CustomEvent(TOGGLE_BLOCK_INPUT_EVENT)),
      "blocks.prev": () => navigateFocusedBlocks(-1),
      "blocks.next": () => navigateFocusedBlocks(1),
      "search.focus": () => {
        const editor = editorRefs.current.get(activeId);
        if (editor) editor.openSearch();
        else searchInlineRef.current?.focus();
      },
      "ai.toggle": togglePanelAndFocus,
      "ai.toggleMini": () => {
        if (!hasComposer) {
          void openSettingsWindow("models");
          return;
        }
        toggleMini();
      },
      "ai.askSelection": onAskFromSelection,
      "agent.focusAttention": () => {
        const t = nextAttentionTarget();
        if (t) activateAgentTarget(t.tabId, t.leafId);
      },
      "settings.open": () => void openSettingsWindow(),
      "sidebar.toggle": toggleSidebar,
      "explorer.focus": toggleExplorerFocus,
      "explorer.toggleHidden": toggleHiddenFiles,
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zenMode": () => setZenMode((v) => !v),
      "editor.undo": () => editorRefs.current.get(activeId)?.undo(),
      "editor.redo": () => editorRefs.current.get(activeId)?.redo(),
      "editor.save": () => {
        void editorRefs.current.get(activeId)?.save();
      },
      "editor.aiComplete": () =>
        editorRefs.current.get(activeId)?.triggerAiComplete(),
      "editor.codeComplete": () =>
        editorRefs.current.get(activeId)?.triggerCodeComplete(),
    }),
    [
      activeId,
      openCommandPalette,
      stepSwitcher,
      cycleSpace,
      handleCloseTabOrPane,
      openNewTab,
      openNewBlockTab,
      openNewPrivateTab,
      openPreviewTab,
      activeSpaceId,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      swapActivePane,
      toggleSourceControl,
      hasComposer,
      togglePanelAndFocus,
      toggleMini,
      onAskFromSelection,
      toggleSidebar,
      toggleExplorerFocus,
      toggleHiddenFiles,
      zoomIn,
      zoomOut,
      zoomReset,
      activateAgentTarget,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      const terminalPaneCount =
        activeTab?.kind === "terminal"
          ? leafIds(activeTab.paneTree).length
          : null;
      if (shouldDisablePaneSwapShortcut(id, terminalPaneCount)) return true;
      if (
        id === "editor.undo" ||
        id === "editor.redo" ||
        id === "editor.save" ||
        id === "editor.aiComplete" ||
        id === "editor.codeComplete"
      ) {
        return activeTab?.kind !== "editor";
      }
      if (id === "ai.askSelection") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return shouldDisableAskSelection(
          e,
          () => isTerminalSurfaceTarget(target),
          () => !!captureActiveSelection()?.trim(),
        );
      }
      if (id === "terminal.clear") {
        // Only intercept ⌘K while a terminal is focused; elsewhere let the key
        // fall through (we never preventDefault when disabled).
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !isTerminalSurfaceTarget(target);
      }
      if (
        id === "terminal.toggleInput" ||
        id === "blocks.prev" ||
        id === "blocks.next"
      ) {
        return !(activeTab?.kind === "terminal" && activeTab.blocks === true);
      }
      if (id === "sidebar.toggle") {
        // Ctrl+B is also Claude Code's "run in background" key. While a terminal
        // is focused, let Ctrl+B reach the shell/Claude instead of toggling the
        // sidebar. Ctrl+Shift+B (second binding) still toggles it from anywhere.
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        const inTerminal = isTerminalSurfaceTarget(target);
        // Only defer the plain (no-shift) Ctrl/⌘+B binding; the Shift variant
        // is the always-on toggle and is never claimed by the terminal.
        return inTerminal && !e.shiftKey;
      }
      return false;
    },
    [activeTab, captureActiveSelection],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  const registerTerminalHandle = useCallback(
    (leafId: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(leafId, h);
      else terminalRefs.current.delete(leafId);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) {
        editorRefs.current.set(id, h);
        const pending = pendingEditorNavigation.current.get(id);
        if (pending != null) {
          pendingEditorNavigation.current.delete(id);
          if (pending.line === undefined) h.focus();
          else h.gotoLine(pending.line, { focus: pending.focus });
        }
      } else {
        editorRefs.current.delete(id);
      }
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  const authorizedCwds = useRef(new Set<string>());
  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => {
      setLeafCwd(leafId, cwd);
      if (cwd && !authorizedCwds.current.has(cwd)) {
        authorizedCwds.current.add(cwd);
        native.workspaceAuthorize(cwd).catch(() => {
          authorizedCwds.current.delete(cwd);
        });
      }
    },
    [setLeafCwd],
  );

  const handleFocusLeaf = useCallback(
    (tabId: number, leafId: number) => focusPane(tabId, leafId),
    [focusPane],
  );

  const onActivateAgent = activateAgentTarget;

  // Estate: the Agents sidebar view.
  const spaceList = useSpaces((s) => s.spaces);
  const spaceNames = useMemo(
    () => new Map(spaceList.map((sp) => [sp.id, sp.name])),
    [spaceList],
  );
  const agentsNeedingYou = useAgentStore(
    (s) =>
      Object.values(s.sessions).filter(
        (a) => a.status === "waiting" && a.waitingReason !== "finished",
      ).length,
  );
  const activateAgentRow = useCallback(
    (tabId: number, leafId: number | null) => {
      if (leafId !== null) {
        activateAgentTarget(tabId, leafId);
        return;
      }
      const space = tabsRef.current.find((t) => t.id === tabId)?.spaceId;
      if (space && space !== useSpaces.getState().activeId) {
        useSpaces.getState().setActive(space);
      }
      setActiveId(tabId);
    },
    [activateAgentTarget, setActiveId],
  );
  // Resumes a saved Claude Code session in a new chat tab.
  const openClaudeSession = useCallback(
    (cwd: string, sessionId: string) => {
      // The chat id is chosen here: the new tab isn't in tabsRef until the
      // next render, so it can't be looked up right after creating it.
      const chatId = newChatId();
      newAgentChatTab("claude", cwd, chatId);
      void import("@/modules/agent-chat/store").then(
        ({ useAgentChatStore }) => {
          const store = useAgentChatStore.getState();
          store.open(chatId, { agent: "claude", cwd });
          void store.openSession(chatId, sessionId);
        },
      );
    },
    [newAgentChatTab],
  );

  const onActivateLocalAgent = useCallback(() => {
    openPanel();
    focusInput(null);
  }, [openPanel, focusInput]);

  const handleLeafExit = useCallback(
    (leafId: number, _code: number) => {
      const all = tabsRef.current;
      const tab = all.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (!tab || tab.kind !== "terminal") return;
      // Last pane of the last tab: quit instead of respawning a shell.
      if (leafIds(tab.paneTree).length === 1 && all.length === 1) {
        void getCurrentWindow().close();
      } else {
        closePaneByLeaf(leafId);
      }
    },
    [closePaneByLeaf],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const handleRenameTab = useCallback(
    (id: number, title: string) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      // Estate: a chat tab's title is its name; empty goes back to the agent.
      if (tab?.kind === "agent-chat") {
        updateTab(id, {
          title: title.trim() || chatTabDefaultTitle(tab.agent, tab.role),
        });
        return;
      }
      updateTab(id, { customTitle: title.trim() });
    },
    [updateTab],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeLeafId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalRefs.current.get(activeLeafId)?.focus(),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeLeafId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  // Estate: a chat tab shows (and works in) its own folder.
  // Estate: a chat shows its folder; tabs without one (browser, editor…)
  // show the project's, instead of "no directory".
  const activeCwd =
    activeTab?.kind === "agent-chat"
      ? activeTab.cwd
      : (activeTerminalLeafCwd ??
        (activeTab?.kind === "terminal" ? null : explorerRoot));

  const handleNewSpace = useCallback(() => {
    const { spaces, create, setActive } = useSpaces.getState();
    const meta = create({
      name: `Space ${spaces.length + 1}`,
      root: activeCwd ?? home ?? null,
      env: workspaceEnv,
    });
    setActiveSpaceForNewTabs(meta.id);
    newTab(activeCwd ?? undefined);
    setActive(meta.id);
    return meta.id;
  }, [activeCwd, home, workspaceEnv, newTab, setActiveSpaceForNewTabs]);

  // Estate: projects (spaces with a folder) from the status bar.
  const spacesForProjects = useSpaces((s) => s.spaces);
  // Re-read recents whenever the project changes (opening marks it) or
  // Clear Recent runs.
  const [recentCleared, setRecentCleared] = useState(readRecentClearedAt);
  // The status bar's switcher lists every project; Clear Recent only empties
  // the welcome screen's list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeSpaceId triggers the re-read
  const allProjects = useMemo(
    () => recentProjects(spacesForProjects, readOpenedAt()),
    [spacesForProjects, activeSpaceId],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeSpaceId triggers the re-read
  const recent = useMemo(
    () => recentProjects(spacesForProjects, readOpenedAt(), recentCleared),
    [spacesForProjects, activeSpaceId, recentCleared],
  );
  const clearRecentProjects = useCallback(() => {
    const now = Date.now();
    clearRecent(now);
    setRecentCleared(now);
  }, []);
  const switchProject = useCallback((spaceId: string) => {
    markOpened(spaceId);
    useSpaces.getState().setActive(spaceId);
  }, []);
  /** Opens (or switches to) the folder's project; false if it can't. */
  const openProjectFolder = useCallback(
    async (folder: string): Promise<boolean> => {
      try {
        await native.workspaceAuthorize(folder);
      } catch (error) {
        toast.error("Could not open this folder", {
          description: String(error),
        });
        return false;
      }
      const { spaces, create, setActive } = useSpaces.getState();
      const existing = projectForFolder(spaces, folder);
      if (existing) {
        switchProject(existing.id);
        return true;
      }
      const meta = create({
        name: folderName(folder),
        root: folder,
        env: workspaceEnv,
      });
      markOpened(meta.id);
      setActiveSpaceForNewTabs(meta.id);
      newTab(folder);
      setActive(meta.id);
      return true;
    },
    [switchProject, workspaceEnv, setActiveSpaceForNewTabs, newTab],
  );
  const pickFolder = useCallback(async (): Promise<string | null> => {
    let picked: string | string[] | null;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      picked = await open({
        directory: true,
        multiple: false,
        title: "Open Project",
      });
    } catch (error) {
      // Estate: say why instead of doing nothing.
      console.error("Open Project failed:", error);
      toast.error("Couldn't open the folder picker", {
        description: String(error),
      });
      return null;
    }
    return typeof picked === "string" ? picked : null;
  }, []);
  const pickProjectFolder = useCallback(async (): Promise<boolean> => {
    const picked = await pickFolder();
    if (!picked) return false;
    return openProjectFolder(picked);
  }, [pickFolder, openProjectFolder]);

  // Estate: a project with work tabs (chats, editors; not the terminal that
  // opening adds) or agent sessions skips the welcome chat box and goes
  // straight to its work. The folder must be authorized first (opening does
  // that); each agent is asked for one session, stopping at the first hit.
  const hasAgentSessions = useCallback(async (root: string) => {
    const { listChatSessions } = await import("@/modules/agent-chat/store");
    return anyAgentHasSession(CHAT_AGENTS, (a) =>
      listChatSessions(a, root, 1).then((list) => list.length),
    );
  }, []);
  /** Open Project from the welcome screen: true to show its chat box. */
  const openFolderFromWelcome = useCallback(async (): Promise<boolean> => {
    const picked = await pickFolder();
    if (!picked) return false;
    if (!(await openProjectFolder(picked))) return false;
    const opened = projectForFolder(useSpaces.getState().spaces, picked);
    if (
      await projectHasSession({
        workTabs: opened ? workTabCount(tabsRef.current, opened.id) : 0,
        root: picked,
        hasSessions: hasAgentSessions,
      })
    ) {
      setWelcomeOpen(false);
      return false;
    }
    return true;
  }, [pickFolder, openProjectFolder, hasAgentSessions]);
  /** A recent project from the welcome screen: true to show its chat box. */
  const switchFromWelcome = useCallback(
    async (spaceId: string): Promise<boolean> => {
      const meta = useSpaces.getState().spaces.find((s) => s.id === spaceId);
      if (spaceId !== useSpaces.getState().activeId) switchProject(spaceId);
      const root = meta?.root ?? null;
      if (
        await projectHasSession({
          workTabs: workTabCount(tabsRef.current, spaceId),
          root,
          hasSessions: async (r) => {
            await native.workspaceAuthorize(r);
            return hasAgentSessions(r);
          },
        })
      ) {
        setWelcomeOpen(false);
        return false;
      }
      return true;
    },
    [switchProject, hasAgentSessions],
  );

  // Estate: Create New Project makes root/name and opens it.
  const createProject = useCallback(
    async (name: string, root: string): Promise<string | null> => {
      const path = `${root.replace(/\/+$/, "")}/${name}`;
      try {
        await invoke("fs_create_dir", {
          path,
          workspace: currentWorkspaceEnv(),
        });
      } catch (error) {
        const why = String(error);
        return why.includes("already exists")
          ? `${name} already exists there. Choose another name, or use Open Project.`
          : `Couldn't create the folder: ${why}`;
      }
      return (await openProjectFolder(path))
        ? null
        : "The folder was created but couldn't be opened. Try Open Project.";
    },
    [openProjectFolder],
  );

  // Estate: the welcome screen, once per launch (Settings > General > Startup).
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const welcomeChecked = useRef(false);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const showWelcomePref = usePreferencesStore((s) => s.showWelcome);
  const orchestratorAgentPref = usePreferencesStore((s) => s.orchestratorAgent);
  useEffect(() => {
    if (welcomeChecked.current || !spacesHydrated || !prefsHydrated) return;
    welcomeChecked.current = true;
    if (showWelcomePref) setWelcomeOpen(true);
  }, [spacesHydrated, prefsHydrated, showWelcomePref]);
  const welcomeProject =
    spacesForProjects.find((sp) => sp.id === activeSpaceId) ?? null;
  const startChatFromWelcome = useCallback(
    (prompt: string, agent: ChatAgentId) => {
      setWelcomeOpen(false);
      const cwd = welcomeProject?.root ?? inheritedCwdForNewTab() ?? home;
      if (!cwd) return;
      const chatId = newChatId();
      void native
        .workspaceAuthorize(cwd)
        .then(() => {
          newAgentChatTab(agent, cwd, chatId);
          if (!prompt) return;
          return import("@/modules/agent-chat/store").then(
            ({ useAgentChatStore }) => {
              const store = useAgentChatStore.getState();
              store.open(chatId, { agent, cwd });
              void store.send(chatId, prompt);
            },
          );
        })
        .catch((error) =>
          toast.error("Could not open this folder for the agent", {
            description: String(error),
          }),
        );
    },
    [welcomeProject, inheritedCwdForNewTab, home, newAgentChatTab],
  );
  // Estate Orchestrator: plans a goal in its own chat, then runs the tasks.
  const planWithOrchestrator = useCallback(
    (goal: string, agent: ChatAgentId) => {
      setWelcomeOpen(false);
      const cwd = welcomeProject?.root ?? inheritedCwdForNewTab() ?? home;
      if (!cwd) return;
      const chatId = newChatId();
      const instructions = resolveInstructions(
        usePreferencesStore.getState().orchestratorInstructions,
      );
      void native
        .workspaceAuthorize(cwd)
        .then(() => {
          newAgentChatTab(agent, cwd, chatId, {
            title: chatTabDefaultTitle(agent, "orchestrator"),
            role: "orchestrator",
          });
          return import("@/modules/agent-chat/store").then(
            ({ useAgentChatStore }) => {
              const store = useAgentChatStore.getState();
              store.open(chatId, { agent, cwd });
              void store.send(chatId, orchestratorPrompt(instructions, goal));
            },
          );
        })
        .catch((error) =>
          toast.error("Could not open this folder for the agent", {
            description: String(error),
          }),
        );
    },
    [welcomeProject, inheritedCwdForNewTab, home, newAgentChatTab],
  );
  // The AI panel's Orchestrator: plans with the agent its chat bar shows
  // (the set one, or the first signed-in one; sign-in checks are cached).
  useEffect(() => {
    const onGoal = (event: Event) => {
      const goal = (event as CustomEvent<OrchestrateDetail>).detail?.goal;
      if (!goal) return;
      const pref = usePreferencesStore.getState().orchestratorAgent;
      if (pref !== "ask") {
        planWithOrchestrator(goal, pref);
        return;
      }
      void Promise.all(CHAT_AGENTS.map((a) => checkAgentAuth(a))).then(
        (states) => {
          const auth = Object.fromEntries(
            CHAT_AGENTS.map((a, i) => [a, states[i]]),
          );
          planWithOrchestrator(goal, resolvePlanner(pref, auth));
        },
      );
    };
    window.addEventListener(ORCHESTRATE_EVENT, onGoal);
    return () => window.removeEventListener(ORCHESTRATE_EVENT, onGoal);
  }, [planWithOrchestrator]);
  useEffect(() => {
    setOrchestratorHost({
      openChat: (agent, cwd, chatId, title) =>
        newAgentChatTab(agent, cwd, chatId, { title, background: true }),
      focusChat: (chatId) => {
        const tab = tabsRef.current.find(
          (t) => t.kind === "agent-chat" && t.chatId === chatId,
        );
        if (tab) setActiveId(tab.id);
      },
    });
    return () => setOrchestratorHost(null);
  }, [newAgentChatTab, setActiveId]);
  const folderActions = useCallback(
    (path: string): FolderAction[] => [
      { label: "Open as project", run: () => void openProjectFolder(path) },
      { label: "New terminal here", run: () => cdInNewTab(path) },
      ...(activeTab?.kind === "terminal"
        ? [{ label: "cd in this terminal", run: () => sendCd(path) }]
        : []),
    ],
    [openProjectFolder, cdInNewTab, sendCd, activeTab],
  );

  const handleDeleteSpace = useCallback(
    (id: string) => {
      const nextSpaceId = useSpaces.getState().remove(id);
      if (!nextSpaceId) return;
      const root = useSpaces
        .getState()
        .spaces.find((s) => s.id === nextSpaceId)?.root;
      removeTabsForSpace(id, nextSpaceId, root ?? undefined);
    },
    [removeTabsForSpace],
  );

  const handleMoveTab = useCallback(
    (tabId: number, targetSpaceId: string) => {
      if (moveTabToSpace(tabId, targetSpaceId)) {
        useSpaces.getState().setActive(targetSpaceId);
      }
    },
    [moveTabToSpace],
  );

  const handleReorderTab = useCallback(
    (tabId: number, targetTabId: number, edge: "top" | "bottom") => {
      if (reorderTab(tabId, targetTabId, edge)) {
        const target = tabsRef.current.find((x) => x.id === targetTabId);
        if (target) useSpaces.getState().setActive(target.spaceId);
      }
    },
    [reorderTab],
  );

  const handleNewTabInSpace = useCallback(
    (spaceId: string) => {
      const root = useSpaces
        .getState()
        .spaces.find((s) => s.id === spaceId)?.root;
      newTabInSpace(spaceId, root ?? undefined);
    },
    [newTabInSpace],
  );

  const jumpToTab = useCallback(
    (tabId: number) => {
      const t = tabsRef.current.find((x) => x.id === tabId);
      if (!t) return;
      setActiveId(tabId);
      useSpaces.getState().setActive(t.spaceId);
      setSwitcherOpen(false);
    },
    [setActiveId],
  );

  const spaceSwitcher = (
    <SpaceSwitcher
      open={switcherOpen}
      onOpenChange={setSwitcherOpen}
      tabs={tabs}
      onNewSpace={() => void handleNewSpace()}
      onDeleteSpace={handleDeleteSpace}
      onNewTabInSpace={handleNewTabInSpace}
      onJumpTab={jumpToTab}
      onCloseTab={handleClose}
      onMoveTabToSpace={handleMoveTab}
      onReorderTab={handleReorderTab}
      onReorderSpaces={(ids) => useSpaces.getState().reorder(ids)}
    />
  );

  const commandPaletteItems = useMemo(
    () =>
      commandPaletteOpen
        ? createCommandItems({
            tabs,
            activeId,
            searchTarget,
            explorerRoot,
            home,
            openNewTab,
            openNewBlock: openNewBlockTab,
            openNewPrivate: openNewPrivateTab,
            openNewEditor: () => setNewEditorOpen(true),
            openNewPreview: () => openPreviewTab(""),
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseTabOrPane,
            splitPaneRight: () => splitActivePaneInActiveTab("row"),
            splitPaneDown: () => splitActivePaneInActiveTab("col"),
            focusSearch: () => searchInlineRef.current?.focus(),
            focusExplorerSearch: () => explorerRef.current?.focusSearch(),
            toggleSidebar,
            toggleHiddenFiles,
            toggleAi: togglePanelAndFocus,
            askAiSelection: askFromSelection,
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow("shortcuts"),
            spaces: useSpaces.getState().spaces,
            activeSpaceId,
            openSpacesOverview: () => setSwitcherOpen(true),
            newSpace: () => void handleNewSpace(),
            switchSpace: (id) => useSpaces.getState().setActive(id),
          })
        : [],
    [
      commandPaletteOpen,
      tabs,
      activeId,
      searchTarget,
      explorerRoot,
      home,
      openNewTab,
      openNewBlockTab,
      openNewPrivateTab,
      openPreviewTab,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseTabOrPane,
      splitActivePaneInActiveTab,
      toggleSidebar,
      toggleHiddenFiles,
      togglePanelAndFocus,
      askFromSelection,
      activeSpaceId,
      handleNewSpace,
    ],
  );

  const pendingEditorNavigation = useRef<
    Map<number, { line?: number; focus: boolean }>
  >(new Map());
  const openContentHit = useCallback(
    (path: string, line: number) => {
      const id = openFileTab(path, true);
      if (id == null) return;
      const h = editorRefs.current.get(id);
      if (h) h.gotoLine(line);
      else pendingEditorNavigation.current.set(id, { line, focus: true });
    },
    [openFileTab],
  );

  // `target.side` (open to the side) has no host support yet: plain open.
  const openPaletteFile = useCallback(
    (path: string, target: OpenFileTarget) => {
      if (target.line !== undefined) openContentHit(path, target.line);
      else handleOpenFile(path, true);
    },
    [openContentHit, handleOpenFile],
  );

  const openControlFile = useCallback(
    ({
      path,
      line,
      focus,
      spaceId,
    }: {
      path: string;
      line?: number;
      focus: boolean;
      spaceId: string;
    }) => {
      if (focus && useSpaces.getState().activeId !== spaceId) {
        useSpaces.getState().setActive(spaceId);
      }
      const id = openFileTab(path, true, {
        spaceId,
        activate: focus,
      });
      const editor = editorRefs.current.get(id);
      if (line !== undefined) {
        if (editor) editor.gotoLine(line, { focus });
        else pendingEditorNavigation.current.set(id, { line, focus });
      } else if (focus) {
        if (editor) editor.focus();
        else pendingEditorNavigation.current.set(id, { focus: true });
      }
      return id;
    },
    [openFileTab],
  );

  useControlBridge({
    ready: spacesHydrated && launchCwdResolved,
    tabsRef,
    activeTabIdRef: activeIdRef,
    activeSpaceIdRef,
    onOpen: openControlFile,
  });

  useEffect(() => {
    setLspNavigator({ openFile: openContentHit });
    return () => setLspNavigator(null);
  }, [openContentHit]);

  const insertHistoryCommand = useMemo(
    () =>
      isTerminalTab && activeLeafId !== null
        ? (cmd: string) => {
            writeToSession(activeLeafId, cmd);
            terminalRefs.current.get(activeLeafId)?.focus();
          }
        : null,
    [isTerminalTab, activeLeafId],
  );

  useAiLiveBridge({
    setLive,
    activeId,
    tabs,
    explorerRoot,
    launchCwd,
    home,
    openPreviewTab,
    newAgentTab,
    terminalRefs,
  });

  // The sidebar renders in a slot before or after the workspace; the workspace keeps
  // its place among the group's children, so switching sides never remounts it.
  const sidebarPanel = (
    <ResizablePanel
      id="sidebar"
      panelRef={sidebarRef}
      defaultSize={
        initialSidebarCollapsed ? "0px" : `${sidebarWidthRef.current}px`
      }
      minSize={`${SIDEBAR_MIN_WIDTH}px`}
      maxSize={`${SIDEBAR_MAX_WIDTH}px`}
      collapsible
      collapsedSize={0}
      onResize={(size) => {
        persistSidebarCollapsed(size.inPixels <= 0);
      }}
    >
      <div
        className={
          sidebarSide === "left"
            ? "h-full min-h-0 pl-2 pr-0.5"
            : "h-full min-h-0 pl-0.5 pr-2"
        }
      >
        <div className="estate-pane flex h-full min-h-0 flex-col">
          <div
            key={sidebarView}
            className="min-h-0 flex-1 estate-panel-in"
            data-side={sidebarSide}
          >
            {sidebarView === "explorer" ? (
              <FileExplorer
                ref={explorerRef}
                rootPath={explorerRoot}
                gitStatus={explorerGitDecorations ? sourceControl.status : null}
                activeFilePath={explorerActiveFilePath}
                onOpenFile={handleOpenFile}
                onPathRenamed={handleExplorerPathRenamed}
                onPathsDeleted={handlePathsDeleted}
                canReplacePath={canReplaceExplorerPath}
                onRevealInTerminal={cdInNewTab}
                onOpenInSourceControl={handleOpenRepositoryInSourceControl}
                onOpenGitHistory={handleOpenGitHistoryForPath}
                onAttachToAgent={handleAttachFileToAgent}
                pathDropTarget={explorerPathDropTarget}
                visible={!sidebarCollapsed}
              />
            ) : sidebarView === "agents" ? (
              <AgentsPanel
                tabs={tabs}
                activeTabId={activeId}
                activeSpaceId={activeSpaceId ?? DEFAULT_SPACE_ID}
                spaceNames={spaceNames}
                cwd={explorerRoot}
                onActivate={activateAgentRow}
                onOpenSession={openClaudeSession}
              />
            ) : (
              <SourceControlPanel
                open
                sourceControl={sourceControl}
                onOpenDiff={openGitDiffTab}
                onOpenGitGraph={openGitGraphFromContext}
                onOpenFile={handleOpenFile}
                onNavigateToPath={cdInNewTab}
                repositoryTarget={sourceControlRepositoryTarget}
                onFollowRepositoryContext={handleFollowRepositoryContext}
              />
            )}
          </div>
          <SidebarRail
            activeView={sidebarView}
            onSelectView={persistSidebarView}
            changedCount={sourceControl.changedCount}
            attentionCount={agentsNeedingYou}
          />
        </div>
      </div>
    </ResizablePanel>
  );
  const sidebarHandle = (
    <ResizableHandle className="w-1 rounded-full bg-transparent transition-colors duration-[var(--dur-fast)] after:w-4 hover:bg-border" />
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        {BenchBridge && (
          <Suspense fallback={null}>
            <BenchBridge
              tabs={tabs}
              activeId={activeId}
              booted={booted}
              setActiveId={setActiveId}
              newTab={newTab}
              newBlockTab={newBlockTab}
              newAgentGroupTab={newAgentGroupTab}
              splitActivePane={splitActivePane}
              closeTab={closeTab}
              readBuffer={(leafId, maxLines) =>
                terminalRefs.current.get(leafId)?.getBuffer(maxLines) ?? null
              }
            />
          </Suspense>
        )}
        {welcomeOpen && (
          <WelcomeScreen
            current={welcomeProject}
            recent={recent}
            onClearRecent={clearRecentProjects}
            home={home}
            showOnStartup={showWelcomePref}
            onShowOnStartupChange={(v) => void setShowWelcome(v)}
            onOpenFolder={openFolderFromWelcome}
            onCreateProject={createProject}
            onSwitchProject={switchFromWelcome}
            onStartChat={startChatFromWelcome}
            planAgent={orchestratorAgentPref}
            onPlan={planWithOrchestrator}
            onNewTerminal={() => {
              setWelcomeOpen(false);
              newTab(welcomeProject?.root ?? undefined);
            }}
            onOpenCommandPalette={() => {
              setWelcomeOpen(false);
              openCommandPalette("commands");
            }}
            onClose={() => setWelcomeOpen(false)}
          />
        )}
        <div className="relative flex h-screen flex-col overflow-hidden bg-frame text-foreground">
          {!zenMode && (
            <Header
              tabs={spaceTabs}
              activeId={activeId}
              onSelect={setActiveId}
              onNew={openNewTab}
              onNewBlock={openNewBlockTab}
              onNewPrivate={openNewPrivateTab}
              onNewPreview={() => openPreviewTab("")}
              onNewEditor={() => setNewEditorOpen(true)}
              onNewGitGraph={openGitGraphFromContext}
              onLaunchAgents={launchAgentGroup}
              onClose={handleClose}
              onCloseTabsToRight={handleCloseTabsToRight}
              onCloseOtherTabs={handleCloseOtherTabs}
              onPin={pinTab}
              onRename={handleRenameTab}
              onReorder={reorderTabByGap}
              onDropOnPane={(id, target) =>
                workspaceLayout.dropTabOnPane(id, target.leafId, target.zone)
              }
              onSplit={workspaceLayout.splitWithTab}
              onClosePane={workspaceLayout.closePaneOfTab}
              splitTabIds={workspaceLayout.splitTabIds}
              groupOfTab={workspaceLayout.groupOfTab}
              onToggleSidebar={toggleSidebar}
              onOpenCommandPalette={() => openCommandPalette("commands")}
              onActivateAgent={onActivateAgent}
              onActivateLocalAgent={onActivateLocalAgent}
              onOpenSettings={() => void openSettingsWindow()}
              spaceSwitcher={spaceSwitcher}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
              onOverrideLanguage={setOverrideLanguage}
            />
          )}

          <main className="zoom-content flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
              onLayoutChanged={(_, { isUserInteraction }) => {
                const width = sidebarRef.current?.getSize().inPixels ?? 0;
                persistSidebarWidth(width, isUserInteraction);
              }}
            >
              {sidebarSide === "left" && sidebarPanel}
              {sidebarSide === "left" && sidebarHandle}
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <div
                  className={
                    sidebarSide === "left"
                      ? "h-full min-h-0 pl-0.5 pr-2"
                      : "h-full min-h-0 pl-2 pr-0.5"
                  }
                >
                  <div className="estate-pane flex h-full min-h-0 flex-col">
                    <div className="relative min-h-0 flex-1">
                      <WorkspaceSurface
                        tabs={tabs}
                        activeId={activeId}
                        layout={workspaceLayout.layout}
                        split={workspaceLayout.split}
                        onFocusPane={workspaceLayout.focusPane}
                        onPaneSizes={workspaceLayout.setSizes}
                        registerTerminalHandle={registerTerminalHandle}
                        onSearchReady={handleSearchReady}
                        onCwd={handleTerminalCwd}
                        onExit={handleLeafExit}
                        onFocusLeaf={handleFocusLeaf}
                        registerEditorHandle={registerEditorHandle}
                        onEditorDirtyChange={handleEditorDirty}
                        onEditorCloseTab={disposeTab}
                        registerPreviewHandle={registerPreviewHandle}
                        onPreviewUrlChange={handlePreviewUrl}
                        onAiDiffAccept={(id) => respondToApproval(id, true)}
                        onAiDiffReject={(id) => respondToApproval(id, false)}
                        onOpenCommitFile={openCommitFileDiffTab}
                        onGitHistorySearchHandle={setGitHistoryHandle}
                        onSetMarkdownView={setMarkdownView}
                        onRenameTab={handleRenameTab}
                      />
                    </div>

                    <WorkspaceInputBar
                      isBlockTab={isBlockTab}
                      isTerminalTab={isTerminalTab}
                      activeLeafId={activeLeafId}
                      cwd={activeCwd}
                      home={home}
                      hasComposer={hasComposer}
                      panelOpen={panelOpen}
                      keysLoaded={keysLoaded}
                      onConnect={() => void openSettingsWindow("models")}
                    />
                  </div>
                </div>
              </ResizablePanel>
              {sidebarSide === "right" && sidebarHandle}
              {sidebarSide === "right" && sidebarPanel}
            </ResizablePanelGroup>
          </main>

          {!zenMode && (
            <StatusBar
              cwd={activeCwd}
              filePath={activeFilePath}
              home={home}
              // Estate: a plain click opens a new terminal; the menu offers more.
              onCd={cdInNewTab}
              folderActions={folderActions}
              project={
                <ProjectButton
                  projects={allProjects}
                  activeSpaceId={activeSpaceId}
                  activeName={
                    spacesForProjects.find((sp) => sp.id === activeSpaceId)
                      ?.name ?? "Project"
                  }
                  home={home}
                  onSwitch={switchProject}
                  onOpenFolder={() => void pickProjectFolder()}
                  onShowWelcome={() => setWelcomeOpen(true)}
                />
              }
              onWorkspaceChange={handleWorkspaceChange}
              onOpenMini={openMini}
              onOpenAi={togglePanelAndFocus}
              hasComposer={hasComposer}
              privateActive={
                activeTab?.kind === "terminal" && activeTab.private === true
              }
            />
          )}

          <WindowVibrancyBridge />
          {IS_MAC ? <LivePageResizeBridge /> : null}
          <WindowActivityBridge
            bindFocus={bindTerminalWindowFocus}
            subscribePresentation={subscribeWindowPresentation}
          />

          <AgentNotificationsBridge
            tabs={tabs}
            activeId={activeId}
            onActivate={onActivateAgent}
          />
          <Toaster position="bottom-right" />

          {hasComposer ? (
            <>
              <AgentRunBridge
                openAiDiffTab={openAiDiffTab}
                closeAiDiffTab={closeAiDiffTab}
              />
              <LocalAgentNotificationsBridge />
            </>
          ) : null}

          {hasComposer && miniPresence.mounted ? (
            <AiMiniWindow state={miniPresence.state} />
          ) : null}
          {askPresence.mounted ? (
            <SelectionAskAi
              state={askPresence.state}
              x={askPopup?.x ?? 0}
              y={askPopup?.y ?? 0}
              onAsk={onAskFromSelection}
              onDismiss={() => setAskPopup(null)}
            />
          ) : null}

          {switcherState && (
            <TabSwitcherHud tabs={spaceTabs} state={switcherState} />
          )}

          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            initialMode={paletteInitialMode}
            commandItems={commandPaletteItems}
            workspaceRoot={explorerRoot}
            onOpenContentHit={openContentHit}
            onOpenFile={openPaletteFile}
            insertCommand={insertHistoryCommand}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <UpdaterDialog />

          <CloseDialogs
            tabs={tabs}
            pendingCloseTab={pendingCloseTab}
            onCancelClose={cancelClose}
            onConfirmClose={confirmClose}
            pendingTerminalCloseTab={pendingTerminalCloseTab}
            onCancelTerminalClose={cancelTerminalClose}
            onConfirmTerminalClose={confirmTerminalClose}
            pendingDeleteTabs={pendingDeleteTabs}
            onCancelDeleteClose={cancelDeleteClose}
            onConfirmDeleteClose={confirmDeleteClose}
            pendingCloseMany={pendingCloseMany}
            closeManyConfirming={closeManyConfirming}
            onCancelCloseMany={cancelCloseMany}
            onConfirmCloseMany={confirmCloseMany}
            pendingAppClose={pendingAppClose}
            onCancelAppClose={cancelAppClose}
            onConfirmAppClose={confirmAppClose}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return <AiComposerProvider>{shell}</AiComposerProvider>;
}
