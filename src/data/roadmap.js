import phase0 from './topics/phase0/index.js'
import phase1 from './topics/phase1/index.js'
import phase2 from './topics/phase2/index.js'
import phase3 from './topics/phase3/index.js'
import phase4 from './topics/phase4/index.js'

export const phases = [
  {
    id: 'phase0',
    number: 0,
    emoji: '🌐',
    title: 'Computer Networks Foundations',
    tagline: 'How bytes actually travel — the bedrock of every system you will design',
    weeks: '~2.5 weeks',
    topics: phase0,
  },
  {
    id: 'phase1',
    number: 1,
    emoji: '⚙️',
    title: 'Operating System Basics',
    tagline: 'What a single machine can do — processes, memory, and I/O',
    weeks: '~2 weeks',
    topics: phase1,
  },
  {
    id: 'phase2',
    number: 2,
    emoji: '🧱',
    title: 'System Design Building Blocks',
    tagline: 'The LEGO bricks: load balancers, caches, databases, queues',
    weeks: '~5 weeks',
    topics: phase2,
  },
  {
    id: 'phase3',
    number: 3,
    emoji: '🕸️',
    title: 'Distributed Systems & Advanced Topics',
    tagline: 'Consensus, failure, and the tricks that make planet-scale systems work',
    weeks: '~3.5 weeks',
    topics: phase3,
  },
  {
    id: 'phase4',
    number: 4,
    emoji: '🏆',
    title: 'Design Problem Gauntlet',
    tagline: 'The classics, end to end — practice like the real interview',
    weeks: '~4 weeks',
    topics: phase4,
  },
]

export const allTopics = phases.flatMap((p) => p.topics)
