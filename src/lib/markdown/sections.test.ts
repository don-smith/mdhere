import { describe, expect, it } from 'vitest';

import {
  isSectionCollapsed,
  revealAncestors,
  sectionHeading,
  sectionize,
  setSectionCollapsed
} from './sections';

function buildArticle(markdown: string): HTMLElement {
  const article = document.createElement('article');
  article.innerHTML = markdown;
  return article;
}

describe('sectionize', () => {
  it('wraps a heading and its following content in a section', () => {
    const article = buildArticle(
      '<h2 id="one">One</h2><p>Alpha</p><h2 id="two">Two</h2><p>Beta</p>'
    );
    sectionize(article);

    const sections = article.querySelectorAll('section[data-mdhere-section]');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.textContent).toBe('OneAlpha');
    expect(sections[1]?.textContent).toBe('TwoBeta');
  });

  it('nests lower-level headings inside the enclosing section', () => {
    const article = buildArticle(
      '<h2 id="outer">Outer</h2><p>Intro</p><h3 id="inner">Inner</h3><p>Detail</p>'
    );
    sectionize(article);

    const sections = article.querySelectorAll('section[data-mdhere-section]');
    expect(sections).toHaveLength(2);
    const outer = sections[0] as HTMLElement;
    expect(outer.dataset.mdhereLevel).toBe('2');
    expect(outer.contains(sections[1]!)).toBe(true);
    expect(sectionHeading(outer)?.id).toBe('outer');
  });

  it('closes a section at a same-or-higher level heading and nests lower ones', () => {
    const article = buildArticle(
      '<h2 id="a">A</h2><p>one</p><h1 id="b">B</h1><p>two</p><h3 id="c">C</h3>'
    );
    sectionize(article);

    const sections = article.querySelectorAll('section[data-mdhere-section]');
    expect(sections).toHaveLength(3);
    expect(sections[0]?.textContent).toBe('Aone');
    // The h3 nests inside the h1's section.
    expect(sections[1]?.textContent).toBe('BtwoC');
    expect(sections[1]?.querySelector(':scope > section')?.textContent).toBe('C');
  });

  it('leaves content before the first heading unwrapped', () => {
    const article = buildArticle('<p>Preamble</p><h2 id="a">A</h2><p>body</p>');
    sectionize(article);

    expect(article.firstChild?.nodeName).toBe('P');
    expect(article.firstChild?.textContent).toBe('Preamble');
    expect(article.querySelectorAll('section')).toHaveLength(1);
  });

  it('leaves headings inside block quotes untouched', () => {
    const article = buildArticle(
      '<h2 id="a">A</h2><blockquote><h3 id="q">Quoted</h3></blockquote>'
    );
    sectionize(article);

    const sections = article.querySelectorAll('section[data-mdhere-section]');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.querySelector('blockquote h3')).not.toBeNull();
  });

  it('marks headings as toggles with aria-expanded', () => {
    const article = buildArticle('<h2 id="a">A</h2><p>body</p>');
    sectionize(article);

    const heading = article.querySelector('h2')!;
    expect(heading.dataset.mdhereSectionToggle).toBe('true');
    expect(heading.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('collapse state', () => {
  it('collapses a section and updates the heading state', () => {
    const article = buildArticle('<h2 id="a">A</h2><p>body</p>');
    sectionize(article);
    const section = article.querySelector('section')!;
    const heading = sectionHeading(section)!;

    setSectionCollapsed(section, true);
    expect(isSectionCollapsed(section)).toBe(true);
    expect(heading.getAttribute('aria-expanded')).toBe('false');

    setSectionCollapsed(section, false);
    expect(isSectionCollapsed(section)).toBe(false);
    expect(heading.getAttribute('aria-expanded')).toBe('true');
  });

  it('reveals collapsed ancestors of a nested target', () => {
    const article = buildArticle(
      '<h2 id="outer">Outer</h2><p>Intro</p><h3 id="inner">Inner</h3><p>Detail</p>'
    );
    sectionize(article);
    const sections = article.querySelectorAll('section');
    setSectionCollapsed(sections[0]!, true);
    setSectionCollapsed(sections[1]!, true);

    const paragraph = article.querySelector('h3')!;
    revealAncestors(paragraph);

    expect(isSectionCollapsed(sections[0]!)).toBe(false);
    expect(isSectionCollapsed(sections[1]!)).toBe(false);
  });
});
