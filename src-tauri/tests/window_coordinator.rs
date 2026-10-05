use mdhere_lib::library::{Document, LibraryError, LibraryRegistry};
use std::{fs, path::Path};
use tempfile::tempdir;

fn write(root: &Path, relative_path: &str, contents: &str) {
    let path = root.join(relative_path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

#[test]
fn rejected_prepared_document_does_not_replace_the_active_root() {
    let current = tempdir().unwrap();
    let candidate = tempdir().unwrap();
    write(current.path(), "current.md", "# current");
    write(candidate.path(), "candidate.md", "# candidate");
    write(candidate.path(), "plain.txt", "not markdown");
    let registry = LibraryRegistry::new();
    registry
        .register_root("mdhere", current.path().to_path_buf())
        .unwrap();

    assert!(matches!(
        registry.prepare(candidate.path().to_path_buf(), Some(Path::new("plain.txt"))),
        Err(LibraryError::NotDocument)
    ));
    assert!(
        matches!(registry.read_document("mdhere", "current.md"), Ok(Document::Markdown { content, .. }) if content == "# current")
    );
}

#[test]
fn prepared_library_commits_a_root_and_root_relative_document_together() {
    let current = tempdir().unwrap();
    let candidate = tempdir().unwrap();
    write(current.path(), "current.md", "# current");
    write(candidate.path(), "guides/Welcome.md", "# welcome");
    write(candidate.path(), "guides/Story.html", "<h1>Story</h1>");
    let registry = LibraryRegistry::new();
    registry
        .register_root("mdhere", current.path().to_path_buf())
        .unwrap();

    let prepared = registry
        .prepare(
            candidate.path().to_path_buf(),
            Some(Path::new("guides/Welcome.md")),
        )
        .unwrap();
    assert!(
        matches!(prepared.document.as_ref(), Some(Document::Markdown { path, .. }) if path == "guides/Welcome.md")
    );
    let html = registry
        .prepare(
            candidate.path().to_path_buf(),
            Some(Path::new("guides/Story.html")),
        )
        .unwrap();
    assert!(
        matches!(html.document, Some(Document::Html { path, title }) if path == "guides/Story.html" && title == "Story")
    );
    registry.commit("mdhere", &prepared).unwrap();

    assert!(registry.read_document("mdhere", "current.md").is_err());
    assert!(
        matches!(registry.read_document("mdhere", "guides/Welcome.md"), Ok(Document::Markdown { content, .. }) if content == "# welcome")
    );
}
