/**
 * The chat widget's React tree: message list, composer, a button that starts the quiz
 * for the current topic (a frontend command; the tutor does not create quizzes) and a
 * close button.
 */

import * as React from 'react';

import { SlideCitation } from '../../api/types';
import { CommandIDs } from '../../commands';
import { useCommands, useGraphit, useStore } from '../../state/useStore';
import { ChatEntry } from '../../state/types';
import { ErrorBanner, Spinner } from '../common/Common';

/**
 * Chat view with topic header, messages and composer.
 * @param props: `onClose` closes the chat widget
 * @returns: The chat view
 */
export function ChatView(props: { onClose: () => void }): JSX.Element {
  const state = useGraphit();
  const store = useStore();
  const commands = useCommands();
  const chat = state.chat;
  const [draft, setDraft] = React.useState('');
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages, chat.phase]);

  const busy = chat.phase !== 'idle';

  const send = () => {
    const text = draft.trim();
    if (!text || busy) {
      return;
    }
    setDraft('');
    void store.sendChat(text);
  };

  const toQuiz = () => {
    if (!chat.scope) {
      void commands.execute(CommandIDs.openMain);
      return;
    }
    void commands.execute(CommandIDs.startQuiz, {
      conceptId: chat.scope.type === 'concept' ? chat.scope.id : undefined,
      scopeId: chat.scope.type === 'concept' ? undefined : chat.scope.id
    });
  };

  return (
    <div className="graphit-root graphit-chat">
      <div className="graphit-chat-scope">
        <span className="graphit-chat-scope-label">
          {chat.scope ? (
            <>
              Thema: <b>{chat.scope.name ?? chat.scope.id}</b>
            </>
          ) : (
            <span className="graphit-muted">
              Kein Thema gewählt, der Tutor muss raten.
            </span>
          )}
        </span>
        <button
          className="graphit-btn"
          onClick={toQuiz}
          title="Quiz zum aktuellen Thema starten. Der Chat wird dabei beendet und der Verlauf verworfen."
        >
          Zum Quiz
        </button>
        <button
          className="graphit-btn graphit-btn--quiet"
          onClick={props.onClose}
          title="Chat beenden. Der Verlauf wird verworfen. Beim nächsten Öffnen beginnt ein neues Gespräch."
        >
          Schließen
        </button>
      </div>

      <div className="graphit-messages">
        {chat.messages.length === 0 ? (
          <div className="graphit-empty">
            <strong>Frag den Tutor</strong>
            <p>
              Er antwortet ausschließlich auf Grundlage der Vorlesungsfolien.
              Wähle links im Baum ein Konzept, damit er weiß, worum es geht.
            </p>
            <p className="graphit-small graphit-muted">
              Jedes Thema hat sein eigenes Gespräch: wechselst du das Konzept,
              beginnt der Verlauf von vorn.
            </p>
          </div>
        ) : null}

        {chat.trimmed ? (
          <div
            className="graphit-small graphit-muted"
            style={{ textAlign: 'center' }}
          >
            Ältere Nachrichten wurden aus dem Verlauf entfernt.
          </div>
        ) : null}

        {chat.messages
          .filter(m => m.content.length > 0 || m.role === 'user')
          .map(message => (
            <Bubble
              key={message.id}
              message={message}
              onConcept={id => void commands.execute(CommandIDs.select, { id })}
            />
          ))}

        {chat.phase === 'waiting' ? (
          <div className="graphit-thinking">
            <Spinner />
            <span>Antwort wird erstellt …</span>
          </div>
        ) : null}

        {chat.error ? (
          <ErrorBanner
            error={chat.error}
            onDismiss={() => store.clearChatError()}
          />
        ) : null}

        <div ref={endRef} />
      </div>

      <div className="graphit-composer">
        <textarea
          value={draft}
          placeholder="Frage an den Tutor …"
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="graphit-composer-row">
          <button
            className="graphit-btn graphit-btn--primary"
            onClick={send}
            disabled={busy || draft.trim().length === 0}
          >
            Senden
          </button>
          {busy ? (
            <button className="graphit-btn" onClick={() => store.abortChat()}>
              Abbrechen
            </button>
          ) : null}
          <span className="graphit-composer-hint">
            Enter sendet, Shift+Enter macht einen Zeilenumbruch.
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * A single chat message.
 * @param props: The message and a callback for concept links
 * @returns: The message bubble
 */
function Bubble(props: {
  message: ChatEntry;
  onConcept: (id: string) => void;
}): JSX.Element {
  const { message } = props;
  return (
    <div className="graphit-msg" data-role={message.role}>
      {renderInline(message.content, props.onConcept)}
      {message.aborted ? (
        <span className="graphit-msg-aborted">(abgebrochen)</span>
      ) : null}
      {message.slides && message.slides.length > 0 ? (
        <SlideSources slides={message.slides} />
      ) : null}
    </div>
  );
}

/**
 * Collapsed footnote listing the slides the tutor was given for an answer. Slide titles
 * and text are deliberately omitted.
 * @param props: The slide citations
 * @returns: The footnote element
 */
function SlideSources(props: { slides: SlideCitation[] }): JSX.Element {
  const { slides } = props;
  return (
    <details className="graphit-sources">
      <summary>Herangezogene Folien ({slides.length})</summary>
      <ul>
        {slides.map(slide => (
          <li key={`${slide.source}-${slide.page}`}>
            <span className="graphit-sources-slide">Folie {slide.page}</span>
            {` · ${chapterLabel(slide)} · ${slide.source} · Stand ${slide.stand}`}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Formats the chapter of a slide, e.g. "Kapitel 3: Title", "Kapitel 7" or just the title.
 * @param slide: Slide citation
 * @returns: The chapter label
 */
function chapterLabel(slide: SlideCitation): string {
  const chapterNumber =
    slide.chapter_num !== null ? `Kapitel ${slide.chapter_num}` : '';
  if (chapterNumber && slide.chapter) {
    return `${chapterNumber}: ${slide.chapter}`;
  }
  return chapterNumber || slide.chapter || 'Kapitel unbekannt';
}

/**
 * Concept links the tutor may emit: `[[CONCEPT_ID|Label]]`, rendered as buttons that
 * select the concept. The id is restricted to letters, digits and underscores because
 * the text comes from a language model and is passed to `commands.execute`.
 */
const CODE = /`[^`]+`/;
const BOLD = /\*\*[^*]+\*\*/;
const CONCEPT_LINK = /\[\[([A-Za-z0-9_]{1,64})\|([^\]|]{1,120})\]\]/;

/**
 * Minimal inline formatting: `code`, **bold** and concept links. Deliberately not a full
 * Markdown renderer, to avoid a sanitiser and the XSS surface.
 * @param text: Message text
 * @param onConcept: Called with the concept id when a concept link is clicked
 * @returns: Text and element fragments
 */
export function renderInline(
  text: string,
  onConcept?: (id: string) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Built from `.source`, since a template literal would drop the backslash before `*`.
  const pattern = new RegExp(
    `(${CODE.source}|${BOLD.source}|${CONCEPT_LINK.source})`,
    'g'
  );
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    const link = CONCEPT_LINK.exec(token);
    if (link) {
      const [, id, label] = link;
      parts.push(
        <button
          key={match.index}
          className="graphit-concept-link"
          title={`${label} im Auswahlbaum öffnen`}
          onClick={() => onConcept?.(id)}
        >
          {label}
        </button>
      );
    } else if (token.startsWith('`')) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}
