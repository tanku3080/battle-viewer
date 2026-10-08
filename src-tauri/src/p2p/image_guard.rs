use base64::Engine;
use image::{GenericImageView, ImageReader, Limits};
use serde_json::Value;
use std::io::Cursor;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PIXELS_PER_IMAGE: u64 = 16_000_000;
const MAX_TOTAL_PIXELS: u64 = 32_000_000;
const MAX_IMAGES: usize = 2048;

pub fn validate_render_assets(raw: &[u8]) -> Result<(), String> {
  let root: Value = serde_json::from_slice(raw)
    .map_err(|_| "Invalid Battle image resource document".to_string())?;
  let mut assets: Vec<&str> = Vec::new();

  fn push<'a>(list: &mut Vec<&'a str>, icon: Option<&'a Value>) {
    if let Some(text) = icon.and_then(Value::as_str)
      && !text.is_empty() { list.push(text); }
  }

  push(&mut assets, root.pointer("/map/image"));
  for name in ["units", "characters"] {
    if let Some(items) = root.get(name).and_then(Value::as_array) {
      for item in items { push(&mut assets, item.get("icon")); }
    }
  }
  if let Some(nodes) = root.pointer("/hierarchy/nodes").and_then(Value::as_object) {
    for node in nodes.values() { push(&mut assets, node.get("icon")); }
  }
  if assets.len() > MAX_IMAGES { return Err("Too many images".into()); }

  let mut total_pixels = 0u64;
  for data_url in assets {
    let (prefix, encoded) = data_url.split_once(";base64,")
      .ok_or_else(|| "Only embedded image assets are accepted for P2P".to_string())?;
    let format = match prefix {
      "data:image/png" => image::ImageFormat::Png,
      "data:image/jpeg" => image::ImageFormat::Jpeg,
      "data:image/webp" => image::ImageFormat::WebP,
      _ => return Err("Unsupported P2P image format".into()),
    };
    if encoded.len() > MAX_IMAGE_BYTES * 4 / 3 + 8 {
      return Err("P2P image asset too large".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
      .decode(encoded).map_err(|_| "Invalid image Base64 data".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
      return Err("P2P image asset too large".into());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader.decode().map_err(|_| "P2P image decoding failed".to_string())?;
    let (width, height) = decoded.dimensions();
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_PIXELS_PER_IMAGE {
      return Err("P2P image pixel limit exceeded".into());
    }
    total_pixels = total_pixels.saturating_add(pixels);
    if total_pixels > MAX_TOTAL_PIXELS {
      return Err("P2P document image pixel budget exceeded".into());
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_image_free_battle() {
    let json = br#"{"title":"ok","map":{"width":1,"height":1},"units":[]}"#;
    assert!(validate_render_assets(json).is_ok());
  }

  #[test]
  fn blocks_remote_images_and_corrupt_base64() {
    let remote = br#"{"map":{"image":"https://example.org/a.png"}}"#;
    let corrupt = br#"{"map":{"image":"data:image/png;base64,!!!"}}"#;
    assert!(validate_render_assets(remote).is_err());
    assert!(validate_render_assets(corrupt).is_err());
  }
}
