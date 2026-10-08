//! Decode every image field admitted by the Battle/Creator v1 document schema.
//! Never fetch remote assets; preserve safe built-in /maps and /charas resources.
use base64::Engine;
use image::{GenericImageView, ImageReader, Limits};
use serde_json::Value;
use std::io::Cursor;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PIXELS_PER_IMAGE: u64 = 16_000_000;
const MAX_TOTAL_PIXELS: u64 = 32_000_000;
const MAX_IMAGES: usize = 2048;

fn fields<'a>(value: &'a Value, result: &mut Vec<&'a str>) {
  for field in ["image", "icon"] {
    if let Some(text) = value.get(field).and_then(Value::as_str)
      && !text.is_empty()
    {
      result.push(text);
    }
  }
}

fn legacy_hierarchy<'a>(value: &'a Value, result: &mut Vec<&'a str>) {
  // The strict core validation bounds hierarchy depth to 64.
  fields(value, result);
  if let Some(children) = value.get("children").and_then(Value::as_array) {
    for child in children { legacy_hierarchy(child, result); }
  }
}

fn images<'a>(root: &'a Value) -> Vec<&'a str> {
  let mut result = Vec::new();
  if let Some(map) = root.get("map") { fields(map, &mut result); }
  for kind in ["units", "characters"] {
    if let Some(values) = root.get(kind).and_then(Value::as_array) {
      for value in values { fields(value, &mut result); }
    }
  }
  if let Some(hierarchy) = root.get("hierarchy") {
    if let Some(nodes) = hierarchy.get("nodes").and_then(Value::as_object) {
      for node in nodes.values() { fields(node, &mut result); }
    }
    if let Some(legions) = hierarchy.get("legions").and_then(Value::as_array) {
      for legion in legions { legacy_hierarchy(legion, &mut result); }
    }
  }
  if let Some(items) = root.pointer("/creatorState/items").and_then(Value::as_array) {
    for item in items { fields(item, &mut result); }
  }
  result
}

fn bundled(source: &str) -> bool {
  if !source.starts_with("/maps/") && !source.starts_with("/charas/") {
    return false;
  }
  source.split('/').skip(1).all(|segment| {
    !segment.is_empty() && segment != "." && segment != ".." &&
      segment.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
  })
}

pub fn validate_render_assets(raw: &[u8]) -> Result<(), String> {
  let root: Value = serde_json::from_slice(raw)
    .map_err(|_| "Invalid Battle image resource document".to_string())?;
  let assets = images(&root);
  if assets.len() > MAX_IMAGES { return Err("Too many images".into()); }

  let mut total_pixels = 0u64;
  for source in assets {
    if bundled(source) { continue; }
    let (mime, encoded) = source.split_once(";base64,")
      .ok_or_else(|| "Only safe bundled paths or embedded raster images are allowed".to_string())?;
    let format = match mime {
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
  fn accepts_image_free_battle_and_safe_bundled_paths() {
    let raw = br#"{"map":{"image":"/maps/arena.png"},"units":[{"icon":"/charas/x.webp"}]}"#;
    assert!(validate_render_assets(raw).is_ok());
  }

  #[test]
  fn blocks_remote_images_and_corrupt_base64_everywhere() {
    for raw in [
      r#"{"map":{"image":"https://example.org/a.png"}}"#,
      r#"{"units":[{"icon":"data:image/png;base64,!!!"}]}"#,
      r#"{"creatorState":{"items":[{"image":"https://tracker.example/icon.png"}]}}"#,
      r#"{"hierarchy":{"nodes":{"x":{"icon":"https://example.org/icon.png"}}}}"#,
      r#"{"hierarchy":{"legions":[{"children":[{"image":"https://example.org/icon.png"}]}]}}"#,
      r#"{"map":{"image":"/maps/../private.txt"}}"#,
    ] {
      assert!(validate_render_assets(raw.as_bytes()).is_err(), "{raw}");
    }
  }

  #[test]
  fn decoding_rejects_truncated_signature_only_images() {
    // Valid PNG signature alone must not be treated as an actual image.
    let bytes = base64::engine::general_purpose::STANDARD.encode(b"\\x89PNG\\r\\n\\x1a\\n");
    let raw = format!(r#"{{"creatorState":{{"items":[{{"icon":"data:image/png;base64,{bytes}"}}]}}}}"#);
    assert!(validate_render_assets(raw.as_bytes()).is_err());
  }
}
