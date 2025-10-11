import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<null | { type: "success" | "error"; msg: string }>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (!message.trim()) return setStatus({ type: "error", msg: "Please enter a message." });
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message })
      });

      // Read text first so we can handle non-JSON or empty responses without throwing
      const text = await res.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          console.warn("/api/contact returned non-JSON response:", text);
          data = null;
        }
      }

      if (res.ok) {
        setStatus({ type: "success", msg: "Message sent — thank you!" });
        setName("");
        setEmail("");
        setMessage("");
      } else {
        const errMsg = data?.error || data?.message || text || "Failed to send message";
        setStatus({ type: "error", msg: errMsg });
      }
    } catch (err: any) {
      setStatus({ type: "error", msg: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="page-main">
        <h1 className="text-3xl font-bold mb-4">Contact</h1>
        <p className="mb-6 text-muted-foreground">If you have questions or feedback, we'd love to hear from you.</p>

        <section className="max-w-xl">
          <form className="space-y-4" onSubmit={submit}>
            <label className="block">
              <span className="text-sm font-medium">Name</span>
              <input value={name} onChange={e => setName(e.target.value)} type="text" className="mt-1 block w-full rounded-md border p-2" />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="mt-1 block w-full rounded-md border p-2" />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Message</span>
              <textarea value={message} onChange={e => setMessage(e.target.value)} className="mt-1 block w-full rounded-md border p-2" rows={6} />
            </label>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={loading} className="inline-flex items-center rounded bg-gradient-primary px-4 py-2 text-white disabled:opacity-60">
                {loading ? 'Sending...' : 'Send Message'}
              </button>
              {status && (
                <p className={`${status.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{status.msg}</p>
              )}
            </div>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Contact;
