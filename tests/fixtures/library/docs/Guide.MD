# Guide

Welcome to the fixture guide. This document has several sections with real
content under each heading, so collapsing a heading visibly hides its body.

## Getting started

Read the paragraphs in this section, then collapse the heading to hide them.

This section has a second paragraph. When the section is collapsed, both
paragraphs disappear and only the heading remains visible.

### Setup steps

The setup steps live one level deeper. They collapse together with the
`Getting started` section, and can also be collapsed independently once the
parent section is expanded.

1. Open the library.
2. Select a document from the tree.
3. Scroll with `j` and `k`.

### Troubleshooting

If a heading refuses to collapse, make sure the reader pane has focus first.

## Reference

Use this section to check that tables and code blocks hide with the section.

### Keyboard reference

| Key       | Action                          |
| --------- | ------------------------------- |
| `j` / `k` | Scroll the reader               |
| `H` / `L` | Collapse or expand all sections |
| `?`       | Show keyboard help              |

### Code example

```rust
fn collapse(section: &mut Section) {
    section.collapsed = true;
}
```

## Closing notes

Everything above this line can be collapsed from the toolbar, with `H`, or by
clicking individual headings.
