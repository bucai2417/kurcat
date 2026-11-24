use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardSkin {
    pub deck_top: String,
    pub deck_side: String,
    pub deck_edge: String,
    pub bed_fill: String,
    pub key_top: String,
    pub key_side: String,
    pub key_text: String,
    pub mod_key_top: String,
    pub mod_key_side: String,
    pub accent_key_top: String,
    pub accent_key_side: String,
    pub shape: String,
    pub material: String,
    pub pattern: String,
    pub pattern_color: String,
    pub pattern_scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseSkin {
    pub shell: String,
    pub shell_edge: String,
    pub button: String,
    pub button_edge: String,
    pub wheel: String,
    pub outline: String,
    pub silhouette: String,
    pub material: String,
    pub pattern: String,
    #[serde(default)]
    pub glow: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeskSkinConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub builtin: bool,
    pub keyboard: KeyboardSkin,
    pub mouse: MouseSkin,
}

const KEYCAP_SHAPES: [&str; 4] = ["classic", "sa", "flat", "jelly"];
const MOUSE_SHAPES: [&str; 3] = ["oval", "ergonomic", "gaming"];
const PATTERNS: [&str; 6] = ["solid", "carbon", "wood", "marble", "grid", "hologram"];
const MATERIALS: [&str; 5] = ["plastic", "metal", "wood", "glass", "fabric"];

fn norm_hex(raw: &str, fallback: &str) -> String {
    let t = raw.trim().trim_start_matches('#').to_ascii_lowercase();
    let ok = (t.len() == 6 || t.len() == 3) && t.chars().all(|c| c.is_ascii_hexdigit());
    if ok {
        format!("#{}", t)
    } else {
        fallback.to_string()
    }
}

fn pick(raw: &str, allowed: &[&str], fallback: &str) -> String {
    if allowed.contains(&raw.trim()) {
        raw.trim().to_string()
    } else {
        fallback.to_string()
    }
}

pub fn sanitize_skin_id(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "custom-desk".to_string()
    } else {
        trimmed.chars().take(36).collect()
    }
}

fn base_keyboard() -> KeyboardSkin {
    KeyboardSkin {
        deck_top: "#24262c".into(),
        deck_side: "#191a1e".into(),
        deck_edge: "#363840".into(),
        bed_fill: "#d4d6d1".into(),
        key_top: "#f8f8f5".into(),
        key_side: "#d0d2cc".into(),
        key_text: "#2c2f36".into(),
        mod_key_top: "#efefeb".into(),
        mod_key_side: "#c7c9c3".into(),
        accent_key_top: "#f4a524".into(),
        accent_key_side: "#c27a10".into(),
        shape: "classic".into(),
        material: "plastic".into(),
        pattern: "solid".into(),
        pattern_color: "#ffffff".into(),
        pattern_scale: 1.0,
    }
}

fn base_mouse() -> MouseSkin {
    MouseSkin {
        shell: "#ecece7".into(),
        shell_edge: "#c8cac4".into(),
        button: "#fafaf7".into(),
        button_edge: "#c8cac4".into(),
        wheel: "#6b6f78".into(),
        outline: "#2b2d34".into(),
        silhouette: "oval".into(),
        material: "plastic".into(),
        pattern: "solid".into(),
        glow: String::new(),
    }
}

impl DeskSkinConfig {
    pub fn normalized(mut self) -> Self {
        let kb = base_keyboard();
        let ms = base_mouse();
        self.id = sanitize_skin_id(&self.id);
        if self.name.trim().is_empty() {
            self.name = self.id.clone();
        }

        let k = &mut self.keyboard;
        k.deck_top = norm_hex(&k.deck_top, &kb.deck_top);
        k.deck_side = norm_hex(&k.deck_side, &kb.deck_side);
        k.deck_edge = norm_hex(&k.deck_edge, &kb.deck_edge);
        k.bed_fill = norm_hex(&k.bed_fill, &kb.bed_fill);
        k.key_top = norm_hex(&k.key_top, &kb.key_top);
        k.key_side = norm_hex(&k.key_side, &kb.key_side);
        k.key_text = norm_hex(&k.key_text, &kb.key_text);
        k.mod_key_top = norm_hex(&k.mod_key_top, &kb.mod_key_top);
        k.mod_key_side = norm_hex(&k.mod_key_side, &kb.mod_key_side);
        k.accent_key_top = norm_hex(&k.accent_key_top, &kb.accent_key_top);
        k.accent_key_side = norm_hex(&k.accent_key_side, &kb.accent_key_side);
        k.pattern_color = norm_hex(&k.pattern_color, &kb.pattern_color);
        k.shape = pick(&k.shape, &KEYCAP_SHAPES, &kb.shape);
        k.material = pick(&k.material, &MATERIALS, &kb.material);
        k.pattern = pick(&k.pattern, &PATTERNS, &kb.pattern);
        k.pattern_scale = if k.pattern_scale.is_finite() {
            k.pattern_scale.clamp(0.2, 4.0)
        } else {
            1.0
        };

        let m = &mut self.mouse;
        m.shell = norm_hex(&m.shell, &ms.shell);
        m.shell_edge = norm_hex(&m.shell_edge, &ms.shell_edge);
        m.button = norm_hex(&m.button, &ms.button);
        m.button_edge = norm_hex(&m.button_edge, &ms.button_edge);
        m.wheel = norm_hex(&m.wheel, &ms.wheel);
        m.outline = norm_hex(&m.outline, &ms.outline);
        m.silhouette = pick(&m.silhouette, &MOUSE_SHAPES, &ms.silhouette);
        m.material = pick(&m.material, &MATERIALS, &ms.material);
        m.pattern = pick(&m.pattern, &PATTERNS, &ms.pattern);
        m.glow = if m.glow.trim().is_empty() {
            String::new()
        } else {
            let v = norm_hex(&m.glow, "");
            if v == "#" {
                String::new()
            } else {
                v
            }
        };

        self
    }
}

