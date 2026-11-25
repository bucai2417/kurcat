use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn default_cat_breed() -> String {
    "black".to_string()
}

fn default_mcp_enabled() -> bool {
    true
}

fn default_privacy_password_guard() -> bool {
    true
}

fn default_mcp_port() -> u16 {
    27420
}

pub fn default_keyboard_layout() -> String {
    if cfg!(feature = "layout-108") {
        "108".to_string()
    } else {
        "65".to_string()
    }
}

pub fn normalize_keyboard_layout(raw: &str) -> String {
    if raw.trim() == "108" {
        "108".to_string()
    } else {
        "65".to_string()
    }
}

pub fn default_keyboard_orientation() -> String {
    "cat".to_string()
}

pub fn normalize_keyboard_orientation(raw: &str) -> String {
    if raw.trim() == "viewer" {
        "viewer".to_string()
    } else {
        "cat".to_string()
    }
}

fn default_keyboard_scale_65() -> f64 {
    1.0
}

fn default_keyboard_scale_108() -> f64 {
    0.85
}

pub fn normalize_keyboard_scale(raw: f64) -> f64 {
    if raw.is_finite() {
        raw.clamp(0.60, 1.20)
    } else {
        1.0
    }
}

fn default_mouse_orientation() -> String {
    "auto".to_string()
}

pub fn normalize_mouse_orientation(raw: &str) -> String {
    match raw.trim() {
        "cat" => "cat".to_string(),
        "viewer" => "viewer".to_string(),
        _ => "auto".to_string(),
    }
}

