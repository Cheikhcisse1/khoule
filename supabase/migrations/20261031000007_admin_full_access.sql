-- =====================================================================
-- Khoulé Éducation — 7. Accès complet de l'administrateur
-- L'admin peut changer le rôle d'un utilisateur : il doit pouvoir créer
-- la fiche élève ou intervenant correspondante.
-- =====================================================================
create policy students_admin_insert on public.students for insert to authenticated
  with check (public.is_admin());
create policy instructors_admin_insert on public.instructors for insert to authenticated
  with check (public.is_admin());
