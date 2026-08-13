"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import {
  CRAFT_COLORWAY_PROFILES,
  DMC_PALETTE,
  addPaletteColors,
  applyColorAssignments,
  assignmentsForColorway,
  assignmentsForUsedRoles,
  generateCraftColorway,
  getAvailableColor,
  getUsedColorRoles,
  originalAssignments,
} from "@/app/_lib/colorways";
import type {
  Colorway,
  PaletteColor,
  Project,
} from "@/app/_lib/needlepointTypes";
import { useEffect, useMemo, useState } from "react";

type Props = {
  project: Project;
  initialRoleId?: string;
  onPreview: (assignments: Record<string, string> | null) => void;
  onCommit: (project: Project, message: string) => void;
  onClose: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  collapsed?: boolean;
};

const PROFILE_SWATCHES: Record<string, string[]> = {
  warm: ["#8f1f2d", "#c45a34", "#d6a13b", "#f2d3a0"],
  cool: ["#244c66", "#3b7392", "#5b918e", "#a9c8c8"],
  earthy: ["#5d4937", "#7b6840", "#75805b", "#b5a57d"],
  pastel: ["#dcaeb7", "#b9c7df", "#b8d4c1", "#ead7a8"],
  jewel: ["#6d1d3c", "#215776", "#27715f", "#8b6622"],
  monochrome: ["#263e45", "#527079", "#91a8ae", "#d3dfe1"],
};

function buttonClass(tone: "quiet" | "solid" = "quiet") {
  return [
    "flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
    tone === "solid"
      ? "border-[#62402e] bg-[#6e4832] text-white hover:bg-[#5e3d2b]"
      : "border-[#d8c4ad] bg-white text-[#5d4433] hover:border-[#aa896c] hover:bg-[#fffaf4]",
  ].join(" ");
}

function colorLabel(color: PaletteColor) {
  return color.floss ? `DMC ${color.floss} ${color.name}` : color.name;
}

function completeAssignments(
  project: Project,
  assignments: Record<string, string>,
) {
  return Object.fromEntries(
    getUsedColorRoles(project).map((usage) => [
      usage.role.id,
      assignments[usage.role.id] ?? usage.role.originalColorId,
    ]),
  );
}

function paletteForAssignments(project: Project, assignments: Record<string, string>) {
  const colors = Object.values(assignments).flatMap((colorId) => {
    const color = getAvailableColor(project, colorId);
    return color ? [color] : [];
  });
  return addPaletteColors(project, colors);
}

