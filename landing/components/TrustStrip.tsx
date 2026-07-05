import {
  CogneeLogo,
  LangGraphLogo,
  GroqLogo,
  Neo4jLogo,
  MongoLogo,
  FirebaseLogo,
} from './StackLogos';

const STACK = [
  { name: 'Cognee', Logo: CogneeLogo },
  { name: 'LangGraph', Logo: LangGraphLogo },
  { name: 'Groq', Logo: GroqLogo },
  { name: 'Neo4j', Logo: Neo4jLogo },
  { name: 'MongoDB', Logo: MongoLogo },
  { name: 'Firebase', Logo: FirebaseLogo },
];

export default function TrustStrip() {
  return (
    <section className="border-y border-cream-200 bg-white py-10">
      <div className="shell">
        <p className="text-center text-[13px] text-ink-400">
          Built on trusted open infrastructure
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {STACK.map(({ name, Logo }) => (
            <span key={name} className="flex items-center gap-2">
              <Logo className="h-5 w-5" />
              <span className="font-display text-[17px] font-medium tracking-tight text-ink-600">
                {name}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
