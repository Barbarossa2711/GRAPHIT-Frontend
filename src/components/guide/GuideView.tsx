/** Standalone tab: how to work with the GRAPHIT tutor. */

import { ConceptStatus } from '../../api/types';
import { MASTERY_THRESHOLD, STATUS_ORDER } from '../../state/selectors';
import { useStore } from '../../state/useStore';
import { MasteryBar, StatusPill } from '../common/Common';

const STATUS_DETAIL: Record<ConceptStatus, string> = {
  new: 'Noch unberührt: weder im Chat angeschaut noch je in einem Quiz geprüft. Hier hast du noch nicht begonnen.',
  visited:
    'Du hast dir das Konzept im Chat erklären lassen, aber noch kein Quiz dazu gemacht. Ein Besuch allein verändert die Mastery nicht. Geprüft ist es also noch nicht.',
  in_progress:
    'Schon getestet, aber die Mastery liegt noch unter der Schwelle. Du bist dran. Ein paar richtige Antworten mehr fehlen bis „beherrscht".',
  due_review:
    'War schon einmal beherrscht, ist mit der Zeit unter die Schwelle gesunken. Ein kurzes Quiz frischt es wieder auf. Gesperrt wird dadurch nichts.',
  mastered:
    'Die Mastery liegt über der Schwelle. Das Konzept ist freigegeben und schaltet seine Folgekonzepte dauerhaft frei.'
};

const TAB_CARDS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '🗂️',
    title: 'Konzepte',
    body: 'Links die Vorlesungsstruktur, rechts Details, Lernstand und Aktionen zum gewählten Konzept.'
  },
  {
    icon: '📊',
    title: 'Statistik',
    body: 'Dein Gesamtfortschritt auf einen Blick: beherrscht, fällig und noch offen.'
  },
  {
    icon: '🔁',
    title: 'Wiederholung',
    body: 'Sammelt Konzepte, deren Mastery gesunken ist, und startet eine gezielte Wiederholung.'
  },
  {
    icon: '✍️',
    title: 'Quiz',
    body: 'Teste dein Wissen zu einem Konzept und erziele so Fortschritt in deiner Lernanzeige.'
  }
];

const STEPS: Array<{ title: string; body: JSX.Element }> = [
  {
    title: 'Konzept wählen',
    body: (
      <>
        Öffne <strong>Konzepte</strong> und klick ein Konzept an. Der{' '}
        <strong>Lernpfad</strong> zeigt, ob Voraussetzungen fehlen und wo du
        anfängst.
      </>
    )
  },
  {
    title: 'Erklären lassen',
    body: (
      <>
        Über <strong>„Im Chat fragen"</strong> erklärt dir der Tutor das
        Konzept, ausschließlich auf Grundlage der Vorlesungsfolien. Im selben
        Chat kannst du auch fragen, womit du weitermachen sollst.
      </>
    )
  },
  {
    title: 'Verständnis prüfen',
    body: (
      <>
        Starte ein <strong>Quiz</strong>. Nur Quizze verändern deine Mastery.
      </>
    )
  },
  {
    title: 'Dranbleiben',
    body: (
      <>
        Schau regelmäßig in die <strong>Wiederholung</strong>, damit Gelerntes
        nicht wieder verblasst.
      </>
    )
  }
];

/**
 * Guide tab explaining work areas, workflow, statuses and the mastery score.
 * @returns: The guide view
 */
