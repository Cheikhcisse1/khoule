# -*- coding: utf-8 -*-
"""Contenu du guide « Requêtes SQL sous Supabase » (Khoulé Éducation)."""

PROJECT_SQL_URL = "https://supabase.com/dashboard/project/shgtnhypsernnsiwitqa/sql/new"

# Chaque requête : (titre, explication, sql, type) — type 'lecture' ou 'modification'
QUERIES = {}

QUERIES["bases"] = [
    ("Afficher une table entière (les 20 premières lignes)",
     "SELECT choisit les colonnes (* = toutes), FROM la table, LIMIT le nombre de lignes.",
     """select *
from public.classes
limit 20;""", "lecture"),
    ("Choisir des colonnes et filtrer",
     "WHERE garde seulement les lignes qui respectent la condition.",
     """select first_name, last_name, status
from public.profiles
where role = 'student';""", "lecture"),
    ("Trier et compter",
     "ORDER BY trie le résultat ; count(*) compte les lignes.",
     """select role, count(*) as nombre
from public.profiles
group by role
order by nombre desc;""", "lecture"),
    ("Chercher un texte (sans tenir compte des majuscules)",
     "ILIKE compare un texte ; % remplace n'importe quelle suite de caractères.",
     """select first_name, last_name
from public.profiles
where last_name ilike '%cisse%';""", "lecture"),
    ("Relier deux tables (JOIN)",
     "Les élèves sont dans profiles (nom) et students (classe) : on les relie par l'identifiant.",
     """select p.first_name, p.last_name, c.code as classe
from public.profiles p
join public.students s on s.profile_id = p.id
left join public.classes c on c.id = s.class_id
order by c.sort_order, p.last_name;""", "lecture"),
]

QUERIES["utilisateurs"] = [
    ("Tous les élèves avec leur classe et leur tuteur",
     "Coordonnées complètes : à n'utiliser que pour l'accompagnement scolaire.",
     """select p.first_name as prenom, p.last_name as nom, u.email,
       c.code as classe, s.school as etablissement,
       s.guardian_name as tuteur, s.guardian_phone as tel_tuteur,
       p.status as statut, p.created_at::date as inscrit_le
from public.profiles p
join auth.users u on u.id = p.id
join public.students s on s.profile_id = p.id
left join public.classes c on c.id = s.class_id
where p.role = 'student'
order by c.sort_order, p.last_name;""", "lecture"),
    ("Les élèves d'une seule classe",
     "Remplacez '3E' par le code voulu : CI, CP, CE1, CE2, CM1, CM2, 6E, 5E, 4E, 3E, 2ND, 1RE, TLE.",
     """select p.first_name, p.last_name, u.email, s.guardian_phone
from public.profiles p
join auth.users u on u.id = p.id
join public.students s on s.profile_id = p.id
join public.classes c on c.id = s.class_id
where c.code = '3E' and p.status = 'active'
order by p.last_name;""", "lecture"),
    ("Intervenants et état de leur candidature",
     "pending = en attente, approved = validée, rejected = refusée.",
     """select p.first_name as prenom, p.last_name as nom, u.email,
       ic.phone as telephone, i.instructor_type as type,
       i.specialty as specialite, i.application_status as candidature,
       p.status as statut, p.created_at::date as inscrit_le
from public.profiles p
join auth.users u on u.id = p.id
join public.instructors i on i.profile_id = p.id
left join public.instructor_contacts ic on ic.profile_id = p.id
where p.role = 'instructor'
order by i.application_status, p.created_at desc;""", "lecture"),
    ("Candidatures en attente uniquement", "",
     """select p.first_name, p.last_name, u.email, i.specialty, i.education_level
from public.profiles p
join auth.users u on u.id = p.id
join public.instructors i on i.profile_id = p.id
where i.application_status = 'pending'
order by p.created_at;""", "lecture"),
    ("Trouver un compte à partir de son e-mail", "",
     """select u.email, p.first_name, p.last_name, p.role, p.status,
       u.created_at::date as cree_le, u.last_sign_in_at as derniere_connexion
from auth.users u
left join public.profiles p on p.id = u.id
where u.email ilike '%gmail.com%';""", "lecture"),
    ("Comptes suspendus", "",
     """select p.first_name, p.last_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.status = 'suspended';""", "lecture"),
    ("Liste des administrateurs", "",
     """select p.first_name, p.last_name, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';""", "lecture"),
]

