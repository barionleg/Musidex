import './explorer.css'
import API, {MetadataCtx, Tag} from "../domain/api";
import {Fragment, useContext} from "react";
import {PlayButton} from "../components/playbutton";
import {MaterialIcon} from "../components/utils";

export type ExplorerProps = {
    title: string;
    hidden: boolean;
}

const Explorer = (props: ExplorerProps) => {
    const [metadata, syncMetadata] = useContext(MetadataCtx);
    return (
        <div className={"explorer color-fg " + (props.hidden ? "hidden" : "")}>
            <div className="explorer-title title">{props.title}</div>
            {
                metadata.musics.map((id) => {
                    return (
                        <SongElem key={id} musicID={id}
                                  tags={metadata.music_tags_idx.get(id)}
                                  onDelete={() => {
                                      API.deleteMusic(id).then((res) => {
                                          if (res.ok && res.status === 200) {
                                              syncMetadata()
                                          }
                                      })
                                  }}
                        />
                    )
                })
            }
        </div>
    )
}

type SongElemProps = {
    musicID: number;
    tags: Map<string, Tag> | undefined;
    onDelete: () => void;
}

const SongElem = (props: SongElemProps) => {
    if (props.tags === undefined) {
        return <Fragment/>;
    }
    let cover = props.tags.get("thumbnail")?.text || null;

    let playable = false;
    let it = props.tags.keys();
    let res = it.next();
    while (!res.done) {
        if (res.value.startsWith("local_")) {
            playable = true;
        }
        res = it.next();
    }

    return (
        <div className="song-elem">
            <div className="cover-image-container">
                {
                    (cover !== null) &&
                    <img src={"storage/" + cover} alt="album or video cover"/>
                }
            </div>
            <div style={{flex: "1", padding: "10px"}}>
                <b>
                    {props.tags.get("title")?.text || "No Title"}
                </b>
            </div>
            <div style={{flex: "1", padding: "10px", textAlign: "right"}}>
                {
                    playable &&
                    <PlayButton musicID={props.musicID}/>
                }
                <button className="player-button" onClick={props.onDelete}>
                    <MaterialIcon name="remove"/>
                </button>
            </div>
        </div>
    )
}


export default Explorer;