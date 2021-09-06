use super::*;
use crate::domain::entity::{Music, Tag, TagKey, User};
use anyhow::{Context, Result};

#[test_env_log::test(tokio::test)]
pub async fn test_crd_user() -> Result<()> {
    let db = mk_db().await?;
    let c = db.get().await;
    c.execute_batch("DELETE FROM users;")?;

    let u = User::create(&c, s!("toto"))?;

    let users = User::list(&c)?;
    let user = users.get(0).context("no user")?;
    assert_eq!(user.name, s!("toto"));
    assert_eq!(user.id, u);
    assert_eq!(User::n_users(&c)?, 1);
    User::delete(&c, user.id)?;

    let users = User::list(&c)?;
    assert_eq!(users.len(), 0);

    Ok(())
}

#[test_env_log::test(tokio::test)]
pub async fn test_update_user() -> Result<()> {
    let db = mk_db().await?;
    let c = db.get().await;
    c.execute_batch("DELETE FROM users;")?;

    let u = User::create(&c, s!("toto"))?;

    User::rename(&c, u, s!("tata")).unwrap();

    let users = User::list(&c)?;
    let user = users.get(0).context("no user")?;
    assert_eq!(user.name, s!("tata"), "user name is different");

    Ok(())
}

#[test_env_log::test(tokio::test)]
pub async fn test_delete_userlibrary() -> Result<()> {
    let db = mk_db().await?;
    let c = db.get().await;
    c.execute_batch("DELETE FROM users;")?;

    let music = Music::mk(&c)?;

    let u = User::create(&c, s!("toto"))?;
    let k = TagKey::UserLibrary(s!(u.0));
    Tag::insert(&c, Tag::new_key(music, k.clone()))?;

    User::delete(&c, u)?;

    assert!(Tag::by_key(&c, k)?.is_empty());

    Ok(())
}
