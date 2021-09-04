import {useCallback, useContext} from "react";
import {TrackplayerCtx} from "../domain/trackplayer";
import {MaterialIcon} from "./utils";
import {MetadataCtx} from "../domain/entity";
import {NextTrackCallback} from "../domain/tracklist";

export type PlayButtonProps = {
    musicID?: number;
    doNext: NextTrackCallback;
    size?: number;
}

export const PlayButton = ({doNext, musicID, size}: PlayButtonProps) => {
    let [trackplayer] = useContext(TrackplayerCtx);
    let [metadata,] = useContext(MetadataCtx);
    let same_v = (trackplayer.current || -1) === musicID;
    let title = metadata.getTags(musicID)?.get("title")?.text || "No Title";

    let onClick = useCallback(() => {
        doNext(musicID);
    }, [doNext, musicID]);

    let titlePrefix = "Play ";
    let icon = "play_circle_filled";

    if (same_v) {
        if (trackplayer.loading) {
            icon = "pending";
            titlePrefix = "Loading ";
        } else if (!trackplayer.paused) {
            icon = "pause";
            titlePrefix = "Pause ";
        }
    }

    return (
        <button className="player-button" onClick={onClick} title={titlePrefix + title}>
            <MaterialIcon name={icon} size={size}/>
        </button>
    )
}