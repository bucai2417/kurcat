use crate::cats::{
    all_cats, cat_exists, cat_schema_guide, cats_path, delete_custom_cat, sanitize_cat_id,
    upsert_custom_cat, CatSkinConfig,
};
use crate::config::{load_settings, save_settings, set_windows_autostart};
use crate::desk_skins::{
    delete_desk_skin, desk_skin_schema_guide, desk_skins_path, load_custom_desk_skins,
    sanitize_skin_id, upsert_desk_skin, DeskSkinConfig,
};
use serde_json::{json, Value};
use crate::{models, resources};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const SERVER_NAME: &str = "kurocat";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Key ids accepted by set_keycaps (mirrors src/keyboardLayout.ts).
const VALID_KEY_IDS: &[&str] = &[
    "esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "minus", "equal", "bs", "grave",
    "tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "lb", "rb", "bslash", "caps", "a",
    "s", "d", "f", "g", "h", "j", "k", "l", "semi", "quote", "enter", "lshift", "z", "x", "c",
    "v", "b", "n", "m", "comma", "dot", "slash", "rshift", "lctrl", "lwin", "lalt", "space",
    "ralt", "rwin", "menu", "rctrl", "left", "down", "up", "right", "f1", "f2", "f3", "f4",
    "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
    "np_0", "np_1", "np_2", "np_3", "np_4", "np_5", "np_6", "np_7", "np_8", "np_9",
    "np_div", "np_mul", "np_sub", "np_add", "np_ent", "np_dot", "numlk", "ins", "del", "home", "end", "pgup", "pgdn", "prt", "scr", "pau",
    "m_mute", "m_vdown", "m_vup", "m_calc",
];

