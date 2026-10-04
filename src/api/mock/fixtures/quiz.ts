/**
 * Mock quizzes with one question of every type, plus a grader that behaves like the
 * backend so the feedback view receives realistic `results`.
 */

import {
  Answer,
  ClientQuestion,
  QuestionType,
  QuizResult,
  QuizStartResponse
} from '../../types';

interface MockSolution {
  correct: Answer;
  explanation: string | null;
}

const SOLUTIONS: Record<string, MockSolution> = {};

/**
 * Registers the solution of a question and returns the question.
 * @param id: Question id
 * @param question: Question as sent to the client
 * @param solution: Correct answer
 * @param explanation: Explanation shown after grading
 * @returns: The unchanged question
 */
function q(
  id: string,
  question: ClientQuestion,
  solution: Answer,
  explanation: string | null
): ClientQuestion {
  SOLUTIONS[id] = { correct: solution, explanation };
  return question;
}

/**
 * Builds one question of every type for a concept.
 * @param conceptId: Concept id used as question id prefix
 * @returns: Five questions
 */
function buildQuestions(conceptId: string): ClientQuestion[] {
  const p = conceptId;
  return [
    q(
      `${p}_ST01_SINGLE`,
      {
        question_id: `${p}_ST01_SINGLE`,
        type: 'single',
        payload: {
          type: 'single',
          prompt: 'Wodurch verteilt Sharding die Daten auf mehrere Knoten?',
          options: [
            { id: 'a', text: 'Durch vollständige Kopien auf jedem Knoten' },
            {
              id: 'b',
              text: 'Durch disjunkte Partitionen anhand eines Schlüssels'
            },
            { id: 'c', text: 'Durch Komprimierung der Datenblöcke' },
            { id: 'd', text: 'Durch Auslagerung auf ein Bandarchiv' }
          ]
        }
      },
      'b',
      'Sharding teilt den Datenbestand disjunkt anhand eines Shard-Keys auf. Vollständige Kopien wären Replikation.'
    ),
    q(
      `${p}_ST02_MULTIPLE`,
      {
        question_id: `${p}_ST02_MULTIPLE`,
        type: 'multiple',
        payload: {
          type: 'multiple',
          prompt: 'Welche Aussagen zum CAP-Theorem treffen zu?',
          options: [
            {
              id: 'a',
              text: 'Bei einer Netzpartition muss zwischen C und A gewählt werden'
            },
            {
              id: 'b',
              text: 'Alle drei Eigenschaften sind gleichzeitig garantierbar'
            },
            { id: 'c', text: 'Konsistenz meint hier Linearisierbarkeit' },
            {
              id: 'd',
              text: 'Partitionstoleranz ist in verteilten Systemen praktisch unverzichtbar'
            }
          ],
          grading: 'all_or_nothing'
        }
      },
      ['a', 'c', 'd'],
      'Nur bei einer Partition entsteht der Zwang zur Wahl; alle drei gleichzeitig geht nicht.'
    ),
    q(
      `${p}_ST03_CLOZE`,
      {
        question_id: `${p}_ST03_CLOZE`,
        type: 'cloze',
        payload: {
          type: 'cloze',
          prompt: 'Fülle die Lücken.',
          text: 'Ein {{b1}} verteilt Daten disjunkt über mehrere Knoten, während {{b2}} identische Kopien vorhält. Der Schlüssel dafür heißt {{b3}}.',
          blanks: ['b1', 'b2', 'b3'],
          bank: [
            { id: 't1', text: 'Shard' },
            { id: 't2', text: 'Replikation' },
            { id: 't3', text: 'Shard-Key' },
            { id: 't4', text: 'Commit-Log' },
            { id: 't5', text: 'Quorum' }
          ],
          reuse: false
        }
      },
      { b1: 't1', b2: 't2', b3: 't3' },
      'Shard = disjunkte Partition, Replikation = Kopie, Shard-Key = Verteilungsschlüssel.'
    ),
    q(
      `${p}_ST04_MATCH`,
      {
        question_id: `${p}_ST04_MATCH`,
        type: 'match',
        payload: {
          type: 'match',
          prompt: 'Ordne jedem Begriff die passende Beschreibung zu.',
          left: [
            { id: 'l1', text: 'HDFS' },
            { id: 'l2', text: 'YARN' },
            { id: 'l3', text: 'Hive' }
          ],
          // More right entries than left (distractors).
          right: [
            { id: 'r1', text: 'Verteiltes Dateisystem mit Blockreplikation' },
            { id: 'r2', text: 'Ressourcenverwaltung und Job-Scheduling' },
            { id: 'r3', text: 'SQL-ähnliche Abfrageschicht über Hadoop' },
            { id: 'r4', text: 'Nachrichtenbroker für Ereignisströme' },
            { id: 'r5', text: 'Spaltenorientiertes Dateiformat' }
          ]
        }
      },
      { l1: 'r1', l2: 'r2', l3: 'r3' },
      'r4 (Kafka) und r5 (Parquet) gehören nicht zu den drei genannten Komponenten.'
    ),
    q(
      `${p}_ST05_ORDER`,
      {
        question_id: `${p}_ST05_ORDER`,
        type: 'order',
        payload: {
          type: 'order',
          prompt:
            'Bringe die Phasen eines MapReduce-Jobs in die richtige Reihenfolge.',
          // Deliberately not in solution order.
          items: [
            { id: 's3', text: 'Reduce' },
            { id: 's1', text: 'Map' },
            { id: 's4', text: 'Ausgabe schreiben' },
            { id: 's2', text: 'Shuffle & Sort' }
          ]
        }
      },
      ['s1', 's2', 's3', 's4'],
      'Map erzeugt Zwischenpaare, Shuffle gruppiert sie nach Schlüssel, Reduce aggregiert, danach wird geschrieben.'
    )
  ];
}

