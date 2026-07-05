import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Reveal from '@/components/Reveal';
import GradientArt from '@/components/GradientArt';
import GlowCard, { type GlowVariant } from '@/components/GlowCard';
import { FEATURES, FEATURE_SLUGS, getFeature } from '@/lib/features';
import { APP_URL, DOCS_URL, SIGNUP_URL } from '@/lib/site';

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FEATURE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) return {};
  return {
    title: `${feature.name} | hyperspace`,
    description: feature.description,
  };
}

const DETAIL_GLOWS: GlowVariant[] = ['gold', 'cream', 'deep'];

export default async function FeaturePage({ params }: PageProps) {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) notFound();

  const others = FEATURES.filter((f) => f.slug !== feature.slug).slice(0, 4);

  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="pb-12 pt-36 sm:pt-44">
          <div className="shell">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow">{feature.category}</p>
              <h1 className="display-xl mt-4 text-ink">{feature.headline}</h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
                {feature.description}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a href={SIGNUP_URL} className="btn-bump-gold !px-6 !py-3 !text-[15px]">
                  Open {feature.name}
                  <ArrowRight className="h-4 w-4" />
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
            </div>

            {/* Gradient banner */}
            <div className="relative mt-14 overflow-hidden rounded-3xl">
              <div className="absolute inset-0">
                <GradientArt id={`feature-${feature.slug}`} variant={feature.variant} />
              </div>
              <div className="relative flex min-h-[280px] items-center justify-center px-4 py-14 sm:min-h-[340px]">
                <div className="w-full max-w-xl rounded-2xl bg-white p-6 text-center shadow-lift sm:p-8">
                  <p className="font-mono text-[13px] text-ink-600 sm:text-[14px]">
                    {feature.bannerLine}
                  </p>
                  <p className="mt-2 text-[12px] text-ink-400">
                    {feature.name} · live inside the hyperspace app
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Detail cards, dark band */}
        <section className="bg-night py-16 sm:py-20">
          <div className="shell">
            <div className="grid gap-3 lg:grid-cols-3">
              {feature.details.map((d, i) => (
                <Reveal key={d.title} delay={i * 60} className="h-full">
                  <GlowCard glow={DETAIL_GLOWS[i % DETAIL_GLOWS.length]} className="h-full">
                    <div className="flex h-full flex-col p-6 sm:p-7">
                      <span className="block h-px w-8 bg-gold" aria-hidden="true" />
                      <h2 className="mt-4 font-display text-lg font-medium text-cream-50">
                        {d.title}
                      </h2>
                      <p className="mt-2 text-[13.5px] leading-relaxed text-night-soft">
                        {d.blurb}
                      </p>
                    </div>
                  </GlowCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* More of the product */}
        <section className="py-16 sm:py-20">
          <div className="shell">
            <div className="flex items-end justify-between gap-4">
              <h2 className="display-md text-ink">More of the product</h2>
              <a
                href={APP_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ink-500 transition hover:text-ink"
              >
                Open the app
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((f) => (
                <a
                  key={f.slug}
                  href={`/features/${f.slug}`}
                  className="group card flex h-full flex-col justify-between gap-6 p-5 transition duration-200 hover:border-cream-400"
                >
                  <div>
                    <h3 className="font-display text-[15px] font-medium text-ink">{f.name}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                      {f.headline}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:text-ink" />
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
