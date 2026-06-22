import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// OcrPayload — canonical shape for documents.ocr_payload (JSONB).
//
// This interface is the integration contract between the Edge Function and
// Phase 3.3 UI. Replace the mock extraction block below with a real OCR
// provider (e.g. Google Document AI, AWS Textract, Azure Form Recognizer)
// without altering this type so downstream consumers remain stable.
// ---------------------------------------------------------------------------
interface OcrPayload {
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
}

interface ProcessInvoiceRequest {
  document_id: string;
}

interface DocumentRow {
  id: string;
  status: string;
  storage_path: string;
  mime_type: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: ProcessInvoiceRequest;
  try {
    body = (await req.json()) as ProcessInvoiceRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { document_id } = body;

  if (!document_id || typeof document_id !== "string") {
    return jsonResponse({ error: "document_id is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing environment configuration" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch and validate: only process documents that are still PROCESSING.
  // The status filter acts as an idempotency guard — a repeated invocation
  // for an already-DRAFT document is a no-op at the DB level.
  const { data: doc, error: fetchError } = await admin
    .from("documents")
    .select("id, status, storage_path, mime_type")
    .eq("id", document_id)
    .eq("status", "PROCESSING")
    .maybeSingle();

  if (fetchError || !doc) {
    return jsonResponse(
      { error: "Document not found or not in PROCESSING state" },
      404,
    );
  }

  const document = doc as unknown as DocumentRow;

  // ---------------------------------------------------------------------------
  // STUB: Mock OCR extraction
  //
  // Replace this section with a real OCR provider call. The storage object is
  // accessible via a signed URL from the `invoices` bucket:
  //
  //   const { data: signedUrl } = await admin.storage
  //     .from("invoices")
  //     .createSignedUrl(document.storage_path, 60);
  //
  // Pass signedUrl.signedUrl to the provider SDK, then map the response to
  // OcrPayload. The update call below remains unchanged.
  // ---------------------------------------------------------------------------
  const mockPayload: OcrPayload = {
    extracted_at: new Date().toISOString(),
    supplier_name: null,
    nif: null,
    total_amount: null,
    issue_date: null,
    invoice_number: null,
    line_items: [],
  };

  const { error: updateError } = await admin
    .from("documents")
    .update({
      status: "DRAFT",
      ocr_payload: mockPayload,
    })
    .eq("id", document.id)
    .eq("status", "PROCESSING"); // Re-check status at update time for safety

  if (updateError) {
    return jsonResponse({ error: "Failed to update document record" }, 500);
  }

  return jsonResponse({ success: true, document_id }, 200);
});
