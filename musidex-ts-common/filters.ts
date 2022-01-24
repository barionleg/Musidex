import {getTags, MusidexMetadata, canPlay, Vector} from "./entity";
import {prng, retain, dot} from "./utils";
import Tracklist from "./tracklist";
import {useMemo} from "react";
import Fuse from "fuse.js";

export type Filters = {
    user: number | undefined;
    searchQry: string;
}

export type SearchForm = {
    filters: Filters;
    sort: SortBy;
    similarityParams: SimilarityParams,
}

export type SimilarityParams = {
    temperature: number,
}

export type SortByKind =
    { kind: "similarity", keepOrder?: boolean }
    | { kind: "creation_time" }
    | { kind: "tag", value: string }
    | { kind: "random" }
export type SortBy = { kind: SortByKind, descending: boolean }

export function newSearchForm(user: number | undefined): SearchForm {
    return {
        filters: {
            user: user,
            searchQry: "",
        },
        sort: {
            kind: {kind: "similarity"},
            descending: true,
        },
        similarityParams: {
            temperature: 0.0,
        },
    };
}

// in place
export function applyFilters(filters: Filters, list: number[], metadata: MusidexMetadata) {
    if (filters.user !== undefined) {
        let k = "user_library:" + filters.user;
        retain(list, (id) => {
            return getTags(metadata, id)?.has(k) || false;
        });
    }
}

const fuseOptions = {
    includeScore: true,
    keys: ['title', 'artist'],
    threshold: 0.4,
};

export const seed = Math.floor(Math.random() * 10000000);

export type MusicSelect = {
    list: number[];
    scoremap: Map<number, number>;
}

export function emptyMusicSelect(): MusicSelect {
    return {
        list: [],
        scoremap: new Map(),
    };
}

export function useMusicSelect(metadata: MusidexMetadata, search: SearchForm, list: Tracklist): MusicSelect {
    const curTrack: number | undefined = list.last_played[list.last_played.length - 1];
    const sortBy = search.sort;
    const searchQry = search.filters.searchQry;
    const isRegex = searchQry.charAt(0) === '/';
    let scoredMusicID: number | undefined = list.last_played[list.last_played.length - 1];

    const similKeepOrder = search.sort.kind.kind === "similarity" && search.sort.kind.keepOrder;

    if (similKeepOrder) {
        scoredMusicID = list.last_manual_select ?? scoredMusicID;
    }

    const scoremap: Map<number, number> = useMemo(() => {
        if (scoredMusicID === undefined) {
            return new Map();
        }
        return scoreCache(metadata, scoredMusicID);
    }, [metadata, scoredMusicID]);

    const temp = search.similarityParams.temperature;
    const alreadyplayedMalus = useMemo(() => {
        if (similKeepOrder) {
            return new Map();
        }
        const malus = new Map();
        list.last_played.forEach((id, l_index) => {
            let d = list.last_played.length - 1 - l_index;
            if (d === 0) {
                malus.set(id, 200); // make sure selected music is at the top when not simil locked
                return;
            }
            malus.set(id, -1.0 / (d * 0.3));
        });
        return malus;
    }, [list, similKeepOrder]);

    const best_tracks = useMemo(() => {
        const l = metadata.musics.slice();
        if (scoremap.size === 0) {
            return l;
        }

        l.sort((a, b) => {
            const va = prng(seed + a)();
            const vb = prng(seed + b)();
            const vc = (va - vb) * temp;
            return ((scoremap.get(b) ?? -100) + (alreadyplayedMalus.get(b) ?? 0)) - ((scoremap.get(a) ?? -100) + (alreadyplayedMalus.get(a) ?? 0)) + vc;
        });
        return l;
    }, [metadata, scoremap, temp, alreadyplayedMalus]);

    const fuse = useMemo(() => {
        return new Fuse(metadata.fuse_document, fuseOptions);
    }, [metadata]);

    const qryFilter = useMemo(() => {
        if (searchQry === "" || fuse === undefined || isRegex) {
            return [];
        }
        return fuse.search(searchQry).map((v) => v.item.id);
    }, [searchQry, fuse, isRegex]);

    const regexFilter = useMemo(() => {
        if (searchQry === "" || !isRegex) {
            return [];
        }
        const matches = [];
        try {
            const regex = new RegExp(searchQry.substr(1), 'i');
            for (let v of metadata.fuse_document) {
                if (regex.test(v.artist) || regex.test(v.title)) {
                    matches.push(v.id);
                }
            }
        } catch {}
        return matches;
    }, [isRegex, searchQry, metadata]);

    const toShow = useMemo(() => {
        let toShow: number[];
        if (searchQry !== "") {
            toShow = isRegex ? regexFilter : qryFilter;
        } else {
            switch (sortBy.kind.kind) {
                case "similarity":
                    toShow = best_tracks.slice();
                    if (curTrack === undefined) {
                        toShow = metadata.musics.slice();
                        toShow.reverse();
                    }
                    applyFilters(search.filters, toShow, metadata);
                    break;
                case "creation_time":
                    toShow = metadata.musics.slice();
                    applyFilters(search.filters, toShow, metadata);
                    toShow.reverse();
                    break;
                case "tag":
                    const v = sortBy.kind.value;
                    toShow = metadata.musics.slice();
                    applyFilters(search.filters, toShow, metadata);
                    toShow.sort((a, b) => {
                        return (getTags(metadata, a)?.get(v)?.text || "").localeCompare(getTags(metadata, b)?.get(v)?.text || "");
                    });
                    break;
                case "random":
                    toShow = metadata.musics.slice();
                    applyFilters(search.filters, toShow, metadata);
                    toShow.sort((a, b) => {
                        return prng(seed + a)() - prng(seed + b)();
                    });
                    break;
            }
            if (!sortBy.descending) {
                toShow.reverse();
            }
        }

        return toShow;
        /* eslint-disable */
    }, [metadata, search, sortBy, list, best_tracks]);
    /* eslint-enable */

    return {
        list: toShow,
        scoremap: scoremap,
    };
}

export function scoreCache(metadata: MusidexMetadata, scoredMusic: number): Map<number, number> {
    const lastplayedvec = metadata.embeddings.get(scoredMusic);
    if (lastplayedvec === undefined) {
        return new Map();
    }
    let scoremap = new Map();

    for (let music of metadata.musics) {
        let tags = getTags(metadata, music);
        if (tags === undefined || !canPlay(tags)) {
            continue;
        }
        let score = Math.random() * 0.0001;
        let neural = neuralScore(lastplayedvec, music, metadata);
        if (neural !== undefined) {
            score += neural;
        }
        scoremap.set(music, score);
    }

    return scoremap;
}

export function neuralScore(lastvec: Vector | undefined, id: number, metadata: MusidexMetadata): number | undefined {
    let emb = metadata.embeddings.get(id);
    if (emb === undefined || lastvec === undefined) {
        return undefined;
    }
    return dot(lastvec, emb) / (lastvec.mag * emb.mag);
}

// eslint-disable-next-line
export function isSimilarity(sf: SearchForm): boolean {
    return sf.sort.kind.kind === "similarity" && sf.filters.searchQry === "";
}

export function sortby_kind_eq(a: SortByKind, b: SortByKind) {
    if (a.kind === "tag" && b.kind === "tag") {
        return a.value === b.value;
    }
    return a.kind === b.kind;
}

export default Filters;
