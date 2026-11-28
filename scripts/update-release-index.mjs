import { mkdir, writeFile } from 'node:fs/promises';
const response = await fetch('https://api.github.com/repos/bucai2417/kurcat/releases?per_page=100', {
  headers: { 'User-Agent': 'DIY-Cat-release-index', Accept: 'application/vnd.github+json',
    ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw Error(`GitHub HTTP ${response.status}`);
const ownAsset = a => typeof a.name === 'string' && /^DIY-Cat-[A-Za-z0-9._-]+$/i.test(a.name)
  && typeof a.browser_download_url === 'string'
  && /^https:\/\/github\.com\/bucai2417\/kurcat\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(a.browser_download_url)
  && a.browser_download_url.split('/').at(-1) === a.name
  && !['.','..'].includes(a.browser_download_url.split('/').at(-2));
const releases = (await response.json()).map(r => ({...r, assets: (r.assets ?? []).filter(ownAsset)})).filter(r => !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+$/i.test(r.tag_name)
  && r.assets.some(a => a.name.toLowerCase().startsWith('diy-cat-'))).map(r => ({
    tag_name: r.tag_name, html_url: `https://github.com/bucai2417/kurcat/releases/tag/${r.tag_name}`, body: r.body, published_at: r.published_at,
    draft: false, prerelease: false,
    assets: r.assets.map(({name, browser_download_url, size, digest}) => ({name, browser_download_url, size, digest})),
  }));
const json = JSON.stringify(releases, null, 2) + '\n';
if (Buffer.byteLength(json) > 2 * 1024 * 1024) throw Error('Release index exceeds 2 MiB');
await mkdir('updates', { recursive: true });
await writeFile('updates/stable.json', json, 'utf8');
console.log(`Release index: ${releases.map(r => r.tag_name).join(', ')}`);
