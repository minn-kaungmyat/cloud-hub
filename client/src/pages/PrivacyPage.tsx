import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const PrivacyPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 text-zinc-300 font-sans overflow-hidden">
      <header className="h-12 border-b border-zinc-800/60 flex items-center px-4 shrink-0 bg-zinc-950 z-10">
        <div className="font-semibold text-zinc-200 flex items-center gap-2">
          <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center text-[10px] text-zinc-950 font-bold">
            C
          </div>
          CloudHub
        </div>
        <div className="mx-3 text-zinc-700">/</div>
        <div className="text-sm text-zinc-400">Privacy Policy</div>
        
        <div className="ml-auto">
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2">
            Return to App
            <span className="bg-zinc-800 border border-zinc-700 rounded-sm px-1.5 py-0.5 text-[10px] font-mono tabular-nums">Esc</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-4xl mx-auto px-8 py-8 pb-16">
          <div className="mb-8 border-b border-zinc-800/60 pb-4">
            <h1 className="text-lg font-medium text-zinc-100">Privacy Policy</h1>
            <p className="text-zinc-500 text-xs font-mono mt-1 mb-4">Last updated: August 2026</p>
            <p className="text-sm text-zinc-300 leading-relaxed border-l-2 border-accent pl-3 py-1">
              CloudHub is designed so your files remain with your cloud providers. We only store the minimum information necessary to securely connect your accounts and provide our services.
            </p>
          </div>

          <div className="space-y-10">
            {/* TLDR Section */}
            <section>
              <h2 className="text-sm font-medium text-accent mb-3 uppercase tracking-wider">00. Privacy-First Design</h2>
              <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                CloudHub is built with privacy in mind. We minimize data collection, do not know your passwords, and do not sell your personal information. We act as a secure pass-through proxy to your existing cloud providers.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-zinc-800/60 pt-4">
                <div>
                  <div className="text-sm font-medium text-zinc-200 mb-1">No Permanent File Storage</div>
                  <div className="text-xs text-zinc-500">We do not permanently store copies of your files.</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 mb-1">No Passwords</div>
                  <div className="text-xs text-zinc-500">Authentication is handled directly by your providers.</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-200 mb-1">No Data Selling</div>
                  <div className="text-xs text-zinc-500">We do not sell personal info or use metadata to train AI.</div>
                </div>
              </div>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">01. What We Store (The "Need to Know")</h2>
              <p className="text-xs text-zinc-400 mb-4">
                To provide lightning-fast search and a unified view of all your files, we must store the absolute minimum metadata required.
              </p>
              <div className="border border-zinc-800/60 rounded-sm divide-y divide-zinc-800/60 bg-zinc-950">
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Encrypted Tokens</div>
                  <div className="text-sm text-zinc-500">We securely store encrypted OAuth access and refresh tokens so you don't need to authenticate with your cloud providers every time you use CloudHub. These tokens are encrypted at rest using industry-standard encryption.</div>
                </div>
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Account Metadata</div>
                  <div className="text-sm text-zinc-500">Your email address and provider ID are stored simply to link your accounts together.</div>
                </div>
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">File Metadata</div>
                  <div className="text-sm text-zinc-500">File names, IDs, MIME types, sizes, and thumbnail URLs required to power fast search across your connected providers.</div>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">02. What We NEVER Store</h2>
              <p className="text-xs text-zinc-400 mb-4">
                CloudHub is designed to minimize the sensitive data we collect and store.
              </p>
              <div className="border border-zinc-800/60 rounded-sm divide-y divide-zinc-800/60 bg-zinc-950">
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Actual File Content</div>
                  <div className="text-sm text-zinc-500">CloudHub does not permanently store copies of your files. Most file transfers are streamed directly between your device and your connected cloud provider. In limited cases, such as file uploads, temporary server-side storage may be used solely to process your request. Any temporary files are automatically deleted once the operation is complete.</div>
                </div>
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Passwords</div>
                  <div className="text-sm text-zinc-500">CloudHub never receives or stores your cloud provider passwords. Authentication is handled directly by Google, Microsoft, Dropbox, and other providers using OAuth 2.0.</div>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">03. Security Practices</h2>
              <div className="pl-4 border-l border-accent py-1 mb-3">
                <p className="text-sm text-zinc-300 leading-relaxed font-mono text-xs">
                  "CloudHub requires standard OAuth 2.0 access and refresh tokens to maintain a continuous connection to your cloud providers without requiring repeated logins. Authentication tokens are encrypted at rest using industry-standard encryption. Encryption keys are stored separately from application data and access is strictly limited."
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                By isolating encryption keys from the database, this architecture significantly reduces the impact of unauthorized database access.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">04. How We Use Your Information</h2>
              <p className="text-xs text-zinc-400 mb-4">
                The metadata we collect is used strictly for operational purposes.
              </p>
              <div className="border border-zinc-800/60 rounded-sm divide-y divide-zinc-800/60 bg-zinc-950">
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Service Delivery</div>
                  <div className="text-sm text-zinc-500">To render your file system interface and execute cross-platform search queries across your connected accounts.</div>
                </div>
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Authentication</div>
                  <div className="text-sm text-zinc-500">To keep you securely logged in and communicate directly with the cloud APIs you authorize.</div>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">05. Third-Party Services</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                CloudHub integrates directly with APIs provided by Google (Google Drive), Microsoft (OneDrive), and Dropbox. Your use of these integrations is additionally subject to the respective privacy policies of these third-party services. We do not share your metadata or authentication tokens with any external marketing, advertising, or analytics services.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">06. Cookies & Tracking</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                We utilize minimal functional cookies and local storage mechanisms strictly necessary for maintaining your active session and preserving UI preferences (such as dark mode or grid layouts). We do not use third-party advertising cookies or cross-site tracking technologies.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">07. Data Retention</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Metadata corresponding to a connected cloud account is retained only for as long as that account remains linked to CloudHub. Upon disconnecting a provider from the Settings panel, all associated metadata and authentication tokens for that provider are permanently expunged from our databases. When you delete your CloudHub account, we schedule your associated data for permanent deletion in accordance with our data retention procedures.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">08. Your Rights (GDPR/CCPA)</h2>
              <p className="text-xs text-zinc-400 mb-4">
                Depending on your jurisdiction, you retain specific rights regarding your personal data:
              </p>
              <div className="border border-zinc-800/60 rounded-sm divide-y divide-zinc-800/60 bg-zinc-950">
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Right to Access</div>
                  <div className="text-sm text-zinc-500">You may request a copy of the metadata we have stored regarding your account.</div>
                </div>
                <div className="flex flex-col sm:flex-row px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                  <div className="w-48 shrink-0 text-sm font-medium text-zinc-300">Right to Erasure</div>
                  <div className="text-sm text-zinc-500">You may request the deletion of all personal data associated with your account. This is self-serviceable via account deletion.</div>
                </div>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">09. Changes to This Policy</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                We may revise this Privacy Policy periodically to reflect changes in our practices or regulatory requirements. Any substantive modifications will be communicated via an in-app notification prior to taking effect. Continued use of CloudHub after such changes constitutes acknowledgment of the revised policy.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-sm font-medium text-zinc-200 mb-3 border-b border-zinc-800/60 pb-2">10. Contact Us</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                For inquiries, data requests, or concerns regarding these privacy practices, please contact our security and compliance team at <span className="font-mono text-[11px] text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">support@cloudhub.dev</span>.
              </p>
            </section>
          </div>
          
          <div className="mt-12 pt-6 border-t border-zinc-800/60">
            <p className="text-[10px] font-mono text-zinc-600 text-center uppercase tracking-widest">
              CloudHub Security Team
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPage;