fn tool_definitions() -> Value {
    json!([
        {"name":"get_builtin_rigs","description":"Discover rigs BEFORE designing skins: cat (built-in 2D/3D), naiwa 奶蛙 (built-in canvas-naiwa-v1 2D; imported three-naiwa-v1 GLB in version 2 packages), dafeiyu 大肥鱼 (fixed 2D art, NOT skin-importable), and generic imported GLB. Naiwa skin fields, inputMapping and deformation describe its built-in 2D renderer; imported three-naiwa-v1 uses GLB materials plus the shared cat live controller: soft-arm keyboard/mouse/prop contacts, pupil/head gaze, grounded roll and foot reactions. Requires the full rig signature and idle/nap base clips. Generic three-glb-v1 remains mapped-clip playback without prop grips. Returns parts, labels and import limits.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},
        {"name":"get_resource_contract","description":"Get the versioned keyboard/mouse resource schema and supported 2D/3D modes; appearance-only packages inherit fixed interaction geometry.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},
        {"name":"list_resources","description":"List installed custom keyboard/mouse packages and independent mode selections. Built-in themes remain available through desk tools.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},
        {"name":"import_resource_pack","description":"Validate and install a DIY-Cat keyboard or mouse package. Existing IDs require explicit replace; package kind cannot change.","inputSchema":{"type":"object","required":["package"],"properties":{"package":{"type":"object"},"replace":{"type":"boolean","default":false}},"additionalProperties":false}},
        {"name":"export_resource_pack","description":"Return an installed resource package as JSON for saving as UTF-8 .diycat.json.","inputSchema":{"type":"object","required":["id"],"properties":{"id":{"type":"string"}},"additionalProperties":false}},
        {"name":"delete_resource_pack","description":"Delete an installed custom resource and clear its selections in both modes. Export first if a backup is needed.","inputSchema":{"type":"object","required":["id"],"properties":{"id":{"type":"string"}},"additionalProperties":false}},
        {"name":"switch_resource","description":"Use an installed keyboard/mouse independently in 2D or 3D, without switching pet mode. Empty id restores the desk theme for that slot.","inputSchema":{"type":"object","required":["kind","mode","id"],"properties":{"kind":{"type":"string","enum":["keyboard","mouse"]},"mode":{"type":"string","enum":["2d","3d"]},"id":{"type":"string"}},"additionalProperties":false}},
        {
            "name": "get_model_contract",
            "description": "Get model package version, renderer adapters, supported reactions, action labels, metadata/revision rules, default GitHub catalog, publishing links and explicit-update policy. Version 1 customizes built-in cat/naiwa skins. Version 2 imports self-contained GLB via three-glb-v1 or three-naiwa-v1; profile.glb maps real named clips. Dedicated three-naiwa-v1 requires the complete Naiwa skeleton, sockets, morphs and idle/nap; it exposes shared live actions, gaze and prop contacts. Generic GLB has no prop grips; VRM/Live2D are unsupported. UI accepts raw .glb and detects Naiwa only by complete structure.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "import_model_pack",
            "description": "Validate and install a version 1 skin or version 2 GLB model package. GLB requires asset.data Base64 (16 MiB binary limit), SHA-256, height/yaw and clip mapping; resolve GitHub Raw asset.url on the client before invoking. Optional profile.revision and description are preserved. Existing IDs require replace:true, including downgrades; built-in IDs are protected. Optionally activate with a compatible render mode.",
            "inputSchema": {
                "type": "object",
                "required": [
                    "package"
                ],
                "properties": {
                    "package": {
                        "type": "object"
                    },
                    "replace": {
                        "type": "boolean",
                        "default": false
                    },
                    "activate": {
                        "type": "boolean",
                        "default": false
                    }
                }
            }
        },
        {
            "name": "export_model_pack",
            "description": "Return the complete version 1 skin or version 2 GLB package JSON (including asset.data) for a model. Save it as UTF-8 .kurocat.json. Built-in cats export with a new custom ID; the dedicated whale renderer cannot be exported.",
            "inputSchema": {
                "type": "object",
                "required": [
                    "id"
                ],
                "properties": {
                    "id": {
                        "type": "string"
                    }
                }
            }
        },
        {
            "name": "list_cats",
            "description": "List all available DIY-Cat desktop pet skins (built-in and custom cats) and show which cat is currently active on screen.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "get_cat_schema",
            "description": "Get the full CatSkinConfig JSON schema, pattern options (solid, bicolor, tuxedo, tabby, calico, siamese), spot coordinate guide, and ready-to-use breed examples before creating or editing a custom cat.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "upsert_cat",
            "description": "Create a new custom cat or update an existing cat's fur colors, coat pattern, ears, eyes, tail, whiskers, keyboard highlight color, and unique pet spots/birthmarks. Changes hot-reload immediately on the running desktop pet!",
            "inputSchema": {
                "type": "object",
                "required": ["cat"],
                "properties": {
                    "cat": {
                        "type": "object",
                        "required": ["id", "name", "furColor"],
                        "properties": {
                            "id": { "type": "string", "description": "Unique lowercase slug ID, e.g. 'orange-tabby', 'my-calico', 'my-ragdoll'" },
                            "name": { "type": "string", "description": "Display name shown in menu, e.g. '大橘猫', '我家三花'" },
                            "emoji": { "type": "string", "description": "Optional emoji badge, e.g. '🍊'" },
                            "furColor": { "type": "string", "description": "Base coat hex color, e.g. '#f2a452'" },
                            "furSecondaryColor": { "type": "string" },
                            "outlineColor": { "type": "string", "description": "Outer stroke hex color for light coats, e.g. '#5d5148'" },
                            "legLineColor": { "type": "string" },
                            "pattern": { "type": "string", "enum": ["solid", "bicolor", "tuxedo", "tabby", "calico", "siamese"] },
                            "maskColor": { "type": "string" },
                            "foreheadBridgeColor": { "type": "string" },
                            "flankColor": { "type": "string" },
                            "bellyBibColor": { "type": "string" },
                            "stripeColor": { "type": "string" },
                            "calicoPatchColor": { "type": "string" },
                            "earOuterColor": { "type": "string" },
                            "earTipColor": { "type": "string" },
                            "earInnerColor": { "type": "string" },
                            "earTuftColor": { "type": "string" },
                            "tailColor": { "type": "string" },
                            "tailTipColor": { "type": "string" },
                            "tailFluffy": { "type": "boolean" },
                            "tailStripes": { "type": "boolean" },
                            "eyeColorTop": { "type": "string" },
                            "eyeColorBottom": { "type": "string" },
                            "pupilColor": { "type": "string" },
                            "eyeCatchlight": { "type": "boolean" },
                            "eyeRimColor": { "type": "string" },
                            "squintColor": { "type": "string" },
                            "squintGlowColor": { "type": "string" },
                            "noseColor": { "type": "string" },
                            "mouthColor": { "type": "string" },
                            "blushColor": { "type": "string" },
                            "whiskerColor": { "type": "string" },
                            "armColor": { "type": "string" },
                            "pawColor": { "type": "string" },
                            "pawOutlineColor": { "type": "string" },
                            "armCreaseColor": { "type": "string" },
                            "accentColor": { "type": "string", "description": "Pressed key & clicked mouse highlight hex color" },
                            "accentSideColor": { "type": "string" },
                            "spots": {
                                "type": "array",
                                "description": "Custom unique pet markings/spots on head, body, leftArm, or rightArm",
                                "items": {
                                    "type": "object",
                                    "required": ["part", "x", "y", "rx", "ry", "color"],
                                    "properties": {
                                        "part": { "type": "string", "enum": ["head", "body", "leftArm", "rightArm"] },
                                        "x": { "type": "number" },
                                        "y": { "type": "number" },
                                        "rx": { "type": "number" },
                                        "ry": { "type": "number" },
                                        "rotation": { "type": "number" },
                                        "color": { "type": "string" },
                                        "opacity": { "type": "number" }
                                    }
                                }
                            }
                        }
                    },
                    "activate": {
                        "type": "boolean",
                        "default": true,
                        "description": "Immediately switch the live desktop pet to this cat (default: true)."
                    }
                }
            }
        },
        {
            "name": "switch_cat",
            "description": "Switch the active cat displayed on the user's Windows desktop by ID (e.g. 'black', 'ragdoll', or any custom cat ID).",
            "inputSchema": {
                "type": "object",
                "required": ["id"],
                "properties": {
                    "id": { "type": "string", "description": "Cat ID to activate" }
                }
            }
        },
        {
            "name": "delete_cat",
            "description": "Delete a local custom model/skin and switch to the black cat if the active model was removed; also supports resetting a customized built-in skin. GitHub packages and exported files are retained.",
            "inputSchema": {
                "type": "object",
                "required": ["id"],
                "properties": {
                    "id": { "type": "string", "description": "Custom cat ID to delete" }
                }
            }
        },
        {
            "name": "get_settings",
            "description": "Read current DIY-Cat desktop pet settings (active cat, scale, bubbles, petting purr sound, always-on-top, click-through lock, MCP status).",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "set_prop",
            "description": "Configure the interactive drink prop beside the keyboard: kind (cola|coffee|boba|energy|pudding), side (left|right|auto), autoSip when the user is idle, and the sip interval range in seconds.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "enabled": { "type": "boolean" },
                    "kind": { "type": "string", "enum": ["cola", "coffee", "boba", "energy", "pudding"] },
                    "side": { "type": "string", "enum": ["left", "right", "auto"] },
                    "autoSip": { "type": "boolean" },
                    "sipIntervalMin": { "type": "number", "minimum": 10, "maximum": 600 },
                    "sipIntervalMax": { "type": "number", "minimum": 10, "maximum": 900 }
                }
            }
        },
        {
            "name": "get_prop",
            "description": "Read the current drink prop configuration.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "trigger_prop_sip",
            "description": "Make the desktop pet drink from its prop right now (useful for demos). The pet reaches for the cup, takes a sip, and plays the matching mood.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "get_desk_schema",
            "description": "Read the keyboard + mouse desk skin schema: every colour field, the keycap shape / mouse silhouette / pattern / material enums, and a complete example.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "list_desk_skins",
            "description": "List every custom desk skin saved on disk plus the active desk skin id.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "upsert_desk_skin",
            "description": "Create or replace a custom keyboard + mouse desk skin. Pass activate: true to apply it to the live desktop pet immediately.",
            "inputSchema": {
                "type": "object",
                "required": ["skin"],
                "properties": {
                    "skin": {
                        "type": "object",
                        "description": "Desk skin JSON: { id, name, keyboard: {...}, mouse: {...} }. Call get_desk_schema for every field and enum."
                    },
                    "activate": { "type": "boolean", "description": "Apply it right away (default true)" }
                }
            }
        },
        {
            "name": "switch_desk_skin",
            "description": "Switch the live keyboard + mouse appearance by desk skin id (built-ins: classic-cream, carbon-night, walnut-warm, sakura-cream, cyber-terminal, deep-whale).",
            "inputSchema": {
                "type": "object",
                "required": ["id"],
                "properties": { "id": { "type": "string" } }
            }
        },
        {
            "name": "delete_desk_skin",
            "description": "Delete a custom desk skin by id and fall back to the classic look if it was active.",
            "inputSchema": {
                "type": "object",
                "required": ["id"],
                "properties": { "id": { "type": "string" } }
            }
        },
        {
            "name": "trigger_idle_action",
            "description": "Queue a supported action without changing automatic idle preferences. Use get_idle_actions for this model. tailGround starts a 2-5 second tantrum (tail slap for cats, foot stomp for naiwa); calm soothes it. Built-in 2D Naiwa additionally supports frogHop, frogCroak (silent cheek puff), bellyPat, frogSway, frogPeek and footSwing; three-naiwa-v1 exposes shared live cat actions (including drink, roll, wave and foot tantrums); three-glb-v1 exposes mapped clips only. The frog-only 2D actions do not apply to 3D. An action may be ignored while privacy or an incompatible interaction is active.",
            "inputSchema": {
                "type": "object",
                "required": ["kind"],
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["drink", "stretch", "wave", "tilt", "slowBlink", "groom", "nap", "cuddle", "roll", "listen", "shimmy", "pawCheck", "tailGround", "calm", "frogHop", "frogCroak", "bellyPat", "frogSway", "frogPeek", "footSwing", "sleep"]
                    }
                }
            }
        },
        {
            "name": "set_idle_actions",
            "description": "Turn automatic random idle behaviours on or off, and set how many seconds of silence trigger them (default 6s).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "enabled": { "type": "boolean" },
                    "delaySec": { "type": "number", "minimum": 2, "maximum": 120 }
                }
            }
        },
        {
            "name": "get_idle_actions",
            "description": "Read the active model/mode, supported actions, automatic idle settings and last request/sequence. Available actions come from the versioned model contract.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "get_mood",
            "description": "Read automatic typing-tracking settings and the last requested mood values/sequence. These saved requests are not live renderer mood measurements.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "set_mood",
            "description": "Set the pet's mood meter directly (0-1). annoyance shows steam puffs and anger marks; dizzy makes its eyes spin and shows a dizzy spiral. Use 0 to clear these mood meters. A sleep tantrum is a separate reaction: use trigger_idle_action with calm to soothe it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "annoyance": { "type": "number", "minimum": 0, "maximum": 1 },
                    "dizzy": { "type": "number", "minimum": 0, "maximum": 1 }
                }
            }
        },
        {
            "name": "set_mood_tracking",
            "description": "Turn automatic typing reactions on or off. Sustained typing cycles through focus, rhythmic swaying, excitement and grumpiness; pausing input lets the pet calm down.",
            "inputSchema": {
                "type": "object",
                "required": ["enabled"],
                "properties": { "enabled": { "type": "boolean" } }
            }
        },
        {
            "name": "set_keycaps",
            "description": "DIY keycaps independently per mode (defaults to the active model mode). Both modes support top/side/text colors and legends. Keys are KeySpec ids (a-z, 0-9, esc, tab, space, lshift, f1..f12, np_0..np_9, up/down/left/right, ...). Each entry may set top/side/text colours, a custom label, or an emoji legend. Merges with existing overrides unless replace: true.",
            "inputSchema": {
                "type": "object",
                "required": ["keycaps"],
                "properties": {
                    "keycaps": {
                        "type": "object",
                        "description": "Map of key id -> { top?, side?, text?, label?, emoji? }. Example: {\"esc\": {\"top\": \"#ff3b6b\", \"emoji\": \"🔥\"}}",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "top": { "type": "string" },
                                "side": { "type": "string" },
                                "text": { "type": "string" },
                                "label": { "type": "string", "description": "Custom legend text, max 4 chars" },
                                "emoji": { "type": "string", "description": "Emoji legend, e.g. 🔥" }
                            }
                        }
                    },
                    "mode": { "type": "string", "enum": ["2d", "3d"] },
                    "replace": { "type": "boolean", "description": "Replace all existing overrides instead of merging (default false)" }
                }
            }
        },
        {
            "name": "get_keycaps",
            "description": "Read the current DIY keycap overrides and the list of valid key ids.",
            "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["2d", "3d"] } }, "additionalProperties": false }
        },
        {
            "name": "clear_keycaps",
            "description": "Remove all DIY keycap overrides and return to the desk skin's own keycaps.",
            "inputSchema": { "type": "object", "properties": { "mode": { "type": "string", "enum": ["2d", "3d"] } }, "additionalProperties": false }
        },
        {
            "name": "set_lighting",
            "description": "Set the keyboard RGB lighting live: effect (off|static|breath|rainbow|random|wave|ripple|typing|aurora), color and color2 as #rrggbb, palette for the random effect, speed 0.2-3, brightness 0-1, reactive per-key glow, underglow deck bloom, and zone (all|alnum|wasd|numpad).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "enabled": { "type": "boolean" },
                    "effect": {
                        "type": "string",
                        "enum": ["off", "static", "breath", "rainbow", "random", "wave", "ripple", "typing", "aurora"]
                    },
                    "color": { "type": "string", "description": "Primary colour, e.g. #00e5ff" },
                    "color2": { "type": "string", "description": "Secondary colour for gradients / pressed keys" },
                    "palette": {
                        "type": "array",
                        "description": "2-16 hex colours used by the 'random' effect and by colorMode palette/random",
                        "items": { "type": "string" }
                    },
                    "colorMode": {
                        "type": "string",
                        "description": "solid = one colour, palette = multi-colour per key, random = random colours that keep shifting",
                        "enum": ["solid", "palette", "random"]
                    },
                    "edgeLight": { "type": "boolean", "description": "Glowing RGB rim around the keyboard chassis" },
                    "speed": { "type": "number", "minimum": 0.2, "maximum": 3 },
                    "brightness": { "type": "number", "minimum": 0, "maximum": 1 },
                    "reactive": { "type": "boolean" },
                    "underglow": { "type": "boolean" },
                    "zone": { "type": "string", "enum": ["all", "alnum", "wasd", "numpad"] }
                }
            }
        },
        {
            "name": "get_lighting",
            "description": "Read the current keyboard RGB lighting configuration.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "update_settings",
            "description": "Update live settings: model/render mode (falls back to a supported adapter), collar, headphones, tail keys, independent keyboard/mouse sound profiles, cat purring (Naiwa has no dedicated sounds), window and keyboard layout preferences. Use dedicated tools for props, idle, mood and lighting.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "renderMode": {"type":"string","enum":["2d","3d"]},
                    "collarColor": {"type":"string","enum":["none","red","blue","pink","green"]},
                    "headphoneMode": {"type":"string","enum":["auto","on","off"]},
                    "tailKeyMode": {"type":"string","enum":["smart","custom","edge","off"]},
                    "tailKeyIds": {"type":"array","items":{"type":"string"}},
                    "inputSound": {"type":"object","description":"Independent keyboard/mouse effects; soundEnabled controls cat purring; Naiwa has no dedicated sounds.","properties":{"keyboard":{"type":"boolean"},"mouse":{"type":"boolean"},"profile":{"type":"string","enum":["linear","tactile","clicky","silent"]},"volume":{"type":"number","minimum":0,"maximum":1}},"additionalProperties":false},
                    "catBreed": { "type": "string" },
                    "scale": { "type": "number", "minimum": 0.2, "maximum": 1.5 },
                    "keyboardLayout": { "type": "string", "enum": ["65", "108"] },
                    "keyboardOrientation": { "type": "string", "enum": ["cat", "viewer"] },
                    "keyboardScale65": { "type": "number", "minimum": 0.6, "maximum": 1.2 },
                    "keyboardScale108": { "type": "number", "minimum": 0.6, "maximum": 1.0 },
                    "mouseOrientation": { "type": "string", "enum": ["auto", "cat", "viewer"] },
                    "showKeyBubbles": { "type": "boolean" },
                    "soundEnabled": { "type": "boolean" },
                    "alwaysOnTop": { "type": "boolean" },
                    "clickThroughLocked": { "type": "boolean" },
                    "autostart": { "type": "boolean" }
                }
            }
        }
    ])
}

