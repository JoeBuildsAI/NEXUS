//! Video thumbnails from the Windows Shell thumbnail provider — the same frames
//! Explorer shows, produced by codecs already on the machine. Local only:
//! cached as PNGs under the app cache dir with hashed names (no filenames on
//! disk), keyed by path + size + modified time so edited files refresh.
//! Generation runs off the UI thread.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Manager;

const THUMB_W: i32 = 480;
const THUMB_H: i32 = 270;

fn thumbs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Stable, non-reversible cache name for a file version.
pub fn cache_name(path: &Path, size: u64, modified: u64) -> String {
    let mut h = Sha256::new();
    h.update(path.to_string_lossy().to_lowercase().as_bytes());
    h.update(size.to_le_bytes());
    h.update(modified.to_le_bytes());
    format!("{:x}", h.finalize())[..32].to_string()
}

/// Cached (or freshly rendered) thumbnail path for a video in an opened folder;
/// None when Windows has no thumbnail for it (unsupported codec, corrupt file).
#[tauri::command]
pub async fn video_thumbnail(app: tauri::AppHandle, state: tauri::State<'_, crate::library::LibraryState>, path: String) -> Result<Option<String>, String> {
    let p = PathBuf::from(path.trim());
    if !crate::library::in_granted_folder(&state, &p) {
        return Err("File is not in a folder you opened.".into());
    }
    let meta = std::fs::metadata(&p).map_err(|_| "File not found.".to_string())?;
    let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let dir = thumbs_dir(&app)?;
    // The WebView may read the cache (read-only grant, idempotent).
    let _ = app.asset_protocol_scope().allow_directory(&dir, false);
    let out = dir.join(format!("{}.png", cache_name(&p, meta.len(), modified)));
    if out.is_file() {
        return Ok(Some(crate::library::normalize(&out).to_string_lossy().to_string()));
    }
    let png = tauri::async_runtime::spawn_blocking(move || shell_image(&p, THUMB_W)).await.map_err(|e| e.to_string())?;
    match png {
        Some(bytes) => {
            std::fs::write(&out, bytes).map_err(|e| e.to_string())?;
            Ok(Some(crate::library::normalize(&out).to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// Remove every cached thumbnail.
#[tauri::command]
pub fn clear_thumbnails(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = thumbs_dir(&app)?;
    let mut removed = 0;
    for e in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        if p.extension().map(|x| x == "png").unwrap_or(false) && std::fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Render a content thumbnail (a video frame — never a generic file icon) as PNG
/// with IShellItemImageFactory, in its own COM apartment; None on any failure.
#[cfg(target_os = "windows")]
pub fn shell_image(path: &Path, size: i32) -> Option<Vec<u8>> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_THUMBNAILONLY};

    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    let result = (|| {
        let wide = HSTRING::from(path.as_os_str());
        let factory: IShellItemImageFactory = unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }.ok()?;
        let (cx, cy, flags) = (size, size * THUMB_H / THUMB_W, SIIGBF_THUMBNAILONLY);
        let hbmp = unsafe { factory.GetImage(SIZE { cx, cy }, flags) }.ok()?;
        let mut bmp = BITMAP::default();
        let got = unsafe { GetObjectW(hbmp.into(), std::mem::size_of::<BITMAP>() as i32, Some(&mut bmp as *mut BITMAP as *mut _)) };
        if got == 0 || bmp.bmWidth <= 0 || bmp.bmHeight <= 0 || bmp.bmWidth > 4096 || bmp.bmHeight > 4096 {
            unsafe { let _ = DeleteObject(hbmp.into()); }
            return None;
        }
        let (w, h) = (bmp.bmWidth as usize, bmp.bmHeight as usize);
        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w as i32,
            biHeight: -(h as i32), // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };
        let mut buf = vec![0u8; w * h * 4];
        let hdc = unsafe { GetDC(None) };
        let lines = unsafe { GetDIBits(hdc, hbmp, 0, h as u32, Some(buf.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS) };
        unsafe {
            ReleaseDC(None, hdc);
            let _ = DeleteObject(hbmp.into());
        }
        if lines == 0 {
            return None;
        }
        // BGRA → RGBA; shell thumbnails often carry a zero alpha channel.
        let has_alpha = buf.chunks_exact(4).any(|px| px[3] != 0);
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            if !has_alpha {
                px[3] = 255;
            }
        }
        encode_png(w as u32, h as u32, &buf)
    })();
    if init.is_ok() {
        unsafe { CoUninitialize() };
    }
    result
}

#[cfg(not(target_os = "windows"))]
pub fn shell_image(_path: &Path, _size: i32) -> Option<Vec<u8>> {
    None
}

pub fn encode_png(w: u32, h: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(out)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_names_are_hashes_that_change_with_the_file_version() {
        let p = Path::new(r"X:\Private\very secret video.mp4");
        let a = cache_name(p, 100, 1);
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(!a.contains("secret"));
        assert_eq!(a, cache_name(Path::new(r"x:\private\VERY SECRET VIDEO.mp4"), 100, 1));
        assert_ne!(a, cache_name(p, 101, 1));
        assert_ne!(a, cache_name(p, 100, 2));
    }

    #[test]
    fn png_encoder_produces_a_valid_signature() {
        let png = encode_png(2, 1, &[255, 0, 0, 255, 0, 255, 0, 255]).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }
}