QUERIES["statistiques"] = [
    ("Nombre d'élèves par classe", "",
     """select c.code as classe, count(s.profile_id) as eleves
from public.classes c
left join public.students s on s.class_id = c.id
group by c.code, c.sort_order
order by c.sort_order;""", "lecture"),
    ("Résumé de la plateforme en une requête", "",
     """select
  (select count(*) from public.profiles where role = 'student' and status = 'active') as eleves,
  (select count(*) from public.instructors where application_status = 'approved') as intervenants,
  (select count(*) from public.courses where status = 'published') as cours_publies,
  (select count(*) from public.enrollments where status = 'active') as inscriptions,
  (select count(*) from public.library_documents) as documents,
  (select count(*) from public.submissions where status = 'submitted') as copies_a_corriger;""", "lecture"),
    ("Nombre d'inscrits par cours", "",
     """select co.title as cours, c.code as classe, sj.name as matiere,
       count(e.id) filter (where e.status = 'active') as inscrits
from public.courses co
join public.classes c on c.id = co.class_id
join public.subjects sj on sj.id = co.subject_id
left join public.enrollments e on e.course_id = co.id
group by co.id, co.title, c.code, sj.name
order by inscrits desc;""", "lecture"),
    ("Nouvelles inscriptions des 30 derniers jours", "",
     """select created_at::date as jour, count(*) as nouveaux_comptes
from public.profiles
where created_at > now() - interval '30 days'
group by jour
order by jour;""", "lecture"),
    ("Moyenne des notes par cours (sur 20)", "",
     """select co.title as cours,
       round(avg(g.score / g.max_score * 20), 1) as moyenne_sur_20,
       count(g.id) as nombre_de_notes
from public.grades g
join public.courses co on co.id = g.course_id
group by co.title
order by moyenne_sur_20 desc;""", "lecture"),
]

