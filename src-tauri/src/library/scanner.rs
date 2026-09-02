use std::{cmp::Ordering, fs, path::Path};

use ignore::WalkBuilder;

use super::{
    error::LibraryError,
    path_guard::PathGuard,
    types::{Diagnostic, LibrarySnapshot, TreeNode},
};

const MAX_DOCUMENTS: usize = 25_000;

#[derive(Default)]
struct Folder {
    name: String,
    path: String,
    folders: Vec<Folder>,
    documents: Vec<(String, String)>,
}

pub fn scan(root: &Path) -> Result<LibrarySnapshot, LibraryError> {
    let guard = PathGuard::new(root.to_path_buf());
    let mut tree = Folder::default();
    let mut count = 0;
    let mut diagnostics = Vec::new();
    let mut builder = WalkBuilder::new(root);
    builder.hidden(false).follow_links(false).git_global(false);

    for result in builder.build() {
        let entry = result.map_err(|error| LibraryError::Io(error.to_string()))?;
        let path = entry.path();
        if path == root || has_vcs_component(path.strip_prefix(root).unwrap_or(path)) {
            continue;
        }
        let metadata = fs::metadata(path).map_err(|error| LibraryError::Io(error.to_string()))?;
        if metadata.is_dir() || !metadata.is_file() || !is_markdown(path) {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .map_err(|_| LibraryError::OutsideRoot)?;
        let relative_string = display_path(relative);
        if let Err(error) = guard.resolve(&relative_string) {
            if matches!(error, LibraryError::OutsideRoot) {
                diagnostics.push(Diagnostic {
                    message: format!("Skipped path outside selected folder: {relative_string}"),
                });
                continue;
            }
            return Err(error);
        }
        count += 1;
        if count > MAX_DOCUMENTS {
            return Err(LibraryError::SnapshotLimit);
        }
        insert_document(&mut tree, relative, &relative_string);
    }

    Ok(LibrarySnapshot {
        root_name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_else(|| root.to_str().unwrap_or("Library"))
            .to_owned(),
        tree: tree.into_nodes(),
        diagnostics,
    })
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn has_vcs_component(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(component, std::path::Component::Normal(name) if matches!(name.to_str(), Some(".git" | ".hg" | ".svn")))
    })
}

fn display_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn insert_document(folder: &mut Folder, relative: &Path, full_path: &str) {
    let components: Vec<String> = relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(name) => name.to_str().map(str::to_owned),
            _ => None,
        })
        .collect();
    let (file, ancestors) = components
        .split_last()
        .expect("scanner only supplies files");
    let mut current = folder;
    for name in ancestors {
        let parent_path = if current.path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", current.path, name)
        };
        let index = current
            .folders
            .iter()
            .position(|child| child.name == *name)
            .unwrap_or_else(|| {
                current.folders.push(Folder {
                    name: name.clone(),
                    path: parent_path,
                    ..Folder::default()
                });
                current.folders.len() - 1
            });
        current = &mut current.folders[index];
    }
    current.documents.push((file.clone(), full_path.to_owned()));
}

impl Folder {
    fn into_nodes(mut self) -> Vec<TreeNode> {
        self.folders
            .sort_by(|left, right| natural_compare(&left.name, &right.name));
        self.documents
            .sort_by(|left, right| natural_compare(&left.0, &right.0));
        let mut nodes = self
            .folders
            .into_iter()
            .map(|folder| {
                let Folder {
                    name,
                    path,
                    folders,
                    documents,
                } = folder;
                let children = Folder {
                    folders,
                    documents,
                    ..Self::default()
                }
                .into_nodes();
                TreeNode::Folder {
                    name,
                    path,
                    children,
                }
            })
            .collect::<Vec<_>>();
        nodes.extend(
            self.documents
                .into_iter()
                .map(|(name, path)| TreeNode::Document { name, path }),
        );
        nodes
    }
}

fn natural_compare(left: &str, right: &str) -> Ordering {
    let left = left.to_lowercase();
    let right = right.to_lowercase();
    let left_bytes = left.as_bytes();
    let right_bytes = right.as_bytes();
    let mut left_index = 0;
    let mut right_index = 0;

    while left_index < left_bytes.len() && right_index < right_bytes.len() {
        if left_bytes[left_index].is_ascii_digit() && right_bytes[right_index].is_ascii_digit() {
            let left_end = digit_end(left_bytes, left_index);
            let right_end = digit_end(right_bytes, right_index);
            let left_number = left[left_index..left_end].trim_start_matches('0');
            let right_number = right[right_index..right_end].trim_start_matches('0');
            let order = left_number
                .len()
                .cmp(&right_number.len())
                .then_with(|| left_number.cmp(right_number));
            if order != Ordering::Equal {
                return order;
            }
            left_index = left_end;
            right_index = right_end;
        } else {
            let order = left_bytes[left_index].cmp(&right_bytes[right_index]);
            if order != Ordering::Equal {
                return order;
            }
            left_index += 1;
            right_index += 1;
        }
    }
    left_bytes
        .len()
        .cmp(&right_bytes.len())
        .then_with(|| left.cmp(&right))
}

fn digit_end(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    index
}
