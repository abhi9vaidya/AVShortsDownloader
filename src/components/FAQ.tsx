import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Is it free to download YouTube Shorts?",
    answer: "Yes! Our service is completely free with no hidden costs or subscriptions. Download as many videos as you want.",
  },
  {
    question: "Do I need to create an account?",
    answer: "No account needed! Simply paste the URL and download. We value your privacy and don't require registration.",
  },
  {
    question: "What video quality options are available?",
    answer: "We offer multiple quality options including 360p, 720p, 1080p for video, and MP3 for audio-only downloads.",
  },
  {
    question: "Is it legal to download YouTube videos?",
    answer: "Downloading videos for personal use is generally acceptable, but redistributing copyrighted content is not. Always respect creators' rights and YouTube's terms of service.",
  },
  {
    question: "Can I download Shorts on mobile devices?",
    answer: "Yes! Our downloader works perfectly on all devices including smartphones, tablets, and desktop computers.",
  },
  {
    question: "Why isn't my download working?",
    answer: "Common issues include invalid URLs, private videos, or age-restricted content. Make sure you're using a valid YouTube Shorts URL. For actual downloads, backend deployment is required.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-20 px-4 bg-background">
      <div className="container mx-auto max-w-3xl">
        <h2 className="text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border rounded-lg px-6 bg-card"
            >
              <AccordionTrigger className="text-left hover:no-underline">
                <span className="font-semibold">{faq.question}</span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

export default FAQ;
