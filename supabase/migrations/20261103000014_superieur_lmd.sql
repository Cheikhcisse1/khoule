-- =============================================================================
-- Enseignement supérieur (système LMD) : les étudiants suivent cours magistraux,
-- TD et TP avec leurs enseignants, comme les élèves du primaire et du secondaire.
-- =============================================================================

-- 1. Nouveau cycle « supérieur »
alter table public.classes drop constraint classes_cycle_check;
alter table public.classes add constraint classes_cycle_check
  check (cycle in ('elementaire', 'college', 'lycee', 'superieur'));

-- 2. Niveaux LMD (après toutes les classes existantes)
insert into public.classes (code, name, cycle, sort_order)
select v.code, v.name, 'superieur', (select coalesce(max(sort_order), 0) from public.classes) + v.n
from (values ('L1', 'Licence 1', 1), ('L2', 'Licence 2', 2), ('L3', 'Licence 3', 3),
             ('M1', 'Master 1', 4), ('M2', 'Master 2', 5)) as v(code, name, n)
on conflict (code) do nothing;

-- 3. Disciplines du supérieur (les matières existantes sont réutilisées)
insert into public.subjects (name, color) values
  ('Droit', '#7a1f3d'), ('Sciences économiques', '#2c5aa0'), ('Gestion et comptabilité', '#8a5a00'),
  ('Sociologie', '#5b3f8c'), ('Lettres modernes', '#a0412c'), ('Communication', '#1f6f7a')
on conflict (name) do nothing;

-- 4. Programme : chaque niveau LMD propose ces disciplines
insert into public.class_subjects (class_id, subject_id)
select c.id, s.id
from public.classes c
cross join public.subjects s
where c.cycle = 'superieur'
  and (s.name in ('Droit', 'Sciences économiques', 'Gestion et comptabilité', 'Sociologie', 'Lettres modernes', 'Communication',
                  'Mathématiques', 'Anglais', 'Physique-Chimie', 'Sciences de la Vie et de la Terre', 'Histoire-Géographie', 'Philosophie')
       or lower(trim(s.name)) = 'informatique')
on conflict do nothing;

-- 5. Format pédagogique d'un cours : cours magistral, travaux dirigés, travaux pratiques
alter table public.courses add column format text not null default 'cours'
  check (format in ('cours', 'td', 'tp'));
