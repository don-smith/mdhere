use std::{fs, path::Path};

use mdhere_lib::{
    library::LibraryRegistry,
    story::{STORY_CSP, StoryNavigation, StoryProtocol},
};
use tempfile::tempdir;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x02\0\0\0\x90wS\xde\0\0\0\x0cIDAT\x08\xd7c\xf8\xcf\xc0\0\0\x03\x01\x01\0\x18\xdd\x8d\xb4\0\0\0\0IEND\xaeB`\x82";

fn write(root: &Path, path: &str, bytes: &[u8]) {
    let file = root.join(path);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(file, bytes).unwrap();
}

#[test]
fn serves_only_bounded_typed_resources_with_exact_headers() {
    let root = tempdir().unwrap();
    for (path, bytes, mime) in [
        (
            "pages/Story.html",
            b"<h1>Story</h1>".as_slice(),
            "text/html; charset=utf-8",
        ),
        (
            "pages/run.js",
            b"window.ran = true".as_slice(),
            "text/javascript; charset=utf-8",
        ),
        (
            "pages/style.css",
            b"h1 { color: red }".as_slice(),
            "text/css; charset=utf-8",
        ),
        ("pages/pic.png", PNG, "image/png"),
    ] {
        write(root.path(), path, bytes);
        let registry = LibraryRegistry::new();
        registry
            .register_root("mdhere", root.path().into())
            .unwrap();
        let revision = registry.root_revision("mdhere").unwrap();
        let response = StoryProtocol::serve(
            &registry,
            "mdhere",
            &format!("mdhere-story://localhost/{revision}/{path}"),
        );
        assert_eq!(response.status, 200, "{path}");
        assert_eq!(response.body, bytes);
        let mut expected = std::collections::BTreeMap::from([
            ("Content-Type".to_owned(), mime.to_owned()),
            ("X-Content-Type-Options".to_owned(), "nosniff".to_owned()),
        ]);
        if path.ends_with(".html") {
            expected.insert("Content-Security-Policy".into(), STORY_CSP.into());
        }
        assert_eq!(response.headers, expected);
    }
}

#[test]
fn serves_literal_percent_names_without_decoding_escapes_twice() {
    let root = tempdir().unwrap();
    write(root.path(), "page%.html", b"<h1>Percent</h1>");
    write(root.path(), "art%.png", PNG);
    write(root.path(), "a%2e.html", b"literal dot escape");
    write(root.path(), "a%2f.html", b"literal slash escape");
    let registry = LibraryRegistry::new();
    registry
        .register_root("mdhere", root.path().into())
        .unwrap();
    let revision = registry.root_revision("mdhere").unwrap();
    let base = format!("mdhere-story://localhost/{revision}/");
    for path in ["page%25.html", "art%25.png", "a%252e.html", "a%252f.html"] {
        assert_eq!(
            StoryProtocol::serve(&registry, "mdhere", &format!("{base}{path}")).status,
            200
        );
    }
    for path in [
        "%252fescape.html",
        "%255cescape.html",
        "%252e%252e/page.html",
        "%2fescape.html",
        "%2e%2e/page.html",
        "a%2f.html",
        "%2e/a%252e.html",
    ] {
        assert_ne!(
            StoryProtocol::serve(&registry, "mdhere", &format!("{base}{path}")).status,
            200,
            "{path}"
        );
    }
}

#[test]
fn rejects_bad_urls_types_sizes_and_stale_roots() {
    let root = tempdir().unwrap();
    write(root.path(), "page.html", b"<h1>ok</h1>");
    write(root.path(), "bad.html", &[0xff]);
    write(root.path(), "huge.js", &vec![b'a'; 10 * 1024 * 1024 + 1]);
    write(root.path(), "fake.png", b"not a png");
    write(root.path(), "script.svg", b"<svg/>");
    let registry = LibraryRegistry::new();
    registry
        .register_root("mdhere", root.path().into())
        .unwrap();
    let revision = registry.root_revision("mdhere").unwrap();
    let base = format!("mdhere-story://localhost/{revision}/");
    for path in [
        "../page.html",
        "%2e%2e/page.html",
        "%2fpage.html",
        "page%5chtml",
        "page.html?x=1",
        "page.html#x",
        "page.html/",
        "./page.html",
        "bad.html",
        "huge.js",
        "fake.png",
        "script.svg",
        "missing.html",
        "",
        "redirect.html",
        "page.html%00",
        "page.html%25",
    ] {
        assert_ne!(
            StoryProtocol::serve(&registry, "mdhere", &format!("{base}{path}")).status,
            200,
            "{path}"
        );
    }
    assert_ne!(
        StoryProtocol::serve(
            &registry,
            "mdhere",
            &format!("mdhere-story://evil/{revision}/page.html")
        )
        .status,
        200
    );
    assert_ne!(
        StoryProtocol::serve(&registry, "other", &format!("{base}page.html")).status,
        200
    );
    let replacement = tempdir().unwrap();
    write(replacement.path(), "page.html", b"<h1>replacement</h1>");
    registry
        .register_root("mdhere", replacement.path().into())
        .unwrap();
    assert_ne!(
        StoryProtocol::serve(&registry, "mdhere", &format!("{base}page.html")).status,
        200
    );
    let current = registry.root_revision("mdhere").unwrap();
    assert_eq!(
        StoryProtocol::serve(
            &registry,
            "mdhere",
            &format!("mdhere-story://localhost/{current}/page.html")
        )
        .body,
        b"<h1>replacement</h1>"
    );
    registry.unregister("mdhere");
    assert_ne!(
        StoryProtocol::serve(&registry, "mdhere", &format!("{base}page.html")).status,
        200
    );
}

#[cfg(unix)]
#[test]
fn rejects_out_of_root_symlinks() {
    use std::os::unix::fs::symlink;
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(outside.path(), "outside.js", b"alert(1)");
    symlink(
        outside.path().join("outside.js"),
        root.path().join("escape.js"),
    )
    .unwrap();
    let registry = LibraryRegistry::new();
    registry
        .register_root("mdhere", root.path().into())
        .unwrap();
    let revision = registry.root_revision("mdhere").unwrap();
    assert_ne!(
        StoryProtocol::serve(
            &registry,
            "mdhere",
            &format!("mdhere-story://localhost/{revision}/escape.js")
        )
        .status,
        200
    );
}

#[test]
fn one_shot_document_navigation_excludes_unexpected_destinations() {
    let navigation = StoryNavigation::default();
    assert!(navigation.allow_initial_app("tauri://localhost"));
    assert!(!navigation.allow_initial_app("tauri://localhost/index.html"));
    navigation.authorize("mdhere-story://localhost/1/story.html");
    assert!(!navigation.allow_story("mdhere-story://localhost/1/other.html"));
    assert!(navigation.allow_story("mdhere-story://localhost/1/story.html"));
    assert!(!navigation.allow_story("mdhere-story://localhost/1/story.html"));
    navigation.authorize("mdhere-story://localhost/2/story.html");
    navigation.invalidate();
    assert!(!navigation.allow_story("mdhere-story://localhost/2/story.html"));
}
