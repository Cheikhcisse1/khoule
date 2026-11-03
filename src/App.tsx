import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole';
import { homeFor, useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { FullPageSpinner } from './components/ui';
import { Landing } from './pages/Landing';
import { MfaChallenge } from './components/Mfa';
import { isConfigured } from './lib/supabase';
import { SetupNotice } from './pages/SetupNotice';

// Chaque page est chargée à la demande : le premier affichage reste léger sur une connexion 3G
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/PasswordPages').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/PasswordPages').then((m) => ({ default: m.ResetPassword })));
const Suspended = lazy(() => import('./pages/Suspended').then((m) => ({ default: m.Suspended })));
const Application = lazy(() => import('./pages/instructor/Application').then((m) => ({ default: m.Application })));
const PendingStudent = lazy(() => import('./pages/student/PendingStudent').then((m) => ({ default: m.PendingStudent })));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard })));
const StudentCourses = lazy(() => import('./pages/student/StudentCourses').then((m) => ({ default: m.StudentCourses })));
const StudentAssignments = lazy(() => import('./pages/student/StudentAssignments').then((m) => ({ default: m.StudentAssignments })));
const StudentGrades = lazy(() => import('./pages/student/StudentGrades').then((m) => ({ default: m.StudentGrades })));
const InstructorDashboard = lazy(() => import('./pages/instructor/InstructorDashboard').then((m) => ({ default: m.InstructorDashboard })));
const InstructorCourses = lazy(() => import('./pages/instructor/InstructorCourses').then((m) => ({ default: m.InstructorCourses })));
const Corrections = lazy(() => import('./pages/instructor/Corrections').then((m) => ({ default: m.Corrections })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminReferential = lazy(() => import('./pages/admin/AdminReferential').then((m) => ({ default: m.AdminReferential })));
const AdminAssignments = lazy(() => import('./pages/admin/AdminAssignments').then((m) => ({ default: m.AdminAssignments })));
const AdminCourses = lazy(() => import('./pages/admin/AdminCourses').then((m) => ({ default: m.AdminCourses })));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements').then((m) => ({ default: m.AdminAnnouncements })));
const AdminModeration = lazy(() => import('./pages/admin/AdminModeration').then((m) => ({ default: m.AdminModeration })));
const CoursePage = lazy(() => import('./pages/CoursePage').then((m) => ({ default: m.CoursePage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage').then((m) => ({ default: m.QuestionsPage })));
const QuestionDetail = lazy(() => import('./pages/QuestionDetail').then((m) => ({ default: m.QuestionDetail })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const InstructorPublicPage = lazy(() => import('./pages/InstructorPublicPage').then((m) => ({ default: m.InstructorPublicPage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const AssistantPage = lazy(() => import('./pages/AssistantPage').then((m) => ({ default: m.AssistantPage })));
const SchoolSpace = lazy(() => import('./pages/SchoolSpace').then((m) => ({ default: m.SchoolSpace })));
const AdminSchools = lazy(() => import('./pages/admin/AdminSchools').then((m) => ({ default: m.AdminSchools })));
const InstructorRoll = lazy(() => import('./pages/instructor/VieClasse').then((m) => ({ default: m.InstructorRoll })));
const InstructorPlanning = lazy(() => import('./pages/instructor/VieClasse').then((m) => ({ default: m.InstructorPlanning })));

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (session && profile) return <Navigate to={homeFor(profile)} replace />;
  return <Landing />;
}

export default function App() {
  const { session, mfaRequired } = useAuth();
  if (!isConfigured) return <SetupNotice />;
  // Vérification en deux étapes activée : le code est demandé avant tout accès
  if (session && mfaRequired) return <MfaChallenge />;

  return (
    <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/inscription" element={<Register />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
      <Route path="/nouveau-mot-de-passe" element={<ResetPassword />} />
      <Route path="/compte-suspendu" element={<Suspended />} />
      <Route path="/en-attente" element={
        <RequireRole roles={['student']} allowPending><PendingStudent /></RequireRole>
      } />
      <Route path="/candidature" element={
        <RequireRole roles={['instructor']} allowPending><Application /></RequireRole>
      } />

      <Route element={<RequireRole><Layout /></RequireRole>}>
        {/* Élève */}
        <Route path="/eleve" element={<RequireRole roles={['student']}><StudentDashboard /></RequireRole>} />
        <Route path="/eleve/cours" element={<RequireRole roles={['student']}><StudentCourses /></RequireRole>} />
        <Route path="/eleve/devoirs" element={<RequireRole roles={['student']}><StudentAssignments /></RequireRole>} />
        <Route path="/eleve/notes" element={<RequireRole roles={['student']}><StudentGrades /></RequireRole>} />

        {/* Intervenant */}
        <Route path="/intervenant" element={<RequireRole roles={['instructor']}><InstructorDashboard /></RequireRole>} />
        <Route path="/intervenant/cours" element={<RequireRole roles={['instructor']}><InstructorCourses /></RequireRole>} />
        <Route path="/intervenant/appel" element={<RequireRole roles={['instructor']}><InstructorRoll /></RequireRole>} />
        <Route path="/intervenant/planning" element={<RequireRole roles={['instructor']}><InstructorPlanning /></RequireRole>} />
        <Route path="/intervenant/corrections" element={<RequireRole roles={['instructor', 'admin']}><Corrections /></RequireRole>} />

        {/* Administration */}
        <Route path="/admin" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
        <Route path="/admin/utilisateurs" element={<RequireRole roles={['admin']}><AdminUsers /></RequireRole>} />
        <Route path="/admin/referentiel" element={<RequireRole roles={['admin']}><AdminReferential /></RequireRole>} />
        <Route path="/admin/affectations" element={<RequireRole roles={['admin']}><AdminAssignments /></RequireRole>} />
        <Route path="/admin/cours" element={<RequireRole roles={['admin']}><AdminCourses /></RequireRole>} />
        <Route path="/admin/annonces" element={<RequireRole roles={['admin']}><AdminAnnouncements /></RequireRole>} />
        <Route path="/admin/moderation" element={<RequireRole roles={['admin']}><AdminModeration /></RequireRole>} />

        {/* Commun */}
        <Route path="/cours/:id" element={<CoursePage />} />
        <Route path="/calendrier" element={<CalendarPage />} />
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/questions/:id" element={<QuestionDetail />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/annonces" element={<AnnouncementsPage />} />
        <Route path="/documents" element={<LibraryPage />} />
        <Route path="/ecole" element={<SchoolSpace />} />
        <Route path="/admin/ecoles" element={<RequireRole roles={['admin']}><AdminSchools /></RequireRole>} />
        <Route path="/assistant" element={<RequireRole roles={['student', 'instructor', 'admin']}><AssistantPage /></RequireRole>} />
        <Route path="/recherche" element={<SearchPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/intervenants/:id" element={<InstructorPublicPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