/// Drops malformed DIY keycaps so a hostile or buggy MCP payload cannot break rendering.
pub fn normalize_keycap_overrides(
    raw: std::collections::HashMap<String, KeycapOverride>,
) -> std::collections::HashMap<String, KeycapOverride> {
    let mut out = std::collections::HashMap::new();
    for (key, mut v) in raw {
        if out.len() >= 200 {
            break;
        }
        let id = key.trim().to_lowercase();
        if id.is_empty()
            || id.len() > 20
            || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        {
            continue;
        }
        let hex_or_none = |o: Option<String>| -> Option<String> {
            let s = o?;
            let c = normalize_hex_color(&s, "");
            if c.len() > 1 {
                Some(c)
            } else {
                None
            }
        };
        v.top = hex_or_none(v.top);
        v.side = hex_or_none(v.side);
        v.text = hex_or_none(v.text);
        v.label = v
            .label
            .map(|s| s.chars().take(4).collect::<String>())
            .filter(|s: &String| !s.is_empty());
        v.emoji = v
            .emoji
            .map(|s| s.chars().take(4).collect::<String>())
            .filter(|s: &String| !s.is_empty());
        if v.top.is_some()
            || v.side.is_some()
            || v.text.is_some()
            || v.label.is_some()
            || v.emoji.is_some()
        {
            out.insert(id, v);
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardLightConfig {
    pub enabled: bool,
    pub effect: String,
    pub color: String,
    pub color2: String,
    #[serde(default)]
    pub palette: Vec<String>,
    #[serde(default = "default_light_color_mode")]
    pub color_mode: String,
    #[serde(default)]
    pub edge_light: bool,
    pub speed: f64,
    pub brightness: f64,
    pub reactive: bool,
    pub underglow: bool,
    pub zone: String,
    /// Opt-in dark backlit keycaps; off keeps the desk skin's own colours.
    #[serde(default)]
    pub backlit_caps: bool,
}

impl Default for KeyboardLightConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            effect: "breath".to_string(),
            color: "#d2f244".to_string(),
            color2: "#8cb014".to_string(),
            palette: DEFAULT_LIGHT_PALETTE.iter().map(|s| s.to_string()).collect(),
            color_mode: default_light_color_mode(),
            edge_light: false,
            speed: 1.0,
            brightness: 0.75,
            reactive: true,
            underglow: true,
            zone: "all".to_string(),
            backlit_caps: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeycapOverride {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
}

const LIGHT_EFFECTS: [&str; 9] = [
    "off", "static", "breath", "rainbow", "random", "wave", "ripple", "typing", "aurora",
];
const LIGHT_ZONES: [&str; 4] = ["all", "alnum", "wasd", "numpad"];
const LIGHT_COLOR_MODES: [&str; 3] = ["solid", "palette", "random"];

fn default_light_color_mode() -> String {
    "solid".to_string()
}

pub const DEFAULT_LIGHT_PALETTE: [&str; 8] = [
    "#ff3b6b", "#ff9a3c", "#ffe14d", "#7ee8a6", "#00e5ff", "#6b8bff", "#c56bff", "#ff6bd6",
];

fn normalize_hex_color(raw: &str, fallback: &str) -> String {
    let t = raw.trim().trim_start_matches('#').to_ascii_lowercase();
    let ok = (t.len() == 6 || t.len() == 3) && t.chars().all(|c| c.is_ascii_hexdigit());
    if ok {
        format!("#{}", t)
    } else {
        fallback.to_string()
    }
}

impl KeyboardLightConfig {
    pub fn normalized(mut self) -> Self {
        let def = Self::default();
        if !LIGHT_EFFECTS.contains(&self.effect.as_str()) {
            self.effect = def.effect;
        }
        if !LIGHT_ZONES.contains(&self.zone.as_str()) {
            self.zone = def.zone;
        }
        self.color = normalize_hex_color(&self.color, &def.color);
        self.color2 = normalize_hex_color(&self.color2, &def.color2);
        self.palette = self
            .palette
            .iter()
            .map(|c| normalize_hex_color(c, ""))
            .filter(|c| c.len() > 1)
            .take(16)
            .collect::<Vec<_>>();
        {
            let mut seen = std::collections::HashSet::new();
            self.palette.retain(|c| seen.insert(c.clone()));
        }
        if self.palette.len() < 2 {
            self.palette = def.palette;
        }
        if !LIGHT_COLOR_MODES.contains(&self.color_mode.as_str()) {
            self.color_mode = def.color_mode;
        }
        self.speed = if self.speed.is_finite() {
            self.speed.clamp(0.2, 3.0)
        } else {
            def.speed
        };
        self.brightness = if self.brightness.is_finite() {
            self.brightness.clamp(0.0, 1.0)
        } else {
            def.brightness
        };
        self
    }
}

fn default_desk_skin_id() -> String {
    "classic-cream".to_string()
}

fn default_idle_actions_enabled() -> bool {
    true
}

/// Default silence before random idle actions (was hard-coded 18s).
fn default_idle_delay_sec() -> f64 {
    6.0
}

/// "" = no pending request; otherwise "drink" | "roll" | "sleep".
fn default_idle_action_request() -> String {
    String::new()
}

fn default_mood_tracking_enabled() -> bool {
    true
}

fn default_mood_request() -> f64 {
    -1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropConfig {
    pub enabled: bool,
    pub kind: String,
    pub side: String,
    pub auto_sip: bool,
    pub sip_interval_min: f64,
    pub sip_interval_max: f64,
}

impl Default for PropConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            kind: "coffee".to_string(),
            side: "right".to_string(),
            auto_sip: true,
            sip_interval_min: 45.0,
            sip_interval_max: 110.0,
        }
    }
}

const PROP_KINDS: [&str; 5] = ["cola", "coffee", "boba", "energy", "pudding"];
const PROP_SIDES: [&str; 3] = ["left", "right", "auto"];

impl PropConfig {
    pub fn normalized(mut self) -> Self {
        let def = Self::default();
        if !PROP_KINDS.contains(&self.kind.as_str()) {
            self.kind = def.kind;
        }
        if !PROP_SIDES.contains(&self.side.as_str()) {
            self.side = def.side;
        }
        let lo = if self.sip_interval_min.is_finite() {
            self.sip_interval_min.clamp(10.0, 600.0)
        } else {
            def.sip_interval_min
        };
        let hi = if self.sip_interval_max.is_finite() {
            self.sip_interval_max.clamp(lo, 900.0)
        } else {
            def.sip_interval_max
        };
        self.sip_interval_min = lo;
        self.sip_interval_max = hi;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub x: Option<i32>,
    pub y: Option<i32>,
    #[cfg(target_os = "macos")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_id: Option<String>,
    #[cfg(windows)]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub windows_display_id: Option<String>,
    pub scale: f64,
    pub always_on_top: bool,
    pub click_through_locked: bool,
    pub show_key_bubbles: bool,
    pub sound_enabled: bool,
    pub autostart: bool,
    #[serde(default = "default_cat_breed")]
    pub cat_breed: String,
    #[serde(default = "default_mcp_enabled")]
    pub mcp_enabled: bool,
    #[serde(default = "default_mcp_port")]
    pub mcp_port: u16,
    #[serde(default = "default_keyboard_layout")]
    pub keyboard_layout: String,
    #[serde(default = "default_keyboard_orientation")]
    pub keyboard_orientation: String,
    #[serde(default = "default_keyboard_scale_65")]
    pub keyboard_scale_65: f64,
    #[serde(default = "default_keyboard_scale_108")]
    pub keyboard_scale_108: f64,
    #[serde(default = "default_mouse_orientation")]
    pub mouse_orientation: String,
    #[serde(default)]
    pub keyboard_light: KeyboardLightConfig,
    #[serde(default = "default_desk_skin_id")]
    pub desk_skin_id: String,
    #[serde(default)]
    pub prop_config: PropConfig,
    #[serde(default)]
    pub keycap_overrides: std::collections::HashMap<String, KeycapOverride>,
    #[serde(default = "default_idle_actions_enabled")]
    pub idle_actions_enabled: bool,
    /// Seconds of silence before the pet starts doing random idle actions.
    #[serde(default = "default_idle_delay_sec")]
    pub idle_delay_sec: f64,
    #[serde(default = "default_idle_action_request")]
    pub idle_action_request: String,
    #[serde(default)]
    pub idle_action_seq: u64,
    #[serde(default = "default_mood_tracking_enabled")]
    pub mood_tracking_enabled: bool,
    /// −1 = "no pending request"; otherwise 0..1.
    #[serde(default = "default_mood_request")]
    pub mood_annoyance_request: f64,
    #[serde(default = "default_mood_request")]
    pub mood_dizzy_request: f64,
    #[serde(default)]
    pub mood_seq: u64,
    #[serde(default = "default_render_mode")]
    pub render_mode: String,
    #[serde(default = "default_collar_color")]
    pub collar_color: String,
    #[serde(default = "default_headphone_mode")]
    pub headphone_mode: String,
    #[serde(default = "default_tail_key_mode")]
    pub tail_key_mode: String,
    #[serde(default = "default_tail_key_ids")]
    pub tail_key_ids: Vec<String>,
    #[serde(default)]
    pub obs_enabled: bool,
    #[serde(default = "default_obs_port")]
    pub obs_port: u16,
    #[serde(default)]
    pub obs_hide_pet: bool,
    #[serde(default = "default_privacy_password_guard")]
    pub privacy_password_guard: bool,
}

fn default_render_mode() -> String {
    "2d".to_string()
}

pub fn normalize_render_mode(raw: &str) -> String {
    if raw.trim() == "3d" {
        "3d".to_string()
    } else {
        "2d".to_string()
    }
}

fn default_collar_color() -> String {
    "none".to_string()
}

pub fn normalize_collar_color(raw: &str) -> String {
    match raw.trim() {
        "red" => "red".to_string(),
        "blue" => "blue".to_string(),
        "pink" => "pink".to_string(),
        "green" => "green".to_string(),
        _ => "none".to_string(),
    }
}

fn default_headphone_mode() -> String {
    "off".to_string()
}

pub fn normalize_headphone_mode(raw: &str) -> String {
    match raw.trim() {
        "auto" => "auto".to_string(),
        "on" => "on".to_string(),
        _ => "off".to_string(),
    }
}

fn default_tail_key_mode() -> String {
    "smart".to_string()
}

pub fn normalize_tail_key_mode(raw: &str) -> String {
    match raw.trim() {
        "custom" => "custom".to_string(),
        "edge" => "edge".to_string(),
        "off" => "off".to_string(),
        _ => "smart".to_string(),
    }
}

fn default_tail_key_ids() -> Vec<String> {
    vec![
        "enter".to_string(),
        "space".to_string(),
        "bs".to_string(),
        "esc".to_string(),
    ]
}

fn default_obs_port() -> u16 {
    27421
}

impl AppSettings {
    /// Scale used by the currently active keyboard layout.
    pub fn active_keyboard_scale(&self) -> f64 {
        let raw = if self.keyboard_layout == "108" {
            self.keyboard_scale_108
        } else {
            self.keyboard_scale_65
        };
        normalize_keyboard_scale(raw)
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            #[cfg(target_os = "macos")]
            display_id: None,
            #[cfg(windows)]
            windows_display_id: None,
            scale: 1.0,
            always_on_top: true,
            click_through_locked: false,
            show_key_bubbles: true,
            sound_enabled: true,
            autostart: false,
            cat_breed: default_cat_breed(),
            mcp_enabled: default_mcp_enabled(),
            mcp_port: default_mcp_port(),
            keyboard_layout: default_keyboard_layout(),
            keyboard_orientation: default_keyboard_orientation(),
            keyboard_scale_65: default_keyboard_scale_65(),
            keyboard_scale_108: default_keyboard_scale_108(),
            mouse_orientation: default_mouse_orientation(),
            keyboard_light: KeyboardLightConfig::default(),
            desk_skin_id: default_desk_skin_id(),
            prop_config: PropConfig::default(),
            keycap_overrides: std::collections::HashMap::new(),
            idle_actions_enabled: default_idle_actions_enabled(),
            idle_delay_sec: default_idle_delay_sec(),
            idle_action_request: default_idle_action_request(),
            idle_action_seq: 0,
            mood_tracking_enabled: default_mood_tracking_enabled(),
            mood_annoyance_request: default_mood_request(),
            mood_dizzy_request: default_mood_request(),
            mood_seq: 0,
            render_mode: default_render_mode(),
            collar_color: default_collar_color(),
            headphone_mode: default_headphone_mode(),
            tail_key_mode: default_tail_key_mode(),
            tail_key_ids: default_tail_key_ids(),
            obs_enabled: false,
            obs_port: default_obs_port(),
            obs_hide_pet: false,
            privacy_password_guard: default_privacy_password_guard(),
        }
    }
}

pub fn app_data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        let base = std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
        base.join("kuro-cat-pet")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
        home.join("Library")
            .join("Application Support")
            .join("kuro-cat-pet")
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let home = std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."));
        home.join(".config").join("kuro-cat-pet")
    }
}

