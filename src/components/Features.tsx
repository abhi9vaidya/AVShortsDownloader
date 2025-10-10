import { Zap, Infinity, Shield, Sparkles, User, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Download your favorite shorts in seconds with our optimized infrastructure",
  },
  {
    icon: Infinity,
    title: "No Limits",
    description: "Download as many videos as you want. No restrictions or quotas",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "Your downloads are private. We don't store your data or track your activity",
  },
  {
    icon: Sparkles,
    title: "Quality Selection",
    description: "Choose from multiple quality options including 360p, 720p, 1080p, and MP3",
  },
  {
    icon: User,
    title: "User-Friendly",
    description: "Simple interface that works seamlessly on desktop and mobile devices",
  },
  {
    icon: DollarSign,
    title: "100% Free",
    description: "No hidden costs, no subscriptions. Completely free to use forever",
  },
];

const Features = () => {
  return (
    <section className="py-20 px-4 bg-gradient-hero">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4">Why Choose Us?</h2>
          <p className="text-xl text-muted-foreground">
            The best YouTube Shorts downloader with powerful features
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="p-6 hover:shadow-xl transition-all duration-300 hover:scale-105 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
