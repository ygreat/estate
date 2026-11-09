// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { firePendingReviewForSession } from "@/modules/agents/lib/review";
import { checkAgentAuth, watchSignedIn } from "@/modules/agent-chat/auth";
import { getModel, getProvider, isKnownModelId } from "../config";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { onKeysChanged } from "@/modules/settings/store";
import {
  getAllCustomEndpointKeys,
  getAllKeys,
  hasAnyKey,
} from "../lib/keyring";
import { useAgentsStore } from "../store/agentsStore";
import { useChatStore } from "../store/chatStore";
import { useSnippetsStore } from "../store/snippetsStore";

/**
 * Startup wiring for the AI subsystem: loads provider keys (and keeps them in
 * sync), hydrates the preference store and mirrors the default model, hydrates
 * chat/agents/snippets stores, and fires any pending review for the active
 * session. Returns the two derived flags the shell needs.
 */
export function useAiBootstrap(): {
  hasComposer: boolean;
  keysLoaded: boolean;
} {
  const apiKeys = useChatStore((s) => s.apiKeys);
  const setApiKeys = useChatStore((s) => s.setApiKeys);
  const setCustomEndpointKeys = useChatStore((s) => s.setCustomEndpointKeys);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const hydrateSessions = useChatStore((s) => s.hydrateSessions);

  useEffect(() => {
    if (activeSessionId) firePendingReviewForSession(activeSessionId);
  }, [activeSessionId]);

  const lmstudioModelId = usePreferencesStore((s) => s.lmstudioModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const mlxModelId = usePreferencesStore((s) => s.mlxModelId);
  const mlxBaseURL = usePreferencesStore((s) => s.mlxBaseURL);
  const ollamaModelId = usePreferencesStore((s) => s.ollamaModelId);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);
  const openaiCompatibleModelId = usePreferencesStore(
    (s) => s.openaiCompatibleModelId,
  );
  const openaiCompatibleBaseURL = usePreferencesStore(
    (s) => s.openaiCompatibleBaseURL,
  );
  const customEndpoints = usePreferencesStore((s) => s.customEndpoints);
  const hasLocalModel =
    (lmstudioBaseURL.trim().length > 0 && lmstudioModelId.trim().length > 0) ||
    (mlxBaseURL.trim().length > 0 && mlxModelId.trim().length > 0) ||
    (ollamaBaseURL.trim().length > 0 && ollamaModelId.trim().length > 0) ||
    (openaiCompatibleBaseURL.trim().length > 0 &&
      openaiCompatibleModelId.trim().length > 0) ||
    customEndpoints.some(
      (e) => e.baseURL.trim().length > 0 && e.modelId.trim().length > 0,
    );
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const [keysLoaded, setKeysLoaded] = useState(false);

  // Estate: a signed-in Claude Code or Codex can power the panel without a
  // key. Checked only when there's no key or local model, and again when the
  // window regains focus (after signing in).
  const keyless = keysLoaded && !hasAnyKey(apiKeys) && !hasLocalModel;
  const [hasAccount, setHasAccount] = useState(false);
  useEffect(() => {
    if (!keyless) return;
    return watchSignedIn(["claude", "codex"], setHasAccount);
  }, [keyless]);
  const hasComposer = hasAnyKey(apiKeys) || hasLocalModel || hasAccount;
  useEffect(() => {
    let alive = true;
    const loadProviderKeys = () => {
      void getAllKeys().then((keys) => {
        if (!alive) return;
        setApiKeys(keys);
        setKeysLoaded(true);
      });
    };
    const reload = () => {
      loadProviderKeys();
      if (!usePreferencesStore.getState().hydrated) return;
      void getAllCustomEndpointKeys(
        usePreferencesStore.getState().customEndpoints,
      ).then((epKeys) => {
        if (!alive) return;
        setCustomEndpointKeys(epKeys);
      });
    };
    loadProviderKeys();
    const unlistenP = onKeysChanged(reload);
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, [setApiKeys, setCustomEndpointKeys]);

  useEffect(() => {
    if (!prefsHydrated) return;
    let alive = true;
    void getAllCustomEndpointKeys(
      usePreferencesStore.getState().customEndpoints,
    ).then((epKeys) => {
      if (alive) setCustomEndpointKeys(epKeys);
    });
    return () => {
      alive = false;
    };
  }, [setCustomEndpointKeys, prefsHydrated]);

  // Hydrate the cross-window preference store and mirror the default model
  // into chatStore so the dropdown reflects what the user picked in Settings.
  const initPrefs = usePreferencesStore((s) => s.init);
  const prefDefaultModel = usePreferencesStore((s) => s.defaultModelId);
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  // Estate: with only an account (no key), start on the account's model
  // rather than a default that needs a key.
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  useEffect(() => {
    if (!hasAccount || !keyless || !isKnownModelId(selectedModelId)) return;
    if (getProvider(getModel(selectedModelId).provider).account) return;
    void checkAgentAuth("claude").then((a) =>
      setSelectedModelId(
        a.state === "signed-in"
          ? "claude-account-sonnet"
          : "chatgpt-account-default",
      ),
    );
  }, [hasAccount, keyless, selectedModelId, setSelectedModelId]);

  useEffect(() => {
    void hydrateSessions().catch((error: unknown) => {
      toast.error("Could not load chat history", {
        id: "chat-history-load",
        description: String(error),
      });
    });
    void useAgentsStore.getState().hydrate();
    void useSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  return { hasComposer, keysLoaded };
}
