use url::Url;

pub fn validate_external_url(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    (url.scheme() == "https" && url.host_str().is_some()).then(|| url.into())
}
