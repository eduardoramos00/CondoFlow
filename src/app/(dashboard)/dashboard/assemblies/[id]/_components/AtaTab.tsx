"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  CheckCircle2,
  Download,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Loader2,
  Lock,
} from "lucide-react";

import {
  finalizeAta,
  getAta,
  upsertAta,
  type Assembly,
  type Ata,
} from "@/app/actions/assemblies";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1.5 text-sm transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  assembly: Assembly;
  isGestor: boolean;
  buildingId: string;
};

// ---------------------------------------------------------------------------
// AtaTab
// ---------------------------------------------------------------------------

export function AtaTab({ assembly, isGestor, buildingId }: Props) {
  const [ata, setAta] = useState<Ata | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [saveError, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isFinalized = ata?.status === "FINALIZED";
  const isConcluded = assembly.status === "CONCLUDED" || assembly.status === "ARCHIVED";
  const canEdit = isGestor && !isFinalized && assembly.status !== "ARCHIVED";

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: "",
    editable: canEdit,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[300px] p-4 text-zinc-200 text-sm leading-relaxed",
      },
    },
  });

  const loadAta = useCallback(async () => {
    const data = await getAta(assembly.id, buildingId);
    setAta(data);
    if (data && editor) {
      editor.commands.setContent(data.content ?? "");
    }
  }, [assembly.id, buildingId, editor]);

  useEffect(() => { void loadAta(); }, [loadAta]);

  // Update editor editability when ata state changes.
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [canEdit, editor, isFinalized]);

  async function handleSave() {
    if (!editor) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    const result = await upsertAta(assembly.id, buildingId, editor.getHTML());
    setSaving(false);
    if ("error" in result) { setError(result.error); return; }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    void loadAta();
  }

  async function handleFinalize() {
    setFinalizing(true);
    setError(null);

    // Save current content first.
    if (editor) {
      const saveResult = await upsertAta(assembly.id, buildingId, editor.getHTML());
      if ("error" in saveResult) { setError(saveResult.error); setFinalizing(false); return; }
    }

    const result = await finalizeAta(assembly.id, buildingId);
    setFinalizing(false);
    if ("error" in result) { setError(result.error); return; }
    void loadAta();
  }

  // ── Condómino view: only show after CONCLUDED ──────────────────────────────

  if (!isGestor && !isConcluded) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <Lock className="mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm text-zinc-400">
          A ata será visível após a conclusão da assembleia
        </p>
      </div>
    );
  }

  if (!isGestor && isFinalized && ata) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">Ata finalizada</p>
            {ata.finalized_at && (
              <p className="text-xs text-zinc-500">
                {new Intl.DateTimeFormat("pt-PT", {
                  day: "2-digit", month: "long", year: "numeric",
                }).format(new Date(ata.finalized_at))}
              </p>
            )}
          </div>
          <a href={`/api/assemblies/${assembly.id}/ata/export`} target="_blank">
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
            >
              <Download className="mr-1.5 h-4 w-4" />
              Exportar PDF
            </Button>
          </a>
        </div>
        <div
          className="prose prose-invert max-w-none rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-200"
          dangerouslySetInnerHTML={{ __html: ata.content }}
        />
      </div>
    );
  }

  if (!isGestor) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">A ata ainda não está disponível.</p>
    );
  }

  // ── GESTOR view ────────────────────────────────────────────────────────────

  if (ata === undefined) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar ata…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isFinalized ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Ata finalizada</span>
            {ata?.finalized_at && (
              <span className="text-xs text-zinc-500">
                {new Intl.DateTimeFormat("pt-PT", {
                  day: "2-digit", month: "long", year: "numeric",
                }).format(new Date(ata.finalized_at))}
              </span>
            )}
          </div>
          <a href={`/api/assemblies/${assembly.id}/ata/export`} target="_blank">
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
            >
              <Download className="mr-1.5 h-4 w-4" />
              Exportar PDF
            </Button>
          </a>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Rascunho da ata — {assembly.status !== "CONCLUDED" && (
              <span className="text-amber-400">
                aguarda conclusão da assembleia para finalizar
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSave()}
                disabled={saving}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                ) : null}
                {saveSuccess ? "Guardado" : "Guardar rascunho"}
              </Button>
            )}
            {assembly.status === "CONCLUDED" && canEdit && (
              <Button
                size="sm"
                disabled={finalizing}
                onClick={() => void handleFinalize()}
                className="bg-emerald-700 text-white hover:bg-emerald-600 active:scale-95"
              >
                {finalizing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Finalizar e publicar
              </Button>
            )}
          </div>
        </div>
      )}

      {saveError && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {saveError}
        </p>
      )}

      {/* Editor */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {canEdit && editor && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-800 px-3 py-2">
            <ToolbarBtn
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title="Negrito"
            >
              <Bold className="h-4 w-4" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title="Itálico"
            >
              <Italic className="h-4 w-4" />
            </ToolbarBtn>
            <div className="mx-1 h-5 w-px bg-zinc-700" />
            <ToolbarBtn
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Título 1"
            >
              <Heading1 className="h-4 w-4" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Título 2"
            >
              <Heading2 className="h-4 w-4" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="Título 3"
            >
              <Heading3 className="h-4 w-4" />
            </ToolbarBtn>
            <div className="mx-1 h-5 w-px bg-zinc-700" />
            <ToolbarBtn
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title="Lista"
            >
              <List className="h-4 w-4" />
            </ToolbarBtn>
            <ToolbarBtn
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title="Lista numerada"
            >
              <ListOrdered className="h-4 w-4" />
            </ToolbarBtn>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
