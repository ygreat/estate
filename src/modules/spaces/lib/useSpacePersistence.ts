// Modified by ygreat for Estate, 2026. Originally part of Terax.
import { useCallback, useEffect, useRef } from "react";
import type { Tab } from "@/modules/tabs";
import { type Groups, serializeGroups } from "@/modules/layout/groups";
import { useLayoutStore } from "@/modules/layout/store";
import { isSerializableTab, serializeTabs } from "./serialize";
import { saveState } from "./store";
import { useSpaces } from "./useSpaces";

const DEBOUNCE_MS = 3000;

type Snapshot = {
  tabs: Tab[];
  activeId: number;
  activeSpaceId: string;
  groups: Record<string, Groups>;
};

type Params = Omit<Snapshot, "groups"> & {
  /** Gate writes until boot hydration finished, so restore never round-trips. */
  enabled: boolean;
};

type LastWrite = { json: string; activeTabIndex: number };

function groupsFor(group: Tab[], groups: Groups | undefined) {
  if (!groups?.length) return undefined;
  const index = new Map<number, number>();
  const saved = group.filter(isSerializableTab);
  for (let i = 0; i < saved.length; i++) index.set(saved[i].id, i);
  return serializeGroups(groups, (id) => index.get(id));
}

export function useSpacePersistence({
  tabs,
  activeId,
  activeSpaceId,
  enabled,
}: Params) {
  const last = useRef<Map<string, LastWrite>>(new Map());
  const seeded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groups = useLayoutStore((s) => s.groups);
  const latest = useRef<Snapshot>({ tabs, activeId, activeSpaceId, groups });
  latest.current = { tabs, activeId, activeSpaceId, groups };

  // Seed each space's last-known active index from disk so the first flush
  // preserves it for spaces the user never opens (empty json forces one write
  // with the correct index rather than clobbering it to 0).
  if (enabled && !seeded.current) {
    seeded.current = true;
    for (const [id, idx] of Object.entries(
      useSpaces.getState().initialActiveIndex,
    )) {
      last.current.set(id, { json: "", activeTabIndex: idx });
    }
  }

  const flush = useCallback((snap: Snapshot) => {
    const groups = new Map<string, Tab[]>();
    for (const t of snap.tabs) {
      const arr = groups.get(t.spaceId);
      if (arr) arr.push(t);
      else groups.set(t.spaceId, [t]);
    }

    for (const [spaceId, group] of groups) {
      const serialized = serializeTabs(group);
      const prev = last.current.get(spaceId);
      let activeTabIndex = prev?.activeTabIndex ?? 0;
      if (spaceId === snap.activeSpaceId) {
        const idx = group
          .filter(isSerializableTab)
          .findIndex((t) => t.id === snap.activeId);
        if (idx >= 0) activeTabIndex = idx;
      }
      const savedGroups = groupsFor(group, snap.groups[spaceId]);
      const json = JSON.stringify(
        savedGroups ? [serialized, savedGroups] : serialized,
      );
      if (
        prev &&
        prev.json === json &&
        prev.activeTabIndex === activeTabIndex
      ) {
        continue;
      }
      last.current.set(spaceId, { json, activeTabIndex });
      void saveState(spaceId, {
        tabs: serialized,
        activeTabIndex,
        ...(savedGroups && { groups: savedGroups }),
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const snap: Snapshot = { tabs, activeId, activeSpaceId, groups };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      flush(snap);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tabs, activeId, activeSpaceId, groups, enabled, flush]);

  useEffect(() => {
    if (!enabled) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush(latest.current);
    };
    const onLeave = () => flush(latest.current);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      flush(latest.current);
    };
  }, [enabled, flush]);
}
