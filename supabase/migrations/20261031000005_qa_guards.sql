-- =====================================================================
-- Khoulé Éducation — 5. Garde-fous Questions / Réponses
-- * l'auteur d'une question peut marquer une réponse comme utile ;
-- * seuls les modérateurs (intervenant du cours, admin) peuvent masquer ;
-- * personne ne peut réécrire le texte d'un autre.
-- =====================================================================
drop policy answers_update on public.answers;
create policy answers_update on public.answers for update to authenticated
  using (author_id = auth.uid()
         or public.can_manage_course(public.question_course(question_id))
         or exists (select 1 from public.questions q where q.id = question_id and q.author_id = auth.uid()))
  with check (true);

create or replace function public.answer_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_moderator boolean;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  v_moderator := public.can_manage_course(public.question_course(old.question_id));
  new.question_id := old.question_id;
  new.author_id := old.author_id;
  if auth.uid() <> old.author_id then
    new.body := old.body;
  end if;
  if not v_moderator then
    new.is_hidden := old.is_hidden;
    -- seul l'auteur de la question décide de la réponse utile
    if not exists (select 1 from public.questions q where q.id = old.question_id and q.author_id = auth.uid()) then
      new.is_accepted := old.is_accepted;
    end if;
  end if;
  return new;
end $$;
create trigger answers_before_update before update on public.answers
  for each row execute function public.answer_before_update();

create or replace function public.question_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.course_id := old.course_id;
  new.author_id := old.author_id;
  if not public.can_manage_course(old.course_id) then
    new.is_hidden := old.is_hidden;
  end if;
  if auth.uid() <> old.author_id then
    new.title := old.title;
    new.body := old.body;
  end if;
  return new;
end $$;
create trigger questions_before_update before update on public.questions
  for each row execute function public.question_before_update();
