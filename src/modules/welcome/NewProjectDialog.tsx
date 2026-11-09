import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { shortPath } from "@/modules/spaces/lib/projects";

type Props = {
  open: boolean;
  home: string | null;
  onOpenChange: (open: boolean) => void;
  /** Creates `root/name` and opens it; resolves an error message, or null. */
  onCreate: (name: string, root: string) => Promise<string | null>;
};

const ROOT_KEY = "estate:new-project-root";

function readRoot(home: string | null): string {
  try {
    const saved = localStorage.getItem(ROOT_KEY);
    if (saved) return saved;
  } catch {
    // Private storage off: fall back to the default.
  }
  return home ? `${home.replace(/\/+$/, "")}/Projects` : "";
}

function writeRoot(root: string): void {
  try {
    localStorage.setItem(ROOT_KEY, root);
  } catch {
    // Private storage off: the folder just isn't remembered.
  }
}

/** Why a project name can't be used as a folder name, or null if it can. */
export function projectNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return "Give the project a name.";
  if (n === "." || n === "..") return "Choose another name.";
  if (/[/\\:]/.test(n)) return "Names can't contain / \\ or :";
  if (n.startsWith(".")) return "Names can't start with a dot.";
  if (n.length > 100) return "Keep the name under 100 characters.";
  return null;
}

/** The new project's folder: the root plus the name. */
export function projectPath(root: string, name: string): string {
  return `${root.trim().replace(/\/+$/, "")}/${name.trim()}`;
}

/** Estate: name a new project and choose where its folder goes. */
export function NewProjectDialog({
  open,
  home,
  onOpenChange,
  onCreate,
}: Props) {
  const [name, setName] = useState("");
  const [root, setRoot] = useState(() => readRoot(home));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    setRoot((r) => r || readRoot(home));
  }, [open, home]);

  const problem = projectNameProblem(name);
  const ready = !problem && root.trim().startsWith("/") && !busy;

  const choose = async () => {
    let picked: string | string[] | null;
    try {
      const { open: pick } = await import("@tauri-apps/plugin-dialog");
      picked = await pick({
        directory: true,
        multiple: false,
        title: "Choose where new projects go",
        defaultPath: root || home || undefined,
      });
    } catch (e) {
      setError(`Couldn't open the folder picker: ${String(e)}`);
      return;
    }
    if (typeof picked === "string") setRoot(picked);
  };

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const failure = await onCreate(name.trim(), root.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    writeRoot(root.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Estate makes a new folder for it and opens it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-name" className="text-[12px]">
              Project Name
            </Label>
            <Input
              id="new-project-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="my-app"
              spellCheck={false}
              className="text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-root" className="text-[12px]">
              Root Directory
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-project-root"
                value={root}
                onChange={(e) => {
                  setRoot(e.target.value);
                  setError(null);
                }}
                spellCheck={false}
                className="min-w-0 flex-1 font-mono text-[12px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void choose()}
              >
                Choose…
              </Button>
            </div>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {name.trim() && !problem && root.trim()
                ? `Creates ${shortPath(projectPath(root, name), home)}`
                : "The project's folder goes inside this one."}
            </span>
          </div>
          {(error || (name.trim() && problem)) && (
            <p className="text-[11.5px] text-destructive">{error ?? problem}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!ready}>
              {busy && <Spinner className="size-3" />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
