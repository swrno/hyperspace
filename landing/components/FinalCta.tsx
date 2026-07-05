import Reveal from './Reveal';
import GradientArt from './GradientArt';
import { DOCS_URL, SIGNUP_URL } from '@/lib/site';

export default function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="shell">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0">
              <GradientArt id="cta" variant="dusk" />
            </div>

            <div className="relative flex items-center justify-center px-4 py-16 sm:py-24">
              <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-lift sm:p-10">
                <h2 className="display-lg text-ink">See hyperspace in action</h2>
                <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink-500">
                  Connect GitHub and Google Docs, watch Cognee build the graph, and ask your
                  first cross-tool question in minutes.
                </p>
                <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a href={SIGNUP_URL} className="btn-bump-gold !px-6 !py-3 !text-[15px]">
                    Get started free
                  </a>
                  <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-bump-accent !px-6 !py-3 !text-[15px]"
                  >
                    Read the docs
                  </a>
                </div>
                <p className="mt-6 text-[12.5px] text-ink-400">
                  No credit card required · Your graph is ready in minutes
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
