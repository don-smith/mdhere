const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

export const SECTION_SELECTOR = 'section[data-mdhere-section]';
export const SECTION_TOGGLE_SELECTOR = '[data-mdhere-section-toggle]';

export function isHeading(element: Element): boolean {
  return HEADING_TAGS.has(element.tagName);
}

/**
 * Wraps each top-level heading and its content (everything up to the next
 * heading of the same or higher level) in a nested <section> element so the
 * reader can collapse it. Headings nested inside block quotes or lists are
 * left alone. Runs on the live, already-sanitized DOM.
 */
export function sectionize(root: HTMLElement): void {
  const headings = Array.from(root.children).filter(isHeading);
  for (const heading of headings) {
    if (heading.parentElement !== root) continue;
    wrapSection(root, heading as HTMLElement);
  }
}

function wrapSection(root: HTMLElement, heading: HTMLElement): void {
  const level = headingLevel(heading);
  const document = root.ownerDocument;
  const section = document.createElement('section');
  section.dataset.mdhereSection = 'true';
  section.dataset.mdhereLevel = String(level);
  heading.before(section);

  const children = Array.from(root.children);
  const start = children.indexOf(heading) + 1;
  for (let index = start; index < children.length; index += 1) {
    const node = children[index]!;
    if (isHeading(node) && headingLevel(node) <= level) break;
    section.append(node);
  }
  section.prepend(heading);

  heading.dataset.mdhereSectionToggle = 'true';
  heading.setAttribute('aria-expanded', 'true');

  // Recurse into the new section for lower-level headings. Skip the section's
  // own heading: it is the first child and must not be wrapped again.
  const nested = Array.from(section.children).slice(1).filter(isHeading);
  for (const heading of nested) {
    if (heading.parentElement !== section) continue;
    wrapSection(section, heading as HTMLElement);
  }
}

function headingLevel(heading: Element): number {
  return Number(heading.tagName.charAt(1));
}

export function sectionHeading(section: Element): HTMLElement | null {
  // The toggle heading is always the section's first child. Avoided :scope
  // selectors because jsdom does not resolve them inside a Shadow Root.
  const first = section.firstElementChild;
  return first?.hasAttribute('data-mdhere-section-toggle') ? (first as HTMLElement) : null;
}

export function setSectionCollapsed(section: Element, collapsed: boolean): void {
  section.setAttribute('data-mdhere-collapsed', String(collapsed));
  sectionHeading(section)?.setAttribute('aria-expanded', String(!collapsed));
}

export function isSectionCollapsed(section: Element): boolean {
  return section.getAttribute('data-mdhere-collapsed') === 'true';
}

/**
 * Expands every collapsed section that contains the element, so fragment
 * jumps and link targets are never hidden behind a collapsed ancestor.
 */
export function revealAncestors(element: Element): void {
  let section = element.parentElement?.closest(SECTION_SELECTOR) ?? null;
  while (section) {
    setSectionCollapsed(section, false);
    section = section.parentElement?.closest(SECTION_SELECTOR) ?? null;
  }
}