QUERIES["pedagogie"] = [
    ("Tous les cours avec leur intervenant", "",
     """select co.title as cours, c.code as classe, sj.name as matiere,
       p.first_name || ' ' || p.last_name as intervenant,
       co.status as statut, co.created_at::date as cree_le
from public.courses co
join public.classes c on c.id = co.class_id
join public.subjects sj on sj.id = co.subject_id
join public.profiles p on p.id = co.instructor_id
order by c.sort_order, sj.name;""", "lecture"),
    ("Séances à venir (heure de Dakar)", "",
     """select to_char(s.starts_at at time zone 'Africa/Dakar', 'DD/MM HH24:MI') as debut,
       co.title as cours, s.title as seance, s.room as salle,
       s.live_url as lien_visio
from public.course_sessions s
join public.courses co on co.id = s.course_id
where s.ends_at > now() and s.status = 'scheduled'
order by s.starts_at;""", "lecture"),
    ("Devoirs rendus pas encore corrigés", "",
     """select p.first_name || ' ' || p.last_name as eleve,
       e.title as devoir, co.title as cours,
       sub.submitted_at::date as rendu_le
from public.submissions sub
join public.assignments a on a.id = sub.assignment_id
join public.exercises e on e.id = a.exercise_id
join public.courses co on co.id = a.course_id
join public.profiles p on p.id = sub.student_id
where sub.status = 'submitted'
order by sub.submitted_at;""", "lecture"),
    ("Toutes les notes d'un élève",
     "Remplacez le nom de famille entre les % par celui de l'élève.",
     """select e.title as devoir, co.title as cours,
       g.score || '/' || g.max_score as note, g.created_at::date as le
from public.grades g
join public.assignments a on a.id = g.assignment_id
join public.exercises e on e.id = a.exercise_id
join public.courses co on co.id = g.course_id
join public.profiles p on p.id = g.student_id
where p.last_name ilike '%ba%'
order by g.created_at desc;""", "lecture"),
    ("Documents & annales déposés", "",
     """select d.title as document, d.kind as type, d.year as annee,
       c.code as classe, sj.name as matiere,
       p.first_name || ' ' || p.last_name as depose_par, d.created_at::date as le
from public.library_documents d
join public.classes c on c.id = d.class_id
join public.subjects sj on sj.id = d.subject_id
left join public.profiles p on p.id = d.uploaded_by
order by d.created_at desc;""", "lecture"),
    ("Affectations des intervenants", "",
     """select p.first_name || ' ' || p.last_name as intervenant,
       c.code as classe, sj.name as matiere
from public.teaching_assignments ta
join public.profiles p on p.id = ta.instructor_id
join public.classes c on c.id = ta.class_id
join public.subjects sj on sj.id = ta.subject_id
order by c.sort_order, sj.name;""", "lecture"),
    ("Disponibilités des intervenants dans la semaine",
     "day_of_week : 0 = dimanche, 1 = lundi … 6 = samedi.",
     """select p.first_name || ' ' || p.last_name as intervenant,
       case a.day_of_week when 0 then 'Dimanche' when 1 then 'Lundi'
         when 2 then 'Mardi' when 3 then 'Mercredi' when 4 then 'Jeudi'
         when 5 then 'Vendredi' else 'Samedi' end as jour,
       to_char(a.start_time, 'HH24:MI') || ' - ' || to_char(a.end_time, 'HH24:MI') as horaire,
       a.mode as format
from public.instructor_availabilities a
join public.profiles p on p.id = a.instructor_id
order by p.last_name, (a.day_of_week + 6) % 7, a.start_time;""", "lecture"),
]

QUERIES["modifications"] = [
    ("Valider la candidature d'un intervenant",
     "Deux requêtes à exécuter ensemble. Remplacez l'adresse e-mail. "
     "Pensez ensuite à l'affecter (requête suivante ou page Affectations du site).",
     """update public.instructors
   set application_status = 'approved', reviewed_at = now()
 where profile_id = (select id from auth.users where email = 'intervenant@exemple.com');

update public.profiles set status = 'active'
 where id = (select id from auth.users where email = 'intervenant@exemple.com');""", "modification"),
    ("Affecter un intervenant à une classe et une matière", "",
     """insert into public.teaching_assignments (instructor_id, class_id, subject_id)
select u.id, c.id, s.id
from auth.users u, public.classes c, public.subjects s
where u.email = 'intervenant@exemple.com'
  and c.code = 'TLE' and s.name = 'Mathématiques';""", "modification"),
    ("Refuser une candidature", "",
     """update public.instructors
   set application_status = 'rejected',
       rejection_reason = 'Profil incomplet', reviewed_at = now()
 where profile_id = (select id from auth.users where email = 'intervenant@exemple.com');""", "modification"),
    ("Suspendre un compte (ou le réactiver)",
     "Mettez 'active' à la place de 'suspended' pour réactiver.",
     """update public.profiles set status = 'suspended'
 where id = (select id from auth.users where email = 'utilisateur@exemple.com');""", "modification"),
    ("Changer la classe d'un élève (passage en classe supérieure)", "",
     """update public.students
   set class_id = (select id from public.classes where code = '2ND')
 where profile_id = (select id from auth.users where email = 'eleve@exemple.com');""", "modification"),
    ("Publier ou archiver un cours",
     "Valeurs possibles : 'draft' (brouillon), 'published' (publié), 'archived' (archivé).",
     """update public.courses set status = 'archived'
 where title = 'Titre exact du cours';""", "modification"),
    ("Publier une annonce pour tout le monde",
     "audience : 'all', 'students', 'instructors' ou 'class' (avec class_id).",
     """insert into public.announcements (title, body, audience, pinned)
values ('Reprise des cours', 'Les cours reprennent lundi à 17 h.', 'all', true);""", "modification"),
    ("Donner les droits d'administrateur",
     "À n'utiliser que pour une personne de confiance : elle aura accès à tout.",
     """update public.profiles set role = 'admin', status = 'active'
 where id = (select id from auth.users where email = 'personne@exemple.com');""", "modification"),
]

