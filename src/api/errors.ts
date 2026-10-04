/**
 * Error classification and mapping to student-facing German text.
 *
 * The server's `detail` strings are developer text and are never shown to students;
 * they are only logged.
 */

export type EndpointId =
  | 'health'
  | 'domainTree'
  | 'progress'
  | 'recommend'
  | 'nextSteps'
  | 'activity'
  | 'chat'
  | 'quizCandidates'
  | 'quizStart'
  | 'quizSubmit';

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'abort' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly endpoint: EndpointId;
  /** Raw server text, for logging only. */
  readonly detail: string | null;

  /**
   * Creates an API error.
   * @param kind: Error category
   * @param endpoint: Endpoint that failed
   * @param status: HTTP status, or null if no response was received
   * @param detail: Raw server or browser message
   */
  constructor(
    kind: ApiErrorKind,
    endpoint: EndpointId,
    status: number | null,
    detail: string | null
  ) {
    super(`[${endpoint}] ${kind}${status !== null ? ' ' + status : ''}`);
    this.name = 'ApiError';
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
    this.detail = detail;
    // Required when subclassing a built-in with an ES2018 target.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Whether the request was cancelled by the caller.
   * @returns: True for aborted requests
   */
  get isAbort(): boolean {
    return this.kind === 'abort';
  }
}

export interface UserFacingError {
  title: string;
  body: string;
  /** Extra diagnostic line, shown smaller. */
  hint?: string;
  /** True if the situation is informational rather than a failure. */
  benign?: boolean;
  canRetry: boolean;
}

export interface ErrorContext {
  baseUrl?: string;
  /**
   * Whether operator details (backend address, server env variable) may be shown.
   * Off for students, who cannot act on them.
   */
  showDiagnostics?: boolean;
  /**
   * True if a submit for this quiz was already sent (timeout, network drop, reload).
   * A 404 then means "probably already graded".
   */
  submitAttempted?: boolean;
}

const GENERIC_RETRY =
  'Bitte versuche es erneut. Wenn es wieder passiert, prüfe, ob das Backend läuft.';

/**
 * Maps a caught error to text a student may read. Use this instead of `err.message`,
 * which contains endpoint names and status codes.
 * @param err: The caught error
 * @param ctx: Additional context for the message
 * @returns: Title, body and retry hint for the UI
 */
