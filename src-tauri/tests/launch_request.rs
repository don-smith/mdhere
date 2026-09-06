use mdhere_lib::launch::{LaunchError, LaunchRequest};
use std::{ffi::OsString, fs, path::PathBuf};
use tempfile::tempdir;

fn args(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

#[test]
fn parses_cwd_root_and_root_relative_document_requests() {
    let temp = tempdir().unwrap();
    let spaced = temp.path().join("folder with spaces");
    fs::create_dir(&spaced).unwrap();

    assert_eq!(
        LaunchRequest::parse(args(&[]), temp.path()).unwrap(),
        LaunchRequest {
            root: temp.path().to_path_buf(),
            document: None,
        }
    );
    assert_eq!(
        LaunchRequest::parse(args(&["folder with spaces"]), temp.path()).unwrap(),
        LaunchRequest {
            root: spaced.clone(),
            document: None,
        }
    );
    assert_eq!(
        LaunchRequest::parse(
            args(&["folder with spaces", "guides/Welcome.md"]),
            temp.path()
        )
        .unwrap(),
        LaunchRequest {
            root: spaced,
            document: Some(PathBuf::from("guides/Welcome.md")),
        }
    );
}

#[test]
fn rejects_bad_launch_arguments() {
    let temp = tempdir().unwrap();
    assert_eq!(
        LaunchRequest::parse(args(&["--root"]), temp.path()),
        Err(LaunchError::Usage)
    );
    assert_eq!(
        LaunchRequest::parse(args(&["one", "two", "three"]), temp.path()),
        Err(LaunchError::Usage)
    );
    assert_eq!(
        LaunchRequest::parse(args(&["missing"]), temp.path()),
        Err(LaunchError::InvalidRoot(
            PathBuf::from(temp.path()).join("missing")
        ))
    );
}
