# -*- coding: utf-8 -*-
"""Génère « Guide SQL Supabase — Khoulé Éducation » (PDF A4)."""
import sys
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Preformatted, Spacer, Table, TableStyle,
)

from content import ERRORS, PROJECT_SQL_URL, QUERIES, TABLES

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Sans", FONT_DIR + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", FONT_DIR + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONT_DIR + "DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold", italic="Sans", boldItalic="Sans-Bold")

GREEN = colors.HexColor("#14532d")
GREEN_MID = colors.HexColor("#1f7a4d")
GREEN_LIGHT = colors.HexColor("#e3f2e8")
GOLD = colors.HexColor("#f4b942")
GOLD_LIGHT = colors.HexColor("#fdf1d6")
RED = colors.HexColor("#b42318")
RED_LIGHT = colors.HexColor("#fdecea")
INK = colors.HexColor("#1d2a22")
MUTED = colors.HexColor("#5f6d64")
CODE_BG = colors.HexColor("#f4f6f4")
LINE = colors.HexColor("#d9e0db")

W, H = A4
MARGIN = 18 * mm

S = {
    "body": ParagraphStyle("body", fontName="Sans", fontSize=9.6, leading=14, textColor=INK, spaceAfter=5),
    "small": ParagraphStyle("small", fontName="Sans", fontSize=8.4, leading=11.5, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Sans-Bold", fontSize=18, leading=22, textColor=GREEN, spaceBefore=4, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Sans-Bold", fontSize=12.5, leading=16, textColor=GREEN_MID, spaceBefore=10, spaceAfter=5),
    "qtitle": ParagraphStyle("qtitle", fontName="Sans-Bold", fontSize=10.2, leading=13.5, textColor=INK),
    "cell": ParagraphStyle("cell", fontName="Sans", fontSize=8.6, leading=11.5, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Sans-Bold", fontSize=8.6, leading=11.5, textColor=INK),
    "cellmono": ParagraphStyle("cellmono", fontName="Mono", fontSize=8.2, leading=11, textColor=GREEN),
    "code": ParagraphStyle("code", fontName="Mono", fontSize=7.9, leading=10.6, textColor=INK),
    "toc": ParagraphStyle("toc", fontName="Sans", fontSize=10.5, leading=19, textColor=INK),
}


def P(text, style="body"):
    return Paragraph(text, S[style])


def box(flowables, bg, border, pad=8):
    t = Table([[flowables]], colWidths=[W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, border),
        ("LEFTPADDING", (0, 0), (-1, -1), pad + 2), ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), pad - 2), ("BOTTOMPADDING", (0, 0), (-1, -1), pad - 2),
    ]))
    return t


