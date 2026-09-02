use mdhere_lib::external_links::validate_external_url;

#[test]
fn accepts_only_well_formed_https_urls() {
    assert_eq!(
        validate_external_url("https://example.com/docs?q=mdhere"),
        Some("https://example.com/docs?q=mdhere".into())
    );

    for value in [
        "http://example.com",
        "file:///tmp/readme.md",
        "javascript:alert(1)",
        "mailto:test@example.com",
        "https://",
    ] {
        assert_eq!(validate_external_url(value), None, "{value}");
    }
}
