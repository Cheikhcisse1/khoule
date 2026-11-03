// Edge Function : assistant IA gratuit (Groq, secours Gemini) pour Khoulé Éducation.
//  - mode "tutor"      : « Coup de pouce » pour l'élève (guide sans donner la réponse)
//  - mode "instructor" : assistant pédagogique de l'intervenant
//  - mode "correct"    : pré-correction Stylo Rouge d'une copie rendue (l'intervenant valide)
// Les clés (GROQ_API_KEY, GEMINI_API_KEY facultative, service_role) restent côté serveur.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ALLOWED = ['https://khoule-education.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const TEXT_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';
const VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b';
const LIMIT_STUDENT = Number(Deno.env.get('AI_LIMIT_STUDENT') || 30);
const LIMIT_STAFF = Number(Deno.env.get('AI_LIMIT_STAFF') || 100);
const MAX_INPUT = 2000;

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type Img = { mime: string; b64: string };
class Fail extends Error { constructor(public code: string, public status = 400) { super(code); } }

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const STYLE_MATHS = 'Écris les maths sans LaTeX ni symbole $ : utilise ×, ÷, √, ², fractions a/b.';

function tutorPrompt(ctx: string): string {
  return `Tu es « Coup de pouce », l'assistant de soutien scolaire de Khoulé Éducation (Sénégal, programmes sénégalais de la CI à la Terminale). Tu aides un élève qui est bloqué.
${ctx}
Règles impératives :
- Ne donne JAMAIS directement la réponse finale d'un exercice ou d'un devoir. Guide pas à pas : fais reformuler, rappelle la notion de cours utile, donne UN indice à la fois, pose une question qui fait avancer.
- Si l'élève a déjà essayé plusieurs fois et reste bloqué, montre la méthode sur un exemple semblable (avec d'autres nombres ou un autre texte), jamais sur l'exercice noté lui-même.
- Vérifie ce que l'élève propose : dis ce qui est juste, explique l'erreur sans la corriger à sa place.
- Phrases courtes et simples, adaptées à son âge, ton chaleureux et encourageant. Réponds en français simple (l'élève peut écrire en wolof : comprends-le et réponds en français simple).
- 10 lignes maximum, texte simple sans Markdown. ${STYLE_MATHS}
- Uniquement le travail scolaire : refuse poliment le reste et ramène vers les cours.
- Ne demande et ne répète jamais d'informations personnelles (nom complet, téléphone, adresse, école).
- Si l'élève parle de détresse, de harcèlement, de violence ou de danger : réponds avec bienveillance, et invite-le à en parler tout de suite à un parent, à un adulte de confiance ou à son intervenant.
- Si la question dépasse ce que tu peux expliquer, propose-lui de poser la question à son intervenant (bouton « Demander à mon intervenant »).`;
}

function instructorPrompt(ctx: string): string {
  return `Tu es l'assistant pédagogique des intervenants (enseignants, étudiants, bénévoles) de Khoulé Éducation, plateforme de soutien scolaire au Sénégal (programmes sénégalais, CI → Terminale).
${ctx}
Tu aides à : préparer une séance, expliquer une notion autrement, créer des exercices progressifs AVEC leur corrigé et un barème, répondre aux questions des élèves, adapter un contenu à un élève en difficulté.
Réponds en français, de façon structurée et concise (titres courts, listes avec « - »), sans Markdown lourd (pas de tableaux). ${STYLE_MATHS}
Si une information sur le programme officiel est incertaine, dis-le.`;
}

function correctPrompt(p: { level: string; subject: string; title: string; instructions: string; max: number; content: string; hasImages: boolean }): string {
  return `Tu es Stylo Rouge, correcteur expert et bienveillant. Tu pré-corriges la copie d'un élève de ${p.level} (Sénégal) en ${p.subject}. Un intervenant relira et validera ta proposition.
Devoir : ${p.title}
Consignes / sujet :
"""${p.instructions}"""
Copie de l'élève${p.hasImages ? ' (texte ci-dessous et/ou photos jointes)' : ''} :
"""${p.content || '(pas de texte, voir les photos)'}"""
Barème : note sur ${p.max}.
Corrige question par question. Sois juste : accorde des points partiels pour une démarche correcte. Si une partie est illisible ou absente, dis-le.
Réponds UNIQUEMENT avec un objet JSON :
{"note": nombre entre 0 et ${p.max} (pas de 0,25), "appreciation": "2 à 3 phrases à l'élève, encourageantes et précises",
 "details": [{"question": "Q1", "statut": "juste|partiel|faux|absent", "points": "x/y", "commentaire": "ce qui est juste ou faux, et la correction attendue"}],
 "points_forts": ["…"], "a_retravailler": ["…"], "confiance": "haute|moyenne|faible"}
${STYLE_MATHS}`;
}