fn ok_text(payload: Value) -> Value {
    let text = serde_json::to_string_pretty(&payload).unwrap_or_else(|_| payload.to_string());
    json!({
        "content": [{ "type": "text", "text": text }],
        "isError": false
    })
}

fn err_text(msg: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": msg }],
        "isError": true
    })
}

fn execute_tool(name: &str, args: &Value, on_change: &dyn Fn()) -> Value {
    match name {
        "list_cats" => {
            let settings = load_settings();
            let cats = all_cats();
            ok_text(json!({
                "activeCatId": settings.cat_breed,
                "storagePath": cats_path().to_string_lossy(),
                "count": cats.len(),
                "cats": cats
            }))
        }
        "get_resource_contract" => ok_text(resources::contract()),
        "list_resources" => match resources::list() { Ok(packs) => ok_text(json!({"resources":packs,"selected":load_settings().desk_accessories})), Err(e) => err_text(&e) },
        "import_resource_pack" => match resources::install(args["package"].clone(), args["replace"].as_bool().unwrap_or(false)) {
            Ok(pack) => { on_change(); ok_text(pack) }, Err(e) => err_text(&e)
        },
        "export_resource_pack" => match resources::list() {
            Ok(packs) => match packs.into_iter().find(|p| p["id"] == args["id"]) { Some(pack) => ok_text(pack), None => err_text("Unknown installed resource id") }, Err(e) => err_text(&e)
        },
        "delete_resource_pack" => {
            let Some(id) = args["id"].as_str() else { return err_text("Missing id"); };
            match resources::remove(id) { Ok(()) => { let mut s=load_settings(); s.desk_accessories.retain(|_,value|value!=id); save_settings(&s); on_change(); ok_text(json!({"deleted":id})) }, Err(e) => err_text(&e) }
        },
        "switch_resource" => {
            let kind=args["kind"].as_str().unwrap_or(""); let mode=args["mode"].as_str().unwrap_or("");
            let Some(id)=args["id"].as_str() else { return err_text("Missing id"); };
            if !["keyboard","mouse"].contains(&kind) || !["2d","3d"].contains(&mode) { return err_text("Invalid kind or mode"); }
            if !id.is_empty() {
                let packs=match resources::list() {Ok(p)=>p,Err(e)=>return err_text(&e)};
                if !packs.iter().any(|p|p["id"]==id && p["kind"]==kind && p["modes"].as_array().map(|ms|ms.iter().any(|m|m==mode)).unwrap_or(false)) { return err_text("Resource not installed or incompatible with this kind/mode"); }
            }
            let mut s=load_settings(); let slot=format!("{}{}",kind,mode);
            if id.is_empty() {s.desk_accessories.remove(&slot);} else {s.desk_accessories.insert(slot,id.into());}
            save_settings(&s); on_change(); ok_text(json!({"selected":s.desk_accessories}))
        },
        "get_model_contract" => ok_text(models::contract()),
        "get_builtin_rigs" => ok_text(models::contract()["rigs"].clone()),
        "import_model_pack" => {
            let Some(package) = args.get("package") else { return err_text("Missing package object"); };
            match models::install(package.clone(), args["replace"].as_bool().unwrap_or(false)) {
                Ok(cat) => {
                    let activate = args["activate"].as_bool().unwrap_or(false);
                    if activate {
                        let mut s = load_settings();
                        s.cat_breed = cat.id.clone(); s.render_mode = models::mode(&cat, &s.render_mode);
                        save_settings(&s);
                    }
                    on_change();
                    ok_text(json!({"status": "installed", "activated": activate, "cat": cat}))
                }
                Err(e) => err_text(&e),
            }
        }
        "export_model_pack" => match args["id"].as_str() {
            Some(id) => match models::export(id) { Ok(package) => ok_text(package), Err(e) => err_text(&e) },
            None => err_text("Missing model id"),
        },
        "get_cat_schema" => ok_text(cat_schema_guide()),
        "upsert_cat" => {
            let Some(cat_val) = args.get("cat") else {
                return err_text("Missing required 'cat' object argument.");
            };
            let parsed: CatSkinConfig = match serde_json::from_value(cat_val.clone()) {
                Ok(c) => c,
                Err(e) => return err_text(&format!("Invalid cat skin JSON: {}", e)),
            };
            match upsert_custom_cat(parsed) {
                Ok(saved) => {
                    let activate = args
                        .get("activate")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    if activate {
                        let mut s = load_settings();
                        s.cat_breed = saved.id.clone();
                        s.render_mode = models::mode(&saved, &s.render_mode);
                        save_settings(&s);
                    }
                    on_change();
                    ok_text(json!({
                        "status": "saved",
                        "activated": activate,
                        "cat": saved
                    }))
                }
                Err(e) => err_text(&format!("Failed to save custom cat: {}", e)),
            }
        }
        "switch_cat" => {
            let Some(id_raw) = args.get("id").and_then(|v| v.as_str()) else {
                return err_text("Missing required 'id' string argument.");
            };
            let id = sanitize_cat_id(id_raw);
            if !cat_exists(&id) {
                let ids: Vec<String> = all_cats().into_iter().map(|c| c.id).collect();
                return err_text(&format!(
                    "Cat '{}' not found. Available IDs: {:?}",
                    id, ids
                ));
            }
            let mut s = load_settings();
            s.cat_breed = id.clone();
            if let Some(cat) = all_cats().iter().find(|cat| cat.id == id) {
                s.render_mode = models::mode(cat, &s.render_mode);
            }
            save_settings(&s);
            on_change();
            ok_text(json!({
                "status": "switched",
                "activeCatId": id
            }))
        }
        "delete_cat" => {
            let Some(id_raw) = args.get("id").and_then(|v| v.as_str()) else {
                return err_text("Missing required 'id' string argument.");
            };
            let id = sanitize_cat_id(id_raw);
            match delete_custom_cat(&id) {
                Ok(removed) => {
                    if removed {
                        let mut s = load_settings();
                        if s.cat_breed == id && !cat_exists(&id) {
                            s.cat_breed = "black".to_string();
                            save_settings(&s);
                        }
                        on_change();
                        ok_text(json!({
                            "status": "deleted",
                            "id": id
                        }))
                    } else {
                        err_text(&format!("No custom cat entry found for '{}'.", id))
                    }
                }
                Err(e) => err_text(&format!("Failed to delete cat: {}", e)),
            }
        }
        "get_prop" => {
            let s = load_settings();
            ok_text(serde_json::to_value(&s.prop_config).unwrap_or(json!({})))
        }
        "set_prop" => {
            let mut s = load_settings();
            let mut cfg = s.prop_config.clone();
            if let Some(v) = args.get("enabled").and_then(|v| v.as_bool()) {
                cfg.enabled = v;
            }
            if let Some(v) = args.get("kind").and_then(|v| v.as_str()) {
                cfg.kind = v.to_string();
                cfg.enabled = true;
            }
            if let Some(v) = args.get("side").and_then(|v| v.as_str()) {
                cfg.side = v.to_string();
            }
            if let Some(v) = args.get("autoSip").and_then(|v| v.as_bool()) {
                cfg.auto_sip = v;
            }
            if let Some(v) = args.get("sipIntervalMin").and_then(|v| v.as_f64()) {
                cfg.sip_interval_min = v;
            }
            if let Some(v) = args.get("sipIntervalMax").and_then(|v| v.as_f64()) {
                cfg.sip_interval_max = v;
            }
            s.prop_config = cfg.normalized();
            save_settings(&s);
            on_change();
            ok_text(serde_json::to_value(&s.prop_config).unwrap_or(json!({})))
        }
        "trigger_prop_sip" => {
            let mut s = load_settings();
            if !s.prop_config.enabled {
                s.prop_config.enabled = true;
                save_settings(&s);
            }
            on_change();
            ok_text(json!({ "status": "sip-triggered", "prop": s.prop_config }))
        }
        "get_desk_schema" => ok_text(desk_skin_schema_guide()),
        "list_desk_skins" => {
            let settings = load_settings();
            let custom = load_custom_desk_skins();
            ok_text(json!({
                "activeDeskSkinId": settings.desk_skin_id,
                "storagePath": desk_skins_path().to_string_lossy(),
                "count": custom.len(),
                "builtins": ["classic-cream", "carbon-night", "walnut-warm", "sakura-cream", "cyber-terminal", "deep-whale"],
                "custom": custom
            }))
        }
        "upsert_desk_skin" => {
            let Some(skin_val) = args.get("skin") else {
                return err_text("Missing required 'skin' object argument.");
            };
            let parsed: DeskSkinConfig = match serde_json::from_value(skin_val.clone()) {
                Ok(s) => s,
                Err(e) => return err_text(&format!("Invalid desk skin JSON: {}", e)),
            };
            match upsert_desk_skin(parsed) {
                Ok(saved) => {
                    let activate = args
                        .get("activate")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    if activate {
                        let mut s = load_settings();
                        s.desk_skin_id = saved.id.clone();
                        save_settings(&s);
                    }
                    on_change();
                    ok_text(json!({ "status": "saved", "activated": activate, "skin": saved }))
                }
                Err(e) => err_text(&format!("Failed to save desk skin: {}", e)),
            }
        }
        "switch_desk_skin" => {
            let Some(id_raw) = args.get("id").and_then(|v| v.as_str()) else {
                return err_text("Missing required 'id' string argument.");
            };
            let id = sanitize_skin_id(id_raw);
            let mut s = load_settings();
            s.desk_skin_id = id.clone();
            save_settings(&s);
            on_change();
            ok_text(json!({ "status": "switched", "activeDeskSkinId": id }))
        }
        "delete_desk_skin" => {
            let Some(id_raw) = args.get("id").and_then(|v| v.as_str()) else {
                return err_text("Missing required 'id' string argument.");
            };
            let id = sanitize_skin_id(id_raw);
            match delete_desk_skin(&id) {
                Ok(removed) => {
                    if removed {
                        let mut s = load_settings();
                        if s.desk_skin_id == id {
                            s.desk_skin_id = "classic-cream".to_string();
                            save_settings(&s);
                        }
                        on_change();
                        ok_text(json!({ "status": "deleted", "id": id }))
                    } else {
                        err_text(&format!("No custom desk skin found for '{}'.", id))
                    }
                }
                Err(e) => err_text(&format!("Failed to delete desk skin: {}", e)),
            }
        }
        "get_idle_actions" => {
            let s = load_settings();
            let available = models::actions(&s.cat_breed, &s.render_mode);
            let active_mode = all_cats().iter().find(|cat| cat.id == s.cat_breed)
                .map(|cat| models::mode(cat, &s.render_mode)).unwrap_or_else(|| s.render_mode.clone());
            ok_text(json!({
                "modelId": s.cat_breed,
                "mode": active_mode,
                "enabled": s.idle_actions_enabled,
                "delaySec": s.idle_delay_sec,
                "lastRequest": s.idle_action_request,
                "seq": s.idle_action_seq,
                "available": available
            }))
        }
        "trigger_idle_action" => {
            let Some(raw) = args.get("kind").and_then(|v| v.as_str()) else {
                return err_text("Missing required 'kind' string argument.");
            };
            let mut s = load_settings();
            let available = models::actions(&s.cat_breed, &s.render_mode);
            let kind = if raw.trim() == "sleep" { "nap" } else { raw.trim() };
            if !available.as_array().is_some_and(|list| list.contains(&json!(kind))) {
                return err_text(&format!("Action '{}' is unavailable for this model; available: {}", kind, available));
            }
            s.idle_action_request = kind.to_string();
            s.idle_action_seq = s.idle_action_seq.wrapping_add(1);
            save_settings(&s);
            on_change();
            ok_text(json!({ "status": "queued", "kind": kind, "seq": s.idle_action_seq }))
        }
        "set_idle_actions" => {
            let enabled = args.get("enabled").and_then(|v| v.as_bool());
            let delay = args.get("delaySec").and_then(|v| v.as_f64());
            if enabled.is_none() && delay.is_none() {
                return err_text("Provide 'enabled' (bool) and/or 'delaySec' (number).");
            }
            let mut s = load_settings();
            if let Some(enabled) = enabled {
                s.idle_actions_enabled = enabled;
            }
            if let Some(delay) = delay {
                if delay.is_finite() {
                    s.idle_delay_sec = delay.clamp(2.0, 120.0);
                }
            }
            save_settings(&s);
            on_change();
            ok_text(json!({ "enabled": s.idle_actions_enabled, "delaySec": s.idle_delay_sec }))
        }
        "get_mood" => {
            let s = load_settings();
            ok_text(json!({
                "tracking": s.mood_tracking_enabled,
                "annoyanceRequest": s.mood_annoyance_request,
                "dizzyRequest": s.mood_dizzy_request,
                "seq": s.mood_seq,
                "note": "The live meter is updated by the desktop UI; these fields are the last request sent via MCP."
            }))
        }
        "set_mood" => {
            let mut s = load_settings();
            let mut changed = false;
            if let Some(v) = args.get("annoyance").and_then(|v| v.as_f64()) {
                s.mood_annoyance_request = v.clamp(0.0, 1.0);
                changed = true;
            }
            if let Some(v) = args.get("dizzy").and_then(|v| v.as_f64()) {
                s.mood_dizzy_request = v.clamp(0.0, 1.0);
                changed = true;
            }
            if !changed {
                return err_text("Provide 'annoyance' and/or 'dizzy' (0-1).");
            }
            s.mood_seq = s.mood_seq.wrapping_add(1);
            save_settings(&s);
            on_change();
            ok_text(json!({
                "status": "queued",
                "annoyance": s.mood_annoyance_request,
                "dizzy": s.mood_dizzy_request,
                "seq": s.mood_seq
            }))
        }
        "set_mood_tracking" => {
            let Some(enabled) = args.get("enabled").and_then(|v| v.as_bool()) else {
                return err_text("Missing required 'enabled' boolean argument.");
            };
            let mut s = load_settings();
            s.mood_tracking_enabled = enabled;
            save_settings(&s);
            on_change();
            ok_text(json!({ "enabled": enabled }))
        }
        "get_keycaps" | "set_keycaps" | "clear_keycaps" => {
            let mut s = load_settings();
            let actual = all_cats().iter().find(|c| c.id == s.cat_breed).map(|c| models::mode(c, &s.render_mode)).unwrap_or_else(|| s.render_mode.clone());
            let mode = args["mode"].as_str().unwrap_or(&actual);
            if !matches!(mode, "2d" | "3d") { return err_text("mode must be 2d or 3d"); }
            let mut next = if mode == "3d" { s.keycap_overrides3d.clone().unwrap_or_else(|| s.keycap_overrides.clone()) } else { s.keycap_overrides.clone() };
            if name == "get_keycaps" { return ok_text(json!({ "mode": mode, "keycaps": next, "validKeyIds": VALID_KEY_IDS })); }
            if name == "clear_keycaps" { next.clear(); } else {
                let parsed: std::collections::HashMap<String, crate::config::KeycapOverride> = match serde_json::from_value(args["keycaps"].clone()) {
                    Ok(m) => m, Err(e) => return err_text(&format!("Invalid keycaps: {}", e)),
                };
                if args["replace"].as_bool().unwrap_or(false) { next.clear(); }
                next.extend(parsed);
                next = crate::config::normalize_keycap_overrides(next);
            }
            if mode == "3d" { s.keycap_overrides3d = Some(next.clone()); } else { s.keycap_overrides = next.clone(); }
            save_settings(&s); on_change();
            ok_text(json!({ "status": "saved", "mode": mode, "count": next.len(), "keycaps": next }))
        }
        "get_lighting" => {
            let s = load_settings();
            ok_text(serde_json::to_value(&s.keyboard_light).unwrap_or(json!({})))
        }
        "set_lighting" => {
            let mut s = load_settings();
            let mut cfg = s.keyboard_light.clone();
            if let Some(v) = args.get("enabled").and_then(|v| v.as_bool()) {
                cfg.enabled = v;
            }
            if let Some(v) = args.get("effect").and_then(|v| v.as_str()) {
                cfg.effect = v.to_string();
                if cfg.effect != "off" {
                    cfg.enabled = true;
                }
            }
            if let Some(v) = args.get("color").and_then(|v| v.as_str()) {
                cfg.color = v.to_string();
            }
            if let Some(v) = args.get("color2").and_then(|v| v.as_str()) {
                cfg.color2 = v.to_string();
            }
            if let Some(arr) = args.get("palette").and_then(|v| v.as_array()) {
                cfg.palette = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
            }
            if let Some(v) = args.get("colorMode").and_then(|v| v.as_str()) {
                cfg.color_mode = v.to_string();
            }
            if let Some(v) = args.get("edgeLight").and_then(|v| v.as_bool()) {
                cfg.edge_light = v;
            }
            if let Some(v) = args.get("speed").and_then(|v| v.as_f64()) {
                cfg.speed = v;
            }
            if let Some(v) = args.get("brightness").and_then(|v| v.as_f64()) {
                cfg.brightness = v;
            }
            if let Some(v) = args.get("reactive").and_then(|v| v.as_bool()) {
                cfg.reactive = v;
            }
            if let Some(v) = args.get("underglow").and_then(|v| v.as_bool()) {
                cfg.underglow = v;
            }
            if let Some(v) = args.get("zone").and_then(|v| v.as_str()) {
                cfg.zone = v.to_string();
            }
            s.keyboard_light = cfg.normalized();
            if s.keyboard_light.effect == "off" {
                s.keyboard_light.enabled = false;
            }
            save_settings(&s);
            on_change();
            ok_text(serde_json::to_value(&s.keyboard_light).unwrap_or(json!({})))
        }
        "get_settings" => ok_text(serde_json::to_value(load_settings()).unwrap_or(json!({}))),
        "update_settings" => {
            let mut s = load_settings();
            if let Some(breed) = args.get("catBreed").and_then(|v| v.as_str()) {
                let clean = sanitize_cat_id(breed);
                if cat_exists(&clean) {
                    s.cat_breed = clean;
                } else {
                    return err_text(&format!("Unknown catBreed '{}'.", clean));
                }
            }
            if let Some(scale) = args.get("scale").and_then(|v| v.as_f64()) {
                s.scale = scale.clamp(0.20, 1.50);
            }
            if let Some(layout) = args.get("keyboardLayout").and_then(|v| v.as_str()) {
                s.keyboard_layout = crate::config::normalize_keyboard_layout(layout);
            }
            if let Some(orient) = args.get("keyboardOrientation").and_then(|v| v.as_str()) {
                s.keyboard_orientation = crate::config::normalize_keyboard_orientation(orient);
            }
            if let Some(v) = args.get("keyboardScale65").and_then(|v| v.as_f64()) {
                s.keyboard_scale_65 = crate::config::normalize_keyboard_scale(v);
            }
            if let Some(v) = args.get("keyboardScale108").and_then(|v| v.as_f64()) {
                s.keyboard_scale_108 = crate::config::normalize_keyboard_scale(v).min(1.0);
            }
            if let Some(v) = args.get("mouseOrientation").and_then(|v| v.as_str()) {
                s.mouse_orientation = crate::config::normalize_mouse_orientation(v);
            }
            if let Some(b) = args.get("showKeyBubbles").and_then(|v| v.as_bool()) {
                s.show_key_bubbles = b;
            }
            if let Some(b) = args.get("soundEnabled").and_then(|v| v.as_bool()) {
                s.sound_enabled = b;
            }
            if let Some(b) = args.get("alwaysOnTop").and_then(|v| v.as_bool()) {
                s.always_on_top = b;
            }
            if let Some(b) = args.get("clickThroughLocked").and_then(|v| v.as_bool()) {
                s.click_through_locked = b;
            }
            if let Some(v) = args["renderMode"].as_str() { s.render_mode = crate::config::normalize_render_mode(v); }
            if let Some(v) = args["collarColor"].as_str() { s.collar_color = crate::config::normalize_collar_color(v); }
            if let Some(v) = args["headphoneMode"].as_str() { s.headphone_mode = crate::config::normalize_headphone_mode(v); }
            if let Some(v) = args["tailKeyMode"].as_str() { s.tail_key_mode = crate::config::normalize_tail_key_mode(v); }
            if let Some(ids) = args["tailKeyIds"].as_array() {
                s.tail_key_ids = ids.iter().filter_map(|id| id.as_str()).filter(|id| VALID_KEY_IDS.contains(id)).map(String::from).collect();
            }
            if let Some(patch) = args["inputSound"].as_object() {
                let mut sound = serde_json::to_value(&s.input_sound).unwrap();
                for (k, v) in patch { sound[k] = v.clone(); }
                s.input_sound = match serde_json::from_value::<crate::config::InputSoundConfig>(sound) {
                    Ok(v) => v.normalized(), Err(e) => return err_text(&format!("Invalid inputSound: {}", e)),
                };
            }
            if let Some(cat) = all_cats().iter().find(|cat| cat.id == s.cat_breed) { s.render_mode = models::mode(cat, &s.render_mode); }
            if let Some(b) = args.get("autostart").and_then(|v| v.as_bool()) {
                if set_windows_autostart(b).is_ok() {
                    s.autostart = b;
                }
            }
            save_settings(&s);
            on_change();
            ok_text(serde_json::to_value(&s).unwrap_or(json!({})))
        }
        _ => err_text(&format!("Unknown tool: {}", name)),
    }
}

