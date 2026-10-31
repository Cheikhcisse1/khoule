-- =====================================================================
-- Khoulé Éducation — données de référence (classes, matières, programme)
-- Idempotent : peut être rejoué sans doublons.
-- =====================================================================
insert into public.classes (code, name, cycle, sort_order) values
  ('CI',  'Classe d''initiation',    'elementaire', 1),
  ('CP',  'Cours préparatoire',      'elementaire', 2),
  ('CE1', 'Cours élémentaire 1',     'elementaire', 3),
  ('CE2', 'Cours élémentaire 2',     'elementaire', 4),
  ('CM1', 'Cours moyen 1',           'elementaire', 5),
  ('CM2', 'Cours moyen 2',           'elementaire', 6),
  ('6E',  'Sixième',                 'college',     7),
  ('5E',  'Cinquième',               'college',     8),
  ('4E',  'Quatrième',               'college',     9),
  ('3E',  'Troisième',               'college',    10),
  ('2ND', 'Seconde',                 'lycee',      11),
  ('1RE', 'Première',                'lycee',      12),
  ('TLE', 'Terminale',               'lycee',      13)
on conflict (code) do nothing;

insert into public.subjects (name, color) values
  ('Mathématiques',                    '#1f7a4d'),
  ('Français',                         '#c0392b'),
  ('Anglais',                          '#2c5aa0'),
  ('Physique-Chimie',                  '#7b3fa0'),
  ('Sciences de la Vie et de la Terre','#2e8b57'),
  ('Histoire-Géographie',              '#b0702a'),
  ('Philosophie',                      '#4a4e69'),
  ('Espagnol',                         '#d35400'),
  ('Arabe',                            '#16748a'),
  ('Éducation civique',                '#8a6d1f'),
  ('Découverte du monde',              '#3d8b37')
on conflict (name) do nothing;

-- Programme par niveau
with plan(cycle, codes, subject) as (values
  ('elementaire', null::text[], 'Mathématiques'),
  ('elementaire', null, 'Français'),
  ('elementaire', null, 'Découverte du monde'),
  ('elementaire', null, 'Éducation civique'),
  ('elementaire', null, 'Arabe'),
  ('elementaire', array['CE2','CM1','CM2'], 'Histoire-Géographie'),
  ('elementaire', array['CM1','CM2'], 'Anglais'),
  ('college', null, 'Mathématiques'),
  ('college', null, 'Français'),
  ('college', null, 'Anglais'),
  ('college', null, 'Sciences de la Vie et de la Terre'),
  ('college', null, 'Histoire-Géographie'),
  ('college', null, 'Éducation civique'),
  ('college', null, 'Arabe'),
  ('college', array['4E','3E'], 'Physique-Chimie'),
  ('college', array['4E','3E'], 'Espagnol'),
  ('lycee', null, 'Mathématiques'),
  ('lycee', null, 'Français'),
  ('lycee', null, 'Anglais'),
  ('lycee', null, 'Physique-Chimie'),
  ('lycee', null, 'Sciences de la Vie et de la Terre'),
  ('lycee', null, 'Histoire-Géographie'),
  ('lycee', null, 'Espagnol'),
  ('lycee', null, 'Arabe'),
  ('lycee', array['1RE','TLE'], 'Philosophie')
)
insert into public.class_subjects (class_id, subject_id)
select c.id, s.id
from plan
join public.classes c on c.cycle = plan.cycle and (plan.codes is null or c.code = any (plan.codes))
join public.subjects s on s.name = plan.subject
on conflict do nothing;
