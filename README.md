# Khoulé Éducation

Plateforme éducative communautaire de soutien scolaire du week-end pour les élèves de Khoulé (Sénégal),
de la CI à la Terminale. Les cours sont animés par des enseignants, professeurs, étudiants et autres
intervenants originaires de Khoulé.

**Stack** : React 18 + TypeScript + Vite (frontend) · Supabase (Auth, PostgreSQL + RLS, Storage, Realtime, Edge Function).

> Architecture détaillée et modèle de données : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 1. Fonctionnalités

| Profil | Fonctionnalités |
|---|---|
| **Élève** | Inscription (classe, établissement, parent/tuteur + consentement) · catalogue des cours de sa classe · inscription aux cours · leçons (texte, vidéo) et suivi « leçon terminée » · supports téléchargeables · exercices · dépôt de devoirs (texte, PDF, photos, documents) · corrections et notes · progression et historique · questions aux intervenants · discussion de cours · messages privés aux intervenants · calendrier · notifications temps réel · annonces |
| **Intervenant** | Candidature + profil (niveau d'études, spécialité, expérience, matières et classes souhaitées) · création/publication de cours sur ses affectations · leçons, supports (PDF, images, vidéos, liens) · exercices/évaluations, devoirs avec date limite · séances datées (salle, lien visio, bouton « Créer un lien Jitsi ») et créneaux récurrents du week-end avec génération automatique des séances · correction et notation · réponses aux questions et modération de ses cours · suivi de la progression de chaque élève · statistiques de ses cours · messagerie |
| **Administrateur** | Tableau de bord statistique · validation/refus des candidatures · gestion des comptes (suspension, réactivation, suppression, promotion admin), fiches élèves avec tuteur · classes, matières et programme par niveau · affectation des intervenants · gestion de tous les cours · annonces ciblées (tous, élèves, intervenants, une classe) · modération (questions, réponses, discussions) |
| **Tous** | Recherche globale (cours, matières, intervenants) · calendrier mensuel · notifications · profil, mot de passe |

## 2. Arborescence

```
supabase/
  migrations/      5 scripts SQL (schéma, triggers, RLS, storage + RPC + realtime, garde-fous Q&R)
  seed.sql         13 classes (CI → Terminale), 11 matières, programme par niveau
  functions/admin-delete-user/   Edge Function de suppression de compte (clé service côté serveur)
  tests/           tests de sécurité RLS exécutables (Docker)
src/
  auth/            contexte de session + garde de routes par rôle
  components/      UI partagée, mise en page, panneaux de cours
  lib/             client Supabase, types, requêtes, stockage, formatage
  pages/           pages communes, student/, instructor/, admin/
docs/ARCHITECTURE.md
```

## État du déploiement (31/10/2026)

- Projet Supabase **khoule-education** (`shgtnhypsernnsiwitqa`, région Paris) : 6 migrations appliquées,
  référentiel chargé, Edge Function `admin-delete-user` déployée. `.env.local` est déjà rempli.
- Trois comptes de test (admin, intervenant, élève) : identifiants dans `supabase/tests/comptes-de-test.local.md`
  (fichier ignoré par git). **À supprimer avant l'ouverture au public.**
- Parcours vérifié de bout en bout : validation et affectation d'un intervenant, création et publication d'un cours,
  leçon, support PDF, devoir, séance avec lien Jitsi, inscription d'un élève, dépôt de copie avec fichier,
  correction et note, question/réponse, discussion, notifications, progression.

**Sans Node.js installé**, lancer l'application avec Docker :
```bash
docker run --rm -it -p 5173:5173 -e CHOKIDAR_USEPOLLING=true -v "${PWD}:/app" -w /app node:22-alpine sh -c "npm install && npx vite --host 0.0.0.0"
```

## 3. Installation

### Prérequis
- Node.js 20+ (ou Docker)
- Un projet Supabase (gratuit : https://supabase.com) — ou la CLI Supabase pour un environnement local

### 3.1 Créer la base de données

**Option A — Tableau de bord Supabase (le plus simple)**
1. Créez un projet sur supabase.com (région la plus proche : `eu-west`).
2. *SQL Editor* → exécutez **dans l'ordre** le contenu de :
   `supabase/migrations/20261031000001_schema.sql` → `…02_functions_triggers.sql` → `…03_rls.sql` →
   `…04_storage_rpc_realtime.sql` → `…05_qa_guards.sql`, puis `supabase/seed.sql`.

**Option B — CLI Supabase**
```bash
npx supabase login
```
```bash
npx supabase link --project-ref <votre-ref>
```
```bash
npx supabase db push
```
```bash
npx supabase db execute --file supabase/seed.sql
```
(en local : `npx supabase start` puis `npx supabase db reset` applique migrations et seed.)

### 3.2 Configurer l'authentification
Dans *Authentication → URL Configuration* :
- **Site URL** : l'URL de production (ex. `https://khoule-education.vercel.app`)
- **Redirect URLs** : ajoutez `http://localhost:5173/**` et `https://<votre-domaine>/**`

Dans *Authentication → Providers → Email* : laissez « Confirm email » activé (recommandé).
Personnalisez les modèles d'e-mails en français dans *Authentication → Email Templates*.

### 3.3 Lancer le frontend
```bash
cp .env.example .env.local
```
Renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (*Project Settings → API*), puis :
```bash
npm install
```
```bash
npm run dev
```
L'application est sur http://localhost:5173.

> ⚠️ N'utilisez **jamais** la clé `service_role` dans `.env.local` ni dans le frontend.

### 3.4 Créer le premier administrateur
L'inscription publique ne crée que des élèves ou des intervenants (impossible de s'auto-déclarer admin).
1. Inscrivez-vous normalement sur la plateforme (n'importe quel profil).
2. Dans le *SQL Editor* :
```sql
update public.profiles set role = 'admin', status = 'active'
where id = (select id from auth.users where email = 'votre-email@exemple.com');
```
Ensuite, l'admin peut promouvoir d'autres administrateurs depuis *Utilisateurs → fiche → Promouvoir*.

### 3.5 Déployer l'Edge Function (suppression de comptes)
```bash
npx supabase functions deploy admin-delete-user
```
Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies
automatiquement par Supabase. Sans cette fonction, l'admin peut toujours **suspendre** un compte.

## 4. Déploiement du frontend

Le frontend est une application statique (`npm run build` → dossier `dist/`).

**Vercel** : importez le dépôt, framework « Vite », ajoutez les deux variables `VITE_SUPABASE_*`.
Ajoutez un fichier `vercel.json` pour les routes de l'application :
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
**Netlify** : build `npm run build`, publish `dist`, et un fichier `public/_redirects` contenant `/* /index.html 200`.

Pensez à ajouter l'URL de production dans les *Redirect URLs* de Supabase.

## 5. Parcours de démarrage

1. **Admin** : vérifie classes/matières (*Classes & matières*), publie une annonce de lancement.
2. **Intervenant** : s'inscrit via « Je veux enseigner », complète ses souhaits.
3. **Admin** : *Utilisateurs → Candidatures → Valider*, puis *Affectations* (ex. Maths en 3e).
4. **Intervenant** : *Mes cours → Nouveau cours*, ajoute leçons, supports, créneau « samedi 9h–11h »,
   « Générer les séances », publie le cours → les élèves de la classe sont notifiés.
5. **Élève** : s'inscrit, choisit sa classe, rejoint le cours, suit les leçons, rend ses devoirs.
6. **Intervenant** : *Corrections* → note + commentaire → l'élève est notifié.

## 6. Sécurité et protection des mineurs

- **RLS sur toutes les tables** ; la logique d'accès est dans PostgreSQL, pas dans le navigateur.
- Un élève ne voit que : ses données, les cours publiés de **sa** classe, le contenu des cours où il est inscrit,
  ses propres copies, notes et messages. Il ne peut écrire en privé qu'aux intervenants et administrateurs.
- Un intervenant ne voit que les élèves inscrits à **ses** cours et leurs travaux ; il ne crée des cours
  que pour les classes/matières que l'administration lui a affectées.
- Rôle, statut et validation de candidature ne sont modifiables que par un admin (triggers).
- Coordonnées des élèves et des tuteurs : visibles uniquement par l'élève, l'admin et ses intervenants.
  Téléphones des intervenants : admin uniquement. Consentement du tuteur horodaté.
- Fichiers dans des buckets **privés**, accès contrôlé par dossier, ouverture via URL signée de 60 s.
- Comptes suspendus : perte immédiate de tout accès (vérifié à chaque requête).

## 7. Tests

**Tests de sécurité de la base** (PostgreSQL jetable dans Docker, 12 scénarios / ~40 assertions :
inscriptions, rôles, isolation des élèves, affectations, devoirs, notes, fichiers, Q&R, messages,
annonces, suspension) :
```bash
sh supabase/tests/run.sh
```
**Vérification du frontend** :
```bash
npm run typecheck
```
```bash
npm run build
```

## 8. Évolutions possibles
- Présences aux séances (feuille d'appel) et bulletins PDF par trimestre.
- Notifications SMS / WhatsApp aux parents (Edge Function + fournisseur SMS).
- Compte parent dédié pour suivre plusieurs enfants.
- Mode hors ligne (PWA) pour les zones à faible connexion.
- Traduction de l'interface en wolof.
