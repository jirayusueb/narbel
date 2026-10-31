import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@narbel/ui/components/alert-dialog";
import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@narbel/ui/components/dialog";
import { Spinner } from "@narbel/ui/components/spinner";
import { useTheme } from "next-themes";
import { overlay } from "overlay-kit";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { downloadAsDataUrl } from "@/entities/board";
import { timeAgo } from "@/shared/lib";

import {
  useRestoreVersion,
  useVersion,
  useVersions,
} from "../model/use-versions";

interface DialogControl {
  isOpen: boolean;
  close: () => void;
  unmount: () => void;
}

interface Target {
  boardId: string;
  canWrite: boolean;
  shareToken?: string;
}

const KIND_LABEL = {
  auto: "Checkpoint",
  pre_restore: "Before a restore",
} as const;

type Preview = NonNullable<ReturnType<typeof useVersion>["data"]>;

const VersionPreview = ({
  boardId,
  shareToken,
  version,
  pageId,
}: {
  boardId: string;
  shareToken?: string;
  version: Preview;
  pageId: string;
}) => {
  const { resolvedTheme } = useTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const page = version.pages.find((p) => p.id === pageId) ?? version.pages[0];

  useEffect(() => {
    if (!api) {
      return;
    }
    let cancelled = false;
    const addFile = async (meta: Preview["files"][number]) => {
      try {
        const dataURL = await downloadAsDataUrl(boardId, meta.id, shareToken);
        if (!cancelled) {
          api.addFiles([{ ...meta, dataURL }] as BinaryFileData[]);
        }
      } catch {
        // a missing image only leaves its placeholder in the preview
      }
    };
    Promise.all(version.files.map((meta) => addFile(meta)));
    return () => {
      cancelled = true;
    };
  }, [api, boardId, shareToken, version]);

  return (
    <Excalidraw
      key={`${version.id}:${page?.id}`}
      viewModeEnabled
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      excalidrawAPI={setApi}
      initialData={{
        elements: (page?.elements ?? []) as never,
        scrollToContent: true,
      }}
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          export: false,
          saveAsImage: false,
          toggleTheme: false,
        },
      }}
    />
  );
};

const confirmRestore = (onConfirm: () => void) =>
  overlay.open(({ isOpen, close, unmount }) => (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={unmount}
    >
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display text-feature font-normal">
          Restore this version?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Everyone on the board sees the old version now. Shapes added since
          disappear and deleted ones return. The board as it is now is saved
          first, so you can restore it from this list.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="ghost">
          Keep current board
        </AlertDialogCancel>
        <AlertDialogAction
          onPress={() => {
            onConfirm();
            close();
          }}
        >
          Restore
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialog>
  ));

type Versions = NonNullable<ReturnType<typeof useVersions>["data"]>;

const VersionList = ({
  versions,
  isPending,
  selected,
  onPick,
}: {
  versions: Versions | undefined;
  isPending: boolean;
  selected: string | null;
  onPick: (id: string) => void;
}) => (
  <ul
    aria-label="Saved versions"
    className="flex max-h-40 flex-col gap-1 overflow-y-auto sm:max-h-none"
  >
    {isPending ? <Spinner /> : null}
    {versions?.length === 0 ? (
      <li className="text-muted-foreground text-sm">
        No versions yet. The first one appears after the board is edited.
      </li>
    ) : null}
    {versions?.map((version) => (
      <li key={version.id}>
        <Button
          variant={version.id === selected ? "secondary" : "ghost"}
          className="h-auto w-full flex-col items-start gap-0 py-2"
          aria-pressed={version.id === selected}
          onPress={() => onPick(version.id)}
        >
          <span>{new Date(version.createdAt).toLocaleString()}</span>
          <span className="text-muted-foreground text-xs">
            {KIND_LABEL[version.kind]}, {timeAgo(version.createdAt)}
          </span>
        </Button>
      </li>
    ))}
  </ul>
);

const PageTabs = ({
  pages,
  activeId,
  onPick,
}: {
  pages: Preview["pages"];
  activeId: string;
  onPick: (id: string) => void;
}) =>
  pages.length > 1 ? (
    <fieldset aria-label="Version pages" className="flex flex-wrap gap-1">
      {pages.map((page) => (
        <Button
          key={page.id}
          aria-pressed={page.id === activeId}
          size="sm"
          variant={page.id === activeId ? "secondary" : "ghost"}
          onPress={() => onPick(page.id)}
        >
          {page.name}
        </Button>
      ))}
    </fieldset>
  ) : null;

const RestoreButton = ({
  boardId,
  shareToken,
  versionId,
  close,
}: {
  boardId: string;
  shareToken?: string;
  versionId: string | null;
  close: () => void;
}) => {
  const restore = useRestoreVersion(boardId, shareToken);
  return (
    <Button
      isDisabled={!versionId || restore.isPending}
      onPress={() =>
        versionId &&
        confirmRestore(() =>
          restore.mutate(versionId, {
            onSuccess: () => {
              toast.success("Version restored");
              close();
            },
            onError: (error) => toast.error(error.message),
          })
        )
      }
    >
      {restore.isPending ? <Spinner data-icon="inline-start" /> : null}
      Restore this version
    </Button>
  );
};

const VersionHistoryDialog = ({
  boardId,
  canWrite,
  shareToken,
  isOpen,
  close,
  unmount,
}: DialogControl & Target) => {
  const list = useVersions(boardId, shareToken);
  const [picked, setPicked] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const selected = picked ?? list.data?.[0]?.id ?? null;
  const preview = useVersion(boardId, selected, shareToken);
  const activePageId = pageId ?? preview.data?.pages[0]?.id ?? "";

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={unmount}
      className="sm:max-w-5xl"
    >
      <DialogHeader>
        <DialogTitle className="font-display text-feature font-normal">
          Version history
        </DialogTitle>
        <DialogDescription>
          Checkpoints are saved about every 10 minutes while the board is
          edited, and kept for 30 days.
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 grid-cols-1 gap-4 sm:h-[60svh] sm:grid-cols-[14rem_1fr]">
        <VersionList
          versions={list.data}
          isPending={list.isPending}
          selected={selected}
          onPick={(id) => {
            setPicked(id);
            setPageId(null);
          }}
        />
        <div className="flex min-h-64 flex-col gap-2 sm:min-h-0">
          <PageTabs
            pages={preview.data?.pages ?? []}
            activeId={activePageId}
            onPick={setPageId}
          />
          <div className="border-border relative min-h-0 flex-1 overflow-hidden rounded-lg border">
            {preview.isError ? (
              <p role="alert" className="p-4 text-sm">
                This version could not be loaded.
              </p>
            ) : null}
            {preview.data ? (
              <VersionPreview
                boardId={boardId}
                shareToken={shareToken}
                version={preview.data}
                pageId={activePageId}
              />
            ) : null}
            {preview.isFetching && !preview.data ? (
              <Spinner className="absolute inset-0 m-auto" />
            ) : null}
          </div>
        </div>
      </div>
      <DialogFooter>
        <DialogClose variant="ghost">Close</DialogClose>
        {canWrite ? (
          <RestoreButton
            boardId={boardId}
            shareToken={shareToken}
            versionId={selected}
            close={close}
          />
        ) : null}
      </DialogFooter>
    </Dialog>
  );
};

export const openVersionHistoryDialog = (target: Target) => {
  overlay.open((control) => <VersionHistoryDialog {...target} {...control} />);
};
