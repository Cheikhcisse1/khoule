import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { must, supabase } from '../lib/supabase';
import { useLoad } from '../lib/hooks';
import { fetchCourses } from '../lib/queries';
import { Button, Card, Empty, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { CourseCard } from '../components/CourseBits';

interface Hit { kind: 'course' | 'subject' | 'instructor'; id: string; title: string; subtitle: string }

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const subjectId = params.get('matiere');
  const [input, setInput] = useState(q);

  const { data, error, loading, reload } = useLoad(async () => {
    if (subjectId) {
      const courses = (await fetchCourses()).filter((c) => String(c.subject_id) === subjectId && c.status === 'published');
      return { hits: [] as Hit[], courses };
    }
    if (q.trim().length < 2) return { hits: [] as Hit[], courses: [] };
    const hits = must(await supabase.rpc('search_catalog', { q })) as Hit[];
    const ids = hits.filter((h) => h.kind === 'course').map((h) => h.id);
    const courses = ids.length ? await fetchCourses({ ids }) : [];
    return { hits, courses };
  }, [q, subjectId]);

  const submit = (e: FormEvent) => { e.preventDefault(); setParams({ q: input }); };
  const subjects = data?.hits.filter((h) => h.kind === 'subject') ?? [];
  const instructors = data?.hits.filter((h) => h.kind === 'instructor') ?? [];

  return (
    <>
      <PageHeader title="Recherche" />
      <form className="search-big" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Cours, matière, intervenant…" autoFocus aria-label="Recherche" />
        <Button type="submit">Rechercher</Button>
      </form>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          {subjects.length > 0 && (
            <Card title="Matières">
              <div className="chips">{subjects.map((s) => (
                <button key={s.id} className="chip" onClick={() => setParams({ matiere: s.id })}>{s.title}</button>
              ))}</div>
            </Card>
          )}
          {instructors.length > 0 && (
            <Card title="Intervenants">
              <ul className="list">{instructors.map((i) => (
                <li key={i.id} className="list-row"><Link to={`/intervenants/${i.id}`}><strong>{i.title}</strong></Link><span className="muted small">{i.subtitle}</span></li>
              ))}</ul>
            </Card>
          )}
          {data && data.courses.length > 0 && (
            <>
              <h2 className="section-title">Cours</h2>
              <div className="course-grid">{data.courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
            </>
          )}
          {data && !data.courses.length && !subjects.length && !instructors.length && (q || subjectId) && (
            <Card><Empty icon="🔎" title="Aucun résultat">Essayez un autre mot-clé (ex. : « fractions », « Anglais », un nom d’intervenant).</Empty></Card>
          )}
        </>
      )}
    </>
  );
}
