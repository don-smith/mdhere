use std::{collections::BTreeMap, fs::File, io::Read, path::Path, sync::Mutex};

use percent_encoding::percent_decode_str;

use crate::library::{LibraryRegistry, PathGuard};

pub const STORY_CSP: &str = "default-src 'none'; script-src 'unsafe-inline' mdhere-story:; style-src 'unsafe-inline' mdhere-story:; img-src mdhere-story:; connect-src 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; font-src 'none'; navigate-to 'none'";
const MAX_TEXT_BYTES: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

pub struct StoryProtocol;

#[derive(Debug, PartialEq, Eq)]
pub struct StoryResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

impl StoryResponse {
    fn reject(status: u16) -> Self {
        Self {
            status,
            headers: BTreeMap::new(),
            body: Vec::new(),
        }
    }
}

// The prefix and encoded path are inspected before any URL parser can normalize
// dot segments. This also rejects query/fragment and non-localhost authorities.
fn parse_request(url: &str) -> Option<(u64, String)> {
    let rest = url.strip_prefix("mdhere-story://localhost/")?;
    if rest.contains(['?', '#', '\\']) {
        return None;
    }
    let (revision, path) = rest.split_once('/')?;
    let revision = revision.parse::<u64>().ok()?;
    if revision == 0 || path.is_empty() {
        return None;
    }
    let mut decoded = Vec::new();
    for part in path.split('/') {
        let segment = percent_decode_str(part).decode_utf8().ok()?;
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.contains(['/', '\\', '\0'])
            || segment.chars().any(char::is_control)
        {
            return None;
        }
        decoded.push(segment.into_owned());
    }
    Some((revision, decoded.join("/")))
}

fn resource_type(path: &str) -> Option<(&'static str, u64, bool)> {
    match Path::new(path)
        .extension()?
        .to_str()?
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => Some(("text/html; charset=utf-8", MAX_TEXT_BYTES, true)),
        "js" => Some(("text/javascript; charset=utf-8", MAX_TEXT_BYTES, true)),
        "css" => Some(("text/css; charset=utf-8", MAX_TEXT_BYTES, true)),
        "png" => Some(("image/png", MAX_IMAGE_BYTES, false)),
        "jpg" | "jpeg" => Some(("image/jpeg", MAX_IMAGE_BYTES, false)),
        "gif" => Some(("image/gif", MAX_IMAGE_BYTES, false)),
        "webp" => Some(("image/webp", MAX_IMAGE_BYTES, false)),
        "bmp" => Some(("image/bmp", MAX_IMAGE_BYTES, false)),
        _ => None,
    }
}

impl StoryProtocol {
    pub fn serve(
        registry: &LibraryRegistry,
        window_label: &str,
        request_url: &str,
    ) -> StoryResponse {
        let Some((revision, relative)) = parse_request(request_url) else {
            return StoryResponse::reject(400);
        };
        let Some((mime, limit, text)) = resource_type(&relative) else {
            return StoryResponse::reject(400);
        };
        registry
            .with_root_revision(window_label, revision, |root| {
                let Ok(file) = PathGuard::new(root.to_path_buf()).resolve(&relative) else {
                    return StoryResponse::reject(404);
                };
                let Ok(file) = File::open(file) else {
                    return StoryResponse::reject(404);
                };
                let Ok(metadata) = file.metadata() else {
                    return StoryResponse::reject(404);
                };
                if !metadata.is_file() || metadata.len() > limit {
                    return StoryResponse::reject(400);
                }
                let mut bytes = Vec::new();
                if file.take(limit + 1).read_to_end(&mut bytes).is_err()
                    || bytes.len() as u64 != metadata.len()
                {
                    return StoryResponse::reject(400);
                }
                if text && std::str::from_utf8(&bytes).is_err() {
                    return StoryResponse::reject(400);
                }
                if !text && infer::get(&bytes).map(|kind| kind.mime_type()) != Some(mime) {
                    return StoryResponse::reject(400);
                }
                let mut headers = BTreeMap::from([
                    ("Content-Type".into(), mime.into()),
                    ("X-Content-Type-Options".into(), "nosniff".into()),
                ]);
                if mime.starts_with("text/html") {
                    headers.insert("Content-Security-Policy".into(), STORY_CSP.into());
                }
                StoryResponse {
                    status: 200,
                    headers,
                    body: bytes,
                }
            })
            .unwrap_or_else(|| StoryResponse::reject(404))
    }
}

#[derive(Default)]
pub struct StoryNavigation(Mutex<NavigationState>);

#[derive(Default)]
struct NavigationState {
    initial_app: bool,
    pending_story: Option<String>,
}

impl StoryNavigation {
    pub fn allow_initial_app(&self, url: &str) -> bool {
        let mut state = self.0.lock().expect("story navigation lock");
        if state.initial_app || !["tauri://localhost", "http://localhost:1420/"].contains(&url) {
            return false;
        }
        state.initial_app = true;
        true
    }

    pub fn authorize(&self, url: &str) {
        self.0.lock().expect("story navigation lock").pending_story = Some(url.to_owned());
    }

    pub fn allow_story(&self, url: &str) -> bool {
        let mut state = self.0.lock().expect("story navigation lock");
        if state.pending_story.as_deref() == Some(url) {
            state.pending_story = None;
            true
        } else {
            false
        }
    }

    pub fn invalidate(&self) {
        self.0.lock().expect("story navigation lock").pending_story = None;
    }
}
