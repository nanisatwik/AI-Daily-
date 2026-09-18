"use client"; // Error boundaries must be Client Components.

/*
 * The last resort, for when the root layout itself fails.
 *
 * WHY THIS FILE LOOKS NOTHING LIKE THE REST OF THE PAPER
 *
 * `global-error.tsx` replaces the root layout rather than rendering inside it.
 * Everything the paper's look is made of is therefore gone:
 *
 *   - `app/globals.css` is imported by `app/layout.tsx`, so no Tailwind
 *     utilities, no `.kicker` / `.headline-caps` / `.rule-double`, and none of
 *     the `--paper` / `--ink` / `--rule` custom properties that every other
 *     component reads.
 *   - the four `next/font` families are declared in that same layout, so
 *     `--font-mast`, `--font-head`, `--font-body` and `--font-label` are all
 *     undefined here. Caslon and the blackletter are simply not loaded.
 *   - the inline script that reads `localStorage.edition` and puts the `night`
 *     class on `<html>` lives in the layout's `<head>`. It never runs, so the
 *     reader's chosen edition is unknowable at this point. Reading
 *     localStorage during render instead would mismatch the server HTML, and
 *     this is the one component in the app that cannot afford a hydration
 *     error of its own.
 *
 * So the styling is a single inline `<style>` block and nothing else. No
 * imports, no shared components, no data — a boundary that fires because the
 * layout broke must not depend on anything the layout touches, and there is no
 * boundary below this one to catch it if it does. The bundled `error.js` guide
 * is explicit that global-error renders its own document and does not get the
 * app's global styles, and that an app-level theme toggle cannot reach it.
 *
 * Dark is handled by `prefers-color-scheme` because the operating system is
 * the only theme signal that survives. A reader in the gaslight edition on a
 * light-mode machine will see this page in daylight colours; that is the
 * correct trade against a flash of the wrong palette or a hydration mismatch,
 * and the palettes are the paper's own either way.
 *
 * `metadata` exports are not supported in a Client Component, so the tab title
 * is set with React's own `<title>` element, as the guide suggests.
 */

/*
 * Values lifted from the `:root` and `.night` blocks of app/globals.css so the
 * fallback is recognisably this paper and not a browser default. They are
 * duplicated on purpose: importing the stylesheet would reintroduce exactly
 * the dependency this file exists to survive without. If the palette in
 * globals.css is ever reworked, these want updating by hand.
 */
const styles = `
  :root {
    --paper: #e7d9bb;
    --paper-deep: #dcc9a4;
    --ink: #2b1f12;
    --ink-soft: #5c4830;
    --ink-faint: #8a7454;
    --rule: #a68f68;
    --accent: #8b2e1f;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #17120c;
      --paper-deep: #100c08;
      --ink: #e4d6b8;
      --ink-soft: #b39f7d;
      --ink-faint: #7d6b4f;
      --rule: #4a3c28;
      --accent: #cf7a5e;
    }
  }

  html { background: var(--paper-deep); }

  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--paper-deep);
    color: var(--ink);
    /* Georgia and Times are on effectively every machine; the paper's Caslon
       is not available here, and a serif that exists beats a webfont that
       does not. */
    font-family: Georgia, "Times New Roman", Times, serif;
    -webkit-font-smoothing: antialiased;
  }

  .sheet {
    width: 100%;
    max-width: 620px;
    box-sizing: border-box;
    background: var(--paper);
    border: 2px solid var(--ink);
    padding: 30px 26px 34px;
    text-align: center;
  }

  /* The blackletter nameplate if the machine happens to have a cut of it, and
     an ordinary serif if not. Never a webfont — see the note above. */
  .nameplate {
    font-family: "Old English Text MT", "UnifrakturMaguntia", Georgia, serif;
    font-size: 26px;
    line-height: 1;
    margin: 0 0 18px;
    font-weight: 400;
  }

  /* Franklin Gothic stands in for the label cut; the generic sans-serif at the
     end of the stack is what most machines will actually use. */
  .kicker {
    font-family: "Franklin Gothic", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .rule-double {
    border-top: 3px solid var(--ink);
    border-bottom: 1px solid var(--ink);
    height: 5px;
  }

  .banner {
    color: var(--accent);
    margin: 22px 0 14px;
  }

  h2 {
    font-size: 30px;
    line-height: 1.08;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    font-weight: 400;
    margin: 0;
  }

  .thick-rule {
    height: 4px;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--ink);
    margin: 22px 0;
  }

  /* Balanced and pretty, as globals.css balances its headlines: unbalanced,
     the deck dropped "yours." onto a line of its own, and the body copy left a
     one-word last line. Both degrade to an ordinary rag where unsupported. */
  .deck {
    font-style: italic;
    font-size: 18px;
    line-height: 1.45;
    color: var(--ink-soft);
    max-width: 34em;
    margin: 0 auto;
    text-wrap: balance;
  }

  .body-copy {
    font-size: 15px;
    line-height: 1.6;
    color: var(--ink-soft);
    max-width: 40em;
    margin: 22px auto 0;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    justify-content: center;
    margin-top: 28px;
  }

  .press {
    font-family: "Franklin Gothic", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 11px 24px;
    background: transparent;
    color: var(--ink);
    border: 2px solid var(--ink);
    text-decoration: none;
    display: inline-block;
  }

  .press:hover { background: var(--ink); color: var(--paper); }

  .press-quiet {
    border: 1px solid var(--rule);
    color: var(--ink-soft);
  }

  .press-quiet:hover { border-color: var(--ink); }

  .reference {
    font-family: "Franklin Gothic", "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin: 26px 0 0;
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
  }
`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /*
   * `retry` rather than `reset`: this version's error.js guide makes `retry`
   * the stable prop as of 16.3.0 and says `reset` should be reserved for the
   * rare case where you want the children re-rendered without being
   * re-fetched. A failed root layout is precisely a thing worth fetching
   * again, so `retry` is what belongs on the button.
   */
  retry: () => void;
}) {
  return (
    // global-error must include html and body tags — it replaces the layout.
    <html lang="en">
      <body>
        <title>The press has stopped — The AI Daily</title>
        <style>{styles}</style>

        <div className="sheet">
          <p className="nameplate">The AI Daily</p>

          <div className="rule-double" />

          <p className="kicker banner">Stop the press</p>

          <h2>The whole press has stopped</h2>

          <div className="thick-rule" />

          <p className="deck">
            The paper could not be printed at all. This is a fault at our end,
            not yours.
          </p>

          <p className="body-copy">
            Nothing here is set the way the rest of the paper is set, because
            the fault took the typecases with it. Try the press again below; if
            it will not start, come back in a few minutes and the morning
            edition should be waiting.
          </p>

          <div className="actions">
            <button type="button" className="press" onClick={() => retry()}>
              Start the press again
            </button>
            {/*
              A plain anchor, not next/link. The client router is part of what
              may have failed here, and a full document load is the one way
              back to the front page that needs nothing to still be working.
            */}
            <a className="press press-quiet" href="/">
              Front page
            </a>
          </div>

          {/* The only thread from what a reader saw to the server's own log:
              production redacts the message but keeps this hash. */}
          {error.digest && <p className="reference">Reference {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
