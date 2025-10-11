import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-[#0b1220] dark:to-[#071021]">
      <Header />

      <main className="page-main">
        {/* Hero */}
        <section className="rounded-lg bg-gradient-hero p-8 shadow-md mb-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-extrabold mb-4">About ShortsDownloader</h1>
            <p className="text-lg text-muted-foreground mb-6">
              A lightweight tool to save and manage short-form videos quickly and privately. Built for speed, simplicity and respect for creators.
            </p>
            <div className="flex justify-center gap-3">
              <Link to="/contact" className="inline-flex items-center rounded bg-gradient-primary px-4 py-2 text-white">
                Contact
              </Link>
              <a href="#features" className="inline-flex items-center rounded border px-4 py-2">
                Learn More
              </a>
            </div>
          </div>
        </section>

        {/* Mission + How it works */}
        <section className="grid gap-8 md:grid-cols-2 mb-12">
          <div>
            <h2 className="text-2xl font-bold mb-3">Our Mission</h2>
            <p className="text-muted-foreground">
              Make it effortless for users to keep offline copies of short videos for
              personal use. We prioritise a fast, minimal UI, and avoid unnecessary
              tracking or data collection.
            </p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-start gap-3">
                <span className="text-primary-foreground font-semibold">Privacy</span>
                <span className="text-muted-foreground">We don't collect more data than necessary.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-foreground font-semibold">Speed</span>
                <span className="text-muted-foreground">Optimized for quick downloads with smart fallbacks.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-foreground font-semibold">Simplicity</span>
                <span className="text-muted-foreground">Easy to use interface focused on the essentials.</span>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-3">How it works</h2>
            <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
              <li>Paste the Shorts or video URL into the downloader.</li>
              <li>The server chooses the best available stream and provides a direct download.</li>
              <li>If streaming fails, a robust fallback downloads and serves a merged file.</li>
            </ol>
            <p className="mt-4 text-muted-foreground">Built with reliability in mind: multiple download strategies and local server storage are available.</p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Key features</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4 shadow-sm bg-card">
              <h3 className="font-semibold mb-2">Fast Downloads</h3>
              <p className="text-sm text-muted-foreground">Optimized streaming with fallback to yt-dlp for higher success rates.</p>
            </div>
            <div className="rounded-lg border p-4 shadow-sm bg-card">
              <h3 className="font-semibold mb-2">Audio Extraction</h3>
              <p className="text-sm text-muted-foreground">Save audio-only versions when you only need the soundtrack.</p>
            </div>
            <div className="rounded-lg border p-4 shadow-sm bg-card">
              <h3 className="font-semibold mb-2">Local Storage</h3>
              <p className="text-sm text-muted-foreground">Optionally download to the server and manage saved files via the dashboard.</p>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Meet the team</h2>
          <div className="max-w-2xl">
            <div className="flex items-center gap-4 rounded-lg border p-6 bg-card">
              <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-xl">
                AV
              </div>
              <div>
                <h3 className="text-lg font-semibold">Abhinav Vaidya</h3>
                <p className="text-sm text-muted-foreground">Founder & sole maintainer. I'm the developer behind ShortsDownloader — I build the frontend, backend and tooling, and I enjoy keeping this project lean and focused.</p>
                <p className="mt-2 text-sm">If you have feedback or want to collaborate, <Link to="/contact" className="text-primary-foreground underline">get in touch</Link>.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-8">
          <h3 className="text-xl font-semibold mb-3">Ready to try it?</h3>
          <p className="text-muted-foreground mb-4">Head over to the downloader and paste a Shorts link to get started.</p>
          <Link to="/" className="inline-flex items-center rounded bg-gradient-primary px-4 py-2 text-white">Go to Downloader</Link>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
