/** One press owns a gesture. Movement cancels clicks; stale IPC never owns a new press. */
export class PetGesture {
  private serial = 0;
  private press: { id: number; x: number; y: number; moved: boolean } | null = null;
  down(x: number, y: number): number {
    const id = ++this.serial; this.press = { id, x, y, moved: false }; return id;
  }
  move(x: number, y: number): number | null {
    const p = this.press;
    if (!p || p.moved || Math.hypot(x - p.x, y - p.y) < 6) return null;
    p.moved = true; return p.id;
  }
  owns(id: number): boolean { return this.press?.id === id; }
  release(): boolean { const click = !!this.press && !this.press.moved; this.press = null; return click; }
  cancel(): void { this.press = null; }
}
