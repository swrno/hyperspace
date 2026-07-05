const STACK = ['Cognee', 'LangGraph', 'Groq', 'Neo4j', 'MongoDB', 'Firebase'];

export default function TrustStrip() {
  return (
    <section className="border-y border-cream-200 bg-white py-10">
      <div className="shell">
        <p className="text-center text-[13px] text-ink-400">
          Built on trusted open infrastructure
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {STACK.map((name) => (
            <span
              key={name}
              className="font-display text-lg font-medium tracking-tight text-ink-300"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
