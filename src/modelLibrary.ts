import type { CatSkinConfig } from './catSkins';
import { MODEL_CONTRACT, fetchModelCatalog, modelActions, modelModes, parseModelPack, type ModelMode, type ModelPack } from './modelPack';
interface LibraryHost {
  current(): { cat?: CatSkinConfig; mode: ModelMode };
  install(pack: ModelPack, replace: boolean): Promise<void>;
  export(id: string): Promise<string>;
  resize(): void;
}
export function setupModelLibrary(host: LibraryHost): () => void {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const status = el('model-status'); const preview = el('model-preview');
  const install = el<HTMLButtonElement>('model-install'); const exportBtn = el<HTMLButtonElement>('model-export');
  const file = el<HTMLInputElement>('model-file'); const replace = el<HTMLInputElement>('model-replace');
  const loadBtn = el<HTMLButtonElement>('model-catalog-load');
  let pending: ModelPack | null = null; let busy = false;
  const labels = MODEL_CONTRACT.actionLabels as Record<string, string>;
  const actions = (cat: CatSkinConfig) => [...new Set(modelModes(cat).flatMap(mode => modelActions(cat, mode)))].map(a => labels[a] ?? a).join('、');
  function message(text: string, error = false): void { status.textContent = text; status.classList.toggle('model-error', error); host.resize(); }
  function update(): void {
    const { cat, mode } = host.current();
    el('model-current').textContent = cat ? cat.name + ' · ' + modelModes(cat).map(m => m.toUpperCase()).join(' / ') : '尚未加载模型';
    el('model-capabilities').textContent = cat ? '当前模式动作：' + (modelActions(cat, mode).map(a => labels[a] ?? a).join('、') || '当前兼容预览不支持此模型的动作') : '';
    exportBtn.disabled = busy || !cat || cat.id === 'dafeiyu';
    exportBtn.title = cat?.id === 'dafeiyu' ? '专用绘制器暂不支持模型包导出' : '';
  }
  function select(pack: ModelPack): void {
    pending = pack; replace.checked = false; preview.hidden = false;
    const p = pack.profile;
    el('model-preview-text').textContent = pack.skin.name + ' · ' + pack.skin.id + '\n' +
      (p.author ? '作者：' + p.author + ' · ' : '') + (p.license ? '许可：' + p.license + ' · ' : '') +
      modelModes(pack.skin).map(m => m.toUpperCase()).join(' / ') + '\n可用动作：' + actions(pack.skin);
    message('已验证模型包，点击“导入并使用”完成安装。');
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return; busy = true;
    install.disabled = exportBtn.disabled = loadBtn.disabled = file.disabled = true;
    try { await work(); } catch (e) { message(e instanceof Error ? e.message : String(e), true); }
    finally { busy = false; install.disabled = loadBtn.disabled = file.disabled = false; update(); host.resize(); }
  }
  file.addEventListener('change', () => { const selected = file.files?.[0]; if (!selected) return;
    pending = null; preview.hidden = true;
    void run(async () => { if (selected.size > MODEL_CONTRACT.maxBytes) throw Error('模型包不能超过 256 KB'); let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); }
      catch { throw Error('文件编码不是 UTF-8，请另存为 UTF-8 后重新导入'); }
      select(parseModelPack(text)); });
    file.value = '';
  });
  install.addEventListener('click', () => void run(async () => {
    if (!pending) return; message('正在导入…'); await host.install(pending, replace.checked);
    message('已导入并启用：' + pending.skin.name); preview.hidden = true; pending = null;
  }));
  exportBtn.addEventListener('click', () => void run(async () => {
    const cat = host.current().cat; if (!cat) return; message('正在导出…'); message(await host.export(cat.id));
  }));
  loadBtn.addEventListener('click', () => void run(async () => {
    const list = el('model-catalog-list'); list.replaceChildren(); message('正在读取 GitHub 目录…');
    const packs = await fetchModelCatalog(el<HTMLInputElement>('model-catalog-url').value.trim());
    for (const pack of packs) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'kb-pill';
      button.textContent = pack.skin.name + ' · ' + modelModes(pack.skin).map(m => m.toUpperCase()).join(' / ') + ' · 预览';
      button.addEventListener('click', () => { if (!busy) select(pack); }); list.append(button);
    }
    message(packs.length ? '已加载 ' + packs.length + ' 个模型，选择后可预览和导入。' : '目录中还没有模型。');
  }));
  update(); return update;
}
