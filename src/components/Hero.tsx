import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Hero = () => {
  const scrollToDownloader = () => {
    document.getElementById('downloader')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="bg-gradient-hero pt-20 pb-32 px-4">
      <div className="container mx-auto max-w-4xl text-center">
        <div className="animate-fade-in">
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 leading-tight">
            Download YouTube Shorts
            <span className="block bg-gradient-primary bg-clip-text text-transparent">
              Fast & Secure
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Save your favorite YouTube Shorts videos in high quality. 
            Free, fast, and no registration required.
            Dilo ka shooter, hai mera scooter :))
          </p>
          
          <Button 
            onClick={scrollToDownloader}
            size="lg" 
            className="bg-gradient-primary hover:opacity-90 transition-all hover:shadow-xl hover:scale-105 text-lg px-8 py-6 h-auto"
          >
            Download Now
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
