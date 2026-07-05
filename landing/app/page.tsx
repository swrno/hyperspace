import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import TrustStrip from '@/components/TrustStrip';
import ValueProps from '@/components/ValueProps';
import Showcase from '@/components/Showcase';
import Stats from '@/components/Stats';
import Pipeline from '@/components/Pipeline';
import Bento from '@/components/Bento';
import Connectors from '@/components/Connectors';
import Story from '@/components/Story';
import Faq from '@/components/Faq';
import FinalCta from '@/components/FinalCta';
import Included from '@/components/Included';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <ValueProps />
        <Showcase />
        <Stats />
        <Pipeline />
        <Bento />
        <Connectors />
        <Story />
        <Faq />
        <FinalCta />
        <Included />
      </main>
      <Footer />
    </>
  );
}
