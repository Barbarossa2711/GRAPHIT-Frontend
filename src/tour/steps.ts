/**
 * Content of the guided tour, kept separate from the overlay that draws it.
 *
 * Each step points at an existing region by its CSS class; the tour adds no markup to
 * the interface. `selector` is optional: a step whose target is missing (e.g. the chat
 * before it was opened) still shows its text, centred.
 */

import { MainTab } from '../state/types';

/**
 * Something the tour does to the interface so the student sees a filled-in example.
 * Every demonstration is undone again (see `useDemonstration` in the overlay):
 *
 *  - `sidebar`        reveals the GRAPHIT sidebar.
 *  - `legend`         opens the colour legend under the progress bar.
 *  - `recommendation` opens the collapsed "Lernpfad-Empfehlung" list.
 *  - `tree`           expands the tree down to the first concept.
 *  - `concept`        selects that concept, so the detail panel has content.
 *  - `mastery`        scrolls the concept's mastery block into view.
 *  - `chat`           opens the chat on that concept, unless it is already open.
 *
 * `sidebar`, `legend` and `chat` are undone when their step is left; `tree` and
 * `concept` last until the tour ends, because later steps refer to the detail panel.
 */
export type Demonstration =
  | 'sidebar'
  | 'legend'
  | 'recommendation'
  | 'tree'
  | 'concept'
  | 'mastery'
  | 'chat';

