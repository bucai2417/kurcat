//! Versioned appearance and self-contained GLB model packages.
static MODEL_IO: std::sync::Mutex<()> = std::sync::Mutex::new(());
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use crate::cats::{self, CatSkinConfig};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub glb: Option<crate::glb::Profile>,
    pub adapters: Vec<String>,
    pub behavior_contract: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
pub fn contract() -> Value { serde_json::from_str(include_str!("../../src/modelContract.json")).expect("bundled model contract") }
fn text<'a>(v: &'a Value, max: usize) -> Result<&'a str, String> {
    let s = v.as_str().ok_or("Expected text")?;
    if s.trim().is_empty() || s.chars().count() > max || s.chars().any(|c| c.is_control()) { return Err("Invalid text length or control characters".into()); }
    Ok(s.trim())
}
fn color(v: &Value) -> bool {
    let Some(s) = v.as_str() else { return false; };
    if s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|c| c.is_ascii_hexdigit()) { return true; }
    let (prefix, count) = if s.starts_with("rgba(") { ("rgba(", 4) } else { ("rgb(", 3) };
    let Some(inner) = s.strip_prefix(prefix).and_then(|s| s.strip_suffix(')')) else { return false; };
    let values: Vec<_> = inner.split(',').collect();
    values.len() == count && values.iter().enumerate().all(|(i, s)| { let part = s.trim(); let pieces: Vec<_> = part.split('.').collect();
        if pieces.len() > 2 || pieces.iter().any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit())) { return false; }
        part.parse::<f64>().map(|v| v.is_finite() && v >= 0.0 && v <= if i == 3 { 1.0 } else { 255.0 }).unwrap_or(false) })
}
pub fn validate_profile(profile: &ModelProfile) -> Result<(), String> {
    let c = contract();
    if profile.behavior_contract != c["behaviorContract"].as_str().unwrap() {
        return Err(format!("不支持的行为版本：{}；当前支持 {}", profile.behavior_contract, c["behaviorContract"].as_str().unwrap()));
    }
    if profile.adapters.is_empty() || profile.adapters.len() > 2 { return Err("profile.adapters 需要 1–2 个适配器".into()); }
    let mut modes = std::collections::HashSet::new();
    for adapter in &profile.adapters {
        let Some(info) = c["adapters"].get(adapter.as_str()) else {
            let supported = c["adapters"].as_object().unwrap().keys().cloned().collect::<Vec<_>>().join("、");
            return Err(format!("不支持的模型适配器：{}。当前支持：{}。请检查拼写或更新 DIY-Cat。3D 奶蛙需要版本 2 的 GLB 模型包。", adapter, supported));
        };
        if !modes.insert(info["mode"].as_str().unwrap()) { return Err("同一个 2D/3D 模式只能声明一个适配器".into()); }
    }
    let is_glb = profile.adapters.iter().any(|a| a == "three-glb-v1" || a == "three-naiwa-v1");
    if is_glb != profile.glb.is_some() { return Err("GLB 适配器需要 profile.glb 配置".into()); }
    if let Some(g) = &profile.glb { g.validate()?; }
    for field in [&profile.author, &profile.license].into_iter().flatten() { text(&json!(field), 100)?; }
    if let Some(revision) = profile.revision {
        if revision == 0 || revision > 2147483647 { return Err("模型修订号需要 1–2147483647 的整数".into()); }
    }
    if let Some(description) = &profile.description { text(&json!(description), 240)?; }
    Ok(())
}
pub fn validate(value: Value) -> Result<CatSkinConfig, String> {
    if value.to_string().len() > if value["version"] == 2 { crate::glb::MAX_PACKAGE } else { 262144 } { return Err("外观包限 256 KB，GLB 模型包限 23 MiB".into()); }
    if value["format"] != "kurocat-model" || (value["version"] != 1 && value["version"] != 2) { return Err("需要版本 1 或 2 的模型包".into()); }
    let c = contract();
    let profile: ModelProfile = serde_json::from_value(value["profile"].clone()).map_err(|e| e.to_string())?;
    validate_profile(&profile)?;
    if let Some(g) = &profile.glb {
        if value["version"] != 2 || value["asset"].get("url").is_some() { return Err("本地安装需要版本 2 的内嵌 GLB；商城请先下载资源".into()); }
        let bytes = crate::glb::decode(value["asset"]["data"].as_str().ok_or("缺少 asset.data")?)?;
        if profile.adapters.iter().any(|a| a == "three-naiwa-v1") { crate::glb::validate_naiwa(&bytes, g)?; }
        else { crate::glb::validate(&bytes, g)?; }
    } else if value["version"] != 1 || value.get("asset").is_some() { return Err("外观模型使用版本 1".into()); }
    let s = &value["skin"];
    let id = text(&s["id"], 36)?;
    if !id.as_bytes()[0].is_ascii_lowercase() && !id.as_bytes()[0].is_ascii_digit() { return Err("Invalid model ID".into()); }
    if !id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_') || cats::builtin_cats().iter().any(|c| c.id == id) { return Err("Invalid or reserved model ID".into()); }
    let mut skin = json!({ "id": id, "name": text(&s["name"], 48)?, "builtin": false });
    if !s["emoji"].is_null() { skin["emoji"] = json!(text(&s["emoji"], 12)?); }
    for key in c["skinRules"]["requiredColors"].as_array().unwrap() {
        if !color(&s[key.as_str().unwrap()]) { return Err(format!("Invalid color: {}", key)); }
    }
    for key in c["skinRules"]["colors"].as_array().unwrap() {
        let k = key.as_str().unwrap();
        if !s[k].is_null() { if !color(&s[k]) { return Err(format!("Invalid color: {}", k)); } skin[k] = s[k].clone(); }
    }
    for key in c["skinRules"]["booleans"].as_array().unwrap() {
        let k = key.as_str().unwrap();
        if !s[k].is_null() { if !s[k].is_boolean() { return Err(format!("Expected boolean: {}", k)); } skin[k] = s[k].clone(); }
    }
    if !s["pattern"].is_null() {
        if !c["skinRules"]["patterns"].as_array().unwrap().contains(&s["pattern"]) { return Err("Invalid coat pattern".into()); }
        skin["pattern"] = s["pattern"].clone();
    }
    if !s["spots"].is_null() {
        let spots = s["spots"].as_array().ok_or("Expected spots array")?;
        if spots.len() > 64 { return Err("At most 64 spots".into()); }
        let mut normalized = Vec::new();
        for spot in spots {
            let mut out = json!({ "part": spot["part"], "color": spot["color"] });
            if !["head","body","leftArm","rightArm"].contains(&spot["part"].as_str().unwrap_or("")) || !color(&spot["color"]) { return Err("Invalid spot part or color".into()); }
            for k in ["x","y","rx","ry","rotation","opacity"] {
                let v = if spot[k].is_null() && k == "rotation" { 0.0 } else if spot[k].is_null() && k == "opacity" { 1.0 } else { spot[k].as_f64().ok_or("Invalid spot coordinate")? };
                let valid = match k { "opacity" => (0.0..=1.0).contains(&v), "rx" | "ry" => v > 0.0 && v <= 300.0, _ => v.abs() <= 360.0 };
                if !v.is_finite() || !valid { return Err(format!("Spot parameter out of range: {}", k)); }
                out[k] = json!(v);
            }
            normalized.push(out);
        }
        skin["spots"] = json!(normalized);
    }
    let mut cat: CatSkinConfig = serde_json::from_value(skin).map_err(|e| e.to_string())?;
    cat.model_profile = Some(profile);
    Ok(cat)
}
pub fn install(value: Value, replace: bool) -> Result<CatSkinConfig, String> {
    let _guard = MODEL_IO.lock().map_err(|_| "模型存储暂不可用".to_string())?;
    let cat = validate(value.clone())?;
    if !replace && cats::cat_exists(&cat.id) { return Err("该模型 ID 已存在；请选择替换，或修改模型包的 ID".into()); }
    let old = cats::all_cats().into_iter().find(|c| c.id == cat.id).and_then(|c| c.model_profile).and_then(|p| p.glb);
    if old.is_none() && !cats::cat_exists(&cat.id) && cats::load_custom_cats().len() >= 50 { return Err("自定义模型最多 50 个，请先删除不需要的模型".into()); }
    if let Some(g) = &cat.model_profile.as_ref().unwrap().glb { crate::glb::save(g, &crate::glb::decode(value["asset"]["data"].as_str().unwrap())?)?; }
    let result = cats::upsert_custom_cat(cat.clone());
    if result.is_err() { if let Some(g) = &cat.model_profile.unwrap().glb { crate::glb::cleanup(g); } }
    if result.is_ok() { if let Some(g) = old { crate::glb::cleanup(&g); } }
    result
}
pub fn export(id: &str) -> Result<Value, String> {
    let _guard = MODEL_IO.lock().map_err(|_| "模型存储暂不可用".to_string())?;
    let cat = cats::all_cats().into_iter().find(|c| c.id == id).ok_or("Model not found")?;
    if id == "dafeiyu" { return Err("大肥鱼使用专用绘制器，暂不支持导出为猫咪模型包".into()); }
    let profile = cat.model_profile.clone().unwrap_or(ModelProfile { adapters: vec!["canvas-cat-v1".into(), "three-cat-v1".into()], behavior_contract: "cat-v1".into(), author: None, license: None, revision: None, description: None, glb: None });
    let copy_id = if cat.builtin { format!("{}-custom", id) } else { id.to_string() };
    let mut skin = serde_json::to_value(cat).map_err(|e| e.to_string())?;
    skin.as_object_mut().unwrap().remove("modelProfile");
    skin["id"] = json!(copy_id); skin["builtin"] = json!(false);
    let asset = profile.glb.as_ref().map(|g| crate::glb::read(g).map(|b| json!({"data": crate::glb::encode(&b)}))).transpose()?;
    let mut package = json!({ "format": "kurocat-model", "version": if asset.is_some() { 2 } else { 1 }, "profile": profile, "skin": skin });
    if let Some(asset) = asset { package["asset"] = asset; }
    validate(package.clone())?;
    Ok(package)
}
pub fn remove(id: &str) -> Result<(), String> {
    let _guard = MODEL_IO.lock().map_err(|_| "模型存储暂不可用".to_string())?;
    if cats::builtin_cats().iter().any(|c| c.id == id) { return Err("内置模型不能删除".into()); }
    if !cats::all_cats().iter().any(|c| c.id == id) { return Err("模型不存在或已被删除".into()); }
    let old = cats::all_cats().into_iter().find(|c| c.id == id).and_then(|c| c.model_profile).and_then(|p| p.glb);
    if !cats::delete_custom_cat(id)? { return Err("模型不存在或已被删除".into()); }
    if let Some(g) = old { crate::glb::cleanup(&g); }
    Ok(())
}
pub fn open_exports() -> Result<(), String> {
    let dir = crate::config::app_data_dir().join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe").arg(&dir).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("/usr/bin/open").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}
pub fn export_file(id: &str) -> Result<String, String> {
    let package = export(id)?;
    let dir = crate::config::app_data_dir().join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stem = package["skin"]["id"].as_str().ok_or("Missing model ID")?;
    for n in 0..10000 {
        let suffix = if n == 0 { String::new() } else { format!("-{}", n) };
        let path = dir.join(format!("{}{}.kurocat.json", stem, suffix));
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => { file.write_all(serde_json::to_string_pretty(&package).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?; return Ok(path.to_string_lossy().into_owned()); },
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Export filenames exhausted".into())
}
pub fn mode(cat: &CatSkinConfig, preferred: &str) -> String {
    if cat.id == "dafeiyu" { return "2d".into(); }
    if let Some(p) = &cat.model_profile {
        let c = contract();
        if p.adapters.iter().any(|a| c["adapters"][a.as_str()]["mode"] == preferred) { return preferred.into(); }
        return p.adapters.first().and_then(|a| c["adapters"][a.as_str()]["mode"].as_str()).unwrap_or("2d").into();
    }
    if preferred == "3d" { "3d".into() } else { "2d".into() }
}
pub fn actions(id: &str, preferred: &str) -> Value {
    let c = contract();
    if id == "dafeiyu" { return c["specialModels"]["dafeiyu"]["actions"].clone(); }
    let all = cats::all_cats();
    let cat = all.iter().find(|cat| cat.id == id);
    let actual = cat.map(|cat| mode(cat, preferred)).unwrap_or_else(|| preferred.into());
    if actual == "3d" && cat.and_then(|cat| cat.model_profile.as_ref()).is_some_and(|p| p.adapters.iter().any(|a| a == "three-naiwa-v1")) {
        return c["adapters"]["three-naiwa-v1"]["actions"].clone();
    }
    if actual == "3d" { if let Some(g) = cat.and_then(|c| c.model_profile.as_ref()).and_then(|p| p.glb.as_ref()) {
        let mut actions: Vec<&str> = g.animations.keys().map(String::as_str).filter(|k| !["idle","typing","mouse","angry","pet"].contains(k)).collect();
        actions.push("calm"); return json!(actions);
    } }
    if let Some(adapter) = cat
        .and_then(|cat| cat.model_profile.as_ref())
        .and_then(|p| p.adapters.iter().find(|a| c["adapters"][a.as_str()]["mode"] == actual))
    {
        return c["adapters"][adapter.as_str()]["actions"].clone();
    }
    c["adapters"][if actual == "3d" { "three-cat-v1" } else { "canvas-cat-v1" }]["actions"].clone()
}


#[cfg(test)]
mod tests {
    use super::*;

    fn example() -> Value {
        serde_json::from_str(include_str!("../../tests/fixtures/model-pack.kurocat.json"))
            .expect("bundled UTF-8 model example")
    }

    #[test]
    fn bundled_model_preserves_chinese_and_modes() {
        let cat = validate(example()).unwrap();
        assert_eq!(cat.name, "薄荷云朵");
        assert!(!cat.builtin);
        assert_eq!(mode(&cat, "2d"), "2d");
        assert_eq!(mode(&cat, "3d"), "3d");
        assert_eq!(cat.model_profile.as_ref().unwrap().author.as_deref(), Some("KuroCat 示例"));
        assert_eq!(cat.model_profile.as_ref().unwrap().revision, Some(1));
        assert!(cat.model_profile.as_ref().unwrap().description.as_ref().unwrap().contains("打盹惊醒"));
        let mut legacy = example();
        legacy["profile"].as_object_mut().unwrap().remove("revision");
        legacy["profile"].as_object_mut().unwrap().remove("description");
        assert!(validate(legacy).is_ok());
        let mut only_three = example();
        only_three["profile"]["adapters"] = json!(["three-cat-v1"]);
        assert_eq!(mode(&validate(only_three).unwrap(), "2d"), "3d");
    }

    #[test]
    fn original_frog_package_and_legacy_milk_cat_keep_distinct_rigs() {
        let package: Value = serde_json::from_str(include_str!("../../tests/fixtures/naiwa.kurocat.json"))
            .expect("original UTF-8 frog package");
        let frog = validate(package.clone()).unwrap();
        assert_eq!(frog.name, "奶蛙");
        assert_eq!(frog.model_profile.as_ref().unwrap().adapters, vec!["canvas-naiwa-v1".to_string()]);
        assert_eq!(frog.model_profile.as_ref().unwrap().author.as_deref(), Some("奶蛙"));
        assert_eq!(mode(&frog, "3d"), "2d");
        let c = contract();
        let actions = c["adapters"]["canvas-naiwa-v1"]["actions"].as_array().unwrap();
        for action in ["drink", "tailGround", "calm", "frogHop", "frogCroak", "bellyPat", "frogSway", "frogPeek", "footSwing"] {
            assert!(actions.contains(&json!(action)));
        }
        assert!(c["rigs"]["naiwa"]["sounds"].as_array().unwrap().is_empty());
        let normalized = serde_json::to_value(&frog).unwrap();
        let roundtrip = json!({"format": "kurocat-model", "version": 1,
            "profile": frog.model_profile.clone(), "skin": normalized});
        assert_eq!(validate(roundtrip).unwrap().name, "奶蛙");
        // User's older milk-cat skin also uses the ID naiwa, without an adapter.
        let mut legacy = frog.clone();
        legacy.model_profile = None;
        legacy.name = "奶猫".into();
        assert_eq!(legacy.id, "naiwa");
        assert_eq!(mode(&legacy, "3d"), "3d");
        let builtins = cats::builtin_cats();
        let ids: std::collections::HashSet<_> = builtins.iter().map(|cat| &cat.id).collect();
        assert_eq!(ids.len(), builtins.len());
        assert!(builtins.iter().any(|cat| cat.id == "builtin-milk-cat" && cat.name == "奶猫"));
        assert!(builtins.iter().any(|cat| cat.id == "builtin-naiwa" && mode(cat, "3d") == "3d"));
        let mut duplicate_mode = package;
        duplicate_mode["profile"]["adapters"] = json!(["canvas-cat-v1", "canvas-naiwa-v1"]);
        assert!(validate(duplicate_mode).unwrap_err().contains("同一个 2D/3D 模式"));
    }

    #[test]
    fn invalid_model_packages_are_rejected() {
        for (path, bad) in [
            ("/version", json!(2)),
            ("/profile/behaviorContract", json!("unknown")),
            ("/profile/revision", json!(0)),
            ("/profile/revision", json!(-1)),
            ("/profile/revision", json!(1.5)),
            ("/profile/revision", json!(2147483648_u64)),
            ("/profile/description", json!("猫".repeat(241))),
            ("/profile/description", json!("")),
            ("/profile/adapters", json!([])),
            ("/profile/adapters", json!(["three-cat-v1", "three-cat-v1"])),
            ("/profile/adapters", json!(["unknown"])),
            ("/skin/id", json!("black")),
            ("/skin/id", json!("../outside")),
            ("/skin/name", json!("坏\n名称")),
            ("/skin/furColor", json!("rgb(256,0,0)")),
            ("/skin/furColor", json!("rgba(0,0,0,2)")),
            ("/skin/tailFluffy", json!("true")),
        ] {
            let mut package = example();
            *package.pointer_mut(path).unwrap() = bad;
            assert!(validate(package).is_err(), "accepted invalid {}", path);
        }
        let mut package = example();
        package["skin"]["spots"] = json!([{"part":"head", "color":"#000000", "x":0, "y":0, "rx":-1, "ry":1}]);
        assert!(validate(package).is_err());
    }

    #[test]
    fn data_only_normalization_and_spot_defaults() {
        let mut package = example();
        package["skin"]["builtin"] = json!(true);
        package["skin"]["script"] = json!("ignored");
        package["skin"]["spots"] = json!([{"part":"head", "color":"#000000", "x":0, "y":0, "rx":1, "ry":1}]);
        let normalized = serde_json::to_value(validate(package).unwrap()).unwrap();
        assert_eq!(normalized["builtin"], false);
        assert!(normalized["script"].is_null());
        assert_eq!(normalized["spots"][0]["opacity"], 1.0);
        assert_eq!(normalized["spots"][0]["rotation"], 0.0);
    }
}

pub fn read_glb(id: &str) -> Result<String, String> {
    let _guard = MODEL_IO.lock().map_err(|_| "模型存储暂不可用".to_string())?;
    let profile = cats::all_cats().into_iter().find(|c| c.id == id).and_then(|c| c.model_profile).ok_or("已安装模型没有配置")?;
    let p = profile.glb.as_ref().ok_or("已安装模型没有 GLB 资源")?;
    let bytes = crate::glb::read(p)?;
    if profile.adapters.iter().any(|a| a == "three-naiwa-v1") { crate::glb::validate_naiwa(&bytes, p)?; }
    Ok(crate::glb::encode(&bytes))
}
