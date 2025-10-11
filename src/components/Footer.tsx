import { Play, Mail, Twitter, Facebook, Instagram } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                <Play className="w-5 h-5 text-primary-foreground fill-current" />
              </div>
              <span className="text-xl font-bold">ShortsDownloader</span>
            </div>
            <p className="text-sm text-background/70">
              The fastest and most reliable YouTube Shorts downloader.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm text-background/70">
              <li><Link to="/" className="hover:text-background transition-colors">Home</Link></li>
              <li><Link to="/about" className="hover:text-background transition-colors">About</Link></li>
              <li><Link to="/contact" className="hover:text-background transition-colors">Contact</Link></li>
              <li><a href="/#faq" className="hover:text-background transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-background/70">
              <li><Link to="/privacy" className="hover:text-background transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-background transition-colors">Terms of Service</Link></li>
              <li><Link to="/dmca" className="hover:text-background transition-colors">DMCA</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Connect</h3>
            <div className="flex gap-4">
              <a href="https://x.com/Abhi9_15" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="https://www.instagram.com/abhi9.1535/" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="https://mail.google.com/mail/?view=cm&fs=1&to=abhinavaidya1535@gmail.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-background/20 pt-8">
          <p className="text-center text-sm text-background/70">
            © 2025 ShortsDownloader. All rights reserved.
          </p>
          <p className="text-center text-xs text-background/60 mt-2">
            ⚠️ Disclaimer: Downloads are for personal use only. Please respect content creators' rights and YouTube's terms of service.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
