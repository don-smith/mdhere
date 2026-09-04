use mdhere_lib::{
    launch::{LaunchRequest, WindowCoordinator, WindowFactory},
    library::LibraryRegistry,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tempfile::tempdir;

#[derive(Default)]
struct FakeFactory {
    calls: Mutex<Vec<(String, bool)>>,
    fail: bool,
}
impl WindowFactory for FakeFactory {
    fn build(&self, label: &str, visible: bool) -> Result<(), String> {
        assert!(
            visible,
            "windows must be visible before an explicit folder choice"
        );
        self.calls.lock().unwrap().push((label.into(), visible));
        if self.fail {
            Err("build failed".into())
        } else {
            Ok(())
        }
    }
}

#[test]
fn allocates_unique_windows_and_registers_roots_before_build() {
    let root = tempdir().unwrap();
    let registry = Arc::new(LibraryRegistry::new());
    let coordinator = WindowCoordinator::new(registry.clone(), FakeFactory::default());
    let first = coordinator
        .open(LaunchRequest {
            root: Some(root.path().to_path_buf()),
        })
        .unwrap();
    let second = coordinator.open(LaunchRequest { root: None }).unwrap();
    assert_ne!(first, second);
    assert!(registry.snapshot(&first).is_ok());
    assert!(registry.snapshot(&second).is_err());
}
#[test]
fn removes_registration_when_build_fails_and_on_close() {
    let root = tempdir().unwrap();
    let registry = Arc::new(LibraryRegistry::new());
    let failing = WindowCoordinator::new(
        registry.clone(),
        FakeFactory {
            fail: true,
            ..Default::default()
        },
    );
    assert!(
        failing
            .open(LaunchRequest {
                root: Some(root.path().to_path_buf())
            })
            .is_err()
    );
    assert!(registry.snapshot("mdhere-1").is_err());
    let coordinator = WindowCoordinator::new(registry.clone(), FakeFactory::default());
    let label = coordinator
        .open(LaunchRequest {
            root: Some(PathBuf::from(root.path())),
        })
        .unwrap();
    coordinator.close(&label);
    assert!(registry.snapshot(&label).is_err());
}
