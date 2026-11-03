-- =============================================================================
-- Documents & annales : chacun ne voit que ce qui le concerne.
-- Avant : tout intervenant actif (donc aussi les responsables d'école, dont le
-- compte est un compte intervenant) voyait les documents de toutes les classes.
-- Désormais :
--   - administration : tout ;
--   - élève / étudiant : sa classe ;
--   - intervenant : les classes qui lui sont affectées (et ses propres dépôts) ;
--   - professeur inscrit dans une université : les niveaux du supérieur (L1 → M2) ;
--   - responsable d'établissement : les classes de son établissement
--     (selon le type d'école) ou, pour un responsable de filière, ses classes.
-- =============================================================================

create or replace function public.can_read_library(p_class smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or (public.is_active_student() and public.student_class_id() = p_class)
      or (public.is_active_instructor() and (
            exists (select 1 from public.teaching_assignments ta
                    where ta.instructor_id = auth.uid() and ta.class_id = p_class)
         or exists (select 1 from public.school_teachers t join public.classes c on c.id = p_class
                    where t.user_id = auth.uid() and c.cycle = 'superieur')))
      or exists (
           select 1 from public.school_staff st
           join public.schools sc on sc.id = st.school_id
           join public.classes c on c.id = p_class
           where st.user_id = auth.uid()
             and (case when st.scope = 'classes' then p_class = any (st.class_ids)
                       else case sc.kind
                              when 'elementaire' then c.cycle = 'elementaire'
                              when 'college' then c.cycle = 'college'
                              when 'lycee' then c.cycle = 'lycee'
                              when 'universite' then c.cycle = 'superieur'
                              when 'ecole_superieure' then c.cycle = 'superieur'
                              else true
                            end
                  end))
$$;

-- L'auteur d'un document le voit toujours, même s'il n'est plus affecté à la classe
drop policy library_read on public.library_documents;
create policy library_read on public.library_documents for select to authenticated
  using (public.can_read_library(class_id) or uploaded_by = (select auth.uid()));
