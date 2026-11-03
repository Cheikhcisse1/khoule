-- Libellé affiché à côté d'un nom (messagerie…) : fonction du responsable d'établissement,
-- ou « étudiant » pour un inscrit du supérieur. Ne renvoie que des personnes visibles par l'appelant.
create or replace function public.people_labels(p_ids uuid[])
returns table (id uuid, staff_title text, school_name text, higher_student boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
         (select st.title from public.school_staff st where st.user_id = p.id order by st.created_at limit 1),
         (select sc.name from public.school_staff st join public.schools sc on sc.id = st.school_id
           where st.user_id = p.id order by st.created_at limit 1),
         exists (select 1 from public.students s join public.classes c on c.id = s.class_id
                 where s.profile_id = p.id and c.cycle = 'superieur')
  from public.profiles p
  where p.id = any (p_ids[1:300]) and public.can_see_profile(p.id)
$$;
revoke execute on function public.people_labels(uuid[]) from public, anon;
grant execute on function public.people_labels(uuid[]) to authenticated;
