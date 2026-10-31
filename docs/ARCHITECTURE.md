# Khoulé Éducation — Architecture technique

## 1. Vue d'ensemble

```
┌──────────────────────────────┐        HTTPS (clé "anon" publique + JWT utilisateur)
│  Application web (SPA)       │ ─────────────────────────────────────────────┐
│  React 18 + TypeScript + Vite│                                              ▼
│  react-router (routes/rôle)  │        ┌───────────────────────────────────────────────┐
│  @supabase/supabase-js       │        │                  Supabase                      │
└──────────────────────────────┘        │  Auth (e-mail / mot de passe, JWT)             │
                                        │  PostgreSQL + Row Level Security (toutes tables)│
                                        │  Storage (4 buckets, policies par dossier)     │
                                        │  Realtime (notifications, messages, réponses)  │
                                        │  Fonctions SQL (RPC) : stats, recherche        │
                                        │  Triggers : profils, notifications, notes      │
                                        └───────────────────────────────────────────────┘
```

* **Aucun serveur applicatif** : toute la logique de sécurité vit dans PostgreSQL (RLS, triggers,
  fonctions `security definer`). Le frontend n'utilise que la clé **anon** publique ;
  la clé `service_role` n'est jamais livrée au navigateur.
* Hébergement du frontend : n'importe quel hébergeur statique (Vercel, Netlify, Cloudflare Pages…).

## 2. Rôles et cycle de vie des comptes

| Rôle | Création | Statut initial | Qui peut changer le rôle/statut |
|------|----------|----------------|---------------------------------|
| `student` | Inscription libre | `active` | Admin |
| `instructor` | Inscription libre (candidature) | `pending` → `active` après validation | Admin |
| `admin` | Promotion SQL manuelle (voir README) | `active` | Admin |

* Le rôle est lu depuis les métadonnées d'inscription **uniquement** pour `student`/`instructor` :
  impossible de s'auto-déclarer admin.
* Un trigger empêche tout utilisateur non-admin de modifier son `role` ou son `status`.
* Un compte `suspended` perd tous ses accès (les fonctions d'autorisation vérifient `status = 'active'`).

## 3. Modèle pédagogique

```
classes (CI … Terminale) ──< class_subjects >── subjects
   │                                              │
   └──< teaching_assignments >── instructors ─────┘   (affectation par l'admin)
                                     │
                                  courses (classe + matière + intervenant)
        ┌──────────┬──────────┬──────┴─────┬─────────────┬──────────┐
     lessons   course_materials  schedules  course_sessions  exercises   questions
        │                         (créneaux   (séances datées,   │           │
  lesson_progress                 week-end)   salle, lien visio) assignments answers
                                                                 │
                                                            submissions ── corrections
                                                                 └──────── grades
enrollments (élève ↔ cours)   messages (direct ou fil de cours)   notifications   announcements
```

* Un intervenant ne peut créer un cours que pour un couple **(classe, matière)** que l'admin lui a affecté.
* Un élève ne voit et ne s'inscrit qu'aux cours **publiés de sa classe**.
* Un **exercice** est un contenu (exercice ou évaluation) ; un **devoir** (`assignments`) le donne
  aux élèves inscrits avec une date limite. Les élèves déposent une **soumission** (texte + fichiers),
  l'intervenant rédige une **correction** et attribue une **note** (`grades`).

## 4. Sécurité

* RLS activée sur **toutes** les tables du schéma `public`.
* Fonctions d'autorisation (`security definer`, `search_path` figé) :
  `is_admin()`, `is_active_instructor()`, `is_course_instructor(course)`,
  `is_enrolled(course)`, `can_access_course(course)`, `can_see_profile(user)`.
* Données des mineurs : les coordonnées (téléphone, tuteur légal) sont dans `students`,
  lisibles uniquement par l'élève, l'admin et les intervenants de ses cours ; un élève ne voit que le
  nom des camarades inscrits aux mêmes cours (jamais leurs coordonnées) et ne peut écrire en privé
  qu'aux intervenants/admins. Le consentement du tuteur est horodaté.
* Storage — buckets **privés**, chemin = clé d'autorisation :
  * `course-materials/{course_id}/…` : intervenant du cours + admin (écriture), élèves inscrits (lecture)
  * `submissions/{student_id}/{assignment_id}/…` : élève propriétaire (écriture), intervenant du cours (lecture)
  * `corrections/{submission_id}/…` : intervenant (écriture), élève concerné (lecture)
  * `avatars/{user_id}/…` : public en lecture, propriétaire en écriture
* Téléchargements via URL signées à durée courte (60 s).

## 5. Temps réel et notifications

Des triggers PostgreSQL insèrent dans `notifications` lors de : nouveau cours publié, nouvelle séance,
nouveau devoir, correction/note, réponse à une question, message reçu, décision sur une candidature,
annonce. Le frontend s'abonne (Realtime) aux insertions de `notifications` et `messages` filtrées sur
l'utilisateur courant.

## 6. Arborescence du dépôt

```
supabase/migrations/   schéma, RLS, storage, triggers, RPC (ordre numérique)
supabase/seed.sql      classes CI→Terminale, matières, programme par niveau
supabase/tests/        tests RLS exécutables (psql)
src/lib/               client Supabase, types, utilitaires
src/auth/              contexte d'authentification, garde de routes
src/components/        UI partagée (layout, cartes, upload, calendrier…)
src/pages/             pages communes (connexion, recherche, messages, calendrier…)
src/pages/student/     espace élève
src/pages/instructor/  espace intervenant
src/pages/admin/       espace administrateur
```
