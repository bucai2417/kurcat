import { BUILTIN_RESOURCES, DEFAULT_RESOURCE_CATALOG, exportResourcePack, fetchResourceCatalog, parseResourceCatalog, parseResourcePack, resourceSlot, type ResourceKind, type ResourcePack, type ResourceSelections } from './resourcePack';
import { normalizeCatalogUrl, type ModelMode } from './modelPack';
import { BUILTIN_DESK_SKINS } from './deskSkin';
import { DEFAULT_BUILTIN_CATS } from './catSkins';
import { ModelPreviews } from './modelPreview';
interface Host {
  capture(kind: ResourceKind, mode: ModelMode): ResourcePack;
  resources(): ResourcePack[]; selected(): ResourceSelections; mode(): ModelMode;
  activate(pack: ResourcePack, mode: ModelMode): Promise<void>; reset(kind: ResourceKind, mode: ModelMode): Promise<void>;
  install(pack: ResourcePack, replace: boolean): Promise<void>; remove(id: string): Promise<void>;
  export(pack: ResourcePack): Promise<string>; openPage(url: string): Promise<void>; resize(): void;
}
export function setupResourceLibrary(host: Host): () => void {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const modeInput = el<HTMLSelectElement>('library-mode');
  const search = el<HTMLInputElement>('resource-search');
  const source = el<HTMLInputElement>('resource-catalog-url');
  const replace = el<HTMLInputElement>('resource-replace');
  const previews = new ModelPreviews();
  let kind: 'pet' | ResourceKind = 'pet';
  let catalog: ResourcePack[] | null = null; let pending: ResourcePack[] = [];
  let busy = false; let stamp = ''; let deleteId = ''; let previewSerial = 0;
  let previewOrigin: HTMLButtonElement | undefined;
  const mode = () => modeInput.value as ModelMode;
  modeInput.value = host.mode();
  source.value = DEFAULT_RESOURCE_CATALOG;
  try { const saved = localStorage.getItem('diy-cat-resource-source'); if (saved) source.value = normalizeCatalogUrl(saved); } catch { /* Default source. */ }
  const all = () => [...BUILTIN_RESOURCES, ...host.resources()];
  const nameOf = (k: ResourceKind) => k === 'keyboard' ? '键盘' : '鼠标';
  const message = (text: string, error = false) => {
    for (const id of ['resource-status','resource-tutorial-status']) { el(id).textContent = text; el(id).classList.toggle('model-error', error); }
    host.resize();
  };
  const button = (label: string, action: () => void, disabled = false) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'kb-pill'; b.textContent = label;
    b.disabled = busy || disabled; b.addEventListener('click', () => { if (!busy) action(); }); return b;
  };
  async function work(task: () => Promise<void>): Promise<void> {
    if (busy) return; busy = true; stamp = ''; render();
    try { await task(); } catch (error) { message(String(error), true); }
    finally { busy = false; stamp = ''; render(); }
  }
  function closePreview() { ++previewSerial; el('resource-gallery').hidden = true; host.resize(); }
  function showImage(pack: ResourcePack, origin: HTMLButtonElement) {
    const serial = ++previewSerial; previewOrigin = origin;
    const previewMode = mode(); el('resource-gallery').hidden = false;
    el('resource-gallery-title').textContent = pack.name + ' · ' + previewMode.toUpperCase();
    const image = el<HTMLImageElement>('resource-gallery-image'); image.hidden = true;
    image.alt = pack.name + ' ' + nameOf(pack.kind) + '在参考猫咪旁的外观';
    el('resource-gallery-status').textContent = '正在生成图片…'; host.resize();
    const desk = { ...BUILTIN_DESK_SKINS[0], [pack.kind]: pack.skin };
    void previews.image(DEFAULT_BUILTIN_CATS[0], previewMode, desk).then(url => {
      if (serial !== previewSerial) return;
      image.src = url; image.hidden = false;
      el('resource-gallery-status').textContent = '预览只替换' + nameOf(pack.kind) + '，参考猫咪和另一配件保持默认外观。'; host.resize();
    }).catch(() => { if (serial === previewSerial) { el('resource-gallery-status').textContent = '此设备无法生成图片，请重新点击预览，或切换适用模式。'; host.resize(); } });
    el('resource-gallery').scrollIntoView({ block: 'nearest' });
  }
  function stage(packs: ResourcePack[]) {
    if (!packs.length) throw Error('文件中没有可导入的资源');
    if (packs.length > 50 || new Set(packs.map(p => p.id)).size !== packs.length) throw Error('一次最多 50 个资源，ID 不能重复');
    pending = packs; replace.checked = false; deleteId = '';
    el('resource-pending').hidden = false;
    el('resource-pending-text').textContent = packs.map(p => p.name + '（' + nameOf(p.kind) + ' · ' + p.modes.join('/').toUpperCase() + '）').join('、');
    message('已校验 ' + packs.length + ' 个资源。导入后可在对应分类与模式中使用。'); host.resize();
    el('resource-pending').scrollIntoView({ block: 'nearest' });
  }
  function row(pack: ResourcePack, remote: boolean): HTMLElement {
    const item = document.createElement('div'); item.className = 'model-entry resource-entry'; item.setAttribute('role','listitem');
    const title = document.createElement('strong'); title.className = 'model-entry-title'; title.textContent = pack.name;
    const meta = document.createElement('p'); meta.className = 'model-copy';
    const installed = host.resources().find(p => p.id === pack.id);
    const current = host.selected()[resourceSlot(pack.kind, mode())] === pack.id;
    const same = installed && JSON.stringify(installed) === JSON.stringify(pack);
    meta.textContent = [pack.modes.join(' / ').toUpperCase(), '修订 ' + pack.revision, pack.author, pack.id.startsWith('builtin-') ? '内置' : remote ? same ? '已安装' : installed ? '本机已有同 ID' : '未安装' : current ? '正在使用' : '已安装'].filter(Boolean).join(' · ');
    const controls = document.createElement('div'); controls.className = 'model-actions';
    const preview = button('查看图片', () => showImage(pack, preview)); controls.append(preview);
    if (remote) controls.append(button(same ? '已安装' : installed ? '检查并替换' : '安装', () => stage([pack]), !!same));
    else {
      controls.append(button(current ? '已用于 ' + mode().toUpperCase() : '用于 ' + mode().toUpperCase(), () => { const selectedMode = mode(); void work(async () => { await host.activate(pack, selectedMode); message('已替换 ' + selectedMode.toUpperCase() + ' ' + nameOf(pack.kind) + '；键帽编辑器中的个人设置仍优先。'); }); }, current));
      controls.append(button('导出', () => void work(async () => message('已导出：' + await host.export(exportResourcePack(pack))))));
      if (!pack.id.startsWith('builtin-')) {
        controls.append(button(deleteId === pack.id ? '确认删除' : '删除', () => {
          if (deleteId !== pack.id) { deleteId = pack.id; stamp = ''; render(); message('再次点击“确认删除”移除此资源；已选模式将恢复桌面主题。'); return; }
          void work(async () => { await host.remove(pack.id); deleteId = ''; message('已删除 ' + pack.name); });
        }));
        if (deleteId === pack.id) controls.append(button('取消删除', () => { deleteId = ''; stamp = ''; render(); }));
      }
    }
    item.append(title, meta, controls); return item;
  }
  function matches(pack: ResourcePack) {
    const query = search.value.trim().toLocaleLowerCase();
    return pack.kind === kind && pack.modes.includes(mode()) && (!query || [pack.name,pack.id,pack.author].join(' ').toLocaleLowerCase().includes(query));
  }
  function render() {
    const next = JSON.stringify([kind,mode(),search.value,host.resources(),host.selected(),catalog,busy,deleteId]); if (next === stamp) return; stamp = next;
    el('pet-library-content').hidden = kind !== 'pet'; el('accessory-library-content').hidden = kind === 'pet';
    document.querySelectorAll<HTMLButtonElement>('[data-library-kind]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.libraryKind === kind)); b.disabled = busy; });
    for (const id of ['resource-install','resource-cancel','resource-file','resource-catalog-load','resource-catalog-reset','resource-export-all','resource-export-current','resource-reset','resource-template','resource-replace']) (el(id) as HTMLButtonElement).disabled = busy;
    modeInput.disabled = busy;
    if (kind !== 'pet') {
      const selected = all().find(p => p.id === host.selected()[resourceSlot(kind as ResourceKind,mode())] && p.kind===kind && p.modes.includes(mode()));
      el('resource-current').textContent = mode().toUpperCase() + ' ' + nameOf(kind) + '：' + (selected?.name ?? '跟随桌面主题');
      for (const [id,packs,remote] of [['resource-list',all(),false],['resource-catalog-list',catalog ?? [],true]] as const) {
        const list = el(id); list.replaceChildren(); const filtered = packs.filter(matches);
        for (const p of filtered) list.append(row(p,remote));
        if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'model-copy'; empty.textContent = remote && !catalog ? '加载目录后显示可安装资源。' : '当前分类与模式没有匹配资源，试试清除搜索。'; list.append(empty); }
      }
    }
    host.resize();
  }
  function changeFilter() {
    deleteId = ''; closePreview();
    const petFilter = el<HTMLSelectElement>('model-filter'); petFilter.value = mode(); petFilter.dispatchEvent(new Event('change'));
    stamp = ''; render();
  }
  document.querySelectorAll<HTMLButtonElement>('[data-library-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.libraryKind as typeof kind; changeFilter(); }));
  modeInput.addEventListener('change', changeFilter); search.addEventListener('input', () => { stamp = ''; render(); });
  el('resource-gallery-close').addEventListener('click', () => { closePreview(); if (previewOrigin?.isConnected) previewOrigin.focus({preventScroll:true}); else search.focus({preventScroll:true}); });
  el('resource-reset').addEventListener('click', () => { if (kind !== 'pet') { const k=kind,m=mode(); void work(async () => { await host.reset(k,m); message('已恢复跟随桌面主题。'); }); } });
  el('resource-cancel').addEventListener('click', () => { pending=[]; el('resource-pending').hidden=true; host.resize(); });
  el<HTMLInputElement>('resource-file').addEventListener('change', event => {
    const input = event.target as HTMLInputElement; const files = Array.from(input.files ?? []); input.value='';
    if (!files.length) return;
    void work(async () => {
      if (files.length > 50 || files.reduce((n,f) => n+f.size,0) > 262144) throw Error('一次最多 50 个文件、合计 256 KB');
      const packs: ResourcePack[]=[];
      for (const file of files) { const text = new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()); const raw = JSON.parse(text); packs.push(...(raw?.format === 'diy-cat-resource-catalog' ? parseResourceCatalog(text) : [parseResourcePack(raw)])); }
      stage(packs);
    });
  });
  el('resource-install').addEventListener('click', () => {
    const packs = [...pending]; const allowReplace = replace.checked;
    void work(async () => {
      if (!packs.length) throw Error('请先选择资源包');
      const existing = host.resources();
      for (const p of packs) { const old=existing.find(e=>e.id===p.id); if (old && old.kind!==p.kind) throw Error('同一 ID 不能从键盘改成鼠标，请修改 ID'); if (old && !allowReplace) throw Error('存在同 ID 资源，请确认替换或修改 ID'); }
      if (new Set([...existing,...packs].map(p=>p.id)).size > 50) throw Error('自定义资源最多 50 个，请先导出并删除不需要的资源');
      let count=0;
      try { for (const p of packs) { await host.install(p,allowReplace); count++; } }
      catch(error) { pending=packs.slice(count); el('resource-pending-text').textContent=pending.map(p=>p.name).join('、'); throw Error('已导入 ' + count + ' 个，剩余资源可重试：' + String(error)); }
      pending=[]; el('resource-pending').hidden=true; message('已导入 ' + count + ' 个资源；到对应分类与模式点击“用于”即可替换。');
    });
  });
  el('resource-catalog-load').addEventListener('click', () => void work(async () => {
    const url=normalizeCatalogUrl(source.value); catalog=null; el('resource-catalog-summary').textContent='正在读取当前来源…'; stamp=''; render(); const result=await fetchResourceCatalog(url).catch(error=>{el('resource-catalog-summary').textContent='读取失败，请检查来源或重试。';throw error;}); catalog=result; source.value=url;
    try { localStorage.setItem('diy-cat-resource-source',url); } catch { /* optional persistence */ }
    el('resource-catalog-summary').textContent='已读取 ' + result.length + ' 个资源，按上方分类与模式筛选。'; message('目录加载完成。');
  }));
  el('resource-catalog-reset').addEventListener('click', () => { source.value=DEFAULT_RESOURCE_CATALOG; catalog=null; try { localStorage.removeItem('diy-cat-resource-source'); } catch {} el('resource-catalog-summary').textContent='已恢复默认来源，点击加载读取。'; stamp='';render(); });
  el('resource-export-all').addEventListener('click', () => void work(async () => {
    const packs=[...host.resources()]; if (!packs.length) throw Error('还没有自定义键鼠资源');
    let count=0; try { for(const p of packs) { await host.export(exportResourcePack(p)); count++; } } catch(error) { throw Error('已导出 '+count+' 个：'+String(error)); }
    message('已导出全部 '+count+' 个自定义资源，可在宠物分类打开导出文件夹。');
  }));
  el('resource-export-current').addEventListener('click', () => { if (kind !== 'pet') { const k=kind, m=mode(); void work(async () => { message('已导出当前设计（包含个人键帽设置）：'+await host.export(host.capture(k,m))); }); } });
  el('resource-template').addEventListener('click', () => void work(async () => {
    if(kind==='pet') throw Error('宠物模板请点击“导出当前模型”；键鼠模板请先选择上方键盘或鼠标分类');
    const pack=exportResourcePack(BUILTIN_RESOURCES.find(p=>p.kind===kind)!); pack.id='my-'+kind+'-'+mode(); pack.name='我的'+mode().toUpperCase()+nameOf(kind); pack.modes=[mode()];
    message('已导出创作模板：'+await host.export(pack));
  }));
  el('resource-design-guide').addEventListener('click', () => void work(async () => { await host.openPage('https://github.com/bucai2417/kurcat/blob/main/docs/RESOURCE_AUTHORING.md'); }));
  changeFilter(); return render;
}
