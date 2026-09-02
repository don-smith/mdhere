use std::{fs, path::Path};

use md_here_lib::library::{LibraryError, LibraryRegistry, TreeNode};
use tempfile::tempdir;

fn write(root: &Path, relative_path: &str, contents: &[u8]) {
    let path = root.join(relative_path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

fn document_paths(nodes: &[TreeNode]) -> Vec<String> {
    nodes
        .iter()
        .flat_map(|node| match node {
            TreeNode::Document { path, .. } => vec![path.clone()],
            TreeNode::Folder { children, .. } => document_paths(children),
        })
        .collect()
}

#[test]
fn snapshot_keeps_only_markdown_documents_and_their_ancestors() {
    let root = tempdir().unwrap();
    write(root.path(), "docs/Guide.MD", b"# guide");
    write(root.path(), "docs/nested/notes.markdown", b"# notes");
    write(root.path(), "docs/image.png", b"png");
    write(root.path(), "empty/ignored.txt", b"ignored");

    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    let snapshot = registry.snapshot("window").unwrap();
    assert_eq!(
        document_paths(&snapshot.tree),
        ["docs/nested/notes.markdown", "docs/Guide.MD"]
    );
}

#[test]
fn snapshot_respects_ignore_files_but_includes_hidden_markdown() {
    let root = tempdir().unwrap();
    write(root.path(), ".ignore", b"ignored.md\n");
    write(root.path(), "ignored.md", b"no");
    write(root.path(), ".hidden/kept.md", b"yes");

    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    let snapshot = registry.snapshot("window").unwrap();
    assert_eq!(document_paths(&snapshot.tree), [".hidden/kept.md"]);
}

#[test]
fn snapshot_sorts_folders_first_with_natural_case_insensitive_order() {
    let root = tempdir().unwrap();
    write(root.path(), "chapter10/a.md", b"a");
    write(root.path(), "chapter2/a.md", b"a");
    write(root.path(), "readme10.md", b"a");
    write(root.path(), "readme2.md", b"a");

    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    let snapshot = registry.snapshot("window").unwrap();
    let names: Vec<&str> = snapshot
        .tree
        .iter()
        .map(|node| match node {
            TreeNode::Folder { name, .. } | TreeNode::Document { name, .. } => name.as_str(),
        })
        .collect();
    assert_eq!(
        names,
        ["chapter2", "chapter10", "readme2.md", "readme10.md"]
    );
}

#[test]
fn replacing_a_root_is_scoped_to_one_window() {
    let first = tempdir().unwrap();
    let second = tempdir().unwrap();
    write(first.path(), "first.md", b"first");
    write(second.path(), "second.md", b"second");
    let registry = LibraryRegistry::new();

    registry
        .register_root("first", first.path().to_path_buf())
        .unwrap();
    registry
        .register_root("second", second.path().to_path_buf())
        .unwrap();
    registry
        .register_root("first", second.path().to_path_buf())
        .unwrap();

    assert_eq!(
        document_paths(&registry.snapshot("first").unwrap().tree),
        ["second.md"]
    );
    assert_eq!(
        document_paths(&registry.snapshot("second").unwrap().tree),
        ["second.md"]
    );
}

#[test]
fn rejects_missing_and_non_directory_roots() {
    let root = tempdir().unwrap();
    let file = root.path().join("file.md");
    fs::write(&file, "file").unwrap();
    let registry = LibraryRegistry::new();

    assert!(matches!(
        registry.register_root("missing", root.path().join("gone")),
        Err(LibraryError::RootMissing(_))
    ));
    assert!(matches!(
        registry.register_root("file", file),
        Err(LibraryError::InvalidRoot(_))
    ));
}

#[test]
fn read_is_confined_to_registered_root_and_markdown() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(root.path(), "docs/inside.md", b"# inside");
    write(root.path(), "docs/plain.txt", b"plain");
    write(outside.path(), "outside.md", b"# outside");
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    assert_eq!(
        registry
            .read_document("window", "docs/inside.md")
            .unwrap()
            .content,
        "# inside"
    );
    assert!(matches!(
        registry.read_document("window", "../outside.md"),
        Err(LibraryError::OutsideRoot)
    ));
    assert!(matches!(
        registry.read_document("window", "docs/plain.txt"),
        Err(LibraryError::NotMarkdown)
    ));
}

#[cfg(unix)]
#[test]
fn skips_directory_symlinks_and_symlinks_that_escape_the_root() {
    use std::os::unix::fs::symlink;

    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(root.path(), "inside.md", b"inside");
    write(root.path(), "real/kept.md", b"kept");
    write(outside.path(), "outside.md", b"outside");
    symlink(
        root.path().join("real"),
        root.path().join("linked-directory"),
    )
    .unwrap();
    symlink(
        outside.path().join("outside.md"),
        root.path().join("escaped.md"),
    )
    .unwrap();
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    assert_eq!(
        document_paths(&registry.snapshot("window").unwrap().tree),
        ["real/kept.md", "inside.md"]
    );
}

#[test]
fn rejects_invalid_utf8_and_documents_over_ten_mebibytes() {
    let root = tempdir().unwrap();
    write(root.path(), "broken.md", &[0xff, 0xfe]);
    write(root.path(), "large.md", &vec![b'x'; 10 * 1024 * 1024 + 1]);
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    assert!(matches!(
        registry.read_document("window", "broken.md"),
        Err(LibraryError::InvalidUtf8)
    ));
    assert!(matches!(
        registry.read_document("window", "large.md"),
        Err(LibraryError::DocumentTooLarge)
    ));
}

#[test]
fn rejects_snapshots_larger_than_document_limit() {
    let root = tempdir().unwrap();
    for number in 0..25_001 {
        write(root.path(), &format!("docs/{number}.md"), b"x");
    }
    let registry = LibraryRegistry::new();
    registry
        .register_root("window", root.path().to_path_buf())
        .unwrap();

    assert!(matches!(
        registry.snapshot("window"),
        Err(LibraryError::SnapshotLimit)
    ));
}
