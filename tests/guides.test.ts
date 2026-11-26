import assert from "node:assert/strict";
import test from "node:test";
import { GUIDE_DISCLAIMER, GUIDE_UPDATED, guidePlainText, guideSitemapEntries, guides } from "../lib/guides.ts";

test("each public guide has its own title, description, summary and steps", () => {
  assert.equal(guides.length, 8);
  const titles = new Set(guides.map((guide) => guide.title));
  const descriptions = new Set(guides.map((guide) => guide.description));
  const slugs = new Set(guides.map((guide) => guide.slug));
  assert.equal(titles.size, guides.length);
  assert.equal(descriptions.size, guides.length);
  assert.equal(slugs.size, guides.length);

  for (const guide of guides) {
    assert.match(guide.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.notEqual(guide.title, guide.description);
    assert.ok(guide.description.length >= 80, guide.slug);
    assert.ok(guide.summary.length >= 80, guide.slug);
    assert.ok(guide.dek.length >= 40, guide.slug);
    assert.ok(guide.steps.length >= 4, guide.slug);
    assert.ok(guide.sources.length >= 2, guide.slug);
    assert.ok(guide.cta.includes("Blixtbo"), guide.slug);
    for (const source of guide.sources) {
      assert.ok(source.url.startsWith("https://"), source.url);
      assert.ok(source.name.length > 8, source.name);
    }
    for (const slug of guide.related) {
      assert.notEqual(slug, guide.slug);
      assert.ok(guides.some((item) => item.slug === slug), slug);
    }
  }
});

test("guides stay clear of ownership claims and unnamed advisory brands", () => {
  const blob = `${GUIDE_DISCLAIMER}\n${guides.map(guidePlainText).join("\n")}`;
  assert.match(GUIDE_DISCLAIMER, /äger inga lägenheter/);
  assert.match(GUIDE_DISCLAIMER, /garanterar inget kontrakt/);
  assert.match(GUIDE_DISCLAIMER, /inte juridisk rådgivning/);
  assert.equal(GUIDE_UPDATED, "2026-11-26");
  assert.equal(blob.includes("Rensé"), false);
  assert.equal(blob.toLowerCase().includes("rense advisory"), false);
  assert.equal(blob.includes("Blixtbo garanterar ett"), false);
  assert.equal(blob.includes("Blixtbo hyr ut"), false);
});

test("the sitemap lists the index and every guide once", () => {
  const entries = guideSitemapEntries();
  const urls = entries.map((entry) => entry.url);
  assert.deepEqual(new Set(urls).size, urls.length);
  assert.ok(urls.includes("https://blixtbo.se/guider"));
  for (const guide of guides) {
    assert.ok(urls.includes(`https://blixtbo.se/guider/${guide.slug}`));
  }
  assert.ok(entries.every((entry) => entry.lastModified === GUIDE_UPDATED));
});