/**
 * Builds a mock quiz. Like the backend it contains exactly one question; the type
 * rotates across concepts so a multi-concept review exercises all five renderers.
 * @param conceptId: Concept to quiz
 * @returns: The quiz without solutions
 */
export function buildMockQuiz(conceptId: string): QuizStartResponse {
  const all = buildQuestions(conceptId);
  const picked = all[hashIndex(conceptId, all.length)];
  return {
    quiz_id: `mock-${Math.random().toString(16).slice(2, 10)}`,
    concept_id: conceptId,
    questions: [picked]
  };
}

/**
 * Stable string hash, so a concept always gets the same question type.
 * @param key: String to hash
 * @param mod: Number of buckets
 * @returns: Bucket index in [0, mod)
 */
function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

/**
 * Grades an answer like the backend: ID-based, binary, no text normalisation.
 * @param type: Question type
 * @param given: Student answer
 * @param expected: Correct answer
 * @returns: True if the answer is correct
 */
function isCorrect(
  type: QuestionType,
  given: Answer | undefined,
  expected: Answer
): boolean {
  if (given === undefined || given === null) {
    return false;
  }
  switch (type) {
    case 'single':
      return given === expected;
    case 'multiple': {
      if (!Array.isArray(given) || !Array.isArray(expected)) {
        return false;
      }
      const a = new Set(given);
      const b = new Set(expected);
      return a.size === b.size && [...a].every(x => b.has(x));
    }
    case 'order':
      return (
        Array.isArray(given) &&
        Array.isArray(expected) &&
        given.length === expected.length &&
        given.every((x, i) => x === expected[i])
      );
    case 'cloze':
    case 'match': {
      if (
        typeof given !== 'object' ||
        Array.isArray(given) ||
        typeof expected !== 'object' ||
        Array.isArray(expected)
      ) {
        return false;
      }
      const ge = Object.entries(given);
      const ee = Object.entries(expected);
      return (
        ge.length === ee.length &&
        ee.every(([k, v]) => (given as Record<string, string>)[k] === v)
      );
    }
    default:
      return false;
  }
}

/**
 * Grades all questions of a mock quiz.
 * @param questions: Questions of the quiz
 * @param answers: Answers keyed by question id
 * @returns: Per-question results including solutions
 */
export function gradeMockQuiz(
  questions: ClientQuestion[],
  answers: Record<string, Answer>
): QuizResult[] {
  return questions.map(question => {
    const sol = SOLUTIONS[question.question_id];
    const given = answers[question.question_id];
    return {
      question_id: question.question_id,
      type: question.type,
      correct: sol ? isCorrect(question.type, given, sol.correct) : false,
      your_answer: given ?? null,
      solution: sol ? { correct: sol.correct } : null,
      explanation: sol?.explanation ?? null
    };
  });
}