async function callGroq(messages: Msg[], images: Img[], json: boolean): Promise<string> {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Fail('no_server_key', 500);
  const vision = images.length > 0;
  const msgs = vision
    ? messages.map((m, i) => i === messages.length - 1
      ? { role: m.role, content: [{ type: 'text', text: m.content }, ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.b64}` } }))] }
      : m)
    : messages;
  const payload: Record<string, unknown> = {
    model: vision ? VISION_MODEL : TEXT_MODEL, messages: msgs,
    temperature: json ? 0.2 : 0.5, max_completion_tokens: json ? 8000 : 2500,
  };
  if (!vision) payload.reasoning_effort = 'low';
  if (json) payload.response_format = { type: 'json_object' };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('groq', r.status, JSON.stringify(data).slice(0, 400));
    throw new Fail(r.status === 429 ? 'rate_limited' : 'upstream_error', r.status === 429 ? 429 : 502);
  }
  return String(data?.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Secours gratuit si Groq est saturé (facultatif : secret GEMINI_API_KEY)
async function callGemini(messages: Msg[], images: Img[], json: boolean): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Fail('rate_limited', 429);
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages.filter((m) => m.role !== 'system').map((m, i, arr) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }, ...(i === arr.length - 1 ? images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.b64 } })) : [])],
  }));
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents,
      generationConfig: { temperature: json ? 0.2 : 0.5, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('gemini', r.status, JSON.stringify(data).slice(0, 300)); throw new Fail(r.status === 429 ? 'rate_limited' : 'upstream_error', r.status === 429 ? 429 : 502); }
  return (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();
}

async function complete(messages: Msg[], images: Img[] = [], json = false): Promise<string> {
  let text = '';
  try { text = await callGroq(messages, images, json); }
  catch (e) {
    if (!(e instanceof Fail) || !['rate_limited', 'upstream_error'].includes(e.code)) throw e;
    text = await callGemini(messages, images, json);
  }
  if (!text) throw new Fail('empty_completion', 502);
  return text;
}

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return reply({ code: 'method' }, 405);

  // Si l'IA échoue après la réservation du quota, l'appel est rendu à l'utilisateur.
  let refund: (() => Promise<unknown>) | null = null;
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    // Client « appelant » : toutes les lectures passent par la RLS de l'utilisateur
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: me } = await caller.auth.getUser();
    if (!me?.user) throw new Fail('login_required', 401);
    const { data: prof } = await caller.from('profiles').select('role,status').eq('id', me.user.id).single();
    if (!prof || prof.status !== 'active') throw new Fail('forbidden', 403);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => null) as { mode?: string; message?: string; course_id?: string; assignment_id?: string; submission_id?: string } | null;
    if (!body) throw new Fail('bad_request');
    const mode = body.mode;
    const staff = prof.role === 'instructor' || prof.role === 'admin';
    if (mode === 'tutor' && prof.role !== 'student' && prof.role !== 'admin') throw new Fail('forbidden', 403);
    if ((mode === 'instructor' || mode === 'correct') && !staff) throw new Fail('forbidden', 403);
    if (!['tutor', 'instructor', 'correct'].includes(mode ?? '')) throw new Fail('bad_request');

    // ---------- Pré-correction Stylo Rouge ----------
    if (mode === 'correct') {
      if (typeof body.submission_id !== 'string') throw new Fail('bad_request');
      const { data: s } = await caller.from('submissions')
        .select('content, file_paths, assignment:assignments(exercise:exercises(title,instructions,max_score), course:courses(instructor_id, class:classes(name), subject:subjects(name)))')
        .eq('id', body.submission_id).single();
      // deno-lint-ignore no-explicit-any
      const a = (s as any)?.assignment;
      if (!s || !a) throw new Fail('not_found', 404);
      if (prof.role !== 'admin' && a.course.instructor_id !== me.user.id) throw new Fail('forbidden', 403);
      const left = await consume(admin, me.user.id, LIMIT_STAFF);
      refund = async () => { await admin.rpc('ai_refund', { p_user: me.user.id }); };
      const images: Img[] = [];
      for (const p of (s.file_paths as string[]).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).slice(0, 3)) {
        const { data: blob } = await caller.storage.from('submissions').download(p);
        if (!blob || blob.size > 3_500_000) continue;
        images.push({ mime: /png$/i.test(p) ? 'image/png' : /webp$/i.test(p) ? 'image/webp' : 'image/jpeg', b64: toB64(await blob.arrayBuffer()) });
      }
      const skipped = (s.file_paths as string[]).length - images.length;
      if (!s.content && !images.length) throw new Fail('no_readable_content', 422);
      const raw = await complete([{ role: 'user', content: correctPrompt({
        level: a.course.class?.name ?? '', subject: a.course.subject?.name ?? '', title: a.exercise.title,
        instructions: a.exercise.instructions, max: Number(a.exercise.max_score), content: s.content ?? '', hasImages: images.length > 0,
      }) }], images, true);
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Fail('bad_json', 502);
      const result = JSON.parse(m[0]);
      refund = null;
      return reply({ result, skipped_files: skipped, remaining: left });
    }

    // ---------- Discussions (élève ou intervenant) ----------
    const message = String(body.message ?? '').trim();
    if (!message) throw new Fail('bad_request');
    if (message.length > MAX_INPUT) throw new Fail('message_too_long');
    let ctx = '';
    let thread = 'general';
    if (typeof body.assignment_id === 'string') {
      const { data: as } = await caller.from('assignments')
        .select('id, exercise:exercises(title,instructions), course:courses(title, class:classes(name), subject:subjects(name))')
        .eq('id', body.assignment_id).single();
      // deno-lint-ignore no-explicit-any
      const x = as as any;
      if (x) {
        thread = `assignment:${x.id}`;
        ctx = `Contexte : classe ${x.course.class?.name}, matière ${x.course.subject?.name}, cours « ${x.course.title} ». Devoir en cours « ${x.exercise.title} » dont la consigne est :\n"""${String(x.exercise.instructions).slice(0, 4000)}"""`;
      }
    } else if (typeof body.course_id === 'string') {
      const { data: c } = await caller.from('courses')
        .select('id, title, description, class:classes(name), subject:subjects(name)').eq('id', body.course_id).single();
      // deno-lint-ignore no-explicit-any
      const x = c as any;
      if (x) {
        thread = `course:${x.id}`;
        ctx = `Contexte : classe ${x.class?.name}, matière ${x.subject?.name}, cours « ${x.title} »${x.description ? ` (${String(x.description).slice(0, 600)})` : ''}.`;
      }
    } else if (prof.role === 'student') {
      const { data: st } = await caller.from('students').select('class:classes(name)').eq('profile_id', me.user.id).maybeSingle();
      // deno-lint-ignore no-explicit-any
      const cls = (st as any)?.class?.name;
      if (cls) ctx = `L'élève est en classe de ${cls}.`;
    }

    const left = await consume(admin, me.user.id, prof.role === 'student' ? LIMIT_STUDENT : LIMIT_STAFF);
    refund = async () => { await admin.rpc('ai_refund', { p_user: me.user.id }); };
    const chatMode = mode as 'tutor' | 'instructor';
    const { data: hist } = await admin.from('ai_messages').select('role,content')
      .eq('user_id', me.user.id).eq('mode', chatMode).eq('thread', thread)
      .order('created_at', { ascending: false }).limit(12);
    const messages: Msg[] = [
      { role: 'system', content: chatMode === 'tutor' ? tutorPrompt(ctx) : instructorPrompt(ctx) },
      ...((hist ?? []).reverse() as Msg[]),
      { role: 'user', content: message },
    ];
    const answer = await complete(messages);
    refund = null;
    await admin.from('ai_messages').insert([
      { user_id: me.user.id, mode: chatMode, thread, role: 'user', content: message },
      { user_id: me.user.id, mode: chatMode, thread, role: 'assistant', content: answer.slice(0, 20000) },
    ]);
    return reply({ answer, thread, remaining: left });
  } catch (e) {
    if (refund) await refund().catch(() => {});
    if (e instanceof Fail) return reply({ code: e.code }, e.status);
    console.error(e);
    return reply({ code: 'server_error' }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function consume(admin: any, user: string, limit: number): Promise<number> {
  const { data, error } = await admin.rpc('ai_consume', { p_user: user, p_limit: limit });
  if (error) { console.error('quota', error.message); throw new Fail('server_error', 500); }
  if (data < 0) throw new Fail('quota_reached', 429);
  return data;
}
