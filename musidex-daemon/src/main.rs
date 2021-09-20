#[macro_use]
extern crate anyhow;

#[macro_use]
mod utils;

mod application;
mod domain;
mod infrastructure;
#[cfg(test)]
mod tests;

use crate::application::{handlers, user_handlers};
use crate::domain::config;
use crate::domain::sync::SyncBroadcast;
use crate::domain::worker_neural_embed::NeuralEmbedWorker;
use crate::domain::worker_thumbnail_resize::SmallThumbnailWorker;
use crate::domain::worker_youtube_dl::YoutubeDLWorker;
use crate::infrastructure::db::Db;
use crate::infrastructure::migrate::migrate;
use crate::infrastructure::router::{RedirectHTTPSService, Router};
use crate::infrastructure::tls::TlsConfigBuilder;
use crate::utils::env_or;
use anyhow::Context;
use hyper::server::conn::AddrIncoming;
use hyper::{Body, Response, Server};
use include_dir::{include_dir, Dir};

pub static MIGRATIONS: Dir = include_dir!("migrations");

async fn start() -> anyhow::Result<()> {
    std::env::set_var("RUST_LOG", "info");
    env_logger::init();
    loop {
        log::info!("initializing musidex");
        std::fs::create_dir_all("./storage/").context("could not create storage")?;

        let db = Db::connect().await.context("error connecting to pg")?;
        migrate(&db, &MIGRATIONS)
            .await
            .context("error running migrations")?;

        config::init(&db).await?;
        let (canceltx, rxc) = tokio::sync::oneshot::channel::<()>();
        let (canceltx_redirect, rxc_red) = tokio::sync::oneshot::channel::<()>();
        let canceltx = std::sync::Mutex::new(Some((canceltx, canceltx_redirect)));

        let ytdl_worker = YoutubeDLWorker::new(db.clone());
        let neuralembed_worker = NeuralEmbedWorker::new(db.clone());
        let small_thumbnail_worker = SmallThumbnailWorker::new(db.clone());
        let (broadcast, sub) = SyncBroadcast::new()?;

        let mut router = Router::new();
        router
            .state(db)
            .state(sub)
            .get("/api/restart_server", move |_| {
                canceltx.lock().unwrap().take().map(|(a, b)| {
                    let _ = a.send(());
                    let _ = b.send(());
                });
                async { Ok(Response::new(Body::empty())) }
            })
            .get("/api/metadata", handlers::metadata)
            .get("/api/metadata/ws", handlers::subscribe_sync)
            .post("/api/config/update", handlers::update_config)
            .post("/api/youtube_upload", handlers::youtube_upload)
            .post(
                "/api/youtube_upload/playlist",
                handlers::youtube_upload_playlist,
            )
            .get("/api/stream/:musicid", handlers::stream)
            .delete("/api/music/:id", handlers::delete_music)
            .post("/api/tag/create", handlers::create_tag)
            .post("/api/user/create", user_handlers::create)
            .post("/api/user/update/:id", user_handlers::update)
            .delete("/api/user/:id", user_handlers::delete)
            .static_files("/storage/", "./storage/")
            .static_files("/", "./web/");

        let port = env_or("PORT", 3200);
        let addr = ([0, 0, 0, 0], port).into();
        let incoming = AddrIncoming::bind(&addr).unwrap_or_else(|e| {
            panic!("error binding to {}: {}", addr, e);
        });

        let service = router.into_service();

        ytdl_worker.start();
        neuralembed_worker.start();
        small_thumbnail_worker.start();
        broadcast.start_workers();

        // Run
        if env_or("USE_HTTPS", false) {
            let tls_accept = infrastructure::tls::TlsAcceptor::new(
                TlsConfigBuilder::new()
                    .cert_path(env_or("CERT_PATH", s!("./cert.pem")))
                    .key_path(env_or("CERT_KEY_PATH", s!("./cert.rsa")))
                    .build()
                    .context("error building certificates, are you authorized to read them?")?,
                incoming,
            );
            let server = Server::builder(tls_accept)
                .serve(service)
                .with_graceful_shutdown(async move {
                    rxc.await.ok();
                });
            println!("Listening on https://{}", addr);
            if port != 443 {
                log::warn!("not using port 443 for HTTPS");
            }

            if env_or("DONT_REDIRECT_HTTP", false) {
                server.await?;
                continue;
            }

            let incoming_http =
                AddrIncoming::bind(&([0, 0, 0, 0], 80).into()).unwrap_or_else(|e| {
                    panic!("error binding to {}: {}", addr, e);
                });
            let red_server = Server::builder(incoming_http)
                .serve(RedirectHTTPSService.into_service())
                .with_graceful_shutdown(async move {
                    rxc_red.await.ok();
                });

            let (v1, v2) = futures::join!(red_server, server);
            v1?;
            v2?;

            continue;
        }
        let server = Server::builder(incoming)
            .serve(service)
            .with_graceful_shutdown(async move {
                rxc.await.ok();
            });
        println!("Listening on http://{}", addr);
        server.await?;
    }
}

fn main() -> anyhow::Result<()> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(start())
}
