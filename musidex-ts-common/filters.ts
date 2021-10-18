import {getTags, MusidexMetadata} from "./entity";
import {prng, retain} from "./utils";
import Tracklist from "./tracklist";
import {useMemo} from "react";
import Fuse from "fuse.js";

export type SearchForm = {
    filters: Filters;
    sort: SortBy;
}

export type Filters = {
    user_only: boolean;
    searchQry: string;
}

export type SortByKind = { kind: "similarity" } | { kind: "creation_time" } | { kind: "tag", value: string } | { kind: "random" }
export type SortBy = { kind: SortByKind, descending: boolean }

export function newSearchForm(): SearchForm {
    return {
        filters: {
            user_only: true,
            searchQry: "",
        },
        sort: {
            kind: {kind: "similarity"},
            descending: true
        }
    };
}

// in place
export function applyFilters(filters: Filters, list: number[], metadata: MusidexMetadata, curUser?: number) {
    let k = "user_library:" + curUser;
    if (filters.user_only) {
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

export function useMusicSelect(metadata: MusidexMetadata, search: SearchForm, list: Tracklist, curUser: number | undefined): number[] {
    const curTrack: number | undefined = list.last_played[list.last_played.length - 1];
    const sortBy = search.sort;
    const searchQry = search.filters.searchQry;
    const scoremap = list.score_map;
    const skind = sortBy.kind.kind;

    const seed = useMemo(() => Math.floor(Math.random() * 10000000), []);

    const best_tracks = useMemo(() => {
        const l = metadata.musics.slice();
        if (skind !== "similarity") {
            return l;
        }
        l.sort((a, b) => {
            return (scoremap.get(b) || -100000) - (scoremap.get(a) || -100000);
        });
        return l;
    }, [metadata, scoremap, skind]);

    const fuse = useMemo(() => {
        return new Fuse(metadata.fuse_document, fuseOptions);
    }, [metadata]);

    const qryFilter = useMemo(() => {
        if (searchQry === "") {
            return [];
        }
        return fuse.search(searchQry);
    }, [searchQry, fuse]);

    return useMemo(() => {
        let toShow: number[];
        if (searchQry !== "" && fuse !== undefined) {
            toShow = qryFilter.map((v: any) => v.item.id);
        } else {
            switch (sortBy.kind.kind) {
                case "similarity":
                    toShow = best_tracks.slice();
                    if (curTrack === undefined) {
                        toShow = metadata.musics.slice();
                        toShow.reverse();
                    }
                    break;
                case "creation_time":
                    toShow = metadata.musics.slice();
                    toShow.reverse();
                    break;
                case "tag":
                    const v = sortBy.kind.value;
                    toShow = metadata.musics.slice();
                    toShow.sort((a, b) => {
                        return (getTags(metadata, a)?.get(v)?.text || "").localeCompare(getTags(metadata, b)?.get(v)?.text || "");
                    });
                    break;
                case "random":
                    toShow = metadata.musics.slice();
                    toShow.sort((a, b) => {
                        return prng(seed + a)() - prng(seed + b)();
                    });
                    break;
            }
            if (!sortBy.descending) {
                toShow.reverse();
            }
        }

        applyFilters(search.filters, toShow, metadata, curUser);
        return toShow;
        /* eslint-disable */
    }, [metadata, search, list, curUser]);
    /* eslint-enable */
}

export function sortby_kind_eq(a: SortByKind, b: SortByKind) {
    if (a.kind === "tag" && b.kind === "tag") {
        return a.value === b.value;
    }
    return a.kind === b.kind;
}

export default Filters;
