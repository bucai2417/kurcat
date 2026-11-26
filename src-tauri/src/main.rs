#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "--mcp") {
        kuro_cat_pet_lib::run_mcp_stdio();
        return;
    }

    // Issue #41 escape hatch: `DIY-Cat.exe --unlock` clears the click-through lock
    // and exits, for users who cannot reach the tray or the Alt shortcut.
    if args.iter().any(|a| a == "--unlock") {
        kuro_cat_pet_lib::clear_click_through_lock();
        return;
    }

    kuro_cat_pet_lib::run();
}
