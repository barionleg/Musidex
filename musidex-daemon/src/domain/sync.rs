use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use futures::{sink::SinkExt, stream::StreamExt};
use hyper_tungstenite::{tungstenite, HyperWebsocket};
use rusqlite::Connection;
use tokio::sync::mpsc;
use tokio::sync::watch;
use tungstenite::Message;

use crate::domain::entity::{Music, MusidexMetadata};
use crate::infrastructure::db::Db;
use crate::utils::collect_rows;

#[derive(Clone)]
pub struct SyncBroadcastSubscriber {
    rx: watch::Receiver<Arc<MusidexMetadata>>,
    refresh_tx: mpsc::Sender<()>,
}

pub struct SyncBroadcast {
    c: Connection,
    tx: watch::Sender<Arc<MusidexMetadata>>,
    refresh_tx: mpsc::Sender<()>,
    refresh_rx: mpsc::Receiver<()>,
}

impl SyncBroadcast {
    pub fn new() -> Result<(Self, SyncBroadcastSubscriber)> {
        let (tx, rx) = watch::channel(Arc::new(MusidexMetadata::default()));
        let (refresh_tx, refresh_rx) = mpsc::channel(16);
        Ok((
            Self {
                c: Db::mk_conn()?,
                tx,
                refresh_tx: refresh_tx.clone(),
                refresh_rx,
            },
            SyncBroadcastSubscriber { rx, refresh_tx },
        ))
    }

    pub fn start_workers(self) {
        let refresh_tx = self.refresh_tx;
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::new(2, 0)).await;
                let _ = refresh_tx.send(()).await;
            }
        });
        let mut r = self.refresh_rx;
        let db = self.c;
        let tx = self.tx;
        tokio::spawn(async move {
            let mut last_hash = 1234;
            while let Some(()) = r.recv().await {
                let m = fetch_metadata(&db);
                let m = match m {
                    Ok(x) => x,
                    Err(e) => {
                        log::error!("error fetching metadata to send to subscribers: {}", e);
                        continue;
                    }
                };
                let mut s = DefaultHasher::new();
                m.hash(&mut s);
                let hash = s.finish();

                if hash == last_hash {
                    continue;
                }
                last_hash = hash;
                let _ = tx.send(Arc::new(m));
            }
        });
    }
}

pub async fn serve_sync_websocket(
    websocket: HyperWebsocket,
    mut b: SyncBroadcastSubscriber,
) -> Result<()> {
    let mut websocket = websocket.await?;

    let meta = b.rx.borrow_and_update().clone();
    let encoded = serde_json::to_string(&*meta).expect("could not encode metadata");
    websocket.send(Message::Text(encoded)).await?;

    loop {
        tokio::select! {
            Some(message) = websocket.next() => {
                let message: Message = message?;
                match message {
                    Message::Close(_) => {
                        log::info!("closing WS");
                        return Ok(());
                    }
                    Message::Ping(v) => {
                        websocket.send(Message::Pong(v)).await?;
                    },
                    Message::Binary(_) | Message::Pong(_) => {},
                    Message::Text(v) => {
                        if &v == "refresh" {
                            let _ = b.refresh_tx.send(()).await;
                        }
                    }
                }
            }
            Ok(_) = b.rx.changed() => {
                let meta = b.rx.borrow_and_update().clone();
                let encoded = serde_json::to_string(&*meta).expect("could not encode metadata");
                websocket.send(Message::Text(encoded)).await?;
            }
        }
    }
}

pub fn fetch_metadata(c: &Connection) -> Result<MusidexMetadata> {
    let mut musics = c.prepare_cached("SELECT * FROM musics")?;
    let mut tags = c.prepare_cached("SELECT * FROM tags")?;

    let musics = musics.query_map([], |r| Ok(Into::into(r)))?;
    let tags = tags.query_map([], |r| Ok(Into::into(r)))?;

    let musics = collect_rows(musics.map(|x| x.map(|v: Music| v.id)))?;
    let tags = collect_rows(tags)?;

    Ok(MusidexMetadata { musics, tags })
}
