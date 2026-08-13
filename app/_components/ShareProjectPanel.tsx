"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FolderOpen,
  Link2,
  PanelRightClose,
  PanelRightOpen,
  Share2,
} from "lucide-react";
import type { Project } from "@/app/_lib/needlepointTypes";
import {
  NEEDLER_FILE_EXTENSION,
  PRACTICAL_SHARE_URL_LIMIT,
  ShareProjectError,
  buildShareUrl,
  createProjectFileBytes,
  decodeProjectFile,
  encodeShareProject,
} from "@/app/_lib/shareProject";
import type {
  DecodedShareProject,
  EncodedShareProject,
} from "@/app/_lib/shareProject";
import { useRef, useState } from "react";

type Props = {
  project: Project;
  rotation: number;
  onOpenProject: (shared: DecodedShareProject, source: "file") => void;
  onNotify: (message: string, tone?: "info" | "warn" | "success") => void;
  onClose: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  collapsed?: boolean;
};

type ShareState =
  | { status: "idle" }
  | { status: "working" }
  | {
      status: "ready";
      encoded: EncodedShareProject;
      url: string;
      reliableUrl: boolean;
      project: Project;
      rotation: number;
    }
  | { status: "error"; message: string };

function buttonClass(tone: "quiet" | "solid" = "quiet") {
  return [
    "flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
    tone === "solid"
      ? "border-[#62402e] bg-[#6e4832] text-white hover:bg-[#5e3d2b]"
      : "border-[#d8c4ad] bg-white text-[#5d4433] hover:border-[#aa896c] hover:bg-[#fffaf4]",
  ].join(" ");
}

function errorMessage(error: unknown) {
  return error instanceof ShareProjectError
    ? error.message
    : "Could not prepare this project for sharing.";
}

function formatBytes(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}

function projectFilename() {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `needler-project-${timestamp}${NEEDLER_FILE_EXTENSION}`;
}

