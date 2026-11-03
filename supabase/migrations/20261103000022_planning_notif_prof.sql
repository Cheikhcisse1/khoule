-- Quand la direction ajoute des créneaux au planning d'un professeur, il est prévenu
-- (une seule notification par ajout, même pour un créneau répété sur plusieurs semaines).
create or replace function public.notify_planning_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select c.instructor_id, 'planning', 'Nouveau créneau dans votre planning',
         c.title || ' : ' || count(*) || ' séance(s) ajoutée(s), à partir du '
           || to_char(min(n.starts_at) at time zone 'Africa/Dakar', 'DD/MM/YYYY à HH24:MI') || '.',
         '/intervenant/planning'
  from new_rows n join public.courses c on c.id = n.course_id
  where c.instructor_id is distinct from auth.uid()
  group by c.instructor_id, c.title;
  return null;
end $$;
create trigger course_sessions_notify_planning after insert on public.course_sessions
  referencing new table as new_rows for each statement execute function public.notify_planning_added();
