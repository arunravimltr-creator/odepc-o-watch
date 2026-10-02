import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [framed, setFramed] = useState(false);

  useEffect(() => {
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setFramed(window.self !== window.top);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (prompt) {
      await prompt.prompt();
      setPrompt(null);
      return;
    }
    if (framed) {
      window.open(window.location.href, "_blank", "noopener");
    }
  }

  return (
    <section className="panel mt-4 mb-3 p-4 text-left">
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl leading-none" aria-hidden="true">
          O
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">ഫോണിൽ ആപ്പായി വയ്ക്കുക</p>
          <p className="text-xs leading-relaxed text-muted">
            grok-sandbox.com താൽക്കാലികമാണ്. അവിടെ Install അടയ്ക്കും, ഐക്കൺ G ആകും, പിന്നെ Session terminated വരും. Publish ചെയ്ത ശാശ്വത ലിങ്കിൽ മാത്രമേ പച്ച O ഐക്കണോടെ എന്നും തുറക്കൂ.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="chip mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
      >
        <Smartphone className="size-4" aria-hidden="true" />
        {prompt ? "ഇൻസ്റ്റാൾ ചെയ്യുക" : framed ? "ബ്രൗസറിൽ തുറക്കുക" : "ഇൻസ്റ്റാൾ ഘട്ടങ്ങൾ"}
      </button>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">എങ്ങനെ വയ്ക്കാം</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
          {ios ? (
            <>
              <li>Safari-യിൽ പബ്ലിഷ് ചെയ്ത പേജ് തുറക്കുക.</li>
              <li>താഴെ ഷെയർ അമ്പടയാളം അമർത്തുക.</li>
              <li>Add to Home Screen തിരഞ്ഞെടുക്കുക. ഐക്കൺ O ആയിരിക്കും.</li>
            </>
          ) : (
            <>
              <li>പഴയ ചാരനിറം ഐക്കൺ അമർത്തിപ്പിടിച്ച് നീക്കം ചെയ്യുക.</li>
              <li>Chrome-ൽ പബ്ലിഷ് ചെയ്ത പേജ് തുറക്കുക.</li>
              <li>Install app അല്ലെങ്കിൽ Add to Home screen. പുതിയ ഐക്കൺ പച്ച O ആണ്.</li>
            </>
          )}
        </ol>
      </details>
    </section>
  );
}
