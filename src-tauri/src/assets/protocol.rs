use std::{collections::BTreeMap, fs};

use percent_encoding::percent_decode_str;
use url::Url;

use crate::library::LibraryRegistry;

const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub struct AssetResponse {
    pub status: u16,
    pub mime: Option<String>,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

pub struct AssetProtocol;

impl AssetProtocol {
    pub fn serve(
        registry: &LibraryRegistry,
        window_label: &str,
        request_url: &str,
    ) -> AssetResponse {
        let path = match asset_path(request_url) {
            Some(path) => path,
            None => return AssetResponse::bad_request(),
        };
        let file = match registry.resolve_path(window_label, &path) {
            Ok(file) => file,
            Err(_) => return AssetResponse::not_found(),
        };
        let metadata = match fs::metadata(&file) {
            Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_IMAGE_BYTES => metadata,
            Ok(_) => return AssetResponse::bad_request(),
            Err(_) => return AssetResponse::not_found(),
        };
        let bytes = match fs::read(&file) {
            Ok(bytes) if bytes.len() as u64 == metadata.len() => bytes,
            Ok(_) => return AssetResponse::bad_request(),
            Err(_) => return AssetResponse::not_found(),
        };
        let Some(mime) = supported_mime(&bytes) else {
            return AssetResponse::bad_request();
        };

        AssetResponse::ok(mime, bytes)
    }
}

impl AssetResponse {
    fn ok(mime: &str, body: Vec<u8>) -> Self {
        let mut headers = BTreeMap::new();
        headers.insert("Content-Type".into(), mime.into());
        headers.insert("X-Content-Type-Options".into(), "nosniff".into());
        Self {
            status: 200,
            mime: Some(mime.into()),
            headers,
            body,
        }
    }

    fn bad_request() -> Self {
        Self {
            status: 400,
            mime: None,
            headers: BTreeMap::new(),
            body: Vec::new(),
        }
    }

    fn not_found() -> Self {
        Self {
            status: 404,
            mime: None,
            headers: BTreeMap::new(),
            body: Vec::new(),
        }
    }
}

fn asset_path(request_url: &str) -> Option<String> {
    let url = Url::parse(request_url).ok()?;
    if url.scheme() != "mdhere-asset"
        || url.host_str() != Some("local")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let mut parts = Vec::new();
    for encoded in url.path_segments()? {
        let part = percent_decode_str(encoded).decode_utf8().ok()?;
        if part.is_empty() || part == "." || part == ".." || part.contains(['/', '\\']) {
            return None;
        }
        parts.push(part.into_owned());
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn supported_mime(bytes: &[u8]) -> Option<&'static str> {
    match infer::get(bytes)?.mime_type() {
        "image/png" => Some("image/png"),
        "image/jpeg" => Some("image/jpeg"),
        "image/gif" => Some("image/gif"),
        "image/webp" => Some("image/webp"),
        "image/bmp" => Some("image/bmp"),
        _ => None,
    }
}
