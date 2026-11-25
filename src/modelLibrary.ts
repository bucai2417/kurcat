import type { CatSkinConfig } from './catSkins';
import {
  MODEL_CONTRACT, DEFAULT_MODEL_CATALOG, MODEL_PUBLISH_PAGE, MODEL_GUIDE_PAGE,
  fetchModelCatalog, normalizeCatalogUrl, modelActions, modelModes, modelInstallState,
  parseModelPack, type ModelMode, type ModelPack, type ModelInstallState,
} from './modelPack';
interface LibraryHost {
  current(): { cat?: CatSkinConfig; mode: ModelMode };
  models(): CatSkinConfig[];
  activate(id: string): Promise<void>;
  install(pack: ModelPack, replace: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  export(id: string): Promise<string>;
  openExports(): Promise<void>;
  openPage(url: string): Promise<void>;
  resize(): void;
}
const SOURCE_KEY = 'kurocat-model-catalog-v1';
const states: Record<ModelInstallState, string> = {
  new: '未安装', installed: '已安装 · 内容一致', update: '有新修订',
  'local-newer': '本机修订较新', different: '同 ID 内容不同',
};
export function setupModelLibrary(host: LibraryHost): () => void {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const status = el('model-status'); const preview = el('model-preview');
  const install = el<HTMLButtonElement>('model-install');
  const exportBtn = el<HTMLButtonElement>('model-export');
  const file = el<HTMLInputElement>('model-file'); const replace = el<HTMLInputElement>('model-replace');
  const source = el<HTMLInputElement>('model-catalog-url');
  const search = el<HTMLInputElement>('model-search'); const filter = el<HTMLSelectElement>('model-filter');
  let pending: ModelPack | null = null; let busy = false; let deleteId: string | null = null;
  let catalog: ModelPack[] | null = null; let catalogSource = ''; let stamp = '';
  const labels = MODEL_CONTRACT.actionLabels as Record<string, string>;
  source.value = DEFAULT_MODEL_CATALOG;
  try { const saved = localStorage.getItem(SOURCE_KEY); if (saved) source.value = normalizeCatalogUrl(saved); } catch { /* Use default if storage or saved URL is invalid. */ }
  const modes = (cat: CatSkinConfig) => modelModes(cat).map(m => m.toUpperCase()).join(' / ');
  const actions = (cat: CatSkinConfig) => [...new Set(modelModes(cat).flatMap(mode => modelActions(cat, mode)))].map(a => labels[a] ?? a).join('、');
  function message(text: string, error = false): void {
    status.textContent = text; status.classList.toggle('model-error', error); host.resize();
  }
  function matches(cat: CatSkinConfig): boolean {
    const query = search.value.trim().toLocaleLowerCase();
    return (filter.value !== 'custom' || !cat.builtin) &&
      (!['2d', '3d'].includes(filter.value) || modelModes(cat).includes(filter.value as ModelMode)) &&
      (!query || [cat.name, cat.id, cat.modelProfile?.author ?? ''].join(' ').toLocaleLowerCase().includes(query));
  }
  function button(text: string, key: string, work: () => void, disabled = false): HTMLButtonElement {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'kb-pill';
    b.textContent = text; b.dataset.modelKey = key; b.dataset.unavailable = String(disabled);
    b.disabled = busy || disabled; b.addEventListener('click', () => { if (!busy) work(); }); return b;
  }
  function row(cat: CatSkinConfig, note: string): { item: HTMLElement; controls: HTMLElement } {
    const item = document.createElement('div'); item.className = 'model-entry'; item.setAttribute('role', 'listitem');
    const name = document.createElement('strong'); name.textContent = cat.name; item.append(name);
    const meta = document.createElement('p'); meta.className = 'model-copy';
    meta.textContent = cat.id + ' · ' + modes(cat) + ' · ' + note +
      (cat.builtin ? '' : ' · 修订 ' + (cat.modelProfile?.revision ?? 1)) +
      (cat.modelProfile?.author ? ' · ' + cat.modelProfile.author : ''); item.append(meta);
    const controls = document.createElement('div'); controls.className = 'model-actions'; item.append(controls);
    return { item, controls };
  }
  function renderLists(): void {
    const cats = host.models(); const current = host.current().cat?.id;
    const nextStamp = JSON.stringify([cats, current, search.value, filter.value, deleteId, catalog]);
    if (nextStamp === stamp) return; stamp = nextStamp;
    const activeKey = (document.activeElement as HTMLElement | null)?.dataset.modelKey;
    const localList = el('model-installed-list'); localList.replaceChildren();
    const visible = cats.filter(matches);
    el('model-installed-count').textContent = '共 ' + cats.length + ' 个 · 自定义 ' + cats.filter(c => !c.builtin).length + ' 个 · 显示 ' + visible.length + ' 个';
    if (!visible.length) localList.textContent = '没有符合条件的本机模型。可清空搜索或更换筛选。';
    for (const cat of visible) {
      const { item, controls } = row(cat, cat.builtin ? '内置' : '自定义');
      controls.append(button(current === cat.id ? '使用中' : '使用', 'use-' + cat.id, () => void run(async () => {
        await host.activate(cat.id); message('已切换：' + cat.name);
      }), current === cat.id));
      if (cat.id !== 'dafeiyu') controls.append(button('导出', 'export-' + cat.id, () => void run(async () => message('导出完成：' + await host.export(cat.id)))));
      if (!cat.builtin) {
        controls.append(button('删除', 'delete-' + cat.id, () => { deleteId = cat.id; update(); host.resize(); }));
        if (deleteId === cat.id) {
          const confirm = document.createElement('div'); confirm.className = 'model-delete-confirm';
          const hint = document.createElement('p'); hint.className = 'model-copy';
          hint.textContent = '删除“' + cat.name + '”？' + (current === cat.id ? '正在使用的模型将切回内置黑猫。' : '') + '仅删除本机副本，GitHub 和已导出的文件会保留。';
          confirm.append(hint, button('确认删除', 'confirm-' + cat.id, () => void run(async () => {
            await host.remove(cat.id); deleteId = null; message('已删除本机模型：' + cat.name);
          })), button('取消', 'cancel-' + cat.id, () => { deleteId = null; update(); host.resize(); })); item.append(confirm);
        }
      }
      localList.append(item);
    }
    const remoteList = el('model-catalog-list'); remoteList.replaceChildren();
    if (catalog) {
      const visibleRemote = catalog.filter(p => matches(p.skin));
      el('model-catalog-summary').textContent = '已读取 ' + catalog.length + ' 个 · 显示 ' + visibleRemote.length + ' 个\n来源：' + catalogSource;
      if (!visibleRemote.length) remoteList.textContent = catalog.length ? '没有符合筛选条件的模型。' : '仓库目录还是空的，可以发布第一个模型。';
      for (const pack of visibleRemote) {
        const state = modelInstallState(pack, cats); const { item, controls } = row(pack.skin, states[state]);
        controls.append(button(state === 'installed' ? '查看详情' : '查看并导入', 'remote-' + pack.skin.id, () => {
          select(pack); preview.scrollIntoView({ block: 'nearest' });
        })); remoteList.append(item);
      }
    }
    if (activeKey) Array.from(el('panel-models').querySelectorAll<HTMLButtonElement>('[data-model-key]'))
      .find(b => b.dataset.modelKey === activeKey)?.focus({ preventScroll: true });
  }
  function update(): void {
    const { cat, mode } = host.current(); renderLists();
    el('model-current').textContent = cat ? cat.name + ' · ' + modes(cat) : '尚未加载模型';
    el('model-capabilities').textContent = cat ? '当前模式动作：' + (modelActions(cat, mode).map(a => labels[a] ?? a).join('、') || '当前预览不支持此模型的动作') : '';
    el('panel-models').setAttribute('aria-busy', String(busy));
    for (const input of el('panel-models').querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button, input, select')) input.disabled = busy || input.dataset.unavailable === 'true';
    exportBtn.disabled = busy || !cat || cat.id === 'dafeiyu';
    exportBtn.title = cat?.id === 'dafeiyu' ? '专用绘制器暂不支持模型包导出' : '';
    const state = pending ? modelInstallState(pending, host.models()) : 'new';
    el('model-replace-row').hidden = state === 'new' || state === 'installed';
    install.textContent = state === 'installed' ? '使用已安装模型' : state === 'new' ? '导入并使用' : '替换并使用';
    install.disabled = busy || !pending || (!['new', 'installed'].includes(state) && !replace.checked);
  }
  function select(pack: ModelPack): void {
    pending = pack; replace.checked = false; preview.hidden = false;
    const p = pack.profile; const state = modelInstallState(pack, host.models());
    el('model-preview-text').textContent = pack.skin.name + ' · ' + pack.skin.id + ' · 修订 ' + (p.revision ?? 1) + '\n' +
      (p.author ? '作者：' + p.author + '\n' : '') + '许可：' + (p.license ?? '作者未声明') + '\n' +
      (p.description ? p.description + '\n' : '') + modes(pack.skin) + '\n可用动作：' + actions(pack.skin) + '\n安装状态：' + states[state];
    message(state === 'new' ? '模型包已验证，确认详情后导入。' : state === 'installed' ? '本机已安装相同模型，可直接使用。' : '本机已有同 ID 模型。建议先导出备份，再勾选确认替换。'); update(); host.resize();
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return; busy = true; update();
    try { await work(); } catch (e) { message(e instanceof Error ? e.message : String(e), true); }
    finally { busy = false; update(); host.resize(); }
  }
  file.addEventListener('change', () => { const selected = file.files?.[0]; if (!selected) return;
    pending = null; preview.hidden = true;
    void run(async () => {
      if (selected.size > MODEL_CONTRACT.maxBytes) throw Error('模型包不能超过 256 KB');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); }
      catch { throw Error('文件编码不是 UTF-8，请另存为 UTF-8 后重新导入'); }
      select(parseModelPack(text));
    }); file.value = '';
  });
  replace.addEventListener('change', update);
  search.addEventListener('input', () => { update(); host.resize(); });
  filter.addEventListener('change', () => { update(); host.resize(); });
  el('model-preview-cancel').addEventListener('click', () => { pending = null; preview.hidden = true; update(); host.resize(); });
  install.addEventListener('click', () => void run(async () => {
    if (!pending) return;
    const pack = pending; const state = modelInstallState(pack, host.models());
    if (state === 'installed') await host.activate(pack.skin.id);
    else {
      if (state !== 'new' && !replace.checked) throw Error('请先确认替换本机同 ID 模型');
      message('正在导入…'); await host.install(pack, state !== 'new' && replace.checked);
    }
    message('已启用：' + pack.skin.name); preview.hidden = true; pending = null;
  }));
  exportBtn.addEventListener('click', () => void run(async () => {
    const cat = host.current().cat; if (cat) message('导出完成：' + await host.export(cat.id));
  }));
  el('model-export-folder').addEventListener('click', () => void run(() => host.openExports()));
  el('model-catalog-load').addEventListener('click', () => void run(async () => {
    catalog = null; catalogSource = ''; pending = null; preview.hidden = true; stamp = ''; renderLists();
    el('model-catalog-summary').textContent = '正在读取目录…'; message('正在读取 GitHub 模型目录…');
    try {
      const url = normalizeCatalogUrl(source.value); const packs = await fetchModelCatalog(url);
      source.value = url; catalogSource = url; catalog = packs;
      try { localStorage.setItem(SOURCE_KEY, url); } catch { /* Session still works. */ }
      message('已读取 ' + packs.length + ' 个模型。选择模型可查看修订、许可与可用动作。');
    } catch (e) { el('model-catalog-summary').textContent = '目录未加载成功。可检查地址后重试，或恢复默认来源。'; throw e; }
  }));
  function clearCatalog(): void {
    catalog = null; catalogSource = ''; pending = null; preview.hidden = true; stamp = '';
    el('model-catalog-summary').textContent = '来源已变更，点击“加载 / 刷新”读取目录。'; update(); host.resize();
  }
  source.addEventListener('input', clearCatalog);
  el('model-catalog-reset').addEventListener('click', () => {
    source.value = DEFAULT_MODEL_CATALOG;
    try { localStorage.removeItem(SOURCE_KEY); } catch { /* Session still works. */ }
    clearCatalog(); message('已恢复 bucai2417/kurcat 的模型目录。');
  });
  el('model-publish').addEventListener('click', () => void run(() => host.openPage(MODEL_PUBLISH_PAGE)));
  el('model-guide').addEventListener('click', () => void run(() => host.openPage(MODEL_GUIDE_PAGE)));
  el('panel-models').querySelector('details')?.addEventListener('toggle', () => host.resize());
  update(); return update;
}
