"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { requireRole, UnauthorizedError } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type DocumentStatus = "PROCESSING" | "DRAFT" | "LINKED";

export type OcrPayload = {
  extracted_at: string;
  supplier_name: string | null;
  nif: string | null;
  total_amount: string | null;
  issue_date: string | null;
  invoice_number: string | null;
  line_items: Array<{
    description: string;
    amount: string;
  }>;
};

export type Document = {
  id: string;
  building_id: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  status: DocumentStatus;
  ocr_payload: OcrPayload | null;
  uploaded_by: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const uploadInvoiceSchema = z.object({
  buildingId: z.string().uuid(),
});

const MIME_TO_EXT: Record<AcceptedMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isAcceptedMime(mime: string): mime is AcceptedMimeType {
  return (ACCEPTED_MIME_TYPES as ReadonlyArray<string>).includes(mime);
}

// ---------------------------------------------------------------------------
// uploadInvoice
//
// Validates the uploaded file server-side, writes it to the `invoices` storage
// bucket under the canonical path convention, creates a `documents` DB record
// with status PROCESSING, then fires the process-invoice Edge Function
// asynchronously (fire-and-forget) so the server action returns immediately.
// ---------------------------------------------------------------------------

export async function uploadInvoice(
  buildingId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true; documentId: string }> {
  const session = await getServerSession();
  if (!session) return { error: "Não autenticado." };

  try {
    await requireRole(session, buildingId, ["GESTOR"]);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const parsed = uploadInvoiceSchema.safeParse({ buildingId });
  if (!parsed.success) return { error: "Dados inválidos." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Nenhum ficheiro fornecido." };

  if (file.size === 0) return { error: "O ficheiro está vazio." };

  if (!isAcceptedMime(file.type)) {
    return {
      error: "Tipo de ficheiro não permitido. Aceites: PDF, JPEG, PNG, WebP.",
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "Ficheiro demasiado grande. Tamanho máximo: 10 MB." };
  }

  const ext = MIME_TO_EXT[file.type];
  const uuid = randomUUID();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // Canonical storage path — must match the convention in agent_developer.md
  // and the UI reviewer audit checklist:
  //   invoices/{building_id}/{year}/{month}/{uuid}.{ext}
  const storagePath = `invoices/${buildingId}/${year}/${month}/${uuid}.${ext}`;

  const admin = createServerSupabaseClient();

  const fileBuffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("invoices")
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: "Erro ao fazer upload do ficheiro. Tente novamente." };
  }

  const { data: docRow, error: insertError } = await admin
    .from("documents")
    .insert({
      building_id: buildingId,
      storage_path: storagePath,
      mime_type: file.type,
      file_size_bytes: file.size,
      status: "PROCESSING",
      uploaded_by: session.user.id,
    })
    .select("id")
    .single();

  if (insertError || !docRow) {
    // Best-effort cleanup: remove the orphaned storage object before returning.
    await admin.storage.from("invoices").remove([storagePath]);
    return { error: "Erro ao registar o documento. Tente novamente." };
  }

  const doc = docRow as unknown as { id: string };

  // Fire the processing Edge Function without blocking the response.
  // Processing failures leave the document in PROCESSING status and are
  // surfaced to the GESTOR via the document status indicator in the UI.
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (supabaseUrl && serviceRoleKey) {
    void fetch(`${supabaseUrl}/functions/v1/process-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ document_id: doc.id }),
    }).catch(() => {
      // Swallowed intentionally — the document remains in PROCESSING until
      // the function succeeds. No user-visible side-effect from this path.
    });
  }

  revalidatePath("/dashboard/expenses");
  return { success: true, documentId: doc.id };
}

// ---------------------------------------------------------------------------
// getDocument — read
// ---------------------------------------------------------------------------

export async function getDocument(
  documentId: string,
): Promise<Document | null> {
  const session = await getServerSession();
  if (!session) return null;

  const admin = createServerSupabaseClient();

  const { data, error } = await admin
    .from("documents")
    .select(
      "id, building_id, storage_path, mime_type, file_size_bytes, status, ocr_payload, uploaded_by, created_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (error || !data) return null;

  return data as unknown as Document;
}
