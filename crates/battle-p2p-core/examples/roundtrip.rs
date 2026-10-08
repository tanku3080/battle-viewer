//! Local-only smoke test; does not connect to Hub or start any network service.
use battle_p2p_core::{
    cache::{Cache, DEFAULT_QUOTA_BYTES},
    content::{MAX_UNCOMPRESSED_SIZE, encode},
};
use std::{fs, io::Read, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err(
            "usage: roundtrip <input.json> <new-output.json> <private-cache-directory>".into(),
        );
    }
    let mut raw = Vec::new();
    fs::File::open(&args[0])?
        .take(MAX_UNCOMPRESSED_SIZE + 1)
        .read_to_end(&mut raw)?;
    let (manifest, gzip) = encode(&raw)?;
    {
        let mut cache = Cache::open(PathBuf::from(&args[2]), DEFAULT_QUOTA_BYTES)?;
        cache.store(&manifest, &gzip)?;
    }
    let cache = Cache::open(PathBuf::from(&args[2]), DEFAULT_QUOTA_BYTES)?;
    let decoded = cache.read_raw(&manifest.content_hash)?;
    // Do not overwrite a user's existing file when running the example manually.
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&args[1])?;
    std::io::Write::write_all(&mut output, &decoded)?;
    println!("{}", serde_json::to_string(&manifest)?);
    Ok(())
}
