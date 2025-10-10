// src/components/downloaderForm.tsx
import { useState } from "react";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface BackendFormat {
  quality?: string | null;    // qualityLabel or null
  container?: string | null;
  hasAudio?: boolean;
  hasVideo?: boolean;
  itag?: number | string;
}

interface VideoResult {
  title: string;
  thumbnail: string;
  formats: BackendFormat[];
  author?: string;
  lengthSeconds?: string;
  viewCount?: string;
  description?: string;
}

const BACKEND = (import.meta.env.VITE_BACKEND_URL as string) || "http://localhost:3000";

const DownloaderForm = () => {
  const [url, setUrl] = useState("");
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [selectedItag, setSelectedItag] = useState<string | number | null>("highest");

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

    setLoadingInfo(true);
    setResult(null);
    setSelectedItag("highest");

    try {
      const res = await fetch(`${BACKEND}/api/video-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || res.statusText);
      }

      const json = await res.json();

      // Map backend formats to the shape we use in UI
      const formats: BackendFormat[] = (json.formats || []).map((f: any) => ({
        quality: f.quality || (f.qualityLabel ?? null),
        container: f.container ?? null,
        hasAudio: f.hasAudio ?? null,
        hasVideo: f.hasVideo ?? null,
        itag: f.itag ?? null,
      }));

      setResult({
        title: json.title ?? "Unknown title",
        thumbnail: json.thumbnail ?? "https://source.unsplash.com/random/400x300/?video",
        formats,
        author: json.author,
        lengthSeconds: json.lengthSeconds,
        viewCount: json.viewCount,
        description: json.description,
      });

      // Prefer selecting the highest available itag if present
      if (formats.length > 0) {
        // pick first format with hasVideo & hasAudio or fallback to first
        const preferred = formats.find(f => f.hasVideo && f.hasAudio) || formats[0];
        setSelectedItag(preferred.itag ?? "highest");
      }

      toast.success("Video information retrieved!");
    } catch (err: any) {
      console.error("video-info error", err);
      toast.error("Failed to fetch video info: " + (err.message || err));
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDownload = async () => {
    if (!url) {
      toast.error("Missing URL");
      return;
    }

    if (!selectedItag) {
      toast.error("Please pick a format");
      return;
    }

    setDownloading(true);
    try {
      // When backend expects quality string, we send the itag if available (safer),
      // otherwise send 'highest'
      const qualityParam = selectedItag ?? "highest";

      const res = await fetch(`${BACKEND}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, quality: qualityParam }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || res.statusText);
      }

      const disposition = res.headers.get("Content-Disposition") || "";
      // try to extract filename from disposition
      let filename = "video.mp4";
      const match = /filename\*?=.*?''?([^;"]+)/i.exec(disposition);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      } else {
        // fallback to title if available
        filename = (result?.title ?? "video").replace(/[\/\\?%*:|"<>]/g, "") + ".mp4";
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);

      toast.success("Download started");
    } catch (err: any) {
      console.error("download error", err);
      toast.error("Download failed: " + (err.message || err));
    } finally {
      setDownloading(false);
    }
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
                disabled={loadingInfo}
                className="h-12 px-8 bg-gradient-primary hover:opacity-90"
              >
                {loadingInfo ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Get Info
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
                  <div className="text-sm text-muted-foreground mt-2">
                    {result.author && <div>By {result.author}</div>}
                    {result.viewCount && <div>{result.viewCount} views</div>}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Select Quality:</label>

                <Select
                  value={String(selectedItag ?? "")}
                  onValueChange={(val) => {
                    setSelectedItag(val || null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(() => {
                        if (!result.formats || result.formats.length === 0) return "No formats";
                        const sel = result.formats.find((f) => String(f.itag) === String(selectedItag));
                        return sel ? `${sel.quality ?? sel.itag} ${sel.container ? `(${sel.container})` : ""}` : "Select format";
                      })()}
                    </SelectValue>
                  </SelectTrigger>

                  <SelectContent>
                    {/* Offer a Highest/Lowest convenience option */}
                    <SelectItem value={"highest"}>Highest quality</SelectItem>
                    <SelectItem value={"lowest"}>Lowest quality</SelectItem>
                    {result.formats.map((format) => (
                      <SelectItem key={String(format.itag)} value={String(format.itag)}>
                        {format.quality ?? String(format.itag)} {format.container ? `- ${format.container}` : ""} {format.hasAudio === false ? "(video only)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleDownload}
                  className="w-full h-12 bg-gradient-primary hover:opacity-90"
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <>
                      <Download className="w-5 h-5 mr-2" />
                      Download
                    </>
                  )}
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
