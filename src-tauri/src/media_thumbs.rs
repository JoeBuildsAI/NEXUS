//! Local video thumbnails via the Windows Shell thumbnail provider — the same
//! images Explorer shows, produced by the codecs already on the machine. Nothing
//! is uploaded; results are cached as PNGs under the app cache dir, keyed by a
//! SHA-256 of the path so private filenames never appear on disk, and grouped
//! per authorized root so revoking a root purges its thumbnails.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Manager;

const THUMB_W: i32 = 384;
const THUMB_H: i32 = 216;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResult {
    /// Absolute cache path (served via the asset protocol) or None when the
    /// shell has no thumbnail for this file.
    pub path: Option<String>,
    pub cached: bool,
}

fn thumbs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn hashed_name(path: &Path) -> String {
    let mut h = Sha256::new();
    h.update(path.to_string_lossy().to_lowercase().as_bytes());
    format!("{:x}", h.finalize())[..32].to_string()
}

fn root_dir_name(root_id: &str) -> String {
    root_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(48).collect()
}

/// Generate (or fetch cached) thumbnail for a file inside an authorized root.
#[tauri::command]
pub fn media_thumbnail(app: tauri::AppHandle, state: tauri::State<crate::media::MediaState>, path: String, root_id: String) -> Result<ThumbnailResult, String> {
    let p = PathBuf::from(path.trim());
    {
        let roots = state.roots.lock().map_err(|e| e.to_string())?;
        if !roots.iter().any(|r| crate::media::is_within(r, &p)) {
            return Err("File is not inside an authorized media location.".into());
        }
    }
    if !p.is_file() {
        return Ok(ThumbnailResult { path: None, cached: false });
    }
    let dir = thumbs_dir(&app)?.join(root_dir_name(&root_id));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Grant the WebView read access to the cache once (idempotent).
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    let out = dir.join(format!("{}.png", hashed_name(&p)));
    if out.is_file() {
        return Ok(ThumbnailResult { path: Some(out.to_string_lossy().to_string()), cached: true });
    }
    match shell_image(&p, THUMB_W, ShellImageKind::Thumbnail) {
        Some(png) => {
            std::fs::write(&out, png).map_err(|e| e.to_string())?;
            Ok(ThumbnailResult { path: Some(out.to_string_lossy().to_string()), cached: false })
        }
        None => Ok(ThumbnailResult { path: None, cached: false }),
    }
}

/// Remove every cached thumbnail for a root (called on revoke / clear history).
#[tauri::command]
pub fn media_purge_thumbnails(app: tauri::AppHandle, root_id: Option<String>) -> Result<u64, String> {
    let base = thumbs_dir(&app)?;
    let target = match root_id.as_deref() {
        Some(id) => base.join(root_dir_name(id)),
        None => base,
    };
    if !target.starts_with(thumbs_dir(&app)?) {
        return Err("refusing to purge outside the thumbnail cache".into());
    }
    let mut removed = 0u64;
    if target.is_dir() {
        for e in std::fs::read_dir(&target).map_err(|e| e.to_string())?.flatten() {
            let p = e.path();
            if p.is_dir() {
                for f in std::fs::read_dir(&p).into_iter().flatten().flatten() {
                    if f.path().extension().map(|x| x == "png").unwrap_or(false) && std::fs::remove_file(f.path()).is_ok() {
                        removed += 1;
                    }
                }
                let _ = std::fs::remove_dir(&p);
            } else if p.extension().map(|x| x == "png").unwrap_or(false) && std::fs::remove_file(&p).is_ok() {
                removed += 1;
            }
        }
        if root_id.is_some() {
            let _ = std::fs::remove_dir(&target);
        }
    }
    Ok(removed)
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ShellImageKind {
    /// Content thumbnail only (video frame, image) — never a generic file icon.
    Thumbnail,
    /// The file's icon (executables, shortcuts).
    Icon,
}

/// Render a PNG with IShellItemImageFactory. Runs on the calling (command)
/// thread with its own COM apartment; returns None on any failure.
#[cfg(target_os = "windows")]
pub fn shell_image(path: &Path, size: i32, kind: ShellImageKind) -> Option<Vec<u8>> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY, SIIGBF_THUMBNAILONLY};

    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    let result = (|| {
        let wide = HSTRING::from(path.as_os_str());
        let factory: IShellItemImageFactory = unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }.ok()?;
        let (cx, cy, flags) = match kind {
            ShellImageKind::Thumbnail => (size, size * THUMB_H / THUMB_W, SIIGBF_THUMBNAILONLY),
            ShellImageKind::Icon => (size, size, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK),
        };
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
pub fn shell_image(_path: &Path, _size: i32, _kind: ShellImageKind) -> Option<Vec<u8>> {
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
    fn cache_names_are_hashes_not_filenames() {
        let n = hashed_name(Path::new(r"X:\Private\very secret video.mp4"));
        assert_eq!(n.len(), 32);
        assert!(n.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(!n.contains("secret"));
        assert_eq!(n, hashed_name(Path::new(r"x:\private\VERY SECRET VIDEO.mp4")), "case-insensitive like NTFS");
    }

    #[test]
    fn root_dir_names_are_sanitized() {
        assert_eq!(root_dir_name("root-x:\\videos/../..\\evil"), "root-xvideosevil");
    }

    #[test]
    fn png_encoder_produces_a_valid_signature() {
        let png = encode_png(2, 1, &[255, 0, 0, 255, 0, 0, 255, 255]).unwrap();
        assert_eq!(&png[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
    }
}

#[cfg(all(test, target_os = "windows"))]
mod probe {
    /// Renders a thumbnail for a system image (video codecs vary per machine) to
    /// prove the shell path end-to-end. Run with --ignored.
    #[test]
    #[ignore]
    fn shell_thumbnail_roundtrip() {
        let p = std::path::Path::new(r"C:\Windows\Web\Wallpaper\Windows\img0.jpg");
        let png = super::shell_image(p, super::THUMB_W, super::ShellImageKind::Thumbnail).expect("shell produced a thumbnail");
        assert_eq!(&png[..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
        println!("thumbnail bytes: {}", png.len());
        std::fs::write(std::env::temp_dir().join("nexus-thumb-probe.png"), &png).unwrap();
    }
}
