//! Independent, data-only keyboard/mouse packages. Keep validation aligned with resourcePack.ts.
use serde_json::{json, Map, Value};
use std::{fs, io::Write, sync::Mutex};
static WRITE_LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES: usize = 262144;
pub fn contract() -> Value { serde_json::from_str(include_str!("../../src/resourceContract.json")).expect("resource contract") }
fn text(v: &Value, name: &str, max: usize) -> Result<String, String> {
    let s = v.as_str().ok_or_else(|| format!("{} 需要文字", name))?;
    if s.trim().is_empty() || s.chars().count() > max || s.chars().any(|c| c.is_control()) { return Err(format!("{} 格式不正确", name)); }
    Ok(s.trim().into())
}
fn color(v: &Value) -> bool {
    v.as_str().map(|s| s.starts_with('#') && (s.len() == 4 || s.len() == 7) && s[1..].bytes().all(|b| b.is_ascii_hexdigit())).unwrap_or(false)
}
pub fn validate(v: Value) -> Result<Value, String> {
    if serde_json::to_vec(&v).map_err(|e| e.to_string())?.len() > MAX_BYTES { return Err("资源包不能超过 256 KB".into()); }
    if v["format"] != "diy-cat-resource" || v["version"] != 1 { return Err("资源包格式或版本不正确".into()); }
    let kind = v["kind"].as_str().filter(|s| *s == "keyboard" || *s == "mouse").ok_or("资源类型必须是 keyboard 或 mouse")?;
    let id = text(&v["id"], "ID", 36)?;
    if id.starts_with("builtin-") || !id.bytes().next().map(|b| b.is_ascii_lowercase() || b.is_ascii_digit()).unwrap_or(false) || !id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_') { return Err("资源 ID 不合法或使用了内置前缀".into()); }
    let modes = v["modes"].as_array().ok_or("缺少 modes")?;
    if modes.is_empty() || modes.len() > 2 || modes.iter().any(|m| m != "2d" && m != "3d") || (modes.len() == 2 && modes[0] == modes[1]) { return Err("modes 只允许不重复的 2d、3d".into()); }
    let rev = v["revision"].as_u64().filter(|n| *n >= 1 && *n <= 2147483647).ok_or("revision 范围为 1–2147483647")?;
    let input = v["skin"].as_object().ok_or("缺少 skin")?;
    let rules = contract(); let mut skin = Map::new();
    for field in rules[kind]["colors"].as_array().unwrap() {
        let field = field.as_str().unwrap(); let value = input.get(field).unwrap_or(&Value::Null);
        if !color(value) { return Err(format!("{} 需要 #RGB 或 #RRGGBB", field)); } skin.insert(field.into(), value.clone());
    }
    for (field, choices) in rules[kind]["enums"].as_object().unwrap() {
        let value = input.get(field).unwrap_or(&Value::Null);
        if !choices.as_array().unwrap().contains(value) { return Err(format!("{} 选项无效", field)); } skin.insert(field.clone(), value.clone());
    }
    if kind == "keyboard" {
        let scale = v["skin"]["patternScale"].as_f64().filter(|n| n.is_finite() && *n >= 0.2 && *n <= 4.0).ok_or("patternScale 范围为 0.2–4")?;
        skin.insert("patternScale".into(), json!(scale));
        if let Some(raw) = input.get("keycaps").filter(|v| !v.is_null()) {
            let caps = raw.as_object().ok_or("keycaps 需要对象")?; if caps.len() > 200 { return Err("keycaps 最多 200 项".into()); }
            let mut clean = Map::new();
            for (id, cap) in caps {
                if !rules["keyboard"]["keyIds"].as_array().unwrap().contains(&json!(id)) || !cap.is_object() { return Err("无效按键 ID".into()); }
                let mut item = Map::new();
                for field in ["top","side","text"] { if let Some(value) = cap.get(field).filter(|v| !v.is_null()) { if !color(value) { return Err("键帽颜色无效".into()); } item.insert(field.into(), value.clone()); } }
                for field in ["label","emoji"] { if let Some(value) = cap.get(field).filter(|v| !v.is_null()) { let s = value.as_str().ok_or("键帽文字无效")?; if s.chars().count() > 24 || s.chars().any(|c| c.is_control()) { return Err("键帽文字最多 24 字符".into()); } item.insert(field.into(), value.clone()); } }
                clean.insert(id.clone(), Value::Object(item));
            }
            skin.insert("keycaps".into(), Value::Object(clean));
        }
    } else {
        let glow = input.get("glow").filter(|v| !v.is_null()).cloned().unwrap_or(json!(""));
        if glow != "" && !color(&glow) { return Err("glow 需要颜色或空字符串".into()); } skin.insert("glow".into(), glow);
    }
    let mut out = json!({"format":"diy-cat-resource","version":1,"kind":kind,"id":id,"name":text(&v["name"],"名称",48)?,"modes":modes,"revision":rev,"skin":skin});
    for field in ["author","license","description"] { if let Some(value) = v.get(field).filter(|v| !v.is_null()) { out[field] = json!(text(value,field,if field == "description" {240} else {100})?); } }
    Ok(out)
}
fn path() -> std::path::PathBuf { crate::config::app_data_dir().join("resources.json") }
pub fn list() -> Result<Vec<Value>, String> {
    let raw = match fs::read(path()) { Ok(raw) => raw, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]), Err(e) => return Err(e.to_string()) };
    if raw.len() > MAX_BYTES * 50 { return Err("本地资源库过大".into()); }
    let packs: Vec<Value> = serde_json::from_slice(&raw).map_err(|e| format!("本地资源库损坏：{}",e))?;
    if packs.len() > 50 { return Err("本地资源库最多 50 个资源".into()); }
    let validated: Vec<Value> = packs.into_iter().map(validate).collect::<Result<_, _>>()?;
    let mut ids = std::collections::HashSet::new();
    if validated.iter().any(|p| !ids.insert(p["id"].as_str().unwrap())) { return Err("本地资源库有重复 ID".into()); }
    Ok(validated)
}
fn save(packs: &[Value]) -> Result<(), String> {
    let path = path(); fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, serde_json::to_vec_pretty(packs).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
pub fn install(pack: Value, replace: bool) -> Result<Value, String> {
    let pack = validate(pack)?; let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut packs = list()?;
    if let Some(index) = packs.iter().position(|p| p["id"] == pack["id"]) {
        if !replace { return Err("同 ID 资源已存在；请勾选替换后重试".into()); }
        if packs[index]["kind"] != pack["kind"] { return Err("同 ID 资源不能更改类型，请使用新 ID".into()); }
        packs[index] = pack.clone();
    } else { if packs.len() >= 50 { return Err("资源库已达 50 个上限".into()); } packs.push(pack.clone()); }
    save(&packs)?; Ok(pack)
}
pub fn remove(id: &str) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?; let mut packs = list()?;
    let before = packs.len(); packs.retain(|p| p["id"] != id);
    if before == packs.len() { return Err("资源不存在或为内置资源".into()); } save(&packs)
}
pub fn export_file(pack: Value) -> Result<String, String> {
    let pack = validate(pack)?; let dir = crate::config::app_data_dir().join("exports"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for n in 0..10000 {
        let suffix = if n == 0 {String::new()} else {format!("-{}",n)};
        let path = dir.join(format!("{}{}.diycat.json", pack["id"].as_str().unwrap(), suffix));
        match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut f) => { f.write_all(serde_json::to_string_pretty(&pack).map_err(|e|e.to_string())?.as_bytes()).map_err(|e|e.to_string())?; return Ok(path.to_string_lossy().into_owned()); },
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("导出文件名已用尽".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn keyboard() -> Value { serde_json::from_str(include_str!("../../model-store/mint-keyboard-3d.diycat.json")).unwrap() }
    #[test]
    fn shared_examples_round_trip_with_chinese() {
        let k = validate(keyboard()).unwrap();
        assert_eq!(k["skin"]["keycaps"]["space"]["label"], "摸鱼时间");
        assert_eq!(validate(k.clone()).unwrap(), k);
        let m: Value = serde_json::from_str(include_str!("../../model-store/mint-mouse-2d.diycat.json")).unwrap();
        assert_eq!(validate(m).unwrap()["kind"], "mouse");
    }
    #[test]
    fn rejects_invalid_ids_modes_and_nested_values() {
        for id in ["../bad", "builtin-evil", "", "中文"] { let mut p=keyboard();p["id"]=json!(id);assert!(validate(p).is_err()); }
        let mut p=keyboard();p["modes"]=json!(["2d","2d"]);assert!(validate(p).is_err());
        let mut p=keyboard();p["revision"]=json!(0);assert!(validate(p).is_err());
        let mut p=keyboard();p["skin"]["patternScale"]=json!(5);assert!(validate(p).is_err());
        let mut p=keyboard();p["skin"]["keycaps"]=json!({"__proto__":{}});assert!(validate(p).is_err());
        let mut p=keyboard();p["extra"]=json!("猫".repeat(90000));assert!(validate(p).is_err());
    }
}
