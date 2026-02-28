export type VocabularyEntry = {
  term: string;
  definition: string;
  example: string;
};

const ENTRIES: VocabularyEntry[] = [
  {
    term: 'evidence',
    definition: 'Information that supports a claim or conclusion.',
    example: 'Use a quote from the text as evidence for your answer.'
  },
  {
    term: 'claim',
    definition: 'A statement you believe is true and can support.',
    example: 'Your claim is that renewable energy should be expanded.'
  },
  {
    term: 'reasoning',
    definition: 'The logic that connects your evidence to your claim.',
    example: 'Reasoning explains why your evidence proves your point.'
  },
  {
    term: 'analyze',
    definition: 'To examine something carefully in detail.',
    example: 'Analyze the graph before answering the question.'
  },
  {
    term: 'infer',
    definition: 'To figure out something from clues and context.',
    example: 'You can infer the character is upset from the dialogue.'
  },
  {
    term: 'hypothesis',
    definition: 'A testable prediction about what might happen.',
    example: 'Our hypothesis is that plants grow faster with more light.'
  },
  {
    term: 'variable',
    definition: 'A factor in an experiment that can change.',
    example: 'Temperature was the independent variable.'
  },
  {
    term: 'context',
    definition: 'The surrounding details that help explain meaning.',
    example: 'Read the sentence in context before defining the word.'
  },
  {
    term: 'contrast',
    definition: 'To explain how things are different.',
    example: 'Contrast the two solutions in your response.'
  },
  {
    term: 'synthesize',
    definition: 'To combine ideas from multiple sources into one understanding.',
    example: 'Synthesize notes from both articles into one summary.'
  }
];

const LOOKUP = new Map(ENTRIES.map((item) => [item.term.toLowerCase(), item]));

export function findVocabularyEntry(word: string) {
  return LOOKUP.get(word.toLowerCase()) || null;
}
