import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function runningAsApp() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setInstalled(runningAsApp());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) {
      setHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  if (installed) {
    return (
      <p className="mt-4 mb-3 text-center text-sm text-muted">ഹോം സ്ക്രീനിലെ ആപ്പിൽ നിന്ന് തുറന്നിരിക്കുന്നു.</p>
    );
  }

  return (
    <section className="panel mt-4 mb-3 p-4 text-left">
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl leading-none" aria-hidden="true">
          O
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">ഫോണിൽ ആപ്പായി വയ്ക്കുക</p>
          <p className="text-xs leading-relaxed text-muted">ഹോം സ്ക്രീനിൽ O ഐക്കൺ. അവിടെ നിന്ന് തുറക്കാം.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="chip mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
      >
        <Smartphone className="size-4" aria-hidden="true" />
        ഇൻസ്റ്റാൾ ചെയ്യുക
      </button>
      {help ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
          {ios ? (
            <>
              <li>ഈ പേജ് Safari-യിൽ തുറക്കുക.</li>
              <li>താഴെയുള്ള ഷെയർ അമ്പടയാളം അമർത്തുക.</li>
              <li>Add to Home Screen തിരഞ്ഞെടുക്കുക.</li>
            </>
          ) : (
            <>
              <li>ഈ പേജ് ഫോണിലെ Chrome-ൽ തുറക്കുക.</li>
              <li>മെനുവിൽ Install app അല്ലെങ്കിൽ Add to Home screen തിരഞ്ഞെടുക്കുക.</li>
              <li>ഹോം സ്ക്രീനിൽ O ഐക്കൺ വരും.</li>
            </>
          )}
        </ol>
      ) : null}
    </section>
  );
}
