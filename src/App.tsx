import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole';
import { homeFor, useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { FullPageSpinner } from './components/ui';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword, ResetPassword } from './pages/PasswordPages';
import { Suspended } from './pages/Suspended';
import { Application } from './pages/instructor/Application';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentCourses } from './pages/student/StudentCourses';
import { StudentAssignments } from './pages/student/StudentAssignments';
import { StudentGrades } from './pages/student/StudentGrades';
import { InstructorDashboard } from './pages/instructor/InstructorDashboard';
import { InstructorCourses } from './pages/instructor/InstructorCourses';
import { Corrections } from './pages/instructor/Corrections';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminReferential } from './pages/admin/AdminReferential';
import { AdminAssignments } from './pages/admin/AdminAssignments';
import { AdminCourses } from './pages/admin/AdminCourses';
import { AdminAnnouncements } from './pages/admin/AdminAnnouncements';
import { AdminModeration } from './pages/admin/AdminModeration';
import { CoursePage } from './pages/CoursePage';
import { CalendarPage } from './pages/CalendarPage';
import { QuestionsPage } from './pages/QuestionsPage';
import { QuestionDetail } from './pages/QuestionDetail';
import { MessagesPage } from './pages/MessagesPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { SearchPage } from './pages/SearchPage';
import { ProfilePage } from './pages/ProfilePage';
import { InstructorPublicPage } from './pages/InstructorPublicPage';
import { LibraryPage } from './pages/LibraryPage';
import { isConfigured } from './lib/supabase';
import { SetupNotice } from './pages/SetupNotice';

function Home() {
  const { session, profile, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (session && profile) return <Navigate to={homeFor(profile)} replace />;
  return <Landing />;
}

export default function App() {
  if (!isConfigured) return <SetupNotice />;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/inscription" element={<Register />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
      <Route path="/nouveau-mot-de-passe" element={<ResetPassword />} />
      <Route path="/compte-suspendu" element={<Suspended />} />
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
        <Route path="/recherche" element={<SearchPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/intervenants/:id" element={<InstructorPublicPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
