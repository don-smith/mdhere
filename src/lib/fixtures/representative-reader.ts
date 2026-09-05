import type { Document, LibrarySnapshot } from '../contracts';

export const representativeReaderDocument: Document = {
  path: 'guides/Welcome.md',
  title: 'Reading a local field guide',
  content: `---
title: Reading a local field guide
tags: [reader, local-first, fieldwork]
summary: A representative tour of the mdhere reading surface
context:
  author: mdhere
  season: autumn
published: 2026-09-05
---
# Reading a local field guide

A quiet reading surface should let a useful document feel familiar without hiding its structure. This fixture follows an imaginary field team as they turn observations into a durable local guide. It is deliberately long enough to reveal rhythm, hierarchy, and scrolling behavior rather than acting like a component catalogue.

Start with the [local chapter](Second.md#second-section), then compare the notes with the [project website](https://example.com). Both links exercise real reader behavior: the first stays inside the confined library, while the second is handed to the operating system instead of navigating the webview.

The team records each observation beside the trail, reviews it at a shared desk, and keeps the final Markdown in the same folder as its supporting images. That ordinary workflow is the reason the document includes prose alongside technical and visual material.

## From observation to durable notes

Good field notes are specific enough to be useful later. They identify the place, preserve the sequence of events, and distinguish a direct observation from an interpretation. The editor can then shape those fragments into a guide without erasing their provenance.

- Record weather, light, and location before interpretation.
- Keep image captions descriptive and useful out of context.
- Link related local chapters instead of repeating their full contents.

The unordered list should read as part of the prose rather than as a detached panel. Its spacing also makes crowded narrow layouts easy to spot.

### A repeatable review route

A small review ritual catches more problems than an elaborate tool used only once. The team follows the same route each time:

1. Read the draft once for continuity and missing context.
2. Compare local assets, links, tables, and diagrams with their source notes.
3. Re-read at a narrow width before marking the guide ready.

The route remains useful whether the guide is a dozen lines or several chapters. Inline code such as \`renderDocument\` should remain distinct without breaking apart when space is tight.

#### Work still visible

Tasks belong near the evidence that motivated them. Completed and open work therefore stay together:

- [x] Confirm the trail names against the paper map.
- [ ] Revisit the north overlook after the first frost.

A checked item must remain legible without depending on color alone, and an unchecked item must preserve a comfortable hit target.

##### A note from the reading desk

> A useful reader makes structure visible, then gets out of the way. Long paragraphs should feel calm, quotes should be unmistakable, and a change of theme should not change the meaning of the document.

The quotation provides a slower beat before the technical record. It should not become a card or dominate the page, especially when the application is zoomed to two hundred percent.

###### Technical appendix

The fixture includes a fenced TypeScript sample with a deliberately long line so code containment can be checked independently from prose measure.

\`\`\`typescript
type Observation = { place: string; recordedAt: string; conditions: string };

export function summarize(observation: Observation): string {
  return \`\${observation.place} — \${observation.conditions} (\${observation.recordedAt})\`;
}

const overlook = summarize({ place: 'North overlook', recordedAt: '07:40', conditions: 'clear after rain with a long line of morning light' });
\`\`\`

| Surface | Evidence | Reader expectation |
| --- | --- | --- |
| Prose | Long-form field notes | A comfortable, narrower measure |
| Code | TypeScript with a long line | Contained scrolling without page clipping |
| Table | Three unequal columns | Full structural width with readable cells |
| Diagram | A simple review flow | Local rendering inside the page boundary |

\`\`\`mermaid
flowchart LR
  Observe[Observe locally] --> Draft[Draft the guide]
  Draft --> Review{Review at two widths}
  Review --> Publish[Keep it in the library]
\`\`\`

![A sunlit reading desk](images/reading-desk.png)

The local illustration is intentionally wide. It should scale within the reader, retain its aspect ratio, and load from the same application origin in the browser evidence.

![Unavailable field photograph](https://example.com/field-photograph.png)

The unavailable image is intentional. Remote content remains blocked and is replaced by an explicit, readable placeholder rather than a broken navigation or an unexpected network request.

A final paragraph gives the page enough depth for keyboard scrolling and zoom checks. The guide remains a single coherent source even though it exercises headings, lists, tasks, a quotation, inline and fenced code, a table, front matter, a Mermaid diagram, local navigation, external navigation, a confined image, and rejected remote media.

~~Rendered safely~~. <script>alert('not rendered')</script>
`
};

export const representativeLibrarySnapshot: LibrarySnapshot = {
  rootName: 'Example library',
  diagnostics: [],
  tree: [
    {
      kind: 'folder',
      name: 'guides',
      path: 'guides',
      children: [
        { kind: 'document', name: 'Welcome.md', path: 'guides/Welcome.md' },
        { kind: 'document', name: 'Second.md', path: 'guides/Second.md' }
      ]
    }
  ]
};

export const representativeDocuments: Record<string, Document> = {
  [representativeReaderDocument.path]: representativeReaderDocument,
  'guides/Second.md': {
    path: 'guides/Second.md',
    title: 'Second',
    content: '# Second section\n\nThis document was selected by a confined local link.'
  }
};

const browserFixtureAssets: Readonly<Record<string, string>> = {
  'guides/images/reading-desk.png': '/tests/fixtures/library/guides/images/reading-desk.png'
};

export function browserFixtureAssetUrl(path: string): string {
  const url = browserFixtureAssets[path];
  if (!url) throw new Error(`No browser fixture asset is registered for ${path}`);
  return url;
}
