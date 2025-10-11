import React from 'react';

const Privacy = () => {
  return (
    <main className="page-main max-w-4xl mx-auto py-20 px-4">
      <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-4">
        This is a minimal, developer-focused privacy policy placeholder. Update this page with your full privacy policy text before publishing.
      </p>

      <section className="space-y-3">
        <p>
          We do not collect personal information unless you submit it via the contact form. If you provide an email address it will only be used to reply to your inquiry.
        </p>
        <p>
          The application may temporarily store download metadata and files on the server for debugging and user convenience. Remove or limit storage in production as required by law.
        </p>
      </section>
    </main>
  );
};

export default Privacy;