export interface TourStep {
  /** Stable key for React lists and the progress dots. */
  id: string;
  /** Card headline. */
  title: string;
  /** Explanation, one paragraph per entry. */
  body: string[];
  /** Region to highlight; omitted for steps about the system as a whole. */
  selector?: string;
  /** Tab to switch to before the step is shown. */
  tab?: MainTab;
  /** Demonstration to perform when the step is reached. */
  demo?: Demonstration;
  /** Let the mouse wheel scroll the highlighted region (for tall tabs). */
  scrollbar?: boolean;
  /** Extra pixels around the highlighted region. */
  padding?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Willkommen bei GRAPHIT',
    body: [
      'GRAPHIT steht für Graph-Based Intelligent Tutoring System: ein Tutor für die Vorlesung Big Data Technologien, der die Vorlesung als Wissensgraph kennt. Er erklärt dir Konzepte auf Grundlage der Vorlesungsfolien, prüft dein Verständnis mit Quizzen und schlägt vor, was als Nächstes sinnvoll ist.',
      'Diese kurze Einführung zeigt dir der Reihe nach, wofür jeder Bereich da ist. Du kannst sie jederzeit mit Escape beenden und später in der Anleitung neu starten.'
    ]
  },
  {
    id: 'sidebar',
    title: 'Die Seitenleiste',
    body: [
      'Hier steht dein Lernstand in Kurzform: wie viele Konzepte du beherrschst, wie viele gerade zur Wiederholung anstehen und an welchen Tagen du gearbeitet hast.',
      'Sie bleibt sichtbar, während du in einem Notebook arbeitest. Du musst den Tutor also nicht geöffnet lassen, um deinen Stand im Blick zu behalten.'
    ],
    selector: '.jp-graphit-sidebar',
    demo: 'sidebar'
  },
  {
    id: 'areas',
    title: 'Die Arbeitsbereiche',
    body: [
      'Über diese Reiter wechselst du zwischen den Bereichen: Konzepte zum Lernen, Statistik für den Überblick, Wiederholung für Fälliges und Anleitung zum Nachlesen.',
      'Rechts außen lädst du deinen Lernstand neu.'
    ],
    selector: '.jp-graphit-main .graphit-tabs',
    tab: 'concepts'
  },
  {
    id: 'progress',
    title: 'Dein Gesamtfortschritt',
    body: [
      'Der Balken zeigt, wie viel der Vorlesung du bereits beherrschst. Die Farben stehen für die Status der einzelnen Konzepte, von unberührt bis beherrscht.',
      'Was die einzelnen Farben bedeuten, kannst du über die Legende darunter aufklappen.'
    ],
    selector: '.graphit-overview',
    tab: 'concepts',
    demo: 'legend'
  },
  {
    id: 'recommendation',
    title: 'Was als Nächstes dran ist',
    body: [
      'Wenn du nicht weißt, wo du anfangen sollst, ist das hier die Antwort. GRAPHIT schlägt Konzepte vor, deren Voraussetzungen du bereits erfüllst, und begründet jeden Vorschlag kurz.',
      'Ein Klick auf einen Vorschlag springt direkt zu diesem Konzept.'
    ],
    selector: '.graphit-next',
    tab: 'concepts',
    demo: 'recommendation'
  },
  {
    id: 'tree',
    title: 'Die Vorlesungsstruktur',
    body: [
      'Links liegt die Vorlesung als Baum: Kapitel, Themen und darunter die einzelnen Konzepte. Der farbige Punkt neben einem Konzept zeigt seinen Status auf einen Blick.',
      'Über das Suchfeld findest du ein Konzept, ohne dich durch den Baum zu klicken. Mit einem Klick wählst du es aus.',
      'Du kannst auch ein Kapitel oder Thema auswählen und dazu ein Quiz starten. GRAPHIT löst es dann in seine Konzepte auf.'
    ],
    selector: '.graphit-split-left',
    tab: 'concepts',
    demo: 'tree'
  },
  {
    id: 'detail',
    title: 'Der Detailbereich',
    body: [
      'Rechts steht alles zum gewählten Konzept: dein Lernstand mit der Mastery, der Lernpfad mit Voraussetzungen und hilfreichen Nachbarkonzepten sowie die Schaltflächen zum Bearbeiten eines Konzepts.',
      'Von hier startest du ein Quiz oder lässt dir das Konzept im Chat erklären. Das erfolgreiche Abschließen eines Quiz bringt dich in deiner Mastery voran.'
    ],
    selector: '.graphit-split-right',
    tab: 'concepts',
    demo: 'concept'
  },
  {
    id: 'mastery',
    title: 'Mastery und Bestmarke',
    body: [
      'Der Balken zeigt, wie sicher du ein Konzept gerade abrufen kannst. Jede richtige Antwort hebt den Wert, jede falsche senkt ihn, und ohne Übung sinkt er langsam von selbst. Ab der markierten Schwelle gilt das Konzept als beherrscht.',
      'Die Bestmarke ist der höchste Wert, den du je erreicht hast, und sie sinkt nie. Lag sie einmal über der Schwelle, bleiben die darauf aufbauenden Konzepte dauerhaft freigeschaltet, auch wenn der aktuelle Wert wieder darunter fällt. Ein gesunkener Wert heißt also nur: eine Wiederholung lohnt sich.',
      'Vorankommen kannst du hier nur auf einem Weg: indem du das Konzept abfragst oder ein Quiz zu einem übergeordneten Bereich machst. Erklärungen im Chat verändern die Mastery nicht.'
    ],
    selector: '.graphit-mastery',
    tab: 'concepts',
    demo: 'mastery',
    padding: 8
  },
  {
    id: 'chat',
    title: 'Der Chat mit dem Tutor',
    body: [
      'Über "Im Chat fragen" öffnet sich ein eigenes Fenster. Der Tutor antwortet ausschließlich auf Grundlage der Vorlesungsfolien und bleibt bei dem Konzept, das du gewählt hast.',
      'Ganz oben im Chatfenster steht, an welches Thema das Gespräch gebunden ist. Jedes Thema hat sein eigenes Gespräch: Schließt du den Chat oder wechselst du das Konzept, beginnt der Verlauf von vorn.',
      'Du kannst hier auch nach deinem Lernweg fragen: „Womit soll ich weitermachen?“ nennt dir Konzepte, deren Voraussetzungen du schon erfüllst, und „Was brauche ich für Kafka?“ sagt dir, was für ein bestimmtes Ziel noch fehlt. Die Antwort kommt aus demselben Wissensgraphen wie der Lernpfad im Detailbereich.'
    ],
    selector: '.jp-graphit-chat',
    demo: 'chat'
  },
  {
    id: 'statistics',
    title: 'Statistik',
    body: [
      'Hier siehst du deinen Fortschritt ausführlich: Unterteilt in Status, Kapiteln und einen Überblick über die demnächst zur Wiederholung anstehenden Konzepte.',
      'Nützlich, um vor einer Prüfung zu erkennen, welches Kapitel noch nicht vollständig bearbeitet ist.'
    ],
    selector: '.jp-graphit-main .graphit-body',
    tab: 'stats',
    scrollbar: true
  },
  {
    id: 'review',
    title: 'Wiederholung',
    body: [
      'Deine Mastery verfällt langsam, wenn du ein Konzept länger nicht übst. Was dadurch unter die Schwelle gerutscht ist, sammelt sich hier.',
      'Ein Klick startet eine Sitzung aus mehreren fälligen Konzepten hintereinander.'
    ],
    selector: '.jp-graphit-main .graphit-body',
    tab: 'review',
    scrollbar: true
  },
  {
    id: 'guide',
    title: 'Die Anleitung',
    body: [
      'Alles, was du gerade gesehen hast, steht hier noch einmal zum Nachlesen, dazu die genaue Bedeutung der Status und des Mastery-Werts.',
      'Ganz oben findest du auch den Knopf, mit dem du diese Einführung erneut starten kannst.'
    ],
    // The tab body rather than .graphit-guide, which is taller than the screen.
    selector: '.jp-graphit-main .graphit-body',
    tab: 'guide',
    scrollbar: true
  },
  {
    id: 'finish',
    title: 'Das war es schon',
    body: [
      'Ein guter Anfang: Wähle unter Konzepte ein Konzept aus der Empfehlung, lass es dir im Chat erklären und prüfe dich danach mit einem Quiz.',
      'Du landest jetzt wieder dort, wo du vor der Einführung warst.'
    ]
  }
];
