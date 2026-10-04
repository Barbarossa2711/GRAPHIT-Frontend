/**
 * Mock domain tree.
 *
 * Deliberately includes the edge cases of the real data:
 *   - a chapter without topics (`children: []` on an inner node)
 *   - a subtopic without concepts
 *   - a concept whose name equals its id (server-side `name` fallback)
 */

import { DomainNode, DomainTreeResponse } from '../../types';

interface Spec {
  name: string;
  subtopics: Array<{ name: string; concepts: string[] }>;
}

const CHAPTERS: Array<{ name: string; topics: Spec[] }> = [
  {
    name: 'Grundlagen',
    topics: [
      {
        name: 'Motivation und Begriffe',
        subtopics: [
          {
            name: 'Die V-Modelle',
            concepts: ['Volume', 'Velocity', 'Variety', 'Veracity']
          },
          {
            name: 'Abgrenzung',
            concepts: ['OLTP vs. OLAP', 'Data Warehouse', 'Data Lake']
          }
        ]
      },
      {
        name: 'Verteilte Speicherung',
        subtopics: [
          {
            name: 'Partitionierung',
            concepts: ['Replikation', 'Sharding', 'Consistent Hashing']
          },
          {
            name: 'Konsistenz',
            concepts: ['CAP-Theorem', 'BASE', 'Eventual Consistency', 'Quorum']
          },
          // Empty branch: subtopic without concepts.
          { name: 'Speicherformate (in Arbeit)', concepts: [] }
        ]
      }
    ]
  },
  {
    name: 'Verarbeitungsmodelle',
    topics: [
      {
        name: 'Batch-Verarbeitung',
        subtopics: [
          {
            name: 'MapReduce',
            concepts: ['Map-Phase', 'Shuffle-Phase', 'Reduce-Phase', 'Combiner']
          },
          {
            name: 'Hadoop-Ökosystem',
            concepts: ['HDFS', 'YARN', 'Hive']
          }
        ]
      },
      {
        name: 'Stream-Verarbeitung',
        subtopics: [
          {
            name: 'Fensterung',
            concepts: ['Tumbling Window', 'Sliding Window', 'Session Window']
          },
          {
            name: 'Zustandsverwaltung',
            // The last entry has no name, so the server falls back to the id.
            concepts: ['Checkpointing', 'Watermarks', '@ID_FALLBACK@']
          }
        ]
      }
    ]
  },
  // Empty branch: chapter without topics.
  { name: 'Ausblick (noch nicht modelliert)', topics: [] },
  {
    name: 'Datenbanken',
    topics: [
      {
        name: 'NoSQL-Familien',
        subtopics: [
          {
            name: 'Key-Value und Wide-Column',
            concepts: ['Key-Value-Store', 'Wide-Column-Store', 'HBase']
          },
          {
            name: 'Dokument und Graph',
            concepts: ['Dokumentenspeicher', 'Graphdatenbank', 'Cypher']
          }
        ]
      }
    ]
  }
];

/**
 * Formats a number with two digits.
 * @param n: Number to format
 * @returns: The zero-padded number
 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Builds the mock tree with hierarchical ids like `BDT_CH01_T01_S01_C01`.
 * @returns: The forest with a single lecture root
 */
function buildTree(): DomainNode[] {
  const chapters: DomainNode[] = CHAPTERS.map((chapter, ci) => {
    const chapterId = `BDT_CH${pad(ci + 1)}`;
    const topics: DomainNode[] = chapter.topics.map((topic, ti) => {
      const topicId = `${chapterId}_T${pad(ti + 1)}`;
      const subtopics: DomainNode[] = topic.subtopics.map((sub, si) => {
        const subId = `${topicId}_S${pad(si + 1)}`;
        const concepts: DomainNode[] = sub.concepts.map((name, coi) => {
          const conceptId = `${subId}_C${pad(coi + 1)}`;
          return {
            id: conceptId,
            // Server-side fallback `name = name or id`.
            name: name === '@ID_FALLBACK@' ? conceptId : name,
            type: 'concept',
            children: []
          };
        });
        return {
          id: subId,
          name: sub.name,
          type: 'subtopic',
          children: concepts
        };
      });
      return {
        id: topicId,
        name: topic.name,
        type: 'topic',
        children: subtopics
      };
    });
    return {
      id: chapterId,
      name: chapter.name,
      type: 'chapter',
      children: topics
    };
  });

  return [
    {
      id: 'BDT',
      name: 'Big Data Technologien',
      type: 'lecture',
      children: chapters
    }
  ];
}

export const MOCK_TREE: DomainTreeResponse = { tree: buildTree() };

/**
 * Collects all concept nodes of the mock tree.
 * @returns: Concept nodes in tree order
 */
export function mockConcepts(): DomainNode[] {
  const out: DomainNode[] = [];
  const walk = (nodes: DomainNode[]): void => {
    for (const n of nodes) {
      if (n.type === 'concept') {
        out.push(n);
      } else {
        walk(n.children);
      }
    }
  };
  walk(MOCK_TREE.tree);
  return out;
}
