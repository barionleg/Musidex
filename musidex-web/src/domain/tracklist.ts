import {Setter} from "../components/utils";
import React, {Dispatch, useCallback} from "react";
import {buildTrack, TrackPlayerAction} from "./trackplayer";
import {canPlay, dot, MusidexMetadata, Vector} from "./entity";

interface Tracklist {
    last_played: number[],
    last_played_maxsize: number,
    cached_scores: {id: number, score: number}[]
}

export function emptyTracklist(): Tracklist {
    return {
        last_played: [],
        last_played_maxsize: 100,
        cached_scores: [],
    }
}

export type NextTrackCallback = (id?: number) => void;
export type PrevTrackCallback = () => void;

export function useNextTrackCallback(curlist: Tracklist, setList: Setter<Tracklist>, dispatch: Dispatch<TrackPlayerAction>, metadata: MusidexMetadata): NextTrackCallback {
    return useCallback((id) => {
        let list = {
            ...curlist,
        };

        if (id === undefined) {
            id = list.cached_scores[0]?.id;
        }
        if (id === undefined) {
            return;
        }
        const track = buildTrack(id, metadata);
        if (track === undefined) {
            return;
        }

        list.last_played.push(id);
        if (list.last_played.length > list.last_played_maxsize) {
            list.last_played = list.last_played.slice(1);
        }

        list = updateCache(list, metadata);
        setList(list);
        dispatch({action: "play", track: track})
    }, [curlist, setList, metadata, dispatch])
}

export function updateCache(list: Tracklist, metadata: MusidexMetadata): Tracklist {
    const lastplayedvec = getLastvec(list, metadata);
    let cache = [];

    for (let music of metadata.musics) {
        let score = getScore(list, lastplayedvec, music, metadata);
        if (score === undefined) {
            continue;
        }
        cache.push({id: music, score: score});
    }

    cache.sort((a, b) => b.score - a.score);
    list.cached_scores = cache;
    return list;
}

export function getLastvec(list: Tracklist, metadata: MusidexMetadata): Vector | undefined {
    return metadata.embeddings.get(list.last_played[list.last_played.length - 1] || -1)
}

export function getScore(list: Tracklist, lastvec: Vector | undefined, id: number, metadata: MusidexMetadata): number | undefined {
    let tags = metadata.music_tags_idx.get(id);
    if (tags === undefined || !canPlay(tags)) {
        return undefined;
    }
    let score = Math.random() * 0.0001;
    if (list.last_played.lastIndexOf(id) >= 0) {
        score -= 5;
    }
    let emb = metadata.embeddings.get(id);
    if (emb !== undefined && lastvec !== undefined) {
        score += dot(lastvec, emb) / (lastvec.mag * emb.mag);
    }
    return score;
}

export function usePrevTrackCallback(curlist: Tracklist, setList: Setter<Tracklist>, dispatch: Dispatch<TrackPlayerAction>, metadata: MusidexMetadata): PrevTrackCallback {
    return useCallback(() => {
        const list = {
            ...curlist,
        };
        const prev_music = list.last_played.pop();

        if (prev_music !== undefined) {
            setList(list);
            let tags = metadata.music_tags_idx.get(prev_music) || new Map();
            dispatch({action: "play", track: {id: prev_music, tags: tags}})
        }
    }, [curlist, setList, metadata, dispatch])
}

export function useCanPrev(curlist: Tracklist): () => boolean {
    return useCallback(() => {
        return curlist.last_played.length === 0;
    }, [curlist])
}

export const TracklistCtx = React.createContext<Tracklist>(emptyTracklist());

export default Tracklist;