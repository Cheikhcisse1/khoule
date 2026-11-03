import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

const LEVELS = [
  { cycle: 'Élémentaire', classes: 'CI · CP · CE1 · CE2 · CM1 · CM2', icon: '✏️' },
  { cycle: 'Collège', classes: '6e · 5e · 4e · 3e', icon: '📐' },
  { cycle: 'Lycée', classes: 'Seconde · Première · Terminale', icon: '🎓' },
  { cycle: 'Supérieur (LMD)', classes: 'Licence 1 → Master 2 · cours, TD et TP', icon: '🏛️' },
];

const STEPS = [
  { n: '1', title: 'Je crée mon compte', text: 'L’élève indique sa classe ; le parent ou tuteur donne son accord.' },
  { n: '2', title: 'Je rejoins mes cours', text: 'Les cours de ma classe apparaissent : je m’inscris en un clic.' },
  { n: '3', title: 'J’apprends chaque semaine', text: 'Des séances tout au long de la semaine, en salle ou en ligne, selon les disponibilités des intervenants.' },
  { n: '4', title: 'Je progresse', text: 'Exercices, devoirs corrigés, notes et questions aux intervenants.' },
];

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav>
          <Link to="/connexion" className="btn btn-ghost">Se connecter</Link>
          <Link to="/inscription" className="btn btn-primary">Créer un compte</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Soutien scolaire communautaire · Khoulé, Sénégal</p>
          <h1>Ensemble, faisons réussir <span>nos enfants et notre jeunesse</span>.</h1>
          <p className="hero-lead">
            Tout au long de la semaine, des enseignants, professeurs et étudiants originaires de Khoulé
            accompagnent les élèves de la CI à la Terminale et les étudiants jusqu’au Master — en salle comme en ligne.
          </p>
          <div className="hero-cta">
            <Link to="/inscription?profil=eleve" className="btn btn-primary btn-lg">Je suis élève</Link>
            <Link to="/inscription?profil=etudiant" className="btn btn-primary btn-lg">Je suis étudiant</Link>
            <Link to="/inscription?profil=intervenant" className="btn btn-ghost btn-lg">Je veux enseigner</Link>
          </div>
        </div>
        <div className="hero-card" aria-hidden>
          <div className="hero-slot"><span>Mardi</span><strong>17:30 — Mathématiques 3e</strong><small>Salle 2 · M. Diop</small></div>
          <div className="hero-slot"><span>Jeudi</span><strong>18:00 — Français CM2</strong><small>En ligne · Mme Sow</small></div>
          <div className="hero-slot"><span>Samedi</span><strong>10:00 — Physique-Chimie Tle</strong><small>Salle 1 · M. Ndiaye</small></div>
          <div className="hero-badge">📝 Devoir corrigé : 16/20</div>
        </div>
      </section>

      <section className="landing-section">
        <h2>De la CI au Master</h2>
        <div className="levels">
          {LEVELS.map((l) => (
            <div key={l.cycle} className="level">
              <span className="level-icon" aria-hidden>{l.icon}</span>
              <h3>{l.cycle}</h3>
              <p>{l.classes}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section alt">
        <h2>Comment ça marche ?</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <div className="callout">
          <div>
            <h2>Vous êtes ressortissant de Khoulé ?</h2>
            <p>
              Enseignant, professeur, étudiant ou professionnel : donnez quelques heures par semaine, quand vous êtes disponible.
              Proposez votre candidature, l’équipe vous affecte aux classes et matières qui vous correspondent.
            </p>
          </div>
          <Link to="/inscription?profil=intervenant" className="btn btn-primary btn-lg">Devenir intervenant</Link>
        </div>
      </section>

      <footer className="landing-foot">
        <Logo />
        <p>Plateforme éducative communautaire · Données des élèves protégées et réservées à l’accompagnement scolaire.</p>
      </footer>
    </div>
  );
}