pub fn handle_jsonrpc(req: &Value, on_change: &dyn Fn()) -> Option<Value> {
    let id = req.get("id").cloned();
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or_else(|| json!({}));

    // Notifications (no id) must not receive a JSON-RPC response
    if id.is_none() || method.starts_with("notifications/") {
        return None;
    }
    let id = id.unwrap();

    let result = match method {
        "initialize" => {
            let client_ver = params
                .get("protocolVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("2024-11-05");
            let ver = match client_ver {
                "2025-06-18" | "2025-03-26" | "2024-11-05" => client_ver,
                _ => "2024-11-05",
            };
            Ok(json!({
                "protocolVersion": ver,
                "capabilities": {
                    "tools": { "listChanged": false }
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION
                },
                "instructions": "First use get_builtin_rigs to discover skin-importable cat/naiwa rigs and fixed-art dafeiyu. Naiwa has canvas-naiwa-v1 for 2D and three-naiwa-v1 for imported GLB with a validated live rig: it shares cat keyboard/mouse/prop contacts, head and pupil gaze, sleeping, ground roll and foot reactions. Ordinary three-glb-v1 remains clip-driven. Its 2D rig uses hands for typing/mouse/props and feet only for tail-key taps, and adds silent frogHop/frogCroak/bellyPat/frogSway/frogPeek/footSwing actions. Milk cat is a cat skin, not a frog. Use get_resource_contract/list_resources/import_resource_pack/export_resource_pack/delete_resource_pack/switch_resource for independent 2D/3D keyboard and mouse resources. Use get_model_contract for versioned 2D/3D packages, import_model_pack/export_model_pack for sharing, delete_cat for local removal, and list_cats/get_idle_actions for the active model capabilities. trigger_idle_action supports sleep, tailGround and calm without changing auto-idle. update_settings includes render mode, collar, headphones, tail controls and input sounds; keycap tools take mode to keep 2D/3D independent. get_mood reports saved requests, not live state. Existing skin, desk, props and RGB tools remain available."
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => {
            let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            Ok(execute_tool(tool_name, &args, on_change))
        }
        _ => Err((-32601, format!("Method not found: {}", method))),
    };

    Some(match result {
        Ok(res) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": res
        }),
        Err((code, message)) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message }
        }),
    })
}

