//! Self-contained GLB storage. Settings contain only a digest and clip mapping.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, io::{Read, Write}, path::PathBuf};
pub const MAX_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_PACKAGE: usize = 23 * 1024 * 1024;
pub const BEHAVIORS: &[&str] = &["idle","typing","mouse","nap","angry","delight","sway","wave","pet","stretch","tilt","slowBlink","groom","cuddle","roll","listen","shimmy","pawCheck"];
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub sha256: String,
    pub animations: BTreeMap<String, String>,
    #[serde(default = "height")] pub height: f64,
    #[serde(default)] pub yaw: f64,
}
fn height() -> f64 { 2.3 }
impl Profile {
    pub fn validate(&self) -> Result<(), String> {
        if self.sha256.len() != 64 || !self.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) { return Err("GLB 的 SHA-256 格式不正确".into()); }
        if !self.height.is_finite() || !(0.5..=4.).contains(&self.height) || !self.yaw.is_finite() || self.yaw.abs() > 180. { return Err("GLB 高度或朝向超出范围".into()); }
        for (key, name) in &self.animations {
            if !BEHAVIORS.contains(&key.as_str()) || name.trim().is_empty() || name.chars().count() > 100 || name.chars().any(char::is_control) { return Err("GLB 动作映射不正确".into()); }
        }
        Ok(())
    }
}
const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
pub fn encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for b in bytes.chunks(3) {
        let n = (b[0] as u32) << 16 | (*b.get(1).unwrap_or(&0) as u32) << 8 | *b.get(2).unwrap_or(&0) as u32;
        out.push(ALPHABET[(n >> 18) as usize] as char); out.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        out.push(if b.len() > 1 { ALPHABET[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if b.len() > 2 { ALPHABET[(n & 63) as usize] as char } else { '=' });
    }
    out
}
pub fn decode(s: &str) -> Result<Vec<u8>, String> {
    if s.is_empty() || s.len() % 4 != 0 || s.len() > (MAX_BYTES + 2) / 3 * 4 { return Err("GLB Base64 无效或超过 16 MiB".into()); }
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    for (i, chunk) in s.as_bytes().chunks_exact(4).enumerate() {
        let pad = if chunk[2] == b'=' { 2 } else if chunk[3] == b'=' { 1 } else { 0 };
        if pad > 0 && (i + 1 != s.len() / 4 || chunk[3] != b'=') { return Err("GLB Base64 填充错误".into()); }
        let mut n = 0u32;
        for (j, &b) in chunk.iter().enumerate() {
            let v = if j >= 4 - pad { 0 } else { ALPHABET.iter().position(|&a| a == b).ok_or("GLB Base64 字符无效")? as u32 };
            n = (n << 6) | v;
        }
        if (pad == 2 && n & 0xffff != 0) || (pad == 1 && n & 0xff != 0) { return Err("GLB Base64 非规范填充".into()); }
        out.push((n >> 16) as u8); if pad < 2 { out.push((n >> 8) as u8); } if pad < 1 { out.push(n as u8); }
    }
    if out.len() > MAX_BYTES { return Err("GLB 超过 16 MiB".into()); }
    Ok(out)
}
fn inspect(v: &Value, depth: usize) -> Result<(), String> {
    if depth > 64 { return Err("GLB JSON 嵌套过深".into()); }
    match v {
        Value::Object(map) => { if map.contains_key("uri") { return Err("GLB 必须自包含，不允许外部文件或 data URI".into()); } for child in map.values() { inspect(child, depth + 1)?; } },
        Value::Array(items) => for child in items { inspect(child, depth + 1)?; },
        _ => {},
    }
    Ok(())
}
pub fn validate(bytes: &[u8], profile: &Profile) -> Result<(), String> {
    profile.validate()?;
    if bytes.len() < 28 || bytes.len() > MAX_BYTES { return Err("GLB 大小无效".into()); }
    let u32_at = |i: usize| u32::from_le_bytes(bytes[i..i+4].try_into().unwrap()) as usize;
    if &bytes[..4] != b"glTF" || u32_at(4) != 2 || u32_at(8) != bytes.len() { return Err("需要 glTF 2.0 GLB 文件".into()); }
    let mut offset = 12; let mut count = 0; let mut doc = Value::Null; let mut bin = 0; let mut bin_offset = 0;
    while offset < bytes.len() {
        if offset + 8 > bytes.len() { return Err("GLB 数据块截断".into()); }
        let size = u32_at(offset); let kind = u32_at(offset + 4); offset += 8;
        if size % 4 != 0 || size > bytes.len() - offset { return Err("GLB 数据块长度错误".into()); }
        if count == 0 && kind == 0x4e4f534a {
            if size > 2 * 1024 * 1024 { return Err("GLB 元数据超过 2 MiB".into()); }
            doc = serde_json::from_slice(&bytes[offset..offset+size]).map_err(|e| format!("GLB JSON: {}", e))?;
        } else if count == 1 && kind == 0x004e4942 { bin = size; bin_offset = offset; } else { return Err("GLB 只能包含 JSON 和 BIN 数据块".into()); }
        count += 1; offset += size;
    }
    if doc["asset"]["version"] != "2.0" || bin == 0 { return Err("GLB 缺少有效资源".into()); }
    let buffers = doc["buffers"].as_array().ok_or("GLB 缺少缓冲区")?;
    let len = buffers.first().and_then(|b| b["byteLength"].as_u64()).ok_or("GLB 缓冲区长度无效")?;
    if buffers.len() != 1 || len > bin as u64 || (bin as u64) - len > 3 { return Err("GLB 缓冲区长度不匹配".into()); }
    inspect(&doc, 0)?;
    for (field, limit) in [("nodes",4096),("meshes",512),("animations",64),("accessors",8192),("bufferViews",8192),("images",16),("textures",8192),("skins",8192),("scenes",8192)] {
        if let Some(v) = doc.get(field) { if v.as_array().map_or(true, |a| a.len() > limit) { return Err(format!("GLB {} 超过复杂度限制", field)); } }
    }
    if doc["meshes"].as_array().map_or(true, |a| a.is_empty()) { return Err("GLB 没有网格".into()); }
    if let Some(views) = doc["bufferViews"].as_array() { for v in views {
        let offset = match v.get("byteOffset") { None => 0, Some(n) => n.as_u64().ok_or("GLB bufferView 偏移无效")? }; let size = v["byteLength"].as_u64().ok_or("GLB bufferView 长度无效")?;
        if v["buffer"].as_u64() != Some(0) || offset > len || size > len - offset { return Err("GLB bufferView 超出边界".into()); }
    } }
    let views = doc["bufferViews"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let valid_index = |v: &Value, size: usize| v.as_u64().is_some_and(|i| i < size as u64);
    let mut allocation = 0u64;
    if let Some(accessors) = doc["accessors"].as_array() { for a in accessors {
        let count = a["count"].as_u64().ok_or("GLB accessor count 无效")?;
        let width = match a["type"].as_str().unwrap_or("") { "SCALAR" => 1, "VEC2" => 2, "VEC3" => 3, "VEC4" | "MAT2" => 4, "MAT3" => 9, "MAT4" => 16, _ => return Err("GLB accessor 类型无效".into()) };
        if count == 0 || count > 2_000_000 || ![5120,5121,5122,5123,5125,5126].contains(&a["componentType"].as_u64().unwrap_or(0)) || (a.get("bufferView").is_some() && !valid_index(&a["bufferView"], views.len())) { return Err("GLB accessor 无效或过大".into()); }
        allocation += count * width * 4;
    } }
    if allocation > 128 * 1024 * 1024 { return Err("GLB 解码数据超过 128 MiB".into()); }
    let nodes = doc["nodes"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let mut parents = vec![false; nodes.len()];
    let mut state = vec![0u8; nodes.len()];
    fn walk(i: usize, depth: usize, nodes: &[Value], parents: &mut [bool], state: &mut [u8]) -> Result<(), String> {
        if depth > 128 || state[i] == 1 { return Err("GLB 节点循环或层级过深".into()); }
        if state[i] == 2 { return Ok(()); }
        if !nodes[i].is_object() { return Err("GLB 节点无效".into()); }
        state[i] = 1;
        if let Some(children) = nodes[i].get("children") { for child in children.as_array().ok_or("GLB 子节点列表无效")? {
            let c = child.as_u64().filter(|n| *n < nodes.len() as u64).ok_or("GLB 子节点越界")? as usize;
            if parents[c] { return Err("GLB 子节点重复父级".into()); }
            parents[c] = true; walk(c, depth + 1, nodes, parents, state)?;
        } }
        state[i] = 2; Ok(())
    }
    for i in 0..nodes.len() { walk(i, 0, nodes, &mut parents, &mut state)?; }
    if let Some(scenes) = doc["scenes"].as_array() { for scene in scenes {
        if !scene.is_object() { return Err("GLB 场景无效".into()); }
        if let Some(roots) = scene.get("nodes") { for n in roots.as_array().ok_or("GLB 场景节点无效")? { if !valid_index(n, nodes.len()) { return Err("GLB 场景节点越界".into()); } } }
    } }
    let mut pixels = 0u64;
    if let Some(images) = doc["images"].as_array() { for image in images {
        if !valid_index(&image["bufferView"], views.len()) { return Err("GLB 纹理需内嵌 PNG/JPEG".into()); }
        let v = &views[image["bufferView"].as_u64().unwrap() as usize];
        let start = bin_offset + v["byteOffset"].as_u64().unwrap_or(0) as usize;
        let data = &bytes[start..start + v["byteLength"].as_u64().unwrap() as usize];
        pixels += image_pixels(data, image["mimeType"].as_str().unwrap_or(""))?;
    } }
    if pixels > 16 * 1024 * 1024 { return Err("GLB 纹理合计不能超过 1600 万像素".into()); }
    let supported = ["KHR_materials_clearcoat","KHR_materials_unlit","KHR_materials_emissive_strength","KHR_materials_ior","KHR_materials_specular","KHR_materials_transmission","KHR_materials_volume","KHR_materials_sheen","KHR_materials_iridescence","KHR_materials_anisotropy","KHR_texture_transform","KHR_mesh_quantization"];
    for field in ["extensionsUsed", "extensionsRequired"] {
        if let Some(v) = doc.get(field) { for ext in v.as_array().ok_or("GLB 扩展列表无效")? {
            let e = ext.as_str().ok_or("GLB 扩展名称无效")?;
            if ["KHR_draco_mesh_compression","EXT_meshopt_compression","KHR_texture_basisu"].contains(&e) || (field == "extensionsRequired" && !supported.contains(&e)) { return Err(format!("不支持 GLB 扩展 {}，请使用未压缩的自包含 GLB", e)); }
        } }
    }
    let mut names = std::collections::HashSet::new();
    if let Some(clips) = doc["animations"].as_array() { for (i, clip) in clips.iter().enumerate() {
        if !clip.is_object() || clip.get("name").is_some_and(|n| !n.is_string()) { return Err("GLB 动作名称无效".into()); }
        let name = clip["name"].as_str().filter(|s| !s.is_empty()).map(str::to_string).unwrap_or_else(|| format!("animation_{}",i));
        if !names.insert(name) { return Err("GLB 动作名称重复".into()); }
    } }
    for clip in profile.animations.values() { if !names.contains(clip) { return Err(format!("GLB 缺少动画片段 {}",clip)); } }
    if crate::updater::hash_bytes(bytes) != profile.sha256 { return Err("GLB SHA-256 不匹配".into()); }
    Ok(())
}
fn image_pixels(b: &[u8], mime: &str) -> Result<u64, String> {
    let checked = |w: u32, h: u32| if w == 0 || h == 0 || w > 4096 || h > 4096 { Err("GLB 纹理尺寸需在 1–4096 像素之间".to_string()) } else { Ok(w as u64 * h as u64) };
    if mime == "image/png" && b.len() >= 24 && &b[..8] == b"\x89PNG\r\n\x1a\n" && &b[12..16] == b"IHDR" { return checked(u32::from_be_bytes(b[16..20].try_into().unwrap()), u32::from_be_bytes(b[20..24].try_into().unwrap())); }
    if mime == "image/jpeg" && b.starts_with(&[255,216]) {
        let mut at = 2;
        while at + 4 <= b.len() {
            if b[at] != 255 { break; } at += 1;
            while at < b.len() && b[at] == 255 { at += 1; }
            if at + 3 > b.len() { break; }
            let marker = b[at]; at += 1;
            if marker == 218 || marker == 217 { break; }
            let len = u16::from_be_bytes([b[at],b[at+1]]) as usize;
            if len < 2 || at + len > b.len() { break; }
            if [192,193,194].contains(&marker) && len >= 8 { return checked(u16::from_be_bytes([b[at+5],b[at+6]]) as u32, u16::from_be_bytes([b[at+3],b[at+4]]) as u32); }
            at += len;
        }
    }
    Err("GLB 纹理不是有效的 PNG 或常规 JPEG".into())
}
fn path(p: &Profile) -> Result<PathBuf, String> { p.validate()?; Ok(crate::config::app_data_dir().join("models").join(format!("{}.glb", p.sha256))) }
pub fn read(p: &Profile) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    std::fs::File::open(path(p)?).map_err(|_| "模型文件丢失，请重新导入 GLB 模型包".to_string())?.take((MAX_BYTES + 1) as u64).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    validate(&bytes, p)?; Ok(bytes)
}
pub fn save(p: &Profile, bytes: &[u8]) -> Result<(), String> {
    validate(bytes,p)?; let dest = path(p)?;
    if dest.exists() && read(p).is_ok() { return Ok(()); }
    std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    // The model operation lock covers readers and writers. Only invalid existing
    // files are removed, after a fully flushed replacement is ready.
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp = dest.with_extension(format!("{}.{}.tmp", std::process::id(), stamp));
    let result = (|| -> Result<(), String> {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
        file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        drop(file);
        if dest.exists() { std::fs::remove_file(&dest).map_err(|e| e.to_string())?; }
        std::fs::rename(&temp, &dest).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = std::fs::remove_file(&temp); }
    result
}

pub fn cleanup(p: &Profile) {
    if !crate::cats::all_cats().iter().any(|c| c.model_profile.as_ref().and_then(|m| m.glb.as_ref()).is_some_and(|g| g.sha256 == p.sha256)) {
        if let Ok(path) = path(p) { let _ = std::fs::remove_file(path); }
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn base64_roundtrip_and_rejections() {
        for bytes in [b"f".as_slice(), b"fo", b"foo", b"foobar", &[0,255,128,15]] { assert_eq!(decode(&encode(bytes)).unwrap(),bytes); }
        for value in ["A", "====", "A===", "Zg==AAAA", "Zg=A", "Zh==", "Zm9=", "!!!!"] { assert!(decode(value).is_err(), "{}", value); }
    }
}
