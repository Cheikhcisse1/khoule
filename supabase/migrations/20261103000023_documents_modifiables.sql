-- =============================================================================
-- Documents & annales modifiables (classe, matière, titre…) après dépôt.
-- Le fichier reste à son emplacement d'origine : l'accès au fichier suit désormais
-- la fiche du document (sa classe actuelle), et non plus le dossier où il a été rangé.
-- La lecture de library_documents est déjà filtrée par can_read_library (RLS).
-- =============================================================================

create or replace function public.can_read_library_file(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.library_documents d
                 where d.file_path = p_path
                   and (public.can_read_library(d.class_id) or d.uploaded_by = auth.uid()))
$$;
revoke execute on function public.can_read_library_file(text) from public, anon;
grant execute on function public.can_read_library_file(text) to authenticated;

drop policy library_files_read on storage.objects;
create policy library_files_read on storage.objects for select to authenticated
  using (bucket_id = 'library' and (owner = (select auth.uid()) or public.can_read_library_file(name)));
