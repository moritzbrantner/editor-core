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

  await page.getByRole("button", { name: /^Save/u }).click();
  await expect(page.getByRole("status")).toContainText("Saved locally");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download JSON/u }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Release Checklist.json");
  await expect(page.getByRole("status")).toContainText("JSON downloaded");

  await page.getByRole("button", { name: /Undo/u }).click();
  await expect(page.getByRole("button", { name: /Moss/u })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByLabel("Import document JSON file").setInputFiles({
    buffer: Buffer.from("{"),
    mimeType: "application/json",
    name: "broken.json",
  });
  await expect(page.getByRole("status")).toContainText("JSON import failed");

  await page.getByLabel("Import document JSON file").setInputFiles({
    buffer: Buffer.from(
      JSON.stringify({
        document: {
          accent: "coral",
          body: "Imported body text.",
          title: "Imported Draft",
        },
        format: "@moenarch/editor-core/example-document",
        schemaVersion: 1,
      }),
    ),
    mimeType: "application/json",
    name: "document.json",
  });
  await expect(title).toHaveValue("Imported Draft");
  await expect(page.getByRole("status")).toContainText("JSON imported");
});

test("uses generic reference editor primitives without domain semantics", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Reference editor" }).click();
  await expect(page.getByRole("heading", { name: "Generic editor kernel" })).toBeVisible();

  await expect(page.getByText("itemA → itemB")).toBeVisible();
  await page.getByRole("button", { name: "Reorder items" }).click();
  await expect(page.getByText("itemB → itemA")).toBeVisible();

  await page.getByRole("button", { name: "Move item A" }).click();
  await expect(page.getByText("40", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Undo/u }).click();
  await expect(page.getByText("0", { exact: true })).toBeVisible();
});
