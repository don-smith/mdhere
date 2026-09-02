use mdhere_lib::launch::{LaunchError, LaunchRequest};
use std::{ffi::OsString, fs, path::PathBuf};
use tempfile::tempdir;

fn args(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

#[test]
fn parses_no_root_absolute_relative_and_spaced_roots() {
    let temp = tempdir().unwrap();
    let spaced = temp.path().join("folder with spaces");
    fs::create_dir(&spaced).unwrap();
    assert_eq!(
        LaunchRequest::parse(args(&[]), temp.path()).unwrap().root,
        None
    );
    assert_eq!(
        LaunchRequest::parse(args(&["--root", spaced.to_str().unwrap()]), temp.path())
            .unwrap()
            .root,
        Some(spaced.clone())
    );
    assert_eq!(
        LaunchRequest::parse(args(&["folder with spaces"]), temp.path())
            .unwrap()
            .root,
        Some(spaced)
    );
}

#[test]
fn rejects_bad_launch_arguments() {
    let temp = tempdir().unwrap();
    assert_eq!(
        LaunchRequest::parse(args(&["--root"]), temp.path()),
        Err(LaunchError::MissingRoot)
    );
    assert_eq!(
        LaunchRequest::parse(args(&["--wat"]), temp.path()),
        Err(LaunchError::Usage)
    );
    assert_eq!(
        LaunchRequest::parse(args(&["one", "two"]), temp.path()),
        Err(LaunchError::Usage)
    );
    assert_eq!(
        LaunchRequest::parse(args(&["missing"]), temp.path()),
        Err(LaunchError::InvalidRoot(
            PathBuf::from(temp.path()).join("missing")
        ))
    );
}