export default function ColorwayStudio({
  project,
  initialRoleId,
  onPreview,
  onCommit,
  onClose,
  onCollapse,
  onExpand,
  collapsed,
}: Props) {
  const usedRoles = useMemo(() => getUsedColorRoles(project), [project]);
  const [draft, setDraft] = useState(() => assignmentsForUsedRoles(project));
  const [compareMode, setCompareMode] = useState<"original" | "draft">("draft");
  const [lockedRoleIds, setLockedRoleIds] = useState<Set<string>>(() => new Set());
  const [selectedRoleId, setSelectedRoleId] = useState(
    initialRoleId ?? usedRoles[0]?.role.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [basedColorwayId, setBasedColorwayId] = useState<string | undefined>(
    project.colors.activeColorwayId,
  );
  const [draftChanged, setDraftChanged] = useState(false);
  const [name, setName] = useState(() => {
    const active = project.colors.colorways.find(
      (colorway) => colorway.id === project.colors.activeColorwayId,
    );
    return active?.name ?? `Colorway ${project.colors.colorways.length + 1}`;
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const selectedUsage = usedRoles.find((usage) => usage.role.id === selectedRoleId);
  const selectedTarget = selectedUsage
    ? getAvailableColor(
        project,
        draft[selectedUsage.role.id] ?? selectedUsage.role.originalColorId,
      )
    : undefined;
  const customColors = project.palette.filter((color) => color.source === "custom");
  const replacementColors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const candidates = [...DMC_PALETTE, ...customColors];
    return candidates
      .filter(
        (color) =>
          !normalized ||
          color.name.toLowerCase().includes(normalized) ||
          color.floss?.toLowerCase().includes(normalized),
      )
      .slice(0, 48);
  }, [customColors, query]);

  useEffect(() => {
    onPreview(compareMode === "original" ? originalAssignments(project) : draft);
    return () => onPreview(null);
  }, [compareMode, draft, onPreview, project]);

  const markDraftChanged = (next: Record<string, string>) => {
    setDraft(next);
    setDraftChanged(true);
    setCompareMode("draft");
    setDeleteConfirmId(null);
  };

  const chooseTarget = (colorId: string) => {
    if (!selectedRoleId) return;
    markDraftChanged({ ...draft, [selectedRoleId]: colorId });
  };

  const chooseCurrent = () => {
    const active = project.colors.colorways.find(
      (colorway) => colorway.id === project.colors.activeColorwayId,
    );
    setDraft(assignmentsForUsedRoles(project));
    setBasedColorwayId(project.colors.activeColorwayId);
    setDraftChanged(false);
    setName(active?.name ?? `Colorway ${project.colors.colorways.length + 1}`);
    setCompareMode("draft");
  };

  const chooseOriginal = () => {
    setDraft(originalAssignments(project));
    setBasedColorwayId(undefined);
    setDraftChanged(false);
    setName("Original copy");
    setCompareMode("draft");
  };

  const chooseSaved = (colorway: Colorway) => {
    setDraft(assignmentsForColorway(project, colorway));
    setBasedColorwayId(colorway.id);
    setDraftChanged(false);
    setName(colorway.name);
    setCompareMode("draft");
    setDeleteConfirmId(null);
  };

  const generateScheme = (profile: (typeof CRAFT_COLORWAY_PROFILES)[number]["id"]) => {
    const generated = generateCraftColorway(project, profile, lockedRoleIds);
    setDraft(generated.assignments);
    setBasedColorwayId(undefined);
    setDraftChanged(true);
    setName(`${CRAFT_COLORWAY_PROFILES.find((item) => item.id === profile)?.name} colorway`);
    setCompareMode("draft");
  };

  const commitDraft = () => {
    const withPalette = paletteForAssignments(project, draft);
    onCommit(
      applyColorAssignments(
        withPalette,
        draft,
        basedColorwayId && !draftChanged ? basedColorwayId : undefined,
      ),
      basedColorwayId && !draftChanged
        ? `${project.colors.colorways.find((item) => item.id === basedColorwayId)?.name ?? "Colorway"} applied.`
        : "Color changes applied.",
    );
  };

  const saveAsNew = (forcedName?: string) => {
    const requestedName = (forcedName ?? name).trim();
    if (!requestedName) return;
    const basedColorway = project.colors.colorways.find(
      (colorway) => colorway.id === basedColorwayId,
    );
    const trimmedName =
      !forcedName && basedColorway?.name === requestedName
        ? `${requestedName} copy`
        : requestedName;
    const id = `colorway-${Date.now().toString(36)}`;
    const assignments = completeAssignments(project, draft);
    const withPalette = paletteForAssignments(project, assignments);
    const nextProject: Project = {
      ...withPalette,
      colors: {
        ...withPalette.colors,
        colorways: [
          ...withPalette.colors.colorways,
          { id, name: trimmedName, assignments },
        ],
      },
    };
    onCommit(
      applyColorAssignments(nextProject, assignments, id),
      `${trimmedName} saved and applied.`,
    );
  };

  const updateExisting = () => {
    if (!basedColorwayId) return;
    const existing = project.colors.colorways.find((item) => item.id === basedColorwayId);
    if (!existing) return;
    const assignments = completeAssignments(project, draft);
    const withPalette = paletteForAssignments(project, assignments);
    const nextProject: Project = {
      ...withPalette,
      colors: {
        ...withPalette.colors,
        colorways: withPalette.colors.colorways.map((colorway) =>
          colorway.id === existing.id ? { ...colorway, assignments } : colorway,
        ),
      },
    };
    onCommit(
      applyColorAssignments(nextProject, assignments, existing.id),
      `${existing.name} updated.`,
    );
  };

  const renameExisting = () => {
    if (!basedColorwayId || !name.trim()) return;
    const nextProject: Project = {
      ...project,
      colors: {
        ...project.colors,
        colorways: project.colors.colorways.map((colorway) =>
          colorway.id === basedColorwayId
            ? { ...colorway, name: name.trim() }
            : colorway,
        ),
      },
    };
    onCommit(nextProject, `${name.trim()} renamed.`);
  };

  const duplicateExisting = () => {
    const existing = project.colors.colorways.find((item) => item.id === basedColorwayId);
    if (!existing) return;
    saveAsNew(`${existing.name} copy`);
  };

  const deleteExisting = (colorway: Colorway) => {
    if (deleteConfirmId !== colorway.id) {
      setDeleteConfirmId(colorway.id);
      return;
    }
    onCommit(
      {
        ...project,
        colors: {
          ...project.colors,
          colorways: project.colors.colorways.filter((item) => item.id !== colorway.id),
          activeColorwayId:
            project.colors.activeColorwayId === colorway.id
              ? undefined
              : project.colors.activeColorwayId,
        },
      },
      `${colorway.name} deleted; current colors retained.`,
    );
  };

  const toggleLock = (roleId: string) => {
    setLockedRoleIds((current) => {
      const next = new Set(current);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  if (collapsed) {
    return (
      <aside className="flex h-full min-h-0 items-center justify-between gap-2 rounded-lg border border-[#d6bfa6] bg-[#fff8ef] p-2 shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)] xl:flex-col xl:justify-start xl:px-1">
        <button
          type="button"
          aria-label="Show Colorway Studio"
          title="Show Colorway Studio"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#7e4e36] bg-[#7e4e36] text-[#fff9f0] transition active:translate-y-px"
          onClick={onExpand}
        >
          <PanelRightOpen size={18} strokeWidth={1.8} />
        </button>
        <span className="max-w-[180px] truncate text-xs font-semibold uppercase tracking-[0.1em] text-[#765943] xl:max-w-none xl:rotate-180 xl:[writing-mode:vertical-rl]">
          Colorways
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-[#d6bfa6] bg-[#fff8ef] shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)]">
      <header className="flex items-center gap-3 border-b border-[#e4d2bf] p-4">
        <button
          type="button"
          aria-label="Close Colorway Studio"
          title="Close Colorway Studio"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#654a38] transition hover:border-[#aa896c] active:translate-y-px"
          onClick={onClose}
        >
          <ArrowLeft size={17} strokeWidth={1.8} />
        </button>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#5c4130]">
            Colorway Studio
          </h2>
          <p className="mt-0.5 truncate text-xs text-[#8a6c55]">
            {usedRoles.length} used thread roles
          </p>
        </div>
        {onCollapse ? (
          <button
            type="button"
            aria-label="Collapse Colorway Studio"
            title="Collapse panel"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#654a38] transition hover:border-[#aa896c] active:translate-y-px"
            onClick={onCollapse}
          >
            <PanelRightClose size={17} strokeWidth={1.8} />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {usedRoles.length === 0 ? (
          <div className="border-y border-[#e4d2bf] py-8 text-center">
            <p className="text-sm font-medium text-[#4f392b]">No stitched colors yet</p>
            <p className="mx-auto mt-2 max-w-[26ch] text-xs leading-5 text-[#8a6c55]">
              Add stitches or apply an image pattern before creating a colorway.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            <section>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-[#d8c4ad] bg-[#f2e6d8] p-1">
                {(["original", "draft"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={[
                      "h-8 rounded text-xs font-semibold capitalize transition",
                      compareMode === mode
                        ? "bg-white text-[#38271d] shadow-[0_2px_8px_-6px_rgba(58,35,22,0.5)]"
                        : "text-[#765943]",
                    ].join(" ")}
                    onClick={() => setCompareMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass()} onClick={chooseCurrent}>
                  <Check size={15} strokeWidth={1.8} />
                  Current
                </button>
                <button type="button" className={buttonClass()} onClick={chooseOriginal}>
                  <RotateCcw size={15} strokeWidth={1.8} />
                  Original
                </button>
              </div>
            </section>

            {project.colors.colorways.length > 0 ? (
              <section className="border-t border-[#e4d2bf] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
                  Saved colorways
                </p>
                <div className="mt-2 grid gap-2">
                  {project.colors.colorways.map((colorway) => {
                    const isSelected = basedColorwayId === colorway.id;
                    return (
                      <div
                        key={colorway.id}
                        className={[
                          "grid grid-cols-[minmax(0,1fr)_34px] items-center rounded-md border bg-white",
                          isSelected ? "border-[#6e4832]" : "border-[#e0ccb6]",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          className="min-w-0 px-3 py-2 text-left"
                          onClick={() => chooseSaved(colorway)}
                        >
                          <span className="block truncate text-sm font-medium text-[#3d2b1f]">
                            {colorway.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] uppercase text-[#8a6c55]">
                            {project.colors.activeColorwayId === colorway.id
                              ? "Active"
                              : `${Object.keys(colorway.assignments).length} mappings`}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${deleteConfirmId === colorway.id ? "Confirm delete" : "Delete"} ${colorway.name}`}
                          title={deleteConfirmId === colorway.id ? "Confirm delete" : "Delete colorway"}
                          className={[
                            "flex h-full items-center justify-center border-l transition",
                            deleteConfirmId === colorway.id
                              ? "border-[#c98d83] bg-[#fff0ec] text-[#963a31]"
                              : "border-[#e4d2bf] text-[#8a6c55] hover:text-[#963a31]",
                          ].join(" ")}
                          onClick={() => deleteExisting(colorway)}
                        >
                          {deleteConfirmId === colorway.id ? (
                            <Check size={15} strokeWidth={1.8} />
                          ) : (
                            <Trash2 size={15} strokeWidth={1.8} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="border-t border-[#e4d2bf] pt-4">
              <div className="flex items-center gap-2">
                <Sparkles size={15} strokeWidth={1.8} className="text-[#7e4e36]" />
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
                  Suggested schemes
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {CRAFT_COLORWAY_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className="overflow-hidden rounded-md border border-[#d8c4ad] bg-white text-left transition hover:border-[#aa896c] active:translate-y-px"
                    onClick={() => generateScheme(profile.id)}
                  >
                    <span className="grid h-6 grid-cols-4">
                      {PROFILE_SWATCHES[profile.id].map((hex) => (
                        <span key={hex} style={{ backgroundColor: hex }} />
                      ))}
                    </span>
                    <span className="block px-2.5 py-2 text-xs font-semibold text-[#4f392b]">
                      {profile.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="border-t border-[#e4d2bf] pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
                  Used threads
                </p>
                <span className="font-mono text-[10px] text-[#8a6c55]">
                  {lockedRoleIds.size} locked
                </span>
              </div>
              <div className="mt-2 divide-y divide-[#ead9c7] border-y border-[#ead9c7]">
                {usedRoles.map((usage) => {
                  const target = getAvailableColor(
                    project,
                    draft[usage.role.id] ?? usage.role.originalColorId,
                  );
                  const selected = usage.role.id === selectedRoleId;
                  const locked = lockedRoleIds.has(usage.role.id);
                  return (
                    <div
                      key={usage.role.id}
                      className={[
                        "grid grid-cols-[minmax(0,1fr)_40px] items-stretch",
                        selected ? "bg-[#fff2df]" : "bg-white/65",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-2 px-2 py-2 text-left"
                        onClick={() => setSelectedRoleId(usage.role.id)}
                      >
                        <span
                          className="h-7 w-7 rounded border border-[#cdb39a]"
                          style={{ backgroundColor: usage.original.hex }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-[#3d2b1f]">
                            {usage.original.floss
                              ? `DMC ${usage.original.floss}`
                              : usage.original.name}
                          </span>
                          <span className="block font-mono text-[10px] text-[#8a6c55]">
                            {usage.count.toLocaleString()} stitches
                          </span>
                        </span>
                        <span
                          className="h-7 w-7 rounded border border-[#cdb39a]"
                          style={{ backgroundColor: target?.hex ?? usage.current.hex }}
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={`${locked ? "Unlock" : "Lock"} ${colorLabel(usage.original)}`}
                        title={locked ? "Unlock color" : "Lock color"}
                        className="flex items-center justify-center border-l border-[#ead9c7] text-[#765943] hover:text-[#4f392b]"
                        onClick={() => toggleLock(usage.role.id)}
                      >
                        {locked ? (
                          <Lock size={14} strokeWidth={1.8} />
                        ) : (
                          <Unlock size={14} strokeWidth={1.8} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {selectedUsage ? (
              <section className="border-t border-[#e4d2bf] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
                  Replace throughout
                </p>
                <div className="mt-2 grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3">
                  <span
                    className="h-9 w-9 rounded-md border border-[#cdb39a]"
                    style={{ backgroundColor: selectedTarget?.hex }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#3d2b1f]">
                      {selectedTarget ? colorLabel(selectedTarget) : "Choose thread"}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase text-[#8a6c55]">
                      {selectedTarget?.hex}
                    </p>
                  </div>
                </div>
                <label className="mt-3 grid gap-2 text-xs font-semibold text-[#4f392b]">
                  Find replacement
                  <input
                    type="search"
                    value={query}
                    placeholder="DMC number or color name"
                    className="h-9 rounded-md border border-[#d8c4ad] bg-white px-3 text-sm font-normal outline-none transition placeholder:text-[#a58d74] focus:border-[#7e4e36]"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="mt-2 grid max-h-52 gap-1 overflow-y-auto pr-1">
                  {replacementColors.map((color) => {
                    const active = selectedTarget?.id === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        className={[
                          "grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-left transition active:translate-y-px",
                          active
                            ? "border-[#6e4832] bg-[#fff2df]"
                            : "border-[#e0ccb6] bg-white hover:border-[#b99b7d]",
                        ].join(" ")}
                        onClick={() => chooseTarget(color.id)}
                      >
                        <span
                          className="h-6 w-6 rounded border border-[#d0b69c]"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span className="min-w-0 truncate text-xs font-medium text-[#3d2b1f]">
                          {colorLabel(color)}
                        </span>
                        {active ? <Check size={14} strokeWidth={1.8} /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="border-t border-[#e4d2bf] pt-4">
              <label className="grid gap-2 text-xs font-semibold text-[#4f392b]">
                Colorway name
                <input
                  type="text"
                  value={name}
                  className="h-9 rounded-md border border-[#d8c4ad] bg-white px-3 text-sm font-normal outline-none transition focus:border-[#7e4e36]"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass("solid")} onClick={commitDraft}>
                  <Check size={15} strokeWidth={1.8} />
                  Apply
                </button>
                <button
                  type="button"
                  className={buttonClass("solid")}
                  disabled={!name.trim()}
                  onClick={() => saveAsNew()}
                >
                  <Save size={15} strokeWidth={1.8} />
                  Save as new
                </button>
              </div>
              <button
                type="button"
                className={`${buttonClass()} mt-2 w-full`}
                onClick={onClose}
              >
                <X size={15} strokeWidth={1.8} />
                Cancel preview
              </button>
              {basedColorwayId ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button type="button" className={buttonClass()} onClick={updateExisting}>
                    <Save size={14} strokeWidth={1.8} />
                    Update
                  </button>
                  <button type="button" className={buttonClass()} onClick={renameExisting}>
                    <Pencil size={14} strokeWidth={1.8} />
                    Rename
                  </button>
                  <button type="button" className={buttonClass()} onClick={duplicateExisting}>
                    <Copy size={14} strokeWidth={1.8} />
                    Duplicate
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