/// Transport 1: Zero-dependency native Stdio MCP server (`DIY-Cat.exe --mcp`)
pub fn run_stdio_mcp() {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    let noop = || {};

    for line_res in stdin.lock().lines() {
        let Ok(line) = line_res else {
            break;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parsed: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let err_resp = json!({
                    "jsonrpc": "2.0",
                    "id": Value::Null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                });
                let _ = writeln!(out, "{}", err_resp);
                let _ = out.flush();
                continue;
            }
        };

        if let Some(resp) = handle_jsonrpc(&parsed, &noop) {
            let _ = writeln!(out, "{}", resp);
            let _ = out.flush();
        }
    }
}

/// Transport 2: Lightweight loopback-only Streamable HTTP MCP endpoint (`http://127.0.0.1:<port>/mcp`)
pub fn start_http_mcp_server<F>(port: u16, enabled: Arc<AtomicBool>, on_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
    let on_change = Arc::new(on_change);
    std::thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", port);
        let Ok(listener) = TcpListener::bind(&addr) else {
            return;
        };
        for stream_res in listener.incoming() {
            let Ok(stream) = stream_res else {
                continue;
            };
            let flag = enabled.clone();
            let notify = on_change.clone();
            std::thread::spawn(move || {
                handle_http_conn(stream, &flag, &*notify);
            });
        }
    });
}

