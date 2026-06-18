use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchOptions {
    server_url: Option<String>,
}

fn parse_launch_options() -> LaunchOptions {
    let mut args = std::env::args().skip(1);
    let mut server_url = None;

    while let Some(arg) = args.next() {
        if arg == "--server" {
            server_url = args.next();
        }
    }

    LaunchOptions { server_url }
}

#[tauri::command]
fn get_launch_options() -> LaunchOptions {
    parse_launch_options()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_launch_options])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
