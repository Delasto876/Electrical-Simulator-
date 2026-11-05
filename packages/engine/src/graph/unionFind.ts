/** Disjoint-set (union–find) over string keys, path compression + union by size. */
export class UnionFind {
  private parent = new Map<string, string>();
  private size = new Map<string, number>();

  add(k: string): void {
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      this.size.set(k, 1);
    }
  }

  find(k: string): string {
    this.add(k);
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = k;
    while (c !== r) {
      const next = this.parent.get(c)!;
      this.parent.set(c, r);
      c = next;
    }
    return r;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const [big, small] = (this.size.get(ra) ?? 1) >= (this.size.get(rb) ?? 1) ? [ra, rb] : [rb, ra];
    this.parent.set(small, big);
    this.size.set(big, (this.size.get(big) ?? 1) + (this.size.get(small) ?? 1));
  }

  same(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }
}
