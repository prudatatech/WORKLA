-- Create the provider-documents bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-documents', 'provider-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS setup to ensure providers can upload their securely
DROP POLICY IF EXISTS "Providers can manage their own documents" ON storage.objects;
CREATE POLICY "Providers can manage their own documents"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'provider-documents' AND (storage.foldername(name))[1]::uuid = auth.uid())
WITH CHECK (bucket_id = 'provider-documents' AND (storage.foldername(name))[1]::uuid = auth.uid());
