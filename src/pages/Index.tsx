import Header from "@/components/Header";
import Hero from "@/components/Hero";
import DownloaderForm from "@/components/DownloaderForm";
import Features from "@/components/Features";
import InfoSections from "@/components/InfoSections";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <DownloaderForm />
        <Features />
        <InfoSections />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
