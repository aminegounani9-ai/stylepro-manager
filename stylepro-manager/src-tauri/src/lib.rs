#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    // Only allow public StylePro storefront URLs. Never pass arbitrary
    // user-provided commands or schemes to the operating system.
    let prefix = "https://stylepro-manager.vercel.app/shop/";
    let store_id = url.strip_prefix(prefix)
        .ok_or_else(|| "URL de boutique non autorisée".to_string())?;
    let valid_id = store_id.len() == 36
        && store_id.chars().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) { c == '-' }
            else { c.is_ascii_hexdigit() }
        });
    if !valid_id {
        return Err("Identifiant de boutique invalide".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", ""]).arg(&url)
            .spawn()
            .map_err(|e| format!("Impossible d’ouvrir le navigateur: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Impossible d’ouvrir le navigateur: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Impossible d’ouvrir le navigateur: {e}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_external_url])
        .run(tauri::generate_context!())
        .expect("error while running StylePro Manager");
}
