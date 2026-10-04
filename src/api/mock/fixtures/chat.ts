/**
 * Canned tutor answers for the mock client, including the "nothing in the slides"
 * case, which is valid behaviour and not an error.
 */

import { ChatScope, SlideCitation } from '../../types';

const NOT_FOUND =
  'Dazu finde ich nichts in den Vorlesungsunterlagen. Die Folien zu diesem Konzept decken den Punkt nicht ab — frag gern nach einem verwandten Begriff aus dem Kapitel.';

const RECOMMENDER =
  'Auf Basis deines Lernstands sind gerade mehrere Konzepte lernbar: **Sharding**, **Quorum** und **Combiner**. Alle drei haben erfüllte Voraussetzungen — welches du zuerst nimmst, entscheidest du.\n\nZur Wiederholung stünde außerdem **Replikation** an (seit rund 25 Tagen fällig). Das hält dich aber nicht auf: das Konzept war schon einmal beherrscht und blockiert die Folgekonzepte deshalb nicht mehr.';

const GENERIC =
  'Laut den Vorlesungsfolien lässt sich das so zusammenfassen:\n\nDie Kernidee besteht darin, große Datenmengen so über mehrere Knoten zu verteilen, dass sowohl der Speicherbedarf als auch die Rechenlast horizontal skalieren. Zwei Mechanismen greifen dabei ineinander:\n\n- **Partitionierung** teilt den Datenbestand disjunkt auf. Jeder Knoten hält nur einen Ausschnitt.\n- **Replikation** legt zusätzlich Kopien an, damit der Ausfall eines Knotens nicht zu Datenverlust führt.\n\nBeides zusammen erklärt, warum in verteilten Systemen `Partitionstoleranz` praktisch nicht verhandelbar ist — und warum bei einer Netzpartition zwischen Konsistenz und Verfügbarkeit gewählt werden muss.';

/**
 * Picks a canned answer based on keywords in the prompt.
 * @param prompt: The student's last message
 * @param scope: Current chat scope
 * @returns: The answer text
 */
export function mockAnswer(prompt: string, scope: ChatScope | null): string {
  const p = prompt.toLowerCase();
  if (
    p.includes('als nächstes') ||
    p.includes('was soll ich') ||
    p.includes('bin ich bereit') ||
    p.includes('brauche ich')
  ) {
    return RECOMMENDER;
  }
  if (p.includes('kubernetes') || p.includes('börse') || p.includes('wetter')) {
    return NOT_FOUND;
  }
  const head = scope?.name ? `Zum Thema **${scope.name}**:\n\n` : '';
  return head + GENERIC;
}

const SLIDE_REVISION = 'BDT 2026';

const GENERIC_SLIDES: SlideCitation[] = [
  {
    page: 14,
    chapter: 'NoSQL-Systeme & Verteiltes Datenmanagement',
    chapter_num: 2,
    source: '02-NoSQL.pdf',
    stand: SLIDE_REVISION
  },
  {
    page: 15,
    chapter: 'NoSQL-Systeme & Verteiltes Datenmanagement',
    chapter_num: 2,
    source: '02-NoSQL.pdf',
    stand: SLIDE_REVISION
  },
  {
    page: 31,
    chapter: 'NoSQL-Systeme & Verteiltes Datenmanagement',
    chapter_num: 2,
    source: '02-NoSQL.pdf',
    stand: SLIDE_REVISION
  },
  // Without a chapter title, as in the real corpus for chapter 7.
  {
    page: 8,
    chapter: '',
    chapter_num: 7,
    source: '07-data-engineering.pdf',
    stand: SLIDE_REVISION
  }
];

/**
 * Returns the slides the canned answer would be based on. Empty for the recommender
 * answer (uses only the learner model) and the "nothing found" answer, as in the real
 * backend.
 * @param prompt: The student's last message
 * @param scope: Current chat scope
 * @returns: The slide citations
 */
export function mockSlides(
  prompt: string,
  scope: ChatScope | null
): SlideCitation[] {
  const answer = mockAnswer(prompt, scope);
  if (answer === RECOMMENDER || answer === NOT_FOUND) {
    return [];
  }
  return GENERIC_SLIDES;
}
