use std::{fs, path::Path};

use md_here_lib::{assets::AssetProtocol, library::LibraryRegistry};
use tempfile::tempdir;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x02\0\0\0\x90wS\xde\0\0\0\x0cIDAT\x08\xd7c\xf8\xcf\xc0\0\0\x03\x01\x01\0\x18\xdd\x8d\xb4\0\0\0\0IEND\xaeB`\x82";

fn write(root: &Path, relative_path: &str, contents: &[u8]) {
    let path = root.join(relative_path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

fn asset(registry: &LibraryRegistry, url: &str) -> u16 {
    AssetProtocol::serve(registry, "window", url).status
}

#[test]
fn serves_a_valid_image_from_the_requesting_windows_root_with_nosniff() {
    let root = tempdir().unwrap();
    write(root.path(), "images/cover.png", PNG);
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().into())
        .unwrap();

    let response =
        AssetProtocol::serve(&registry, "window", "mdhere-asset://local/images/cover.png");

    assert_eq!(response.status, 200);
    assert_eq!(response.mime, Some("image/png".into()));
    assert_eq!(
        response.headers.get("X-Content-Type-Options"),
        Some(&"nosniff".into())
    );
    assert_eq!(response.body, PNG);
}

#[test]
fn rejects_paths_and_content_that_cannot_be_safe_images() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(
        root.path(),
        "images/vector.svg",
        b"<svg xmlns='http://www.w3.org/2000/svg'/>",
    );
    write(root.path(), "images/mismatch.png", b"not an image");
    write(
        root.path(),
        "images/large.png",
        &vec![0; 25 * 1024 * 1024 + 1],
    );
    write(outside.path(), "outside.png", PNG);
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().into())
        .unwrap();

    for url in [
        "mdhere-asset://local/../outside.png",
        "mdhere-asset://local/%2e%2e/outside.png",
        "mdhere-asset://local/%2Fetc%2Fpasswd",
        "mdhere-asset://other/images/vector.svg",
        "mdhere-asset://local/images/vector.svg",
        "mdhere-asset://local/images/mismatch.png",
        "mdhere-asset://local/images/large.png",
        "mdhere-asset://local/images/missing.png",
    ] {
        assert_ne!(asset(&registry, url), 200, "{url}");
    }
}

#[cfg(unix)]
#[test]
fn rejects_a_symlink_that_escapes_the_registered_root() {
    use std::os::unix::fs::symlink;

    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(outside.path(), "outside.png", PNG);
    symlink(
        outside.path().join("outside.png"),
        root.path().join("escaped.png"),
    )
    .unwrap();
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().into())
        .unwrap();

    assert_ne!(asset(&registry, "mdhere-asset://local/escaped.png"), 200);
}