export function userMessage(
  err: unknown,
  ctx: ErrorContext = {}
): UserFacingError {
  if (!(err instanceof ApiError)) {
    console.warn('[GRAPHIT] unexpected error', err);
    return {
      title: 'Unerwarteter Fehler',
      body: 'In der Erweiterung ist etwas schiefgelaufen. Details stehen in der Browser-Konsole.',
      canRetry: true
    };
  }

  console.warn(
    '[GRAPHIT]',
    err.endpoint,
    err.kind,
    err.status ?? '',
    err.detail ?? ''
  );

  if (err.kind === 'abort') {
    return { title: 'Abgebrochen', body: '', benign: true, canRetry: false };
  }

  if (err.kind === 'network') {
    // fetch() cannot distinguish a CORS rejection from a dead server, so name both.
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '(unbekannt)';
    const crossOrigin = isCrossOrigin(ctx.baseUrl);
    if (!ctx.showDiagnostics) {
      return {
        title: 'Backend nicht erreichbar',
        body: 'Der GRAPHIT-Server hat nicht geantwortet.',
        hint: 'Versuche es gleich noch einmal. Bleibt es dabei, melde dich bei der Betreuung der Veranstaltung.',
        canRetry: true
      };
    }
    return {
      title: 'Backend nicht erreichbar',
      body: `Der GRAPHIT-Server unter ${ctx.baseUrl ?? 'der eingestellten Adresse'} hat nicht geantwortet.`,
      hint: crossOrigin
        ? `Läuft der Server? Und ist "${origin}" in GRAPHIT_CORS_ORIGINS eingetragen? Der Browser unterscheidet beide Fälle nicht.`
        : 'Läuft der Server?',
      canRetry: true
    };
  }

  if (err.kind === 'timeout') {
    if (err.endpoint === 'quizStart') {
      return {
        title: 'Fragengenerierung hat zu lange gedauert',
        body: 'Das Erstellen der Fragen dauert normalerweise 30–120 Sekunden, hier war es länger.',
        hint: 'Ein neuer Versuch erzeugt die Fragen komplett neu und dauert wieder genauso lange.',
        canRetry: true
      };
    }
    if (err.endpoint === 'chat') {
      return {
        title: 'Der Tutor hat zu lange gebraucht',
        body: 'Die Antwort ist nicht rechtzeitig angekommen.',
        canRetry: true
      };
    }
    return {
      title: 'Zeitüberschreitung',
      body: 'Der Server hat nicht rechtzeitig geantwortet.',
      canRetry: true
    };
  }

  if (err.kind === 'parse') {
    return {
      title: 'Unerwartete Antwort',
      body: 'Der Server hat etwas geschickt, das die Erweiterung nicht lesen kann.',
      canRetry: true
    };
  }

  switch (err.status) {
    case 404:
      return notFound(err, ctx);
    case 422:
      // Always a frontend bug: a required field is missing or has the wrong type.
      console.error(
        '[GRAPHIT] 422, Frontend-Bug bei',
        err.endpoint,
        err.detail
      );
      return {
        title: 'Interner Fehler',
        body: 'Die Anfrage war fehlerhaft aufgebaut. Das ist ein Fehler der Erweiterung, nicht deiner.',
        canRetry: false
      };
    case 500:
    case 502:
    case 503:
      return {
        title: 'Der Tutor-Server hat ein Problem',
        body: 'Die Anfrage konnte serverseitig nicht bearbeitet werden.',
        hint: GENERIC_RETRY,
        canRetry: true
      };
    default:
      return {
        title: 'Anfrage fehlgeschlagen',
        body: 'Der Server hat die Anfrage abgelehnt.',
        canRetry: true
      };
  }
}

/**
 * Maps a 404 to an endpoint-specific message.
 * @param err: The 404 error
 * @param ctx: Error context
 * @returns: The student-facing message
 */
function notFound(err: ApiError, ctx: ErrorContext): UserFacingError {
  switch (err.endpoint) {
    case 'quizStart':
      return {
        title: 'Kein Quiz möglich',
        body: 'Für dieses Konzept konnten keine Fragen erzeugt werden. Meistens fehlen dazu Folien.',
        hint: 'Wähle ein anderes Konzept.',
        canRetry: false
      };
    case 'quizSubmit':
      if (ctx.submitAttempted) {
        // quiz_id is single-use, so a repeated submit after a timeout returns 404
        // even though the first one succeeded.
        return {
          title: 'Antworten vermutlich gewertet',
          body: 'Die Abgabe scheint beim ersten Versuch angekommen zu sein. Dein aktueller Stand wurde neu geladen.',
          benign: true,
          canRetry: false
        };
      }
      return {
        title: 'Quiz abgelaufen',
        body: 'Dieses Quiz ist auf dem Server nicht mehr vorhanden. Vermutlich wurde er zwischenzeitlich neu gestartet.',
        hint: 'Die Fragen sind verloren. Du kannst ein neues Quiz starten.',
        canRetry: false
      };
    case 'recommend':
      // The ID came from /domain/tree, so this is a data-integrity problem.
      console.error('[GRAPHIT] /recommend 404 für eine ID aus /domain/tree');
      return {
        title: 'Kein Lernpfad verfügbar',
        body: 'Zu diesem Konzept liegen keine Pfadinformationen vor.',
        canRetry: false
      };
    default:
      return {
        title: 'Nicht gefunden',
        body: 'Die angefragten Daten gibt es auf dem Server nicht.',
        canRetry: false
      };
  }
}

/**
 * Checks whether the backend runs on a different origin than JupyterLab.
 * @param baseUrl: Configured backend URL
 * @returns: True if cross-origin or undeterminable
 */
function isCrossOrigin(baseUrl: string | undefined): boolean {
  if (!baseUrl || typeof window === 'undefined') {
    return true;
  }
  try {
    return new URL(baseUrl).origin !== window.location.origin;
  } catch {
    return true;
  }
}
