use crate::domain::entity::MusicID;
use crate::domain::{config, stream, sync};
use crate::infrastructure::router::RequestExt;
use crate::Pg;
use anyhow::{Context, Result};
use hyper::{Body, Request, Response, StatusCode};
use serde_json::Value;
use std::convert::TryInto;

pub async fn metadata(req: Request<Body>) -> Result<Response<Body>> {
    let db = req.state::<Pg>();
    let c = db.get().await?;

    let metadata = sync::fetch_metadata(&c)
        .await
        .context("failed fetching metadata")?;

    Ok(Response::new(Body::from(serde_json::to_string(&metadata)?)))
}

pub async fn stream(req: Request<Body>) -> Result<Response<Body>> {
    let music_id = req.params().get("musicid").context("invalid music id")?;
    let id = MusicID(
        music_id
            .parse()
            .context("couldn't parse music id as integer")?,
    );
    let db = req.state::<Pg>();
    let c = db.get().await?;

    let meta = stream::stream_music(&c, id, req.headers().get(hyper::header::RANGE)).await?;

    let mut r = Response::new(Body::from(meta.buf));

    r.headers_mut()
        .insert(hyper::header::CONTENT_TYPE, meta.content_type.parse()?);
    r.headers_mut()
        .insert(hyper::header::ACCEPT_RANGES, "bytes".parse()?);

    if req.headers().contains_key(hyper::header::RANGE) {
        r.headers_mut().insert(
            hyper::header::CONTENT_RANGE,
            format!(
                "bytes {}-{}/{}",
                meta.range_size.0, meta.range_size.1, meta.range_size.2
            )
            .try_into()?,
        );
        if meta.range_size.0 > 0 && meta.range_size.1 < meta.range_size.2 {
            *r.status_mut() = StatusCode::PARTIAL_CONTENT;
        }
    }

    Ok(r)
}

pub async fn get_config(req: Request<Body>) -> Result<Response<Body>> {
    let db = req.state::<Pg>();
    let c = db.get().await?;

    let keyvals = config::get_all(&c)
        .await
        .context("failed fetching metadata")?;

    let m: serde_json::value::Map<String, Value> = keyvals
        .into_iter()
        .map(|x| (x.0, serde_json::Value::String(x.1)))
        .collect();

    Ok(Response::new(Body::from(serde_json::to_string(&m)?)))
}