pub fn config_path() -> PathBuf {
    app_data_dir().join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(mut parsed) = serde_json::from_str::<AppSettings>(&content) {
            parsed.scale = parsed.scale.clamp(0.20, 1.50);
            return parsed;
        }
    }
    AppSettings::default()
}

pub fn save_settings(settings: &AppSettings) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(path, json);
    }
}

#[cfg(windows)]
pub fn set_windows_autostart(enabled: bool) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_SZ,
    };

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let subkey = to_wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let value_name = to_wide("KuroCat");
    let legacy_value_name = to_wide("KuroCatPet");

    unsafe {
        let mut hkey: HKEY = std::ptr::null_mut();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        );
        if status != 0 {
            return Err(format!("RegOpenKeyExW failed with code {}", status));
        }

        // Clean up legacy autostart key so users upgrading from <=v4.2 never run two copies
        let _ = RegDeleteValueW(hkey, legacy_value_name.as_ptr());

        let result = if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            let quoted = format!("\"{}\"", exe);
            let data = to_wide(&quoted);
            let byte_len = (data.len() * std::mem::size_of::<u16>()) as u32;
            let st = RegSetValueExW(
                hkey,
                value_name.as_ptr(),
                0,
                REG_SZ,
                data.as_ptr() as *const u8,
                byte_len,
            );
            if st == 0 {
                Ok(())
            } else {
                Err(format!("RegSetValueExW failed with code {}", st))
            }
        } else {
            let _ = RegDeleteValueW(hkey, value_name.as_ptr());
            Ok(())
        };

        RegCloseKey(hkey);
        result
    }
}

