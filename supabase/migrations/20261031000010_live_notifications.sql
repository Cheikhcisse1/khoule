-- =====================================================================
-- Khoulé Éducation — 10. Notification des cours en direct
-- Une séance qui démarre dans moins de 30 minutes (« Démarrer un direct »)
-- prévient tous les élèves de la classe, inscrits ou non au cours.
-- =====================================================================
create or replace function public.session_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_class smallint;
begin
  if new.live_url is not null and new.starts_at <= now() + interval '30 minutes' then
    select class_id into v_class from public.courses where id = new.course_id;
    insert into public.notifications (user_id, type, title, body, link)
    select s.profile_id, 'live', '🔴 Cours en direct maintenant', new.title, '/eleve'
    from public.students s join public.profiles p on p.id = s.profile_id
    where s.class_id = v_class and p.status = 'active';
  else
    perform public.notify_course_students(new.course_id, 'new_session', 'Nouvelle séance programmée',
      new.title || ' — ' || to_char(new.starts_at at time zone 'Africa/Dakar', 'DD/MM/YYYY HH24:MI'),
      '/calendrier');
  end if;
  return null;
end $$;
revoke execute on function public.session_after_insert() from public, anon, authenticated;
