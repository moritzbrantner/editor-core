import { expect, test } from "@playwright/test";

test("edits the React example document and updates editor state", async ({ page }) => {
  await page.goto("/");

  const title = page.getByLabel("Document title");
  const body = page.getByLabel("Document body");

  await expect(page.getByRole("heading", { name: "React editor example" })).toBeVisible();
  await expect(title).toHaveValue("Untitled Draft");

  await title.fill("Release Checklist");
  await body.fill("Draft the release notes and verify the editor integrations.");

  await expect(page.getByText("Release Checklist")).toBeVisible();
  await expect(page.getByText("9")).toBeVisible();

  await page.getByRole("button", { name: /Moss/u }).click();
  await expect(page.getByRole("button", { name: /Moss/u })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Save Local/u }).click();
  await expect(page.getByRole("status")).toContainText("Saved locally");

  await page.getByRole("button", { name: /Undo/u }).click();
  await expect(page.getByRole("status")).toContainText("Undid last edit");

  await page.getByLabel("Import document JSON file").setInputFiles({
    buffer: Buffer.from(
      JSON.stringify({
        document: {
          accent: "coral",
          body: "Imported body text.",
          title: "Imported Draft",
        },
        format: "@moritzbrantner/editor-core/example-document",
        schemaVersion: 1,
      }),
    ),
    mimeType: "application/json",
    name: "document.json",
  });
  await expect(title).toHaveValue("Imported Draft");
  await expect(page.getByRole("status")).toContainText("JSON imported");
});
