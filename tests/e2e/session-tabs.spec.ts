import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Two tabs of one browser profile share real localStorage and IndexedDB. The built package is
// served under /__editor-core/ so each tab drives its own editor session against that storage.
const distDir = resolve(import.meta.dirname, "../../dist");

async function openTab(page: Page) {
  await page.route("**/__editor-core/**", (route) =>
    route.fulfill({ path: join(distDir, new URL(route.request().url()).pathname.slice(15)) }),
  );
  await page.goto("/");
}

declare global {
  interface Window {
    tab: {
      load: () => Promise<void>;
      edit: (title: string) => Promise<{ saved: boolean; lifecycle: string; kind?: string }>;
      stored: () => Promise<string | undefined>;
    };
  }
}

for (const storeKind of ["localStorage", "IndexedDB"] as const) {
  test(`a stale save from a second tab conflicts in ${storeKind}`, async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await openTab(first);
    await openTab(second);

    for (const page of [first, second]) {
      await page.evaluate(async (kind) => {
        const session = await import("/__editor-core/session.js" as string);
        const runtime = await import("/__editor-core/runtime.js" as string);
        const store =
          kind === "localStorage"
            ? session.createLocalStorageEditorSessionStore({ key: "tabs" })
            : session.createIndexedDbEditorSessionStore({ databaseName: "tabs" });
        const editor = session.createEditorSession({
          autosave: false,
          codec: { parse: (payload: unknown) => payload },
          runtime: runtime.createEditorRuntime({ initialDocument: { title: "Base" } }),
          store,
        });
        window.tab = {
          load: () => editor.load(),
          async edit(title) {
            editor.update((current: unknown) => runtime.commitEditorRuntime(current, { title }));
            const saved = await editor.flush();
            const state = editor.getState();
            return { kind: state.error?.kind, lifecycle: state.lifecycle, saved };
          },
          stored: async () => (await store.read("document"))?.value,
        };
      }, storeKind);
    }

    await first.evaluate(() => window.tab.load());
    expect(await first.evaluate(() => window.tab.edit("Seed"))).toMatchObject({ saved: true });

    await second.evaluate(() => window.tab.load());
    expect(await first.evaluate(() => window.tab.edit("First"))).toMatchObject({ saved: true });
    expect(await second.evaluate(() => window.tab.edit("Second"))).toEqual({
      kind: "conflict",
      lifecycle: "conflicted",
      saved: false,
    });
    expect(await second.evaluate(() => window.tab.stored())).toBe('{"title":"First"}');
  });
}
