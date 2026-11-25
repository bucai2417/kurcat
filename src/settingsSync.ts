/** One ordered writer, with pending UI edits over the latest native snapshot. */
export class SettingsSync<T extends object> {
  private pending: Array<{ patch: Partial<T> }> = [];
  private queue: Promise<void> = Promise.resolve();
  private readVersion = 0;

  constructor(
    private current: T,
    private readonly read: () => Promise<T>,
    private readonly write: (patch: Partial<T>) => Promise<unknown>,
    private readonly publish: (value: T) => void,
  ) {}

  private render(): void {
    this.publish(Object.assign({}, this.current, ...this.pending.map((edit) => edit.patch)));
  }

  accept(snapshot: T): void {
    ++this.readVersion;
    this.current = snapshot;
    this.render();
  }

  async refresh(): Promise<void> {
    const version = ++this.readVersion;
    const snapshot = await this.read();
    if (version !== this.readVersion) return;
    this.current = snapshot;
    this.render();
  }

  update(patch: Partial<T>): Promise<void> {
    const edit = { patch: { ...patch } };
    this.pending.push(edit);
    this.render();
    const task = this.queue.then(async () => {
      try {
        await this.write(edit.patch);
      } finally {
        this.pending = this.pending.filter((item) => item !== edit);
        // A tray/MCP edit may have landed while IPC was in flight. Read native
        // truth instead of letting an old command response restore old toggles.
        try { await this.refresh(); } finally { this.render(); }
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
