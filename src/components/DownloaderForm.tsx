import { useState } from "react";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface VideoResult {
  title: string;
  thumbnail: string;
  formats: Array<{
    quality: string;
    size: string;
    url: string;
  }>;
}

const DownloaderForm = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState("720p");

  const validateUrl = (url: string) => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/shorts\/|youtu\.be\/)[a-zA-Z0-9_-]+/;
    return regex.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url) {
      toast.error("Please enter a YouTube Shorts URL");
      return;
    }

    if (!validateUrl(url)) {
      toast.error("Please enter a valid YouTube Shorts URL");
      return;
    }

    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      setResult({
        title: "Sample YouTube Short Video",
        thumbnail: "https://source.unsplash.com/random/400x300/?video",
        formats: [
          { quality: "360p", size: "3.2 MB", url: "#" },
          { quality: "720p", size: "8.5 MB", url: "#" },
          { quality: "1080p", size: "15.8 MB", url: "#" },
          { quality: "MP3", size: "2.1 MB", url: "#" },
        ],
      });
      setLoading(false);
      toast.success("Video information retrieved!");
    }, 2000);
  };

  const handleDownload = () => {
    toast.info("Note: Backend deployment required for actual downloads. This is a UI demonstration.");
  };

  return (
    <section id="downloader" className="py-20 px-4 bg-background">
      <div className="container mx-auto max-w-3xl">
        <Card className="p-8 shadow-xl border-2">
          <h2 className="text-3xl font-bold text-center mb-8 text-foreground">
            Download YouTube Shorts
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Paste YouTube Shorts URL (e.g., https://youtube.com/shorts/abc123)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 h-12 text-base"
              />
              <Button 
                type="submit" 
                disabled={loading}
                className="h-12 px-8 bg-gradient-primary hover:opacity-90"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Download
                  </>
                )}
              </Button>
            </div>
          </form>

          {result && (
            <div className="mt-8 animate-scale-in">
              <div className="flex gap-4 items-start mb-6">
                <img 
                  src={result.thumbnail} 
                  alt={result.title}
                  className="w-32 h-32 rounded-lg object-cover"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">{result.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Ready to download
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Select Quality:</label>
                <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {result.formats.map((format) => (
                      <SelectItem key={format.quality} value={format.quality}>
                        {format.quality} - {format.size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button 
                  onClick={handleDownload}
                  className="w-full h-12 bg-gradient-primary hover:opacity-90"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download {selectedFormat}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          ⚠️ Downloads are for personal use only. Please respect creators' rights and YouTube's terms of service.
        </p>
      </div>
    </section>
  );
};

export default DownloaderForm;