pub fn desk_skins_path() -> PathBuf {
    crate::config::app_data_dir().join("desk-skins.json")
}

pub fn load_custom_desk_skins() -> Vec<DeskSkinConfig> {
    let path = desk_skins_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<Vec<DeskSkinConfig>>(&content) {
            return parsed
                .into_iter()
                .map(|s| {
                    let mut n = s.normalized();
                    n.builtin = false;
                    n
                })
                .collect();
        }
    }
    vec![]
}

pub fn save_custom_desk_skins(skins: &[DeskSkinConfig]) -> Result<(), String> {
    let path = desk_skins_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(skins).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn upsert_desk_skin(skin: DeskSkinConfig) -> Result<DeskSkinConfig, String> {
    let normalized = skin.normalized();
    let mut custom = load_custom_desk_skins();
    if let Some(existing) = custom.iter_mut().find(|s| s.id == normalized.id) {
        *existing = normalized.clone();
    } else {
        custom.push(normalized.clone());
    }
    save_custom_desk_skins(&custom)?;
    Ok(normalized)
}

pub fn delete_desk_skin(id: &str) -> Result<bool, String> {
    let clean = sanitize_skin_id(id);
    let mut custom = load_custom_desk_skins();
    let before = custom.len();
    custom.retain(|s| s.id != clean);
    if custom.len() == before {
        return Ok(false);
    }
    save_custom_desk_skins(&custom)?;
    Ok(true)
}

pub fn desk_skin_schema_guide() -> serde_json::Value {
    serde_json::json!({
        "description": "KuroCat keyboard + mouse desk skin schema. Call upsert_desk_skin then switch_desk_skin to apply it live on the desktop.",
        "keyboardFields": {
            "deckTop/deckSide/deckEdge": "Keyboard case top surface, side wall and rim outline (#rrggbb)",
            "bedFill": "Inner keybed plate colour behind the keycaps",
            "keyTop/keySide": "Normal keycap top face and side wall",
            "keyText": "Legend ink colour for normal keys",
            "modKeyTop/modKeySide": "Modifier keys (Tab/Caps/Shift/Ctrl/Alt/Win)",
            "accentKeyTop/accentKeySide": "Accent keys (Esc, right Shift, numpad Enter)"
        },
        "mouseFields": {
            "shell/shellEdge": "Mouse body top and rim",
            "button/buttonEdge": "Left/right button plates",
            "wheel": "Scroll wheel",
            "outline": "Silhouette stroke",
            "glow": "Optional side LED strip colour; empty string disables it"
        },
        "enums": {
            "keyboard.shape": KEYCAP_SHAPES,
            "mouse.silhouette": MOUSE_SHAPES,
            "pattern": PATTERNS,
            "material": MATERIALS
        },
        "examples": {
            "cyberTerminal": {
                "id": "cyber-terminal",
                "name": "赛博终端",
                "keyboard": {
                    "deckTop": "#101820", "deckSide": "#070c11", "deckEdge": "#1d3b4a",
                    "bedFill": "#060b10", "keyTop": "#12222b", "keySide": "#0a151c",
                    "keyText": "#6ff5d0", "modKeyTop": "#162c37", "modKeySide": "#0b171e",
                    "accentKeyTop": "#00e5ff", "accentKeySide": "#0088a8",
                    "shape": "flat", "material": "glass", "pattern": "grid",
                    "patternColor": "#1d6f85", "patternScale": 1.0
                },
                "mouse": {
                    "shell": "#12222b", "shellEdge": "#0a151c", "button": "#162c37",
                    "buttonEdge": "#0b171e", "wheel": "#00e5ff", "outline": "#00e5ff",
                    "silhouette": "gaming", "material": "glass", "pattern": "grid",
                    "glow": "#00e5ff"
                }
            }
        }
    })
}
