/**
 * Promise.try polyfill for Node < 22.7.
 *
 * unpdf@1.4+ calls Promise.try internally (pdfjs.mjs). Promise.try is the
 * Stage-3 ES2026 proposal, finalised in V8 13.3 / Node 22.7. Node 22.22.2
 * in production lacks it → "Promise.try is not a function" at parse time.
 *
 * This file is imported BEFORE unpdf in pdf-parser.ts so the polyfill is
 * installed before any unpdf code can call Promise.try. Module imports are
 * hoisted in ES — putting the polyfill inline at the top of pdf-parser.ts
 * after the unpdf import would have evaluated unpdf's module body first.
 *
 * Importing this file for its side effect is the standard way to guarantee
 * polyfill ordering with ES modules.
 */

if (typeof (Promise as { try?: unknown }).try !== "function") {
  (Promise as unknown as {
    try: <T>(fn: (...args: unknown[]) => T | Promise<T>, ...args: unknown[]) => Promise<T>;
  }).try = function <T>(
    fn: (...args: unknown[]) => T | Promise<T>,
    ...args: unknown[]
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (err) {
        reject(err);
      }
    });
  };
}
