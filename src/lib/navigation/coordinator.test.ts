import { describe, expect, it } from 'vitest';
import type { Document } from '../contracts';
import { NavigationCoordinator } from './coordinator';

const doc = (path: string): Document => ({ kind: 'markdown', path, title: path, content: path });
const deferred = () => {
  let resolve!: (value: Document) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Document>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('NavigationCoordinator', () => {
  it('commits only successful reads, bounds the stack and discards forward entries', async () => {
    const nav = new NavigationCoordinator(2);
    await nav.select('a.md', () => Promise.resolve(doc('a.md')));
    await nav.select('b.md', () => Promise.resolve(doc('b.md')));
    await nav.select('c.md', () => Promise.resolve(doc('c.md')));
    await nav.select('d.md', () => Promise.resolve(doc('d.md')));
    expect(nav.back()).toMatchObject({ path: 'c.md' });
    expect(nav.back()).toMatchObject({ path: 'b.md' });
    expect(nav.back()).toBeNull();
    await nav.select('e.md', () => Promise.resolve(doc('e.md')));
    expect(nav.back()).toMatchObject({ path: 'b.md' });
  });

  it('restores scroll, lets fragments override scroll, and ignores repeated selection/anchors', async () => {
    const nav = new NavigationCoordinator();
    await nav.select('a.md', () => Promise.resolve(doc('a.md')));
    nav.position(123);
    await nav.select('a.md', () => {
      throw Error('duplicate read');
    });
    expect(nav.current).toMatchObject({ path: 'a.md', scroll: 123, fragment: undefined });
    nav.anchor('part', 150);
    expect(nav.current).toMatchObject({ fragment: 'part', scroll: 150 });
    await nav.select('b.md', () => Promise.resolve(doc('b.md')));
    expect(nav.back()).toMatchObject({ path: 'a.md', fragment: 'part', scroll: 150 });
    expect(nav.canBack).toBe(false);
  });

  it('keeps view/history on failure and ignores races, refreshes and old root reads', async () => {
    const nav = new NavigationCoordinator();
    await nav.select('a.md', () => Promise.resolve(doc('a.md')));
    const slow = deferred();
    const pending = nav.select('b.md', () => slow.promise);
    await nav.select('c.md', () => Promise.resolve(doc('c.md')));
    slow.resolve(doc('b.md'));
    expect(await pending).toBe('stale');
    expect(await nav.select('missing.md', () => Promise.reject(Error('missing')))).toBe('failed');
    expect(nav.current?.path).toBe('c.md');
    const refresh = deferred();
    const refreshing = nav.refresh(() => refresh.promise);
    await nav.select('d.md', () => Promise.resolve(doc('d.md')));
    refresh.resolve(doc('c.md'));
    await refreshing;
    expect(nav.current?.path).toBe('d.md');
    const old = deferred();
    const pendingRoot = nav.select('old.md', () => old.promise);
    nav.reset(doc('launch.md'));
    old.resolve(doc('old.md'));
    expect(await pendingRoot).toBe('stale');
    expect(nav.current?.path).toBe('launch.md');
    expect(nav.canBack).toBe(false);
    nav.reset();
    expect(nav.current).toBeNull();
  });

  it('does not add an entry on refresh and cancels an in-flight selection on Back', async () => {
    const nav = new NavigationCoordinator();
    await nav.select('a.md', () => Promise.resolve(doc('a.md')));
    await nav.select('b.md', () => Promise.resolve(doc('b.md')));
    expect(await nav.refresh(() => Promise.resolve({ ...doc('b.md'), title: 'Updated' }))).toBe(
      'refreshed'
    );
    expect(nav.current?.document.title).toBe('Updated');
    const slow = deferred();
    const pending = nav.select('c.md', () => slow.promise);
    expect(nav.back()?.path).toBe('a.md');
    slow.resolve(doc('c.md'));
    expect(await pending).toBe('stale');
    expect(nav.current?.path).toBe('a.md');
    expect(nav.canBack).toBe(false);
  });

  it('reports a failed selected reread but ignores a stale refresh', async () => {
    const nav = new NavigationCoordinator();
    await nav.select('a.md', () => Promise.resolve(doc('a.md')));
    await nav.select('b.md', () => Promise.resolve(doc('b.md')));
    expect(await nav.refresh(() => Promise.reject(Error('Deleted file')))).toBe('failed');
    expect(nav.error).toMatchObject({ message: 'Deleted file' });
    expect(nav.current?.path).toBe('b.md');
    expect(nav.canBack).toBe(true);
    const pending = deferred();
    const result = nav.refresh(() => pending.promise);
    nav.back();
    pending.reject(Error('Stale failure'));
    expect(await result).toBe('stale');
    expect(nav.error).toBeUndefined();
  });

  it('rejects a mismatched native document without committing', async () => {
    const nav = new NavigationCoordinator();
    expect(await nav.select('a.md', () => Promise.resolve(doc('b.md')))).toBe('failed');
    expect(nav.current).toBeNull();
  });
});