function downloadProjectFile(encoded: EncodedShareProject) {
  const bytes = createProjectFileBytes(encoded);
  const blob = new Blob([bytes.slice().buffer], {
    type: "application/x-needler",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = projectFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ShareProjectPanel({
  project,
  rotation,
  onOpenProject,
  onNotify,
  onClose,
  onCollapse,
  onExpand,
  collapsed,
}: Props) {
  const [shareState, setShareState] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const prepareProject = async () => {
    if (
      shareState.status === "ready" &&
      shareState.project === project &&
      shareState.rotation === rotation
    ) {
      return shareState;
    }
    setShareState({ status: "working" });
    setCopied(false);
    try {
      const encoded = await encodeShareProject(project, rotation);
      const url = buildShareUrl(encoded.token, window.location.href);
      const ready = {
        status: "ready" as const,
        encoded,
        url,
        reliableUrl: url.length <= PRACTICAL_SHARE_URL_LIMIT,
        project,
        rotation,
      };
      setShareState(ready);
      return ready;
    } catch (error) {
      const message = errorMessage(error);
      setShareState({ status: "error", message });
      onNotify(message, "warn");
      return null;
    }
  };

  const copyLink = async () => {
    const ready = await prepareProject();
    if (!ready?.reliableUrl) return;
    try {
      await navigator.clipboard.writeText(ready.url);
      setCopied(true);
      onNotify("Share link copied.", "success");
    } catch {
      onNotify("Select and copy the generated link.", "warn");
    }
  };

  const shareProject = async () => {
    const ready = await prepareProject();
    if (!ready) return;
    try {
      if (ready.reliableUrl && navigator.share) {
        await navigator.share({ title: "Needler project", url: ready.url });
        return;
      }

      const bytes = createProjectFileBytes(ready.encoded);
      const file = new File([bytes.slice().buffer], projectFilename(), {
        type: "application/x-needler",
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Needler project", files: [file] });
        return;
      }
      downloadProjectFile(ready.encoded);
      onNotify("Needler project downloaded.", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onNotify("Could not open the system share menu.", "warn");
    }
  };

  const downloadFile = async () => {
    const ready = await prepareProject();
    if (!ready) return;
    downloadProjectFile(ready.encoded);
    onNotify("Needler project downloaded.", "success");
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setOpeningFile(true);
    try {
      const shared = await decodeProjectFile(await file.arrayBuffer());
      onOpenProject(shared, "file");
      onNotify("Project file opened as a temporary copy.", "success");
    } catch (error) {
      onNotify(errorMessage(error), "warn");
    } finally {
      setOpeningFile(false);
    }
  };

  const ready =
    shareState.status === "ready" &&
    shareState.project === project &&
    shareState.rotation === rotation
      ? shareState
      : null;

  if (collapsed) {
    return (
      <aside className="flex h-full min-h-0 items-center justify-between gap-2 rounded-lg border border-[#d6bfa6] bg-[#fff8ef] p-2 shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)] xl:flex-col xl:justify-start xl:px-1">
        <button
          type="button"
          aria-label="Show project sharing"
          title="Show project sharing"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#7e4e36] bg-[#7e4e36] text-[#fff9f0] transition active:translate-y-px"
          onClick={onExpand}
        >
          <PanelRightOpen size={18} strokeWidth={1.8} />
        </button>
        <span className="max-w-[180px] truncate text-xs font-semibold uppercase tracking-[0.1em] text-[#765943] xl:max-w-none xl:rotate-180 xl:[writing-mode:vertical-rl]">
          Share
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-[#d6bfa6] bg-[#fff8ef] shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)]">
      <header className="flex items-center gap-3 border-b border-[#e4d2bf] p-4">
        <button
          type="button"
          aria-label="Close project sharing"
          title="Close project sharing"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#654a38] transition hover:border-[#aa896c] active:translate-y-px"
          onClick={onClose}
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#5c4130]">
            Share Project
          </h2>
          <p className="mt-0.5 truncate text-xs text-[#8a6c55]">
            {project.stitches.length.toLocaleString()}{" "}
            {project.stitches.length === 1 ? "stitch" : "stitches"}
          </p>
        </div>
        {onCollapse ? (
          <button
            type="button"
            aria-label="Collapse project sharing"
            title="Collapse panel"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#654a38] transition hover:border-[#aa896c] active:translate-y-px"
            onClick={onCollapse}
          >
            <PanelRightClose size={17} strokeWidth={1.8} />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-5">
          <section>
            <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 border-y border-[#e4d2bf] py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#efe0cf] text-[#6e4832]">
                <Link2 size={16} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#4f392b]">Final project</p>
                <p className="mt-0.5 text-xs text-[#8a6c55]">
                  Stitches, DMC threads, colorways, and rotation
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#8a6c55]">
              Reference images stay on this device.
            </p>
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Share link
            </p>
            {ready?.reliableUrl ? (
              <>
                <textarea
                  readOnly
                  aria-label="Generated share link"
                  value={ready.url}
                  className="mt-3 h-24 w-full resize-none rounded-md border border-[#d8c4ad] bg-white p-2 font-mono text-[10px] leading-4 text-[#654a38] outline-none focus:border-[#7e4e36]"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" className={buttonClass("solid")} onClick={copyLink}>
                    {copied ? (
                      <Check size={15} strokeWidth={1.8} />
                    ) : (
                      <Copy size={15} strokeWidth={1.8} />
                    )}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" className={buttonClass()} onClick={shareProject}>
                    <Share2 size={15} strokeWidth={1.8} />
                    Share
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className={`${buttonClass("solid")} mt-3 w-full`}
                disabled={shareState.status === "working"}
                onClick={prepareProject}
              >
                <Link2 size={15} strokeWidth={1.8} />
                {shareState.status === "working" ? "Compressing" : "Create link"}
              </button>
            )}

            {ready ? (
              <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[10px] uppercase text-[#8a6c55]">
                <span>{ready.encoded.mode === "grid" ? "Packed grid" : "Stitch list"}</span>
                <span>{formatBytes(ready.encoded.compressedBytes)}</span>
              </div>
            ) : null}
            {ready && !ready.reliableUrl ? (
              <p className="mt-3 rounded-md border border-[#d7a49a] bg-[#fff2ed] px-3 py-2 text-xs leading-5 text-[#8a332c]">
                This project exceeds the reliable link size. Share its Needler file instead.
              </p>
            ) : null}
            {shareState.status === "error" ? (
              <p className="mt-3 rounded-md border border-[#d7a49a] bg-[#fff2ed] px-3 py-2 text-xs leading-5 text-[#8a332c]">
                {shareState.message}
              </p>
            ) : null}
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Project file
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={buttonClass()}
                disabled={shareState.status === "working"}
                onClick={downloadFile}
              >
                <Download size={15} strokeWidth={1.8} />
                Download
              </button>
              <button
                type="button"
                className={buttonClass()}
                disabled={openingFile}
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderOpen size={15} strokeWidth={1.8} />
                {openingFile ? "Opening" : "Open"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={NEEDLER_FILE_EXTENSION + ",application/x-needler"}
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void openFile(file);
              }}
            />
          </section>
        </div>
      </div>
    </aside>
  );
}