#[cfg(target_os = "macos")]
pub fn set_windows_autostart(enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let agents_dir = PathBuf::from(home).join("Library").join("LaunchAgents");
    let plist_path = agents_dir.join("com.kurocat.pet.plist");

    if enabled {
        fs::create_dir_all(&agents_dir).map_err(|e| e.to_string())?;
        let exe = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        let plist = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kurocat.pet</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"#,
            exe
        );
        fs::write(plist_path, plist).map_err(|e| e.to_string())
    } else {
        if plist_path.exists() {
            let _ = fs::remove_file(plist_path);
        }
        Ok(())
    }
}

#[cfg(all(not(windows), not(target_os = "macos")))]
pub fn set_windows_autostart(enabled: bool) -> Result<(), String> {
    let config_root = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".config")
        });
    let autostart_dir = config_root.join("autostart");
    let desktop_path = autostart_dir.join("kurocat.desktop");

    if enabled {
        fs::create_dir_all(&autostart_dir).map_err(|e| e.to_string())?;
        let exe = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        let entry = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Name=KuroCat\n\
             Comment=Minimalist desktop cat typing & mouse companion\n\
             Exec=\"{exe}\"\n\
             Icon=KuroCat\n\
             Terminal=false\n\
             X-GNOME-Autostart-enabled=true\n",
            exe = exe.replace('"', "\\\"")
        );
        fs::write(desktop_path, entry).map_err(|e| e.to_string())
    } else {
        if desktop_path.exists() {
            let _ = fs::remove_file(desktop_path);
        }
        Ok(())
    }
}

#[cfg(windows)]
pub fn create_desktop_shortcut() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_string_lossy().replace('\'', "''");
    let work_dir = exe_path
        .parent()
        .map(|p| p.to_string_lossy().replace('\'', "''"))
        .unwrap_or_default();

    let script = format!(
        "$desktop = [Environment]::GetFolderPath('Desktop'); \
         $lnk = Join-Path $desktop 'KuroCat.lnk'; \
         $ws = New-Object -ComObject WScript.Shell; \
         $s = $ws.CreateShortcut($lnk); \
         $s.TargetPath = '{exe}'; \
         $s.WorkingDirectory = '{wd}'; \
         $s.IconLocation = '{exe},0'; \
         $s.Description = 'KuroCat Desktop Companion'; \
         $s.Save(); \
         Write-Output $lnk",
        exe = exe_str,
        wd = work_dir,
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to invoke PowerShell: {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(path)
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if err.is_empty() {
            "Failed to create desktop shortcut".to_string()
        } else {
            err
        })
    }
}

#[cfg(not(windows))]
pub fn create_desktop_shortcut() -> Result<String, String> {
    Ok("Desktop shortcut is managed via Applications on this OS".to_string())
}
