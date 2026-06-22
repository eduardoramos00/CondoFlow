-- CondoFlow — Storage bucket provisioning
-- Run automatically by `supabase db reset` in local dev.
-- For production: apply manually via Supabase dashboard or the management API.

-- ── Storage buckets ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'invoices',
    'invoices',
    false,                   -- private: access controlled via RLS
    10485760,                -- 10 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'incident-media',
    'incident-media',
    false,                   -- private: access controlled via RLS
    10485760,                -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ─────────────────────────────────────────────────────
-- Gestor: full access to their building's invoices (path scoped by building_id)
-- Condómino: read-only on incident-media for their building
-- Service role bypasses RLS entirely (used by server actions for uploads)

CREATE POLICY "invoices_gestor_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] IN (
      SELECT b.id::text
      FROM public.buildings b
      JOIN public.user_building_roles r ON r.building_id = b.id
      WHERE r.user_id = auth.uid() AND r.role = 'GESTOR'
    )
  );

CREATE POLICY "invoices_gestor_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] IN (
      SELECT b.id::text
      FROM public.buildings b
      JOIN public.user_building_roles r ON r.building_id = b.id
      WHERE r.user_id = auth.uid() AND r.role = 'GESTOR'
    )
  );

CREATE POLICY "invoices_gestor_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] IN (
      SELECT b.id::text
      FROM public.buildings b
      JOIN public.user_building_roles r ON r.building_id = b.id
      WHERE r.user_id = auth.uid() AND r.role = 'GESTOR'
    )
  );

CREATE POLICY "incident_media_building_member_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'incident-media'
    AND (storage.foldername(name))[1] IN (
      SELECT building_id::text
      FROM public.user_building_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "incident_media_member_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident-media'
    AND (storage.foldername(name))[1] IN (
      SELECT building_id::text
      FROM public.user_building_roles
      WHERE user_id = auth.uid()
    )
  );
