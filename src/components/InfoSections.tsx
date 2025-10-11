import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

const InfoSections = () => {
  return (
    <section className="py-20 px-4 bg-background">
      <div className="container mx-auto max-w-6xl space-y-20">
        {/* What is YouTube Shorts */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-in">
            <h2 className="text-3xl font-bold mb-4">What is YouTube Shorts?</h2>
            <p className="text-muted-foreground mb-4">
              YouTube Shorts is a short-form video feature that allows creators to produce 
              vertical videos up to 60 seconds long. Similar to TikTok and Instagram Reels, 
              Shorts has become one of the most popular content formats on YouTube.
            </p>
            <p className="text-muted-foreground mb-4">
              With billions of daily views, YouTube Shorts offers creators a powerful way to 
              reach new audiences and engage viewers with quick, entertaining content.
            </p>
            <p className="text-muted-foreground">
              Our downloader makes it easy to save your favorite Shorts for offline viewing, 
              sharing with friends, or creating compilations.
            </p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=800&q=80"
            alt="YouTube Shorts on mobile device"
            className="rounded-xl shadow-xl animate-scale-in"
          />
        </div>

        {/* How to Download */}
        <div>
          <h2 className="text-3xl font-bold mb-12 text-center">How to Download YouTube Shorts</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: 1,
                title: "Copy the URL",
                description: "Find the YouTube Short you want to download and copy its URL from the address bar or share button",
              },
              {
                step: 2,
                title: "Paste & Process",
                description: "Paste the URL into our downloader form and click 'Download Now' to process the video",
              },
              {
                step: 3,
                title: "Download & Enjoy",
                description: "Choose your preferred quality and click download. Your video will be saved to your device",
              },
            ].map((item) => (
              <Card key={item.step} className="p-6 text-center hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* How to Make YouTube Shorts */}
        <div className="bg-gradient-hero rounded-2xl p-8 md:p-12">
          <h2 className="text-3xl font-bold mb-8 text-center">How to Create YouTube Shorts</h2>
          <div className="space-y-4">
            {[
              "Open the YouTube mobile app and tap the '+' button",
              "Select 'Create a Short' from the menu",
              "Record your video (up to 60 seconds) or upload from gallery",
              "Add text, filters, and music to enhance your Short",
              "Write a catchy title and add relevant hashtags",
              "Click 'Upload' and share your Short with the world!",
            ].map((step, index) => (
              <div key={index} className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default InfoSections;