QUERIES["securite"] = [
    ("Tester une modification sans risque (transaction)",
     "BEGIN ouvre une transaction ; ROLLBACK annule tout. Quand le résultat est bon, "
     "remplacez ROLLBACK par COMMIT pour enregistrer.",
     """begin;

update public.courses set status = 'archived'
 where title = 'Titre exact du cours';

select title, status from public.courses where title = 'Titre exact du cours';

rollback;   -- remplacez par commit; pour enregistrer""", "lecture"),
    ("Compter avant de modifier ou de supprimer",
     "Lancez d'abord le SELECT avec le même WHERE : si le nombre n'est pas celui attendu, n'allez pas plus loin.",
     """select count(*) from public.enrollments
where status = 'dropped';""", "lecture"),
]

TABLES = [
    ("profiles", "Tous les comptes : prénom, nom, rôle (student / instructor / admin), statut"),
    ("auth.users", "Comptes de connexion : e-mail, date de création, dernière connexion"),
    ("students", "Fiche élève : classe, établissement, parent / tuteur, consentement"),
    ("instructors", "Fiche intervenant : type, études, spécialité, état de la candidature"),
    ("instructor_contacts", "Téléphone des intervenants (visible par l'administration seulement)"),
    ("instructor_availabilities", "Disponibilités des intervenants dans la semaine"),
    ("classes / subjects", "Classes (CI → Terminale) et matières"),
    ("class_subjects", "Programme : quelles matières dans quelle classe"),
    ("teaching_assignments", "Affectations : intervenant ↔ classe ↔ matière"),
    ("courses", "Cours : titre, classe, matière, intervenant, statut"),
    ("lessons / course_materials", "Leçons et supports d'un cours"),
    ("course_sessions / schedules", "Séances datées (salle, lien visio) et créneaux récurrents"),
    ("enrollments", "Inscriptions des élèves aux cours"),
    ("exercises / assignments", "Exercices et devoirs (avec date limite)"),
    ("submissions / corrections / grades", "Copies rendues, corrections et notes"),
    ("questions / answers", "Questions des élèves et réponses"),
    ("messages / notifications", "Messagerie et notifications"),
    ("announcements", "Annonces de l'administration"),
    ("library_documents", "Documents & annales déposés par les intervenants"),
]

ERRORS = [
    ("syntax error at or near …", "Faute de frappe : virgule ou guillemet oublié, mot mal écrit. "
     "Les textes s'écrivent entre apostrophes droites : 'texte'."),
    ("relation \"…\" does not exist", "Nom de table incorrect. Préfixez par public. (ex. public.courses) "
     "ou auth. pour auth.users."),
    ("column \"…\" does not exist", "Nom de colonne incorrect : consultez la table dans le Table Editor."),
    ("violates check constraint", "Valeur non autorisée (ex. un statut qui n'existe pas). "
     "Utilisez exactement les valeurs indiquées dans ce guide."),
    ("violates foreign key constraint", "Vous faites référence à un élément qui n'existe pas "
     "(ex. une classe ou un utilisateur introuvable)."),
    ("duplicate key value violates unique constraint", "L'élément existe déjà (ex. affectation déjà faite)."),
    ("UPDATE 0 / Success. No rows returned", "La requête a fonctionné mais n'a trouvé aucune ligne : "
     "vérifiez l'e-mail ou le titre utilisé dans le WHERE."),
]
