// Example scripts for each template. Used to test the look of the videos and the checks on AI-written scripts.
const common = {accent: 0, music: 0, brand: 'Zeecomedia Tech', cta: 'Follow for daily coding tips'};

export const SAMPLES = {
  tips: {
    ...common,
    template: 'tips',
    label: 'Coding tip',
    hook: '4 habits that make you a faster developer',
    items: [
      {heading: 'Read the error message', detail: 'Most bugs explain themselves in the first line of the error.'},
      {heading: 'Commit small and often', detail: 'Small commits are easy to review and easy to undo.'},
      {heading: 'Name things clearly', detail: 'A good name removes the need for a comment.'},
      {heading: 'Write the test first when stuck', detail: 'A failing test turns a vague problem into a clear target.'}
    ]
  },
  myth: {
    ...common,
    accent: 1,
    music: 1,
    template: 'myth',
    label: 'Myth vs fact',
    hook: 'Three myths about learning to code',
    pairs: [
      {myth: 'You need to be good at math to code', fact: 'Most everyday programming needs logic and patience, not advanced math.'},
      {myth: 'You must memorize all the syntax', fact: 'Developers look things up every day. Understanding matters more.'}
    ]
  },
  code: {
    ...common,
    accent: 2,
    music: 2,
    template: 'code',
    label: 'Python tip',
    hook: 'Stop looping to build a list',
    language: 'python',
    code: 'squares = []\nfor n in range(5):\n    squares.append(n * n)\n\n# or in one line\nsquares = [n * n for n in range(5)]\nprint(squares)',
    steps: [
      {line: 2, text: 'The long way: loop, then append each value.'},
      {line: 6, text: 'A list comprehension does the same in one line.'},
      {line: 7, text: 'Both print [0, 1, 4, 9, 16].'}
    ]
  },
  versus: {
    ...common,
    accent: 3,
    music: 0,
    template: 'versus',
    label: 'Which one?',
    hook: 'Tabs or spaces for indentation?',
    question: 'Which side are you on?',
    a: {label: 'Tabs', points: ['One character per level', 'Each person picks the width']},
    b: {label: 'Spaces', points: ['Looks the same everywhere', 'Most style guides choose it']}
  }
};