export function GuideView(): JSX.Element {
  const store = useStore();
  const thresholdPct = Math.round(MASTERY_THRESHOLD * 100);
  return (
    <div className="graphit-scroll">
      <div className="graphit-guide">
        <h2>Anleitung</h2>
        <p className="graphit-muted">
          GRAPHIT ist ein intelligenter Tutor für Big-Data-Technologien. Er
          führt dich entlang eines Wissensgraphen durch die Vorlesung, prüft
          dein Verständnis mit Quizzen und schlägt vor, was als Nächstes
          sinnvoll ist.
        </p>

        <h3>Was GRAPHIT bedeutet</h3>
        <p className="graphit-muted">
          Der Name steht für <strong>Graph-Based Intelligent Tutoring System</strong>,
          und beide Hälften siehst du in der Oberfläche wieder.
        </p>
        <dl className="graphit-guide-acronym">
          <dt>Graph-Based</dt>
          <dd>
            Die Vorlesung ist als Wissensgraph hinterlegt: Kapitel, Themen und
            Konzepte, dazu die Voraussetzungen zwischen den Konzepten. Der Baum
            unter „Konzepte“ und der Lernpfad im Detailbereich sind dieser
            Graph.
          </dd>
          <dt>Intelligent Tutoring System</dt>
          <dd>
            Ein Tutor, der erklärt, prüft und empfiehlt, und zwar auf Grundlage
            deines Lernstands: der Chat erklärt aus den Folien, das Quiz misst
            die Mastery, die Empfehlung folgt dem Graphen und deinem Stand.
          </dd>
        </dl>

        <div className="graphit-guide-tour">
          <p>
            Lieber einmal gezeigt bekommen? Die Einführung geht die Bereiche der
            Reihe nach durch und hebt sie dabei hervor.
          </p>
          <button
            className="graphit-btn graphit-btn--primary"
            onClick={() => store.startTour()}
          >
            Einführung starten
          </button>
        </div>

        <h3>Die vier Arbeitsbereiche</h3>
        <div className="graphit-guide-cards">
          {TAB_CARDS.map(card => (
            <div className="graphit-guide-card" key={card.title}>
              <span className="graphit-guide-card-icon" aria-hidden="true">
                {card.icon}
              </span>
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </div>
          ))}
        </div>

        <h3>In vier Schritten zum Ziel</h3>
        <ol className="graphit-guide-steps">
          {STEPS.map((step, i) => (
            <li key={i}>
              <span className="graphit-guide-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <strong>{step.title}.</strong> {step.body}
              </span>
            </li>
          ))}
        </ol>

        <h3>Mastery-Score verstehen</h3>
        <p>
          <strong>Mastery</strong> ist ein Maß dafür, wie gut du ein Konzept
          gerade beherrschst, also wie sicher du es abrufen und anwenden kannst.
          Sie steigt, wenn du Fragen dazu richtig beantwortest, und sinkt
          wieder, wenn du ein Konzept länger nicht übst. Sie ist damit kein
          Zeugnis eines einzelnen Quiz, sondern ein lebendiger Schätzwert deines
          aktuellen Wissensstands.
        </p>

        <div className="graphit-guide-example">
          <div className="graphit-meter-label">
            <span>Beispiel</span>
          </div>
          <MasteryBar
            mastery={0.62}
            peak={0.9}
            threshold={MASTERY_THRESHOLD}
            labeled
          />
          <p className="graphit-small graphit-muted">
            Die Füllung ist dein aktueller Stand. Ab der{' '}
            <strong>Schwelle bei {thresholdPct} %</strong> gilt ein Konzept als
            beherrscht und schaltet Folgekonzepte frei. Die{' '}
            <strong>Bestmarke</strong> ist der höchste je erreichte Wert. Sie
            zerfällt nicht und hält die Freischaltung dauerhaft aufrecht.
          </p>
        </div>

        <div className="graphit-notice">
          <strong>Warum sich der Stand von allein verändert</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>
              Die Mastery verfällt mit der Zeit. Ein Konzept kann ohne dein
              Zutun von „beherrscht" auf „Wiederholung fällig" fallen.
            </li>
            <li>
              Ein solcher Rückfall <strong>sperrt nichts</strong>. Was einmal
              beherrscht war, gibt die Folgekonzepte dauerhaft frei.
            </li>
            <li>
              Erklärungen im Chat erhöhen nur den Besuchszähler. Die Mastery
              ändern ausschließlich Quizze.
            </li>
            <li>
              Für „beherrscht" sind insgesamt 3 richtige Antworten nötig. Ein
              einzelnes Quiz reicht meist noch nicht.
            </li>
          </ul>
        </div>

        <h3>Die Status eines Konzepts</h3>
        <p className="graphit-muted">
          Jedes Konzept trägt einen Status, der zeigt, wo du gerade stehst. Er
          ergibt sich aus deiner Mastery und deiner bisherigen Aktivität:
        </p>
        <dl className="graphit-guide-status">
          {STATUS_ORDER.map(status => (
            <div className="graphit-guide-status-row" key={status}>
              <dt>
                <StatusPill status={status} />
              </dt>
              <dd>{STATUS_DETAIL[status]}</dd>
            </div>
          ))}
        </dl>

        <h3>Lernpfad, Voraussetzungen und Hilfreiches</h3>
        <p>
          Zu jedem ausgewählten Konzept zeigt der <strong>Lernpfad</strong> im
          Detailbereich, was im Wissensgraphen davor liegt. So siehst du auf
          einen Blick eine sinnvolle Reihenfolge, statt planlos zu springen.
        </p>
        <dl className="graphit-guide-list">
          <dt>Voraussetzungen</dt>
          <dd>
            Konzepte, die du zum Verständnis vorher bearbeiten solltest. Sie
            sind weiter unterteilt:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              <li>
                <strong>Jetzt möglich:</strong> Die eigenen Voraussetzungen sind
                erfüllt, ein guter Einstiegspunkt.
              </li>
              <li>
                <strong>Noch gesperrt:</strong> Es fehlen noch Voraussetzungen.
                Ein Klick auf das Konzept zeigt, was ihm konkret fehlt.
              </li>
              <li>
                <strong>Zum Wiederholen:</strong> War schon beherrscht und ist
                nur zeitbedingt gesunken. Lohnt sich, ist aber kein Muss.
              </li>
            </ul>
          </dd>
          <dt>Hilfreich</dt>
          <dd>
            Konzepte, die das Verständnis erleichtern, aber{' '}
            <strong>keine</strong> Voraussetzung sind. Nichts davon hält dich
            auf.
          </dd>
          <dt>Freischalten</dt>
          <dd>
            Sobald du ein Konzept beherrschst, gibt es seine Folgekonzepte
            dauerhaft frei. Diese Freigabe bleibt bestehen, auch wenn die
            Mastery später wieder unter die Schwelle sinkt.
          </dd>
        </dl>
        <p className="graphit-small graphit-muted">
          Wichtig: GRAPHIT sperrt nichts wirklich. Du kannst jederzeit fragen
          und ein Quiz starten. „Gesperrt" und „freigegeben" beschreiben nur die
          empfohlene Reihenfolge, keine echte Blockade.
        </p>

        <h3>Den Lernpfad im Chat erfragen</h3>
        <p>
          Der Chat kann mehr als erklären. Stellst du eine Frage zu deinem
          Lernweg, antwortet nicht der Erklärer, sondern der{' '}
          <strong>Lernpfad-Berater</strong>. Er rechnet dabei nichts selbst
          aus, sondern liest denselben Wissensgraphen und denselben Lernstand,
          aus denen auch der Lernpfad im Detailbereich entsteht, und formuliert
          das Ergebnis für dich. Zwei Arten von Fragen versteht er:
        </p>
        <dl className="graphit-guide-list">
          <dt>Ohne Ziel</dt>
          <dd>
            „Womit soll ich weitermachen?“ oder „Was kann ich jetzt lernen?“.
            Du bekommst zwei bis vier Konzepte genannt, deren Voraussetzungen
            du bereits erfüllst, in der Reihenfolge der Vorlesung und mit dem
            Kapitel, zu dem sie gehören. Was du schon angeschaut hast, nennt er
            als „abschließen“ statt „anfangen“.
          </dd>
          <dt>Mit Ziel</dt>
          <dd>
            „Was brauche ich für Kafka?“ oder „Bin ich bereit für den
            Speed-Layer?“. Die Antwort sagt, ob du direkt loslegen kannst,
            welche Voraussetzungen zuerst dran sind, was davon noch gesperrt
            ist und warum, welche Konzepte eine Wiederholung vertragen, und
            welche nur hilfreich, aber nicht nötig sind.
          </dd>
        </dl>
        <p className="graphit-small graphit-muted">
          Du musst dafür nicht das richtige Konzept ausgewählt haben; der
          Chat erkennt am Wortlaut, ob du eine Erklärung oder eine Empfehlung
          möchtest. Ein Klick auf ein empfohlenes Konzept im Baum bringt dich
          dann zum Lernpfad mit denselben Angaben.
        </p>

        <p className="graphit-small graphit-muted">
          Hinweis: Der angezeigte Lernstand stammt aus dem letzten Abruf. Oben
          rechts über ⟳ lädst du ihn jederzeit neu.
        </p>
      </div>
    </div>
  );
}