def code_block(sql):
    pre = Preformatted(sql.strip("\n"), S["code"])
    t = Table([[pre]], colWidths=[W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def badge(kind):
    if kind == "modification":
        return '<font color="#b42318"><b>●  Modifie les données</b></font>'
    return '<font color="#1f7a4d"><b>●  Lecture seule (sans risque)</b></font>'


def query_block(title, expl, sql, kind):
    parts = [P(title, "qtitle"), P(badge(kind), "small")]
    if expl:
        parts.append(P(expl, "small"))
    parts += [Spacer(1, 3), code_block(sql), Spacer(1, 9)]
    return KeepTogether(parts)


def simple_table(rows, widths, header=True, mono_first=False):
    data = []
    for i, row in enumerate(rows):
        cells = []
        for j, c in enumerate(row):
            if header and i == 0:
                cells.append(Paragraph(c, ParagraphStyle("th", parent=S["cellb"], textColor=colors.white)))
            elif mono_first and j == 0:
                cells.append(Paragraph(c, S["cellmono"]))
            else:
                cells.append(Paragraph(c, S["cell"]))
        data.append(cells)
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), GREEN_MID)]
    for i in range(1 if header else 0, len(rows)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f7faf8")))
    t.setStyle(TableStyle(style))
    return t


# ---------------------------------------------------------------------------
# Mise en page : couverture + pages courantes
# ---------------------------------------------------------------------------
def draw_cover(c, _doc):
    c.saveState()
    c.setFillColor(GREEN)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#1b6b3d"))
    c.circle(W - 30 * mm, 40 * mm, 70 * mm, stroke=0, fill=1)
    # logo
    x, y, s = MARGIN, H - 60 * mm, 22 * mm
    c.setFillColor(colors.HexColor("#0f3d22"))
    c.roundRect(x, y, s, s, 4 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    p = c.beginPath()
    p.moveTo(x + s * .22, y + s * .31); p.lineTo(x + s * .22, y + s * .69); p.lineTo(x + s * .5, y + s * .56)
    p.lineTo(x + s * .78, y + s * .69); p.lineTo(x + s * .78, y + s * .31); p.lineTo(x + s * .5, y + s * .19); p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Sans-Bold", 15)
    c.drawString(x + s + 5 * mm, y + s * .55, "Khoulé")
    c.setFillColor(GOLD)
    c.drawString(x + s + 5 * mm + c.stringWidth("Khoulé ", "Sans-Bold", 15), y + s * .55, "Éducation")
    # titre
    c.setFillColor(GOLD)
    c.setFont("Sans-Bold", 11)
    c.drawString(MARGIN, H - 105 * mm, "GUIDE DE L'ADMINISTRATEUR")
    c.setFillColor(colors.white)
    c.setFont("Sans-Bold", 34)
    c.drawString(MARGIN, H - 125 * mm, "Les requêtes SQL")
    c.drawString(MARGIN, H - 140 * mm, "sous Supabase")
    c.setFont("Sans", 12.5)
    c.setFillColor(colors.HexColor("#d7e9dd"))
    for i, line in enumerate([
        "Consulter les élèves, les intervenants et les cours,",
        "suivre les statistiques et modifier les données",
        "de la plateforme en toute sécurité.",
    ]):
        c.drawString(MARGIN, H - 160 * mm - i * 7 * mm, line)
    c.setFillColor(GOLD)
    c.roundRect(MARGIN, 32 * mm, 70 * mm, 9 * mm, 2 * mm, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.setFont("Sans-Bold", 9.5)
    c.drawString(MARGIN + 4 * mm, 35 * mm, "34 requêtes prêtes à l'emploi")
    c.setFillColor(colors.HexColor("#b9d3c2"))
    c.setFont("Sans", 8.5)
    c.drawString(MARGIN, 20 * mm, f"Version du {date.today().strftime('%d/%m/%Y')} · Projet Supabase « khoule-education »")
    c.restoreState()


def draw_page(c, doc):
    c.saveState()
    c.setFillColor(GREEN)
    c.rect(0, H - 9 * mm, W, 9 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Sans-Bold", 8)
    c.drawString(MARGIN, H - 6 * mm, "Khoulé Éducation")
    c.setFont("Sans", 8)
    c.drawRightString(W - MARGIN, H - 6 * mm, "Guide des requêtes SQL sous Supabase")
    c.setFillColor(MUTED)
    c.setStrokeColor(LINE)
    c.line(MARGIN, 13 * mm, W - MARGIN, 13 * mm)
    c.drawRightString(W - MARGIN, 8.5 * mm, f"Page {doc.page}")
    c.drawString(MARGIN, 8.5 * mm, "Document interne — ne pas diffuser les données personnelles des élèves")
    c.restoreState()


# ---------------------------------------------------------------------------
# Contenu
# ---------------------------------------------------------------------------
def build(path):
    doc = BaseDocTemplate(path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=16 * mm, bottomMargin=18 * mm,
                          title="Guide des requêtes SQL sous Supabase — Khoulé Éducation",
                          author="Khoulé Éducation", subject="Administration de la plateforme")
    frame = Frame(MARGIN, 18 * mm, W - 2 * MARGIN, H - 34 * mm, id="f", leftPadding=0, rightPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[Frame(0, 0, W, H, id="c")], onPage=draw_cover),
        PageTemplate(id="page", frames=[frame], onPage=draw_page),
    ])
    st = [NextPageTemplate("page"), PageBreak()]

    # Sommaire
    st.append(P("Sommaire", "h1"))
    toc = [
        "1. Avant de commencer : à quoi sert l'éditeur SQL",
        "2. Ouvrir l'éditeur et exécuter une requête",
        "3. Les tables de la plateforme",
        "4. Les bases du SQL en 5 exemples",
        "5. Requêtes prêtes à l'emploi : utilisateurs",
        "6. Requêtes prêtes à l'emploi : statistiques",
        "7. Requêtes prêtes à l'emploi : cours et pédagogie",
        "8. Modifier des données",
        "9. Sécurité et bonnes pratiques",
        "10. Erreurs fréquentes",
        "11. Aide-mémoire des valeurs",
    ]
    for t in toc:
        st.append(P(t, "toc"))
    st.append(Spacer(1, 10))
    st.append(box([P("<b>Le site d'administration reste l'outil principal.</b> Valider un intervenant, affecter une classe, "
                     "suspendre un compte ou publier une annonce se fait plus simplement (et avec notification "
                     "automatique) depuis <b>khoule-education.vercel.app → espace Administrateur</b>. "
                     "L'éditeur SQL sert pour les <b>listes complètes</b>, les <b>exports</b>, les "
                     "<b>statistiques sur mesure</b> et les <b>corrections ponctuelles</b>.", "body")],
                  GOLD_LIGHT, GOLD))
    st.append(PageBreak())

    # 1
    st.append(P("1. Avant de commencer", "h1"))
    st.append(P("Toutes les données de Khoulé Éducation (comptes, classes, cours, devoirs, notes, messages…) sont "
                "enregistrées dans une base de données <b>PostgreSQL</b> hébergée par Supabase. Le <b>SQL Editor</b> "
                "de Supabase permet d'interroger cette base directement avec le langage <b>SQL</b>."))
    st.append(P("Deux familles de requêtes", "h2"))
    st.append(simple_table([
        ["Type", "Mots-clés", "Effet"],
        ["Lecture", "SELECT", "Affiche des données. <b>Aucun risque</b> : rien n'est modifié."],
        ["Modification", "UPDATE, INSERT, DELETE", "Change, ajoute ou supprime des données. "
         "<b>Effet immédiat et définitif</b> sur le site en ligne."],
    ], [32 * mm, 50 * mm, W - 2 * MARGIN - 82 * mm]))
    st.append(Spacer(1, 10))
    st.append(box([
        P("<b>⚠  Important : dans l'éditeur SQL, vous avez tous les droits.</b>", "body"),
        P("Les règles de sécurité du site (un élève ne voit que ses données, etc.) <b>ne s'appliquent pas</b> dans "
          "l'éditeur : vous agissez comme propriétaire de la base. Une requête UPDATE ou DELETE sans "
          "<b>WHERE</b> modifie <b>toutes les lignes</b> de la table. Relisez toujours avant de cliquer sur Run.", "body"),
    ], RED_LIGHT, RED))
    st.append(Spacer(1, 8))
    st.append(P("Les données des élèves sont des données de mineurs : n'exportez et ne partagez que ce qui est "
                "strictement nécessaire à l'accompagnement scolaire.", "small"))

    # 2
    st.append(P("2. Ouvrir l'éditeur et exécuter une requête", "h1"))
    steps = [
        ["1", "Connectez-vous sur <b>supabase.com</b> avec votre compte, puis ouvrez le projet <b>khoule-education</b>."],
        ["2", "Dans le menu de gauche, cliquez sur <b>SQL Editor</b> (icône  &gt;_ ). Lien direct : "
              f"<font color='#1f7a4d'>{PROJECT_SQL_URL}</font>"],
        ["3", "Cliquez sur <b>+ New query</b>, puis collez ou tapez votre requête dans la zone de texte."],
        ["4", "Cliquez sur <b>Run</b> (en bas à droite) ou appuyez sur <b>Ctrl + Entrée</b>."],
        ["5", "Le résultat s'affiche sous la requête, sous forme de tableau."],
    ]
    st.append(simple_table(steps, [10 * mm, W - 2 * MARGIN - 10 * mm], header=False))
    st.append(P("Astuces utiles", "h2"))
    st.append(simple_table([
        ["Besoin", "Comment faire"],
        ["Exécuter une seule requête parmi plusieurs", "Sélectionnez son texte à la souris, puis Ctrl + Entrée."],
        ["Garder une requête pour plus tard", "Bouton <b>Save</b> : elle apparaît dans la liste « Private » à gauche."],
        ["Exporter le résultat (Excel)", "Bouton <b>Export → Download CSV</b> au-dessus des résultats, "
                                          "puis ouvrir le fichier avec Excel ou Google Sheets."],
        ["Voir une table sans écrire de SQL", "Menu <b>Table Editor</b> : affichage type tableur, filtres et tri."],
        ["Mettre un commentaire", "Tout ce qui suit <b>--</b> sur une ligne est ignoré."],
        ["Message « This query has destructive operations »",
         "Supabase vous demande de confirmer une modification : relisez, puis <b>Run this query</b>."],
    ], [62 * mm, W - 2 * MARGIN - 62 * mm]))

    # 3
    st.append(PageBreak())
    st.append(P("3. Les tables de la plateforme", "h1"))
    st.append(P("Les tables de l'application se trouvent dans le schéma <b>public</b> : écrivez "
                "<font name='Mono'>public.nom_de_la_table</font>. Les e-mails sont dans <font name='Mono'>auth.users</font>."))
    st.append(simple_table([["Table", "Contenu"]] + [[a, b] for a, b in TABLES],
                           [58 * mm, W - 2 * MARGIN - 58 * mm], mono_first=True))
    st.append(Spacer(1, 6))
    st.append(P("Les tables sont reliées par des <b>identifiants</b> (colonnes id, profile_id, class_id, course_id…). "
                "Par exemple, un élève a une ligne dans <font name='Mono'>profiles</font> (son nom) et une ligne dans "
                "<font name='Mono'>students</font> (sa classe), avec le même identifiant.", "small"))

    # 4 à 7 : requêtes
    sections = [
        ("4. Les bases du SQL en 5 exemples", "bases",
         "Ces exemples suffisent à écrire la plupart des requêtes utiles. Copiez-les tels quels pour essayer."),
        ("5. Requêtes prêtes à l'emploi : utilisateurs", "utilisateurs",
         "Copiez la requête, adaptez la valeur entre apostrophes si besoin (code de classe, e-mail…), puis Run."),
        ("6. Requêtes prêtes à l'emploi : statistiques", "statistiques",
         "Pratique pour les bilans : le résultat s'exporte en CSV pour un rapport ou une réunion."),
        ("7. Requêtes prêtes à l'emploi : cours et pédagogie", "pedagogie", ""),
    ]
    for title, key, intro in sections:
        st.append(PageBreak())
        st.append(P(title, "h1"))
        if intro:
            st.append(P(intro))
        for q in QUERIES[key]:
            st.append(query_block(*q))

    # 8
    st.append(PageBreak())
    st.append(P("8. Modifier des données", "h1"))
    st.append(box([
        P("<b>Avant toute modification :</b>", "body"),
        P("1)  Lancez d'abord un <b>SELECT</b> avec le même WHERE pour voir les lignes concernées.<br/>"
          "2)  Remplacez les exemples (<font name='Mono'>intervenant@exemple.com</font>, titres…) par les vraies valeurs.<br/>"
          "3)  En cas de doute, utilisez une <b>transaction</b> (section 9) pour tester sans rien enregistrer.<br/>"
          "4)  Préférez le site quand c'est possible : il envoie aussi les <b>notifications</b> aux personnes concernées.",
          "body"),
    ], RED_LIGHT, RED))
    st.append(Spacer(1, 8))
    for q in QUERIES["modifications"]:
        st.append(query_block(*q))

    # 9
    st.append(PageBreak())
    st.append(P("9. Sécurité et bonnes pratiques", "h1"))
    for q in QUERIES["securite"]:
        st.append(query_block(*q))
    st.append(P("Les règles d'or", "h2"))
    rules = [
        ["✔", "Toujours un <b>WHERE</b> dans un UPDATE ou un DELETE."],
        ["✔", "Un <b>SELECT</b> avec le même WHERE avant de modifier, pour vérifier le nombre de lignes."],
        ["✔", "Exporter (CSV) les données importantes avant une grosse modification."],
        ["✘", "Ne jamais modifier ni supprimer directement dans <font name='Mono'>auth.users</font> : utilisez "
              "Authentication → Users, ou le bouton de suppression du site (qui supprime aussi les fichiers)."],
        ["✘", "Ne jamais désactiver la sécurité d'une table (« Disable RLS ») : les données des élèves deviendraient lisibles par tous."],
        ["✘", "Ne jamais copier la clé <b>service_role</b> (Project Settings → API) dans un message, un fichier partagé ou le site."],
        ["✘", "Ne pas modifier la structure des tables (ALTER, DROP) : l'application en dépend."],
    ]
    st.append(simple_table(rules, [10 * mm, W - 2 * MARGIN - 10 * mm], header=False))
    st.append(Spacer(1, 6))
    st.append(P("Sauvegardes : le plan gratuit de Supabase ne permet pas de revenir en arrière après une erreur. "
                "Pour les données importantes, gardez des exports CSV réguliers (requêtes des sections 5 à 7).", "small"))

    # 10
    st.append(PageBreak())
    st.append(P("10. Erreurs fréquentes", "h1"))
    st.append(P("Si une requête échoue, Supabase affiche un message en anglais en bas de l'éditeur. "
                "Voici les plus courants et comment les corriger."))
    st.append(simple_table([["Message affiché", "Signification et solution"]] + [[a, b] for a, b in ERRORS],
                           [62 * mm, W - 2 * MARGIN - 62 * mm], mono_first=True))

    # 11
    st.append(PageBreak())
    st.append(P("11. Aide-mémoire des valeurs", "h1"))
    st.append(P("Les colonnes ci-dessous n'acceptent que ces valeurs exactes (en minuscules, entre apostrophes)."))
    st.append(simple_table([
        ["Colonne", "Valeurs possibles"],
        ["profiles.role", "'student' (élève) · 'instructor' (intervenant) · 'admin' (administrateur)"],
        ["profiles.status", "'active' (actif) · 'pending' (en attente) · 'suspended' (suspendu)"],
        ["instructors.application_status", "'pending' (en attente) · 'approved' (validée) · 'rejected' (refusée)"],
        ["instructors.instructor_type", "'enseignant' · 'professeur' · 'etudiant' · 'autre'"],
        ["courses.status", "'draft' (brouillon) · 'published' (publié) · 'archived' (archivé)"],
        ["course_sessions.status", "'scheduled' (programmée) · 'done' (terminée) · 'cancelled' (annulée)"],
        ["enrollments.status", "'active' (inscrit) · 'dropped' (a quitté le cours)"],
        ["submissions.status", "'submitted' (à corriger) · 'corrected' (corrigée)"],
        ["questions.status", "'open' (en attente) · 'answered' (répondue) · 'closed' (fermée)"],
        ["announcements.audience", "'all' · 'students' · 'instructors' · 'class' (avec class_id)"],
        ["library_documents.kind", "'annale' · 'corrige' · 'cours' · 'exercices' · 'fiche' · 'autre'"],
        ["*.day_of_week", "0 dimanche · 1 lundi · 2 mardi · 3 mercredi · 4 jeudi · 5 vendredi · 6 samedi"],
        ["classes.code", "CI · CP · CE1 · CE2 · CM1 · CM2 · 6E · 5E · 4E · 3E · 2ND · 1RE · TLE"],
    ], [58 * mm, W - 2 * MARGIN - 58 * mm], mono_first=True))
    st.append(Spacer(1, 10))
    st.append(P("Mémo des mots-clés", "h2"))
    st.append(simple_table([
        ["Mot-clé", "Rôle", "Exemple"],
        ["SELECT … FROM", "Lire des colonnes d'une table", "select title from public.courses"],
        ["WHERE", "Filtrer les lignes", "where status = 'published'"],
        ["ORDER BY", "Trier (desc = décroissant)", "order by created_at desc"],
        ["LIMIT", "Limiter le nombre de lignes", "limit 50"],
        ["JOIN … ON", "Relier deux tables", "join public.classes c on c.id = s.class_id"],
        ["COUNT / GROUP BY", "Compter par groupe", "select role, count(*) … group by role"],
        ["ILIKE '%…%'", "Rechercher un texte", "where last_name ilike '%diop%'"],
        ["UPDATE … SET", "Modifier des lignes", "update … set status = 'active' where …"],
        ["INSERT INTO", "Ajouter une ligne", "insert into … (col) values ('…')"],
        ["BEGIN / ROLLBACK", "Tester puis annuler", "begin; … rollback;"],
    ], [36 * mm, 50 * mm, W - 2 * MARGIN - 86 * mm]))

    doc.build(st)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "guide.pdf")
    print("PDF généré")
