// Run this in Supabase SQL editor to scaffold the storage buckets

-- Create buckets for Provider Documents
insert into storage.buckets (id, name, public) values ('provider-documents', 'provider-documents', false);
insert into storage.buckets (id, name, public) values ('provider-photos', 'provider-photos', true);
insert into storage.buckets (id, name, public) values ('booking-photos', 'booking-photos', false);
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- Note: RLS is already enabled by default on storage.objects in Supabase.
-- We can go straight to creating the policies.

-- Provider Documents Policy (Private, only owner can view/upload)
create policy "Providers can upload their own documents"
on storage.objects for insert
with check ( bucket_id = 'provider-documents' and auth.uid() = owner);

create policy "Providers can view their own documents"
on storage.objects for select
using ( bucket_id = 'provider-documents' and auth.uid() = owner);

-- Public Photos Policy
create policy "Public photos are viewable by everyone"
on storage.objects for select
using ( bucket_id in ('provider-photos', 'avatars') );

create policy "Users can upload their own photos"
on storage.objects for insert
with check ( bucket_id in ('provider-photos', 'avatars') and auth.uid() = owner);