fn write_http_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
    let resp = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Accept, Mcp-Session-Id\r\nConnection: close\r\n\r\n{}",
        status,
        content_type,
        body.as_bytes().len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn handle_http_conn(mut stream: TcpStream, enabled: &AtomicBool, on_change: &dyn Fn()) {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.is_empty() {
        return;
    }
    let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0];
    let path = parts[1];

    let mut content_length: usize = 0;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).is_err() {
            return;
        }
        let trimmed = header.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            if k.eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse().unwrap_or(0);
            }
        }
    }

    if method == "OPTIONS" {
        write_http_response(&mut stream, "204 No Content", "text/plain", "");
        return;
    }

    if !enabled.load(Ordering::Relaxed) {
        write_http_response(
            &mut stream,
            "403 Forbidden",
            "application/json; charset=utf-8",
            r#"{"error":"MCP server is disabled in DIY-Cat settings"}"#,
        );
        return;
    }

    if method == "GET" && (path == "/health" || path == "/") {
        let body = json!({
            "ok": true,
            "name": SERVER_NAME,
            "version": SERVER_VERSION,
            "mcpEndpoint": "/mcp"
        })
        .to_string();
        write_http_response(&mut stream, "200 OK", "application/json; charset=utf-8", &body);
        return;
    }

    if method == "POST" && (path == "/mcp" || path == "/") {
        if content_length > crate::glb::MAX_PACKAGE + 65536 {
            write_http_response(
                &mut stream,
                "413 Payload Too Large",
                "application/json",
                r#"{"error":"Payload too large"}"#,
            );
            return;
        }
        let mut buf = vec![0u8; content_length];
        if content_length > 0 && reader.read_exact(&mut buf).is_err() {
            return;
        }
        let parsed: Value = match serde_json::from_slice(&buf) {
            Ok(v) => v,
            Err(e) => {
                let err = json!({
                    "jsonrpc": "2.0",
                    "id": Value::Null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                })
                .to_string();
                write_http_response(&mut stream, "400 Bad Request", "application/json; charset=utf-8", &err);
                return;
            }
        };

        if let Some(arr) = parsed.as_array() {
            let mut responses = Vec::new();
            for item in arr {
                if let Some(resp) = handle_jsonrpc(item, on_change) {
                    responses.push(resp);
                }
            }
            if responses.is_empty() {
                write_http_response(&mut stream, "202 Accepted", "application/json", "");
            } else {
                let body = serde_json::to_string(&responses).unwrap_or_else(|_| "[]".to_string());
                write_http_response(&mut stream, "200 OK", "application/json; charset=utf-8", &body);
            }
        } else if let Some(resp) = handle_jsonrpc(&parsed, on_change) {
            let body = resp.to_string();
            write_http_response(&mut stream, "200 OK", "application/json; charset=utf-8", &body);
        } else {
            write_http_response(&mut stream, "202 Accepted", "application/json", "");
        }
        return;
    }

    write_http_response(
        &mut stream,
        "404 Not Found",
        "application/json; charset=utf-8",
        r#"{"error":"Not found. Use POST /mcp or GET /health"}"#,
    );
}